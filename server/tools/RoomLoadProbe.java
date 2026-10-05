package example;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;

/** Local real-WebSocket load probe with a light control room and one non-reading peer. */
public final class RoomLoadProbe {
    public static void main(String[] args) throws Exception {
        int count = args.length > 0 ? Integer.parseInt(args[0]) : 4;
        int enemies = args.length > 1 ? Integer.parseInt(args[1]) : 200;
        int seconds = args.length > 2 ? Integer.parseInt(args[2]) : 12;
        if (count < 1 || count > 64 || enemies < 0 || seconds < 1) throw new IllegalArgumentException();
        WasdServer server = new WasdServer("127.0.0.1", 0);
        server.setDaemon(true);
        List<Peer> peers = new ArrayList<>();
        Socket slow = null;
        List<GameSession> games = new ArrayList<>();
        long gcBefore = gcMillis();
        try {
            for (int i = 0; i < count; i++) {
                String id = "load" + i;
                String session = "load-session-" + i + "-123456789";
                Method create = WasdServer.class.getDeclaredMethod("createRoom", String.class, String.class, String.class);
                create.setAccessible(true);
                Object room = create.invoke(server, id, session, id);
                GameSession game = (GameSession) field(room, "game");
                games.add(game);
                game.connectPlayer(session);
                game.setRoomOwner(game.players.get(0));
                for (int slot = 1; slot < 4; slot++) {
                    game.players.get(slot).human = true;
                    game.players.get(slot).sessionId = slot == 1 && i == count - 1
                            ? "slow-session-123456789" : "fixture-" + i + "-" + slot;
                }
                game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
                if (i > 0 || count == 1) {
                    game.phase = GamePhase.WAVE;
                    game.round = 40;
                    game.coreHp = game.coreMaxHp = 1e12;
                    for (int enemy = 0; enemy < enemies; enemy++) {
                        SpawnPoint spawn = GameMap.SPAWN_POINTS.get(enemy % GameMap.SPAWN_POINTS.size());
                        game.enemies.add(new Enemy(enemy + 1, "normal", spawn, 1e9, 0, 0, 0));
                    }
                }
                @SuppressWarnings("unchecked") Map<String, Object> rooms = (Map<String, Object>) field(server, "rooms");
                rooms.put(id, room);
            }
            server.start();
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (server.getPort() <= 0 && System.nanoTime() < deadline) Thread.sleep(10);
            if (server.getPort() <= 0) throw new IllegalStateException("Server did not bind");
            System.out.println("PROBE bound=" + server.getPort());
            for (int i = 0; i < count; i++) {
                Peer peer = new Peer(new URI("ws://127.0.0.1:" + server.getPort()
                        + "/?room=load" + i + "&session=load-session-" + i + "-123456789"));
                peers.add(peer);
                peer.setDaemon(true);
                boolean connected = peer.connectBlocking(30, TimeUnit.SECONDS);
                System.out.println("PROBE peer=" + i + " connected=" + connected);
                if (!connected || !peer.welcome.await(5, TimeUnit.SECONDS))
                    throw new IllegalStateException("Client did not receive welcome");
            }
            slow = new Socket();
            slow.setReceiveBufferSize(1024);
            slow.connect(new InetSocketAddress("127.0.0.1", server.getPort()));
            String handshake = "GET /?room=load" + (count - 1) + "&session=slow-session-123456789 HTTP/1.1\r\n"
                    + "Host: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                    + "Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n";
            slow.getOutputStream().write(handshake.getBytes(StandardCharsets.US_ASCII));
            // Deliberately never read the response or any frames.
            Thread.sleep(2000);
            System.gc();
            long heapBefore = heapBytes();
            peers.forEach(peer -> peer.measure = true);
            long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(seconds);
            while (System.nanoTime() < end) {
                for (Peer peer : peers) peer.input();
                Thread.sleep(50);
            }
            Thread.sleep(200);
            System.gc();
            System.out.println("LOAD rooms=" + count + " enemiesPerHeavyRoom=" + enemies + " seconds=" + seconds
                    + " java=" + System.getProperty("java.version") + " cpus=" + Runtime.getRuntime().availableProcessors());
            System.out.println("CONTROL ack=" + peers.get(0).latency.summary()
                    + " states=" + peers.get(0).states.get() + " maxStateGapMs=" + peers.get(0).maxGap / 1e6);
            System.out.println("HEAP retainedBefore=" + heapBefore + " retainedAfter=" + heapBytes()
                    + " gcMillis=" + (gcMillis() - gcBefore));
            try {
                System.out.println("SERVER " + ((PerformanceMetrics) field(server, "performance")).summary());
                for (int i = 0; i < Math.min(count, 2); i++)
                    System.out.println("ROOM " + i + " " + ((PerformanceMetrics) field(games.get(i), "performance")).summary());
            } catch (NoSuchFieldException baseline) {
                System.out.println("Baseline has no internal performance counters.");
            }
        } finally {
            if (slow != null) slow.close();
            for (Peer peer : peers) peer.close();
            server.stop(1000);
        }
    }

    private static Object field(Object object, String name) throws Exception {
        Field field = object.getClass().getDeclaredField(name); field.setAccessible(true); return field.get(object);
    }

    private static long heapBytes() { return Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory(); }
    private static long gcMillis() {
        return java.lang.management.ManagementFactory.getGarbageCollectorMXBeans().stream()
                .mapToLong(bean -> Math.max(0, bean.getCollectionTime())).sum();
    }

    private static final class Peer extends WebSocketClient {
        final CountDownLatch welcome = new CountDownLatch(1);
        final ObjectMapper json = new ObjectMapper();
        final ConcurrentHashMap<Integer, Long> pending = new ConcurrentHashMap<>();
        final PerformanceMetrics.Latency latency = new PerformanceMetrics.Latency();
        final AtomicInteger states = new AtomicInteger();
        volatile boolean measure;
        volatile long maxGap;
        long lastState;
        int sequence;
        String playerId;
        Peer(URI uri) { super(uri); }
        void input() {
            if (!isOpen()) return;
            int seq = ++sequence;
            pending.put(seq, System.nanoTime());
            send("INPUT:" + seq + ":HELLO:Probe");
        }
        @Override public void onOpen(ServerHandshake handshake) { }
        @Override public void onMessage(String text) {
            try {
                var message = json.readTree(text);
                if (message.path("type").asText().equals("error")) System.err.println("PROBE " + text);
                if (message.path("type").asText().equals("welcome")) {
                    playerId = message.path("playerId").asText(); welcome.countDown();
                }
                if (!message.path("type").asText().equals("state")) return;
                long now = System.nanoTime();
                if (measure) {
                    states.incrementAndGet();
                    if (lastState != 0) maxGap = Math.max(maxGap, now - lastState);
                    lastState = now;
                }
                for (var player : message.path("players")) {
                    if (!player.path("id").asText().equals(playerId)) continue;
                    int ack = player.path("ackInput").asInt();
                    pending.forEach((seq, sent) -> {
                        if (seq <= ack && pending.remove(seq, sent) && measure) latency.record(now - sent);
                    });
                }
            } catch (Exception failure) { throw new IllegalStateException(failure); }
        }
        @Override public void onClose(int code, String reason, boolean remote) { }
        @Override public void onError(Exception error) { System.err.println(error); }
    }
}
