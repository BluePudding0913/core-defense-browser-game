package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.*;
import java.net.InetSocketAddress;
import java.util.Map;
import java.util.concurrent.*;
import java.util.concurrent.locks.ReentrantLock;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.HandshakeImpl1Client;
import org.junit.jupiter.api.Test;

class RoomIsolationTest {
    @Test void failureInOneRoomDoesNotCancelOtherRoomsAndLockIsReleased() throws Exception {
        WasdServer server = new WasdServer("127.0.0.1", 0);
        Object broken = room(server, "broken"), normal = room(server, "normal");
        GameSession bad = (GameSession) field(broken, "game");
        GameSession good = (GameSession) field(normal, "game");
        bad.phase = GamePhase.WAVE;
        bad.enemies.add(null); // Force the room's simulation to throw.
        Method tick = WasdServer.class.getDeclaredMethod("tickSafely"); tick.setAccessible(true);
        try {
            tick.invoke(server);
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
            while ((good.performance.update.count() == 0 || bad.performance.updateFailures.sum() == 0)
                    && System.nanoTime() < deadline) Thread.sleep(5);
            assertEquals(1, bad.performance.updateFailures.sum());
            assertTrue(good.performance.update.count() > 0);
            ReentrantLock lock = (ReentrantLock) field(broken, "lock");
            assertTrue(lock.tryLock());
            lock.unlock();
        } finally { server.stop(100); }
    }

    @Test void blockedRoomDoesNotBlockOtherInputsUpdatesOrDirectoryAndDoesNotQueueTicks() throws Exception {
        WasdServer server = new WasdServer("127.0.0.1", 0);
        Object heavy = room(server, "heavy"), normal = room(server, "normal");
        ReentrantLock heavyLock = (ReentrantLock) field(heavy, "lock");
        GameSession normalGame = (GameSession) field(normal, "game");
        WebSocket player = socket();
        HandshakeImpl1Client handshake = new HandshakeImpl1Client();
        handshake.setResourceDescriptor("/?room=normal&session=normal-session-12345");
        server.onOpen(player, handshake);
        ExecutorService actions = Executors.newSingleThreadExecutor();
        heavyLock.lock();
        try {
            Method tick = WasdServer.class.getDeclaredMethod("tickSafely"); tick.setAccessible(true);
            tick.invoke(server);
            actions.submit(() -> server.onMessage(player, "INPUT:1:HELLO:Independent")).get(2, TimeUnit.SECONDS);
            assertEquals(1, normalGame.players.get(0).lastProcessedInput);
            actions.submit(() -> {
                HandshakeImpl1Client directory = new HandshakeImpl1Client();
                directory.setResourceDescriptor("/?directory=1&session=directory-session-12345");
                server.onOpen(socket(), directory);
            }).get(2, TimeUnit.SECONDS);
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
            while (normalGame.performance.update.count() == 0 && System.nanoTime() < deadline) Thread.sleep(5);
            assertTrue(normalGame.performance.update.count() > 0);
            for (int i = 0; i < 100; i++) tick.invoke(server);
            GameSession heavyGame = (GameSession) field(heavy, "game");
            assertEquals(0, heavyGame.performance.update.count());
            assertEquals(100, heavyGame.performance.skippedTicks.sum());
            ThreadPoolExecutor workers = (ThreadPoolExecutor) field(server, "roomWorkers");
            assertTrue(workers.getQueue().size() <= 1, "at most one outstanding task per room");
        } finally {
            heavyLock.unlock();
            actions.shutdownNow();
            server.stop(100);
        }
        assertTrue(((ThreadPoolExecutor) field(server, "roomWorkers")).isShutdown());
    }

    @SuppressWarnings("unchecked")
    static Object room(WasdServer server, String id) throws Exception {
        Method create = WasdServer.class.getDeclaredMethod("createRoom", String.class, String.class, String.class);
        create.setAccessible(true);
        Object room = create.invoke(server, id, "session-" + id + "-123456789", id);
        ((Map<String, Object>) field(server, "rooms")).put(id, room);
        return room;
    }

    static Object field(Object object, String name) throws Exception {
        Field field = object.getClass().getDeclaredField(name); field.setAccessible(true); return field.get(object);
    }

    private static WebSocket socket() {
        return (WebSocket) Proxy.newProxyInstance(WebSocket.class.getClassLoader(), new Class<?>[]{WebSocket.class},
                (proxy, method, args) -> switch (method.getName()) {
                    case "isOpen" -> true;
                    case "hasBufferedData" -> false;
                    case "getRemoteSocketAddress" -> new InetSocketAddress("127.0.0.1", 10000);
                    case "send", "close", "closeConnection" -> null;
                    case "hashCode" -> System.identityHashCode(proxy);
                    case "equals" -> proxy == args[0];
                    default -> throw new UnsupportedOperationException(method.getName());
                });
    }
}
