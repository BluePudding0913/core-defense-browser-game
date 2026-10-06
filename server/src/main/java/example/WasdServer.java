package example;

import static example.GameConfig.PLAYER_COUNT;
import static example.GameConfig.SNAPSHOT_INTERVAL;
import static example.GameConfig.TICK_SECONDS;

import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.DefaultSSLWebSocketServerFactory;
import org.java_websocket.server.WebSocketServer;

/** Multi-room WebSocket transport for the cooperative CORE defense game. */
public final class WasdServer extends WebSocketServer {
    private static final long EMPTY_ROOM_RETENTION_NANOS = TimeUnit.SECONDS.toNanos(60);

    private final Object gameLock = new Object();
    private final Map<WebSocket, MessageBudget> messageBudgets = new ConcurrentHashMap<>();
    private final Map<String, GameRoom> rooms = new ConcurrentHashMap<>();
    private final Map<WebSocket, ConnectionAssignment> assignments = new ConcurrentHashMap<>();
    private final Set<WebSocket> directoryConnections = ConcurrentHashMap.newKeySet();
    private final Map<WebSocket, String> directorySessions = new ConcurrentHashMap<>();
    private final ScheduledExecutorService ticker = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "core-defense-loop");
        thread.setDaemon(true);
        return thread;
    });
    private final int maxRooms;
    private final String accessToken;
    private final Set<String> allowedOrigins;
    private final String bindHost;
    private boolean tlsEnabled;
    private double directoryBroadcastTimer;

    public WasdServer(int port) {
        this(null, port);
    }

    public WasdServer(String bindHost, int port) {
        super(bindHost == null || bindHost.isBlank()
                ? new InetSocketAddress(port) : new InetSocketAddress(bindHost, port));
        this.bindHost = bindHost == null || bindHost.isBlank() ? "0.0.0.0" : bindHost;
        maxRooms = positiveIntEnvironment("CORE_MAX_ROOMS", 64);
        accessToken = trimmedEnvironment("CORE_ACCESS_TOKEN");
        allowedOrigins = parseAllowedOrigins(trimmedEnvironment("CORE_ALLOWED_ORIGINS"));
        configureTls();
    }

    @Override
    public void onOpen(WebSocket connection, ClientHandshake handshake) {
        if (!originAllowed(handshake.getFieldValue("Origin"))) {
            reject(connection, "この接続元は許可されていません");
            return;
        }
        if (!tokenMatches(readQueryParameter(handshake.getResourceDescriptor(), "access"))) {
            reject(connection, "アクセスキーが必要です");
            return;
        }
        String sessionId = readSessionId(handshake);
        if (sessionId == null) { reject(connection, "セッションIDが必要です"); return; }
        messageBudgets.put(connection, new MessageBudget());
        if ("1".equals(readQueryParameter(handshake.getResourceDescriptor(), "directory"))) {
            if (sessionId == null) {
                reject(connection, "セッションIDが必要です");
                return;
            }
            directoryConnections.add(connection);
            directorySessions.put(connection, sessionId);
            sendRoomList(connection);
            return;
        }
        String roomId = normalizeRoomId(readQueryParameter(handshake.getResourceDescriptor(), "room"));
        if (roomId == null) {
            reject(connection, "部屋IDが不正です");
            return;
        }

        Player assigned;
        WebSocket previous = null;
        GameRoom room;
        synchronized (gameLock) {
            room = rooms.get(roomId);
            if (room == null) {
                reject(connection, "ルームが見つかりません。検索し直してください");
                return;
            }
            if (room.password != null && !room.password.equals(
                    readQueryParameter(handshake.getResourceDescriptor(), "phrase"))) {
                reject(connection, "合言葉が一致しません");
                return;
            }
            boolean reconnecting = room.game.players.stream().anyMatch(p -> sessionId.equals(p.sessionId));
            if (!reconnecting && room.game.phase != GamePhase.LOBBY) {
                reject(connection, "このルームはプレイ中です");
                return;
            }
            assigned = room.game.connectPlayer(sessionId);
            if (assigned != null) {
                MatchReservation reservation = room.reservations.remove(sessionId);
                if (reservation != null && reservation.expiresAt() >= System.nanoTime()) {
                    room.game.handleMessage(assigned, "HELLO:" + reservation.name());
                }
                assignments.put(connection, new ConnectionAssignment(room, assigned));
                previous = room.playerConnections.put(assigned, connection);
                room.emptySinceNanos = 0;
                if (room.game.roomOwnerId == null || sessionId.equals(room.ownerSession)) {
                    room.ownerSession = sessionId;
                    room.game.setRoomOwner(assigned);
                }
                if (assigned.id.equals(room.game.roomOwnerId)) room.ownerName = assigned.name;
            }
        }
        if (assigned == null) {
            reject(connection, "この部屋は満員です");
            return;
        }
        if (previous != null && previous != connection) {
            assignments.remove(previous);
            previous.close(4000, "reconnected");
        }
        sendIfOpen(connection, GameMap.clientMapMessage());
        sendIfOpen(connection, "{\"type\":\"welcome\",\"playerId\":\"" + assigned.id
                + "\",\"ackInput\":" + assigned.lastProcessedInput
                + ",\"roomId\":\"" + escapeRoom(roomId) + "\",\"players\":"
                + humanCount(room) + ",\"capacity\":" + PLAYER_COUNT
                + ",\"owner\":" + assigned.id.equals(room.game.roomOwnerId) + "}");
        sendSnapshot(room);
        broadcastRoomLists();
        System.out.println(roomId + "/" + assigned.id + " connected from "
                + connection.getRemoteSocketAddress());
    }

    @Override
    public void onMessage(WebSocket connection, String message) {
        MessageBudget budget = messageBudgets.get(connection);
        if (budget == null || !budget.take(System.nanoTime())) return;
        if (directoryConnections.contains(connection)) {
            handleDirectoryMessage(connection, message);
            return;
        }
        ConnectionAssignment assignment = assignments.get(connection);
        if (assignment == null || message == null || message.length() > 160) return;
        synchronized (gameLock) {
            try {
                if (assignment.room.playerConnections.get(assignment.player) != connection) return;
                assignment.room.game.handleMessage(assignment.player, message.trim());
                if (assignment.player.sessionId != null
                        && assignment.player.sessionId.equals(assignment.room.ownerSession)) {
                    assignment.room.ownerName = assignment.player.name;
                }
            } catch (RuntimeException ignored) {
                sendIfOpen(connection, "{\"type\":\"error\",\"message\":\"入力を処理できません\"}");
            }
        }
    }

    @Override
    public void onClose(WebSocket connection, int code, String reason, boolean remote) {
        messageBudgets.remove(connection);
        if (directoryConnections.remove(connection)) {
            directorySessions.remove(connection);
            return;
        }
        synchronized (gameLock) {
            ConnectionAssignment assignment = assignments.remove(connection);
            if (assignment == null) return;
            GameRoom room = assignment.room;
            if (room.playerConnections.remove(assignment.player, connection)) {
                room.game.disconnectPlayer(assignment.player);
            }
            if (assignment.player.sessionId != null
                    && assignment.player.sessionId.equals(room.ownerSession)
                    && !room.playerConnections.isEmpty()) {
                Player nextOwner = room.playerConnections.keySet().stream()
                        .min(java.util.Comparator.comparingInt(player -> player.slot)).orElse(null);
                if (nextOwner != null) {
                    room.ownerSession = nextOwner.sessionId;
                    room.ownerName = nextOwner.name;
                    room.game.setRoomOwner(nextOwner);
                }
            }
            if (room.playerConnections.isEmpty()) rooms.remove(room.id, room);
        }
        broadcastRoomLists();
    }

    @Override
    public void onError(WebSocket connection, Exception error) {
        System.err.println("WebSocket error: " + error.getMessage());
    }

    @Override
    public void onStart() {
        setConnectionLostTimeout(30);
        ticker.scheduleAtFixedRate(this::tickSafely, 0, 50, TimeUnit.MILLISECONDS);
        System.out.println("CORE Defense server: " + (tlsEnabled ? "wss" : "ws")
                + "://" + bindHost + ":" + getPort() + " (rooms=" + maxRooms + ")");
    }

    private GameRoom createRoom(String id, String ownerSession, String ownerName) {
        GameRoom room = new GameRoom(id, ownerSession, ownerName);
        room.game = new GameSession(new GameEventSink() {
            @Override
            public void broadcast(String message) {
                sendToRoom(room, message);
            }

            @Override
            public void send(Player player, String message) {
                WebSocket connection = room.playerConnections.get(player);
                sendIfOpen(connection, message);
            }
        });
        return room;
    }

    private void tickSafely() {
        try {
            synchronized (gameLock) {
                long now = System.nanoTime();
                ArrayList<String> expiredRooms = new ArrayList<>();
                for (GameRoom room : rooms.values()) {
                    room.game.update(TICK_SECONDS);
                    room.snapshotTimer -= TICK_SECONDS;
                    if (room.snapshotTimer <= 0) {
                        room.snapshotTimer = SNAPSHOT_INTERVAL;
                        sendSnapshot(room);
                    }
                    if (room.playerConnections.isEmpty() && room.emptySinceNanos > 0
                            && now - room.emptySinceNanos >= EMPTY_ROOM_RETENTION_NANOS) {
                        expiredRooms.add(room.id);
                    }
                }
                expiredRooms.forEach(rooms::remove);
                directoryBroadcastTimer -= TICK_SECONDS;
                if (directoryBroadcastTimer <= 0) {
                    directoryBroadcastTimer = 0.5;
                    broadcastRoomLists();
                }
            }
        } catch (RuntimeException error) {
            error.printStackTrace();
        }
    }

    private void sendSnapshot(GameRoom room) {
        if (room.playerConnections.isEmpty()) return;
        String snapshot;
        synchronized (gameLock) {
            snapshot = SnapshotBuilder.build(room.game, room.id, humanCount(room), PLAYER_COUNT);
            snapshot = snapshot.substring(0, snapshot.length() - 1)
                    + ",\"privateRoom\":" + (room.password != null) + "}";
        }
        sendToRoom(room, snapshot);
    }

    private static void sendToRoom(GameRoom room, String message) {
        for (WebSocket connection : room.playerConnections.values()) {
            sendIfOpen(connection, message);
        }
    }

    static void sendIfOpen(WebSocket connection, String message) {
        if (connection == null || !connection.isOpen()) return;
        try {
            connection.send(message);
        } catch (org.java_websocket.exceptions.WebsocketNotConnectedException disconnected) {
            // The socket can close between isOpen() and send(). Other clients still need their update.
        }
    }

    private static int humanCount(GameRoom room) {
        return (int) room.game.players.stream().filter(player -> player.human).count();
    }

    private void handleDirectoryMessage(WebSocket connection, String message) {
        if (message == null || message.length() > 2048) return;
        if (message.startsWith("MATCH:")) {
            handleMatch(connection, message.substring(6));
            return;
        }
        if (message.equals("LIST_ROOMS")) {
            sendRoomList(connection);
            return;
        }
        if (!message.startsWith("CREATE_ROOM:")) return;
        String ownerSession = directorySessions.get(connection);
        if (ownerSession == null) return;
        String ownerName = cleanPlayerName(message.substring("CREATE_ROOM:".length()));
        synchronized (gameLock) {
            if (rooms.size() >= maxRooms) {
                sendIfOpen(connection, "{\"type\":\"error\",\"message\":\"作成できる部屋数の上限に達しました\"}");
                return;
            }
            String roomId;
            do {
                roomId = UUID.randomUUID().toString().substring(0, 6);
            } while (rooms.containsKey(roomId));
            rooms.put(roomId, createRoom(roomId, ownerSession, ownerName));
            sendIfOpen(connection, "{\"type\":\"room-created\",\"roomId\":\"" + roomId + "\"}");
        }
        broadcastRoomLists();
    }

    private void broadcastRoomLists() {
        for (WebSocket connection : directoryConnections) sendRoomList(connection);
    }

    private void handleMatch(WebSocket connection, String payload) {
        try {
            var request = new com.fasterxml.jackson.databind.ObjectMapper().readTree(payload);
            String action = request.path("action").asText();
            String phrase = request.path("password").asText().strip();
            String session = directorySessions.get(connection);
            if (session == null) return;
            synchronized (gameLock) {
                GameRoom selected = null;
                if (action.equals("join") || action.equals("create")) {
                    if (phrase.isEmpty() || phrase.length() > 32) {
                        matchError(connection, "合言葉を1〜32文字で入力してください"); return;
                    }
                    selected = rooms.values().stream().filter(r -> phrase.equals(r.password)).findFirst().orElse(null);
                    if (action.equals("create") && selected != null) {
                        matchError(connection, "その合言葉は使用中です。別の合言葉を入力してください"); return;
                    }
                    if (action.equals("join") && (selected == null || !matchAvailable(selected, session))) {
                        matchError(connection, "参加できるルームが見つかりません。合言葉・満員・プレイ中でないか確認してください"); return;
                    }
                } else if (action.equals("quick")) {
                    selected = rooms.values().stream().filter(r -> r.password == null && matchAvailable(r, session))
                            .sorted(java.util.Comparator.comparing(r -> r.id)).findFirst().orElse(null);
                } else return;
                if (selected == null) {
                    if (rooms.size() >= maxRooms) { matchError(connection, "作成できる部屋数の上限に達しました"); return; }
                    String id;
                    do { id = UUID.randomUUID().toString().replace("-", "").substring(0, 24); }
                    while (rooms.containsKey(id));
                    selected = createRoom(id, session, cleanPlayerName(request.path("name").asText()));
                    selected.password = action.equals("create") ? phrase : null;
                    selected.emptySinceNanos = System.nanoTime();
                    rooms.put(id, selected);
                }
                selected.reservations.put(session, new MatchReservation(
                        System.nanoTime() + TimeUnit.SECONDS.toNanos(15), cleanPlayerName(request.path("name").asText())));
                sendIfOpen(connection, "{\"type\":\"room-created\",\"roomId\":\"" + selected.id + "\"}");
            }
        } catch (Exception invalid) {
            matchError(connection, "ルーム操作を処理できませんでした");
        }
    }

    private boolean matchAvailable(GameRoom room, String session) {
        room.reservations.entrySet().removeIf(e -> e.getValue().expiresAt() < System.nanoTime()
                || room.game.players.stream().anyMatch(p -> p.human && e.getKey().equals(p.sessionId)));
        long available = room.game.players.stream().filter(p -> !p.human
                && (p.sessionId == null || p.reconnectGrace <= 0 || session.equals(p.sessionId))).count();
        long reserved = room.reservations.keySet().stream().filter(s -> !s.equals(session)).count();
        return room.game.phase == GamePhase.LOBBY && available > reserved;
    }

    private void matchError(WebSocket connection, String message) {
        sendIfOpen(connection, "{\"type\":\"error\",\"message\":\"" + GameSupport.escapeJson(message) + "\"}");
    }

    private void sendRoomList(WebSocket connection) {
        if (!connection.isOpen()) return;
        String message;
        synchronized (gameLock) {
        ArrayList<GameRoom> visibleRooms = new ArrayList<>(rooms.values());
        visibleRooms.removeIf(room -> room.password != null);
        visibleRooms.sort(java.util.Comparator.comparing(room -> room.id));
        StringBuilder json = new StringBuilder("{\"type\":\"rooms\",\"rooms\":[");
        for (int index = 0; index < visibleRooms.size(); index++) {
            GameRoom room = visibleRooms.get(index);
            if (index > 0) json.append(',');
            int players = humanCount(room);
            String phase = room.game.phase.name().toLowerCase(java.util.Locale.ROOT);
            boolean joinable = room.game.phase == GamePhase.LOBBY
                    && players > 0 && matchAvailable(room, directorySessions.getOrDefault(connection, ""));
            json.append("{\"id\":\"").append(escapeRoom(room.id))
                    .append("\",\"owner\":\"").append(escapeRoom(room.ownerName))
                    .append("\",\"players\":").append(players)
                    .append(",\"capacity\":").append(PLAYER_COUNT)
                    .append(",\"phase\":\"").append(phase)
                    .append("\",\"joinable\":").append(joinable).append('}');
        }
        json.append("]}");
        message = json.toString();
        }
        sendIfOpen(connection, message);
    }

    private static String cleanPlayerName(String value) {
        String cleaned = value == null ? "" : value
                .replaceAll("[^\\p{L}\\p{N} _-]", "").trim();
        if (cleaned.isEmpty()) return "Player";
        return cleaned.substring(0, Math.min(16, cleaned.length()));
    }

    private boolean originAllowed(String origin) {
        return allowedOrigins.isEmpty() || allowedOrigins.contains(origin);
    }

    private boolean tokenMatches(String supplied) {
        if (accessToken == null) return true;
        if (supplied == null) return false;
        return MessageDigest.isEqual(accessToken.getBytes(StandardCharsets.UTF_8),
                supplied.getBytes(StandardCharsets.UTF_8));
    }

    private static void reject(WebSocket connection, String message) {
        sendIfOpen(connection, "{\"type\":\"error\",\"message\":\"" + message + "\"}");
        connection.close(1008, "policy rejected");
    }

    private void configureTls() {
        String keyStorePath = trimmedEnvironment("CORE_TLS_KEYSTORE");
        if (keyStorePath == null) return;
        String password = trimmedEnvironment("CORE_TLS_PASSWORD");
        if (password == null) {
            throw new IllegalStateException("CORE_TLS_PASSWORD is required with CORE_TLS_KEYSTORE");
        }
        String keyStoreType = trimmedEnvironment("CORE_TLS_KEYSTORE_TYPE");
        if (keyStoreType == null) keyStoreType = "PKCS12";
        try {
            KeyStore keyStore = KeyStore.getInstance(keyStoreType);
            try (InputStream input = Files.newInputStream(Path.of(keyStorePath))) {
                keyStore.load(input, password.toCharArray());
            }
            KeyManagerFactory managers = KeyManagerFactory.getInstance(
                    KeyManagerFactory.getDefaultAlgorithm());
            managers.init(keyStore, password.toCharArray());
            SSLContext context = SSLContext.getInstance("TLS");
            context.init(managers.getKeyManagers(), null, null);
            setWebSocketFactory(new DefaultSSLWebSocketServerFactory(context));
            tlsEnabled = true;
        } catch (Exception error) {
            throw new IllegalStateException("Could not configure TLS: " + error.getMessage(), error);
        }
    }

    static String normalizeRoomId(String value) {
        if (value == null || value.isBlank()) return "lobby";
        String normalized = value.trim().toLowerCase();
        return normalized.matches("[a-z0-9_-]{1,24}") ? normalized : null;
    }

    static String readQueryParameter(String resource, String name) {
        if (resource == null) return null;
        int queryStart = resource.indexOf('?');
        if (queryStart < 0 || queryStart == resource.length() - 1) return null;
        for (String parameter : resource.substring(queryStart + 1).split("&")) {
            String[] pair = parameter.split("=", 2);
            if (pair.length != 2) continue;
            String key = URLDecoder.decode(pair[0], StandardCharsets.UTF_8);
            if (key.equals(name)) return URLDecoder.decode(pair[1], StandardCharsets.UTF_8);
        }
        return null;
    }

    private static String readSessionId(ClientHandshake handshake) {
        String value = readQueryParameter(handshake.getResourceDescriptor(), "session");
        return value != null && value.matches("[A-Za-z0-9_-]{16,128}") ? value : null;
    }

    private static int positiveIntEnvironment(String name, int fallback) {
        String value = trimmedEnvironment(name);
        if (value == null) return fallback;
        try {
            return Math.max(1, Integer.parseInt(value));
        } catch (NumberFormatException error) {
            throw new IllegalArgumentException(name + " must be a positive integer");
        }
    }

    private static String trimmedEnvironment(String name) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static Set<String> parseAllowedOrigins(String configured) {
        if (configured == null) return Set.of();
        Set<String> origins = new HashSet<>();
        Arrays.stream(configured.split(",")).map(String::trim).filter(value -> !value.isEmpty())
                .forEach(origins::add);
        return Set.copyOf(origins);
    }

    private static String escapeRoom(String roomId) {
        return roomId.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    public static void main(String[] args) {
        int port = args.length == 0 ? 8887 : Integer.parseInt(args[0]);
        String bindHost = args.length < 2 ? null : args[1];
        new WasdServer(bindHost, port).start();
    }

    private record ConnectionAssignment(GameRoom room, Player player) { }
    private record MatchReservation(long expiresAt, String name) { }

    private static final class GameRoom {
        final String id;
        final Map<Player, WebSocket> playerConnections = new ConcurrentHashMap<>();
        GameSession game;
        String ownerSession;
        String ownerName;
        String password;
        final Map<String, MatchReservation> reservations = new java.util.HashMap<>();
        double snapshotTimer;
        long emptySinceNanos;

        GameRoom(String id, String ownerSession, String ownerName) {
            this.id = id;
            this.ownerSession = ownerSession;
            this.ownerName = ownerName;
            emptySinceNanos = System.nanoTime();
        }
    }
}
