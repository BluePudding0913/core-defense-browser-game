package example;

import static example.GameConfig.SNAPSHOT_INTERVAL;
import static example.GameConfig.TICK_SECONDS;

import java.net.InetSocketAddress;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

/** WebSocket transport for the cooperative CORE defense game. */
public final class WasdServer extends WebSocketServer {
    private final Object gameLock = new Object();
    private final Map<WebSocket, Player> connectionPlayers = new ConcurrentHashMap<>();
    private final Map<Player, WebSocket> playerConnections = new ConcurrentHashMap<>();
    private final ScheduledExecutorService ticker = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "core-defense-loop");
        thread.setDaemon(true);
        return thread;
    });
    private final GameSession game;
    private double snapshotTimer;

    public WasdServer(int port) {
        super(new InetSocketAddress(port));
        game = new GameSession(new GameEventSink() {
            @Override
            public void broadcast(String message) {
                WasdServer.this.broadcast(message);
            }

            @Override
            public void send(Player player, String message) {
                WebSocket connection = playerConnections.get(player);
                if (connection != null && connection.isOpen()) connection.send(message);
            }
        });
    }

    @Override
    public void onOpen(WebSocket connection, ClientHandshake handshake) {
        Player assigned;
        synchronized (gameLock) {
            assigned = game.connectPlayer();
            if (assigned != null) {
                connectionPlayers.put(connection, assigned);
                playerConnections.put(assigned, connection);
            }
        }
        if (assigned == null) {
            connection.send("{\"type\":\"error\",\"message\":\"この試合は満員です\"}");
            connection.close(1000, "room full");
            return;
        }
        connection.send("{\"type\":\"welcome\",\"playerId\":\"" + assigned.id + "\"}");
        sendSnapshot();
        System.out.println(assigned.id + " connected from " + connection.getRemoteSocketAddress());
    }

    @Override
    public void onMessage(WebSocket connection, String message) {
        Player player = connectionPlayers.get(connection);
        if (player == null || message == null || message.length() > 160) return;
        synchronized (gameLock) {
            try {
                game.handleMessage(player, message.trim());
            } catch (RuntimeException ignored) {
                connection.send("{\"type\":\"error\",\"message\":\"入力を処理できません\"}");
            }
        }
    }

    @Override
    public void onClose(WebSocket connection, int code, String reason, boolean remote) {
        synchronized (gameLock) {
            Player player = connectionPlayers.remove(connection);
            if (player != null) {
                playerConnections.remove(player);
                game.disconnectPlayer(player);
            }
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
        System.out.println("CORE Defense server: ws://localhost:" + getPort());
    }

    private void tickSafely() {
        try {
            synchronized (gameLock) {
                game.update(TICK_SECONDS);
                snapshotTimer -= TICK_SECONDS;
                if (snapshotTimer <= 0) {
                    snapshotTimer = SNAPSHOT_INTERVAL;
                    sendSnapshot();
                }
            }
        } catch (RuntimeException error) {
            error.printStackTrace();
        }
    }

    private void sendSnapshot() {
        if (!getConnections().isEmpty()) broadcast(SnapshotBuilder.build(game));
    }

    public static void main(String[] args) {
        int port = args.length == 0 ? 8887 : Integer.parseInt(args[0]);
        new WasdServer(port).start();
    }
}
