package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.*;
import org.java_websocket.WebSocket;
import org.junit.jupiter.api.Test;

class OutboundDispatcherTest {
    @Test void stalledPeerCoalescesStateWithoutDelayingHealthyPeerOrWelcome() {
        AtomicLong time = new AtomicLong();
        AtomicBoolean buffered = new AtomicBoolean(true);
        List<String> slowMessages = new ArrayList<>(), healthyMessages = new ArrayList<>();
        AtomicInteger closed = new AtomicInteger();
        WebSocket slow = socket(buffered, slowMessages, closed);
        WebSocket healthy = socket(new AtomicBoolean(), healthyMessages, new AtomicInteger());
        PerformanceMetrics metrics = new PerformanceMetrics();
        try (OutboundDispatcher output = new OutboundDispatcher(metrics, time::get, false)) {
            output.offer(slow, "map", false, false);
            output.offer(slow, "welcome", false, false);
            for (int i = 0; i < 1000; i++) output.offer(slow, "state" + i, true, false);
            output.offer(healthy, "healthy", true, false);
            output.drainForTest(slow);
            output.drainForTest(healthy);
            assertEquals(List.of("healthy"), healthyMessages);
            assertTrue(slowMessages.isEmpty());
            assertTrue(output.pendingBytes(slow) < 100);
            assertEquals(999, metrics.coalescedStates.sum());
            buffered.set(false);
            output.drainForTest(slow);
            assertEquals(List.of("map", "welcome", "state999"), slowMessages);
            buffered.set(true);
            output.drainForTest(slow);
            time.set(OutboundDispatcher.STALL_NANOS);
            output.drainForTest(slow);
            assertEquals(1, closed.get());
            assertEquals(1, metrics.slowDisconnects.sum());
        }
    }

    @Test void requiredOverflowDisconnectsAndOptionalOverflowIsBounded() {
        WebSocket peer = socket(new AtomicBoolean(true), new ArrayList<>(), new AtomicInteger());
        AtomicInteger closed = new AtomicInteger();
        WebSocket required = socket(new AtomicBoolean(), new ArrayList<>(), closed);
        try (OutboundDispatcher output = new OutboundDispatcher(new PerformanceMetrics(), () -> 0L, false)) {
            for (int i = 0; i < 1000; i++) output.offer(peer, "effect", false, true);
            assertTrue(output.pendingBytes(peer) <= OutboundDispatcher.MAX_MESSAGES * 6);
            output.offer(required, "x".repeat(OutboundDispatcher.MAX_BYTES + 1), false, false);
            output.drainForTest(required);
            assertEquals(1, closed.get());
            assertEquals(0, output.pendingBytes(required));
        }
    }

    private WebSocket socket(AtomicBoolean buffered, List<String> messages, AtomicInteger closed) {
        return (WebSocket) Proxy.newProxyInstance(WebSocket.class.getClassLoader(), new Class<?>[]{WebSocket.class},
                (proxy, method, args) -> switch (method.getName()) {
                    case "isOpen" -> closed.get() == 0;
                    case "hasBufferedData" -> buffered.get();
                    case "send" -> { messages.add((String) args[0]); yield null; }
                    case "closeConnection" -> { closed.incrementAndGet(); yield null; }
                    case "hashCode" -> System.identityHashCode(proxy);
                    case "equals" -> proxy == args[0];
                    default -> throw new UnsupportedOperationException(method.getName());
                });
    }
}
