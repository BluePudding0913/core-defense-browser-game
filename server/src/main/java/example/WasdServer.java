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
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.locks.ReentrantLock;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.DefaultSSLWebSocketServerFactory;
import org.java_websocket.server.WebSocketServer;

/** Multi-room WebSocket transport for the cooperative CORE defense game. */
public final class WasdServer extends WebSocketServer {
    private static final long EMPTY_ROOM_RETENTION_NANOS = TimeUnit.SECONDS.toNanos(60);

    private final Object registryLock = new Object();
    private final ThreadPoolExecutor roomWorkers;
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
    private final PerformanceMetrics performance = new PerformanceMetrics();
    private final OutboundDispatcher outbound = new OutboundDispatcher(performance);
    private long expectedTickNanos;
    private long nextPerformanceLogNanos;
    private final long performanceLogNanos = TimeUnit.SECONDS.toNanos(
            nonnegativeIntEnvironment("CORE_PERF_LOG_SECONDS", 0));

    public WasdServer(int port) {
        this(null, port);
    }

    public WasdServer(String bindHost, int port) {
        super(bindHost == null || bindHost.isBlank()
                ? new InetSocketAddress(port) : new InetSocketAddress(bindHost, port));
        this.bindHost = bindHost == null || bindHost.isBlank() ? "0.0.0.0" : bindHost;
        maxRooms = positiveIntEnvironment("CORE_MAX_ROOMS", 64);
        int workerCount = positiveIntEnvironment("CORE_ROOM_WORKERS",
                Math.max(2, Math.min(4, Runtime.getRuntime().availableProcessors())));
        roomWorkers = new ThreadPoolExecutor(workerCount, workerCount, 0, TimeUnit.SECONDS,
                new ArrayBlockingQueue<>(maxRooms), runnable -> {
                    Thread thread = new Thread(runnable, "core-room-update");
                    thread.setDaemon(true);
                    return thread;
                });
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
        GameRoom room = rooms.get(roomId);
        if (room == null) {
            reject(connection, "ルームが見つかりません。検索し直してください");
            return;
        }
        long lockStarted = lockRoom(room);
        try {
            if (room.closed || rooms.get(roomId) != room) {
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
            if (!reconnecting && !matchAvailable(room, sessionId)) {
                reject(connection, "この部屋は満員です");
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
                // Queue the handshake before exposing this connection to periodic snapshots.
                queueMessage(connection, GameMap.clientMapMessage());
                queueMessage(connection, "{\"type\":\"welcome\",\"playerId\":\"" + assigned.id
                        + "\",\"ackInput\":" + assigned.lastProcessedInput
                        + ",\"roomId\":\"" + escapeRoom(roomId) + "\",\"players\":"
                        + humanCount(room) + ",\"capacity\":" + PLAYER_COUNT
                        + ",\"owner\":" + assigned.id.equals(room.game.roomOwnerId) + "}");
                sendSnapshot(room);
                refreshView(room);
            }
        } finally {
            unlockRoom(room, lockStarted);
        }
        if (assigned == null) {
            reject(connection, "この部屋は満員です");
            return;
        }
        if (previous != null && previous != connection) {
            assignments.remove(previous);
            previous.close(4000, "reconnected");
        }
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
        long lockStarted = lockRoom(assignment.room);
        try {
            try {
                if (assignment.room.closed) return;
                if (assignment.room.playerConnections.get(assignment.player) != connection) return;
                assignment.room.game.handleMessage(assignment.player, message.trim());
                if (assignment.player.sessionId != null
                        && assignment.player.sessionId.equals(assignment.room.ownerSession)) {
                    assignment.room.ownerName = assignment.player.name;
                }
                refreshView(assignment.room);
            } catch (RuntimeException ignored) {
                queueMessage(connection, "{\"type\":\"error\",\"message\":\"入力を処理できません\"}");
            }
        } finally {
            unlockRoom(assignment.room, lockStarted);
        }
    }

    @Override
    public void onClose(WebSocket connection, int code, String reason, boolean remote) {
        messageBudgets.remove(connection);
        outbound.forget(connection);
        if (directoryConnections.remove(connection)) {
            directorySessions.remove(connection);
            return;
        }
        ConnectionAssignment assignment = assignments.remove(connection);
        if (assignment == null) return;
        GameRoom room = assignment.room;
        long lockStarted = lockRoom(room);
        try {
            if (!room.playerConnections.remove(assignment.player, connection)) return;
            room.game.disconnectPlayer(assignment.player);
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
            if (room.playerConnections.isEmpty()) {
                room.closed = true;
                rooms.remove(room.id, room);
            }
            refreshView(room);
        } finally {
            unlockRoom(room, lockStarted);
        }
        broadcastRoomLists();
    }

    @Override
    public void onError(WebSocket connection, Exception error) {
        System.err.println("WebSocket error: " + error.getMessage());
    }

    @Override
    public void onStart() {
        if (ticker.isShutdown()) return;
        setConnectionLostTimeout(30);
        try { ticker.scheduleAtFixedRate(this::tickSafely, 0, 50, TimeUnit.MILLISECONDS); }
        catch (RejectedExecutionException stopping) {
            if (ticker.isShutdown()) return;
            throw stopping;
        }
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
                queueMessage(connection, message);
            }
        });
        refreshView(room);
        return room;
    }

    private void tickSafely() {
        long started = System.nanoTime();
        if (expectedTickNanos != 0) performance.scheduleDelay.record(started - expectedTickNanos);
        expectedTickNanos = (expectedTickNanos == 0 ? started : expectedTickNanos) + 50_000_000;
        try {
            for (GameRoom room : rooms.values()) {
                if (room.closed) continue;
                if (!room.updating.compareAndSet(false, true)) {
                    room.game.performance.skippedTicks.increment();
                    continue;
                }
                long scheduled = System.nanoTime();
                try {
                    roomWorkers.execute(() -> {
                        try { updateRoom(room, scheduled); }
                        finally { room.updating.set(false); }
                    });
                } catch (RejectedExecutionException full) {
                    room.updating.set(false);
                    room.game.performance.skippedTicks.increment();
                }
            }
            directoryBroadcastTimer -= TICK_SECONDS;
            if (directoryBroadcastTimer <= 0) {
                directoryBroadcastTimer = 0.5;
                broadcastRoomLists();
            }
        } catch (RuntimeException error) {
            error.printStackTrace();
        } finally {
            performance.update.record(System.nanoTime() - started);
            logPerformanceIfDue();
        }
    }

    private void updateRoom(GameRoom room, long scheduled) {
        long lockStarted = lockRoom(room);
        try {
            if (room.closed) return;
            room.game.performance.scheduleDelay.record(System.nanoTime() - scheduled);
            long updateStarted = System.nanoTime();
            try { room.game.update(TICK_SECONDS); }
            finally { room.game.performance.update.record(System.nanoTime() - updateStarted); }
            room.snapshotTimer -= TICK_SECONDS;
            if (room.snapshotTimer <= 0) {
                room.snapshotTimer = SNAPSHOT_INTERVAL;
                sendSnapshot(room);
            }
            cleanReservations(room);
            if (room.playerConnections.isEmpty() && room.emptySinceNanos > 0
                    && System.nanoTime() - room.emptySinceNanos >= EMPTY_ROOM_RETENTION_NANOS) {
                room.closed = true;
                rooms.remove(room.id, room);
            }
        } catch (RuntimeException error) {
            room.game.performance.updateFailures.increment();
            long now = System.nanoTime();
            if (now >= room.nextErrorLogNanos) {
                room.nextErrorLogNanos = now + TimeUnit.SECONDS.toNanos(1);
                System.err.println("Room " + room.id + " update failed: " + error);
            }
        } finally {
            try { refreshView(room); }
            finally { unlockRoom(room, lockStarted); }
        }
    }

    private static long lockRoom(GameRoom room) {
        long started = System.nanoTime();
        room.lock.lock();
        long acquired = System.nanoTime();
        room.game.performance.lockWait.record(acquired - started);
        return acquired;
    }

    private static void unlockRoom(GameRoom room, long started) {
        room.game.performance.lockHeld.record(System.nanoTime() - started);
        room.lock.unlock();
    }

    private void logPerformanceIfDue() {
        long now = System.nanoTime();
        if (performanceLogNanos == 0 || now < nextPerformanceLogNanos) return;
        nextPerformanceLogNanos = now + performanceLogNanos;
        System.out.println("PERF server " + performance.summary());
        rooms.values().stream().sorted(java.util.Comparator.comparingLong(
                (GameRoom room) -> room.game.performance.update.max()).reversed()).limit(3)
                .forEach(room -> System.out.println("PERF room=" + room.id + " "
                        + room.game.performance.summary()));
    }

    private void sendSnapshot(GameRoom room) {
        if (room.playerConnections.isEmpty()) return;
        // Caller holds the room lock; output is only queued here.
        long snapshotStarted = System.nanoTime();
        String snapshot = SnapshotBuilder.build(room.game, room.id, humanCount(room), PLAYER_COUNT);
        snapshot = snapshot.substring(0, snapshot.length() - 1)
                + ",\"privateRoom\":" + (room.password != null) + "}";
        room.game.performance.snapshot.record(System.nanoTime() - snapshotStarted);
        room.game.performance.snapshotBytes.add(snapshot.getBytes(StandardCharsets.UTF_8).length);
        sendToRoom(room, snapshot);
    }

    private void sendToRoom(GameRoom room, String message) {
        for (WebSocket connection : room.playerConnections.values()) {
            queueMessage(connection, message);
        }
    }

    private void queueMessage(WebSocket connection, String message) {
        outbound.offer(connection, message,
                message.startsWith("{\"type\":\"state\"") || message.startsWith("{\"type\":\"rooms\""),
                message.startsWith("{\"type\":\"effect\""));
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
        synchronized (registryLock) {
            if (rooms.size() >= maxRooms) {
                queueMessage(connection, "{\"type\":\"error\",\"message\":\"作成できる部屋数の上限に達しました\"}");
                return;
            }
            String roomId;
            do {
                roomId = UUID.randomUUID().toString().substring(0, 6);
            } while (rooms.containsKey(roomId));
            rooms.put(roomId, createRoom(roomId, ownerSession, ownerName));
            queueMessage(connection, "{\"type\":\"room-created\",\"roomId\":\"" + roomId + "\"}");
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
            String name = cleanPlayerName(request.path("name").asText());
            if (!Set.of("join", "create", "quick").contains(action)) return;
            if (!action.equals("quick") && (phrase.isEmpty() || phrase.length() > 32)) {
                matchError(connection, "合言葉を1〜32文字で入力してください"); return;
            }
            GameRoom selected = null;
            if (action.equals("quick")) {
                for (GameRoom candidate : rooms.values().stream()
                        .filter(room -> !room.closed && room.password == null
                                && room.view.available(session, System.nanoTime()))
                        .sorted(java.util.Comparator.comparing(room -> room.id)).toList()) {
                    long started = lockRoom(candidate);
                    try { if (reserve(candidate, session, name)) selected = candidate; }
                    finally { unlockRoom(candidate, started); }
                    if (selected != null) break;
                }
            }
            if (action.equals("join")) {
                GameRoom candidate = rooms.values().stream()
                        .filter(room -> !room.closed && phrase.equals(room.password)).findFirst().orElse(null);
                if (candidate != null) {
                    long started = lockRoom(candidate);
                    try { if (reserve(candidate, session, name)) selected = candidate; }
                    finally { unlockRoom(candidate, started); }
                }
                if (selected == null) {
                    matchError(connection, "参加できるルームが見つかりません。合言葉・満員・プレイ中でないか確認してください"); return;
                }
            } else if (selected == null) {
                synchronized (registryLock) {
                    if (action.equals("create") && rooms.values().stream()
                            .anyMatch(room -> !room.closed && phrase.equals(room.password))) {
                        matchError(connection, "その合言葉は使用中です。別の合言葉を入力してください"); return;
                    }
                    if (action.equals("quick")) {
                        for (GameRoom candidate : rooms.values().stream()
                                .filter(room -> !room.closed && room.password == null)
                                .sorted(java.util.Comparator.comparing(room -> room.id)).toList()) {
                            // Never wait for a busy room while holding the registry lock.
                            if (!candidate.lock.tryLock()) continue;
                            try { if (reserve(candidate, session, name)) selected = candidate; }
                            finally { candidate.lock.unlock(); }
                            if (selected != null) break;
                        }
                    }
                    if (selected == null) {
                        if (rooms.size() >= maxRooms) {
                            matchError(connection, "作成できる部屋数の上限に達しました"); return;
                        }
                        String id;
                        do { id = UUID.randomUUID().toString().replace("-", "").substring(0, 24); }
                        while (rooms.containsKey(id));
                        selected = createRoom(id, session, name);
                        selected.password = action.equals("create") ? phrase : null;
                        selected.reservations.put(session, new MatchReservation(
                                System.nanoTime() + TimeUnit.SECONDS.toNanos(15), name));
                        refreshView(selected);
                        rooms.put(id, selected);
                    }
                }
            }
            queueMessage(connection, "{\"type\":\"room-created\",\"roomId\":\"" + selected.id + "\"}");
        } catch (Exception invalid) {
            matchError(connection, "ルーム操作を処理できませんでした");
        }
    }

    private boolean matchAvailable(GameRoom room, String session) {
        cleanReservations(room);
        refreshView(room);
        return !room.closed && room.view.available(session, System.nanoTime());
    }

    private boolean reserve(GameRoom room, String session, String name) {
        if (room.closed || rooms.get(room.id) != room || !matchAvailable(room, session)) return false;
        room.reservations.put(session, new MatchReservation(System.nanoTime() + TimeUnit.SECONDS.toNanos(15), name));
        refreshView(room);
        return true;
    }

    private static void cleanReservations(GameRoom room) {
        room.reservations.entrySet().removeIf(e -> e.getValue().expiresAt() < System.nanoTime()
                || room.game.players.stream().anyMatch(p -> p.human && e.getKey().equals(p.sessionId)));
    }

    private static void refreshView(GameRoom room) {
        room.view = new RoomView(room.id, room.ownerName, room.password != null, room.game.phase,
                room.game.players.stream().map(p -> new Seat(p.sessionId, p.human, p.reconnectGrace)).toList(),
                Map.copyOf(room.reservations));
    }

    private void matchError(WebSocket connection, String message) {
        queueMessage(connection, "{\"type\":\"error\",\"message\":\"" + GameSupport.escapeJson(message) + "\"}");
    }

    private void sendRoomList(WebSocket connection) {
        if (!connection.isOpen()) return;
        String message;
        var visibleRooms = rooms.values().stream().filter(room -> !room.closed)
                .map(room -> room.view).filter(view -> !view.privateRoom)
                .sorted(java.util.Comparator.comparing(view -> view.id)).toList();
        StringBuilder json = new StringBuilder("{\"type\":\"rooms\",\"rooms\":[");
        for (int index = 0; index < visibleRooms.size(); index++) {
            RoomView room = visibleRooms.get(index);
            if (index > 0) json.append(',');
            int players = (int) room.seats.stream().filter(Seat::human).count();
            String phase = room.phase.name().toLowerCase(java.util.Locale.ROOT);
            boolean joinable = players > 0 && room.available(
                    directorySessions.getOrDefault(connection, ""), System.nanoTime());
            json.append("{\"id\":\"").append(escapeRoom(room.id))
                    .append("\",\"owner\":\"").append(escapeRoom(room.owner))
                    .append("\",\"players\":").append(players)
                    .append(",\"capacity\":").append(PLAYER_COUNT)
                    .append(",\"phase\":\"").append(phase)
                    .append("\",\"joinable\":").append(joinable).append('}');
        }
        json.append("]}");
        message = json.toString();
        queueMessage(connection, message);
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

    private void reject(WebSocket connection, String message) {
        sendIfOpen(connection, "{\"type\":\"error\",\"message\":\"" + message + "\"}");
        connection.close(1008, "policy rejected");
    }

    @Override public void stop(int timeout, String reason) throws InterruptedException {
        ticker.shutdownNow();
        roomWorkers.shutdownNow();
        outbound.close();
        super.stop(timeout, reason);
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

    private static int nonnegativeIntEnvironment(String name, int fallback) {
        String value = trimmedEnvironment(name);
        return value == null ? fallback : Math.max(0, Integer.parseInt(value));
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
    private record Seat(String session, boolean human, double reconnectGrace) { }
    private record RoomView(String id, String owner, boolean privateRoom, GamePhase phase,
            java.util.List<Seat> seats, Map<String, MatchReservation> reservations) {
        boolean available(String session, long now) {
            long available = seats.stream().filter(seat -> !seat.human
                    && (seat.session == null || seat.reconnectGrace <= 0 || session.equals(seat.session))).count();
            long reserved = reservations.entrySet().stream()
                    .filter(entry -> !entry.getKey().equals(session) && entry.getValue().expiresAt >= now).count();
            return phase == GamePhase.LOBBY && available > reserved;
        }
    }

    private static final class GameRoom {
        final String id;
        final ReentrantLock lock = new ReentrantLock();
        final AtomicBoolean updating = new AtomicBoolean();
        volatile boolean closed;
        volatile RoomView view;
        final Map<Player, WebSocket> playerConnections = new ConcurrentHashMap<>();
        GameSession game;
        String ownerSession;
        String ownerName;
        String password;
        final Map<String, MatchReservation> reservations = new java.util.HashMap<>();
        double snapshotTimer;
        long emptySinceNanos;
        long nextErrorLogNanos;

        GameRoom(String id, String ownerSession, String ownerName) {
            this.id = id;
            this.ownerSession = ownerSession;
            this.ownerName = ownerName;
            emptySinceNanos = System.nanoTime();
        }
    }
}
