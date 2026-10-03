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
    private final Map<String, GameRoom> rooms = new ConcurrentHashMap<>();
    private final Map<WebSocket, ConnectionAssignment> assignments = new ConcurrentHashMap<>();
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
        String roomId = normalizeRoomId(readQueryParameter(handshake.getResourceDescriptor(), "room"));
        if (roomId == null) {
            reject(connection, "部屋IDが不正です");
            return;
        }
        if (!originAllowed(handshake.getFieldValue("Origin"))) {
            reject(connection, "この接続元は許可されていません");
            return;
        }
        if (!tokenMatches(readQueryParameter(handshake.getResourceDescriptor(), "access"))) {
            reject(connection, "アクセスキーが必要です");
            return;
        }

        Player assigned;
        WebSocket previous = null;
        GameRoom room;
        synchronized (gameLock) {
            room = rooms.get(roomId);
            if (room == null) {
                if (rooms.size() >= maxRooms) {
                    reject(connection, "作成できる部屋数の上限に達しました");
                    return;
                }
                room = createRoom(roomId);
                rooms.put(roomId, room);
            }
            assigned = room.game.connectPlayer(readSessionId(handshake));
            if (assigned != null) {
                assignments.put(connection, new ConnectionAssignment(room, assigned));
                previous = room.playerConnections.put(assigned, connection);
                room.emptySinceNanos = 0;
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
        connection.send(GameMap.clientMapMessage());
        connection.send("{\"type\":\"welcome\",\"playerId\":\"" + assigned.id
                + "\",\"ackInput\":" + assigned.lastProcessedInput
                + ",\"roomId\":\"" + escapeRoom(roomId) + "\",\"players\":"
                + humanCount(room) + ",\"capacity\":" + PLAYER_COUNT + "}");
        sendSnapshot(room);
        System.out.println(roomId + "/" + assigned.id + " connected from "
                + connection.getRemoteSocketAddress());
    }

    @Override
    public void onMessage(WebSocket connection, String message) {
        ConnectionAssignment assignment = assignments.get(connection);
        if (assignment == null || message == null || message.length() > 160) return;
        synchronized (gameLock) {
            try {
                assignment.room.game.handleMessage(assignment.player, message.trim());
            } catch (RuntimeException ignored) {
                connection.send("{\"type\":\"error\",\"message\":\"入力を処理できません\"}");
            }
        }
    }

    @Override
    public void onClose(WebSocket connection, int code, String reason, boolean remote) {
        synchronized (gameLock) {
            ConnectionAssignment assignment = assignments.remove(connection);
            if (assignment == null) return;
            GameRoom room = assignment.room;
            if (room.playerConnections.remove(assignment.player, connection)) {
                room.game.disconnectPlayer(assignment.player);
            }
            if (room.playerConnections.isEmpty()) room.emptySinceNanos = System.nanoTime();
        }
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

    private GameRoom createRoom(String id) {
        GameRoom room = new GameRoom(id);
        room.game = new GameSession(new GameEventSink() {
            @Override
            public void broadcast(String message) {
                sendToRoom(room, message);
            }

            @Override
            public void send(Player player, String message) {
                WebSocket connection = room.playerConnections.get(player);
                if (connection != null && connection.isOpen()) connection.send(message);
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
            }
        } catch (RuntimeException error) {
            error.printStackTrace();
        }
    }

    private void sendSnapshot(GameRoom room) {
        if (room.playerConnections.isEmpty()) return;
        sendToRoom(room, SnapshotBuilder.build(room.game, room.id, humanCount(room), PLAYER_COUNT));
    }

    private static void sendToRoom(GameRoom room, String message) {
        for (WebSocket connection : room.playerConnections.values()) {
            if (connection.isOpen()) connection.send(message);
        }
    }

    private static int humanCount(GameRoom room) {
        return (int) room.game.players.stream().filter(player -> player.human).count();
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
        connection.send("{\"type\":\"error\",\"message\":\"" + message + "\"}");
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

    private static final class GameRoom {
        final String id;
        final Map<Player, WebSocket> playerConnections = new ConcurrentHashMap<>();
        GameSession game;
        double snapshotTimer;
        long emptySinceNanos;

        GameRoom(String id) {
            this.id = id;
        }
    }
}
