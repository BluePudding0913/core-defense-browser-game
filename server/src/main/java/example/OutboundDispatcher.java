package example;

import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Map;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.LongSupplier;
import org.java_websocket.WebSocket;
import org.java_websocket.WebSocketImpl;

/** Bounded per-connection output, independently drained outside game locks. */
final class OutboundDispatcher implements AutoCloseable {
    static final int MAX_MESSAGES = 128;
    static final int MAX_BYTES = 512 * 1024;
    static final long STALL_NANOS = TimeUnit.SECONDS.toNanos(5);
    private final Map<WebSocket, Channel> channels = new ConcurrentHashMap<>();
    private final ScheduledExecutorService clock = Executors.newSingleThreadScheduledExecutor(
            runnable -> daemon(runnable, "core-output-clock"));
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(2, 2, 0, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(256), runnable -> daemon(runnable, "core-output"));
    private final PerformanceMetrics metrics;
    private final LongSupplier now;
    private volatile boolean closed;

    OutboundDispatcher(PerformanceMetrics metrics) { this(metrics, System::nanoTime, true); }

    OutboundDispatcher(PerformanceMetrics metrics, LongSupplier now, boolean automatic) {
        this.metrics = metrics;
        this.now = now;
        if (automatic) clock.scheduleWithFixedDelay(this::dispatch, 0, 10, TimeUnit.MILLISECONDS);
    }

    void offer(WebSocket connection, String text, boolean replaceable, boolean optional) {
        if (closed || connection == null || !connection.isOpen()) return;
        Channel channel = channels.computeIfAbsent(connection, ignored -> new Channel());
        int bytes = text.getBytes(StandardCharsets.UTF_8).length;
        synchronized (channel) {
            if (channel.failed) return;
            if (replaceable) {
                channel.queue.removeIf(message -> {
                    if (!message.replaceable) return false;
                    channel.bytes -= message.bytes;
                    metrics.coalescedStates.increment();
                    return true;
                });
            }
            if (channel.queue.size() >= MAX_MESSAGES || bytes > MAX_BYTES - channel.bytes) {
                if (!optional) channel.failed = true;
                return;
            }
            channel.queue.addLast(new Message(text, bytes, replaceable));
            channel.bytes += bytes;
            metrics.appBacklogMax.accumulateAndGet(channel.bytes, Math::max);
        }
    }

    void forget(WebSocket connection) { channels.remove(connection); }

    private void dispatch() {
        for (var entry : channels.entrySet()) {
            Channel channel = entry.getValue();
            if (!channel.running.compareAndSet(false, true)) continue;
            try {
                workers.execute(() -> {
                    try { drain(entry.getKey(), channel); }
                    finally { channel.running.set(false); }
                });
            } catch (RejectedExecutionException full) {
                channel.running.set(false);
            }
        }
    }

    void drainForTest(WebSocket connection) {
        Channel channel = channels.get(connection);
        if (channel != null) drain(connection, channel);
    }

    private void drain(WebSocket connection, Channel channel) {
        try {
            if (!connection.isOpen()) { forget(connection); return; }
            for (int sent = 0; sent < 16; sent++) {
                boolean failed;
                synchronized (channel) { failed = channel.failed; }
                if (failed) { disconnect(connection, channel); return; }
                boolean buffered = connection.hasBufferedData();
                long libraryBytes = 0;
                if (connection instanceof WebSocketImpl impl) {
                    for (var buffer : impl.outQueue) libraryBytes += buffer.remaining();
                }
                metrics.libraryBacklogMax.accumulateAndGet(libraryBytes, Math::max);
                if (buffered) {
                    long time = now.getAsLong();
                    if (!channel.stalled) { channel.stalled = true; channel.stalledSince = time; }
                    metrics.stallNanosMax.accumulateAndGet(time - channel.stalledSince, Math::max);
                    if (libraryBytes > MAX_BYTES || time - channel.stalledSince >= STALL_NANOS)
                        disconnect(connection, channel);
                    return;
                }
                channel.stalled = false;
                Message message;
                synchronized (channel) {
                    message = channel.queue.pollFirst();
                    if (message != null) channel.bytes -= message.bytes;
                }
                if (message == null) return;
                long started = System.nanoTime();
                try { connection.send(message.text); }
                finally { metrics.send.record(System.nanoTime() - started); }
            }
        } catch (org.java_websocket.exceptions.WebsocketNotConnectedException disconnected) {
            forget(connection);
        } catch (RuntimeException failure) {
            disconnect(connection, channel);
        }
    }

    private void disconnect(WebSocket connection, Channel channel) {
        synchronized (channel) { channel.failed = true; channel.queue.clear(); channel.bytes = 0; }
        forget(connection);
        metrics.slowDisconnects.increment();
        connection.closeConnection(4001, "output backlog exceeded");
    }

    int pendingBytes(WebSocket connection) {
        Channel channel = channels.get(connection);
        if (channel == null) return 0;
        synchronized (channel) { return channel.bytes; }
    }

    @Override public void close() {
        closed = true;
        clock.shutdownNow();
        workers.shutdownNow();
        channels.clear();
    }

    private static Thread daemon(Runnable runnable, String name) {
        Thread thread = new Thread(runnable, name); thread.setDaemon(true); return thread;
    }

    private record Message(String text, int bytes, boolean replaceable) { }
    private static final class Channel {
        final ArrayDeque<Message> queue = new ArrayDeque<>();
        final AtomicBoolean running = new AtomicBoolean();
        int bytes;
        boolean failed;
        boolean stalled;
        long stalledSince;
    }
}
