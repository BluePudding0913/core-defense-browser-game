package example;

import java.util.Arrays;
import java.util.concurrent.atomic.LongAdder;

/** Fixed-size, cumulative counters with a bounded recent latency sample. */
final class PerformanceMetrics {
    final Latency update = new Latency();
    final Latency snapshot = new Latency();
    final Latency lockWait = new Latency();
    final Latency lockHeld = new Latency();
    final Latency scheduleDelay = new Latency();
    final Latency path = new Latency();
    final Latency send = new Latency();
    final LongAdder pathVisits = new LongAdder();
    final LongAdder pathHits = new LongAdder();
    final LongAdder snapshotBytes = new LongAdder();
    final LongAdder skippedTicks = new LongAdder();
    final LongAdder coalescedStates = new LongAdder();
    final LongAdder slowDisconnects = new LongAdder();

    String summary() {
        return "update=" + update.summary() + " snapshot=" + snapshot.summary()
                + " lockWait=" + lockWait.summary() + " lockHeld=" + lockHeld.summary()
                + " delay=" + scheduleDelay.summary() + " path=" + path.summary()
                + " send=" + send.summary() + " visits=" + pathVisits.sum()
                + " pathHits=" + pathHits.sum() + " snapshotBytes=" + snapshotBytes.sum()
                + " skippedTicks=" + skippedTicks.sum() + " coalesced=" + coalescedStates.sum()
                + " slowDisconnects=" + slowDisconnects.sum();
    }

    static final class Latency {
        private final long[] recent = new long[256];
        private long count;
        private long max;
        private long overBudget;

        synchronized void record(long nanos) {
            nanos = Math.max(0, nanos);
            recent[(int) (count++ % recent.length)] = nanos;
            max = Math.max(max, nanos);
            if (nanos > 50_000_000) overBudget++;
        }

        synchronized long count() { return count; }

        synchronized long max() { return max; }

        synchronized String summary() {
            int length = (int) Math.min(count, recent.length);
            if (length == 0) return "0";
            long[] values = Arrays.copyOf(recent, length);
            Arrays.sort(values);
            return String.format(java.util.Locale.ROOT,
                    "%d/p95:%.3f/p99:%.3f/max:%.3f/over50:%d", count,
                    values[(int) Math.ceil(length * .95) - 1] / 1e6,
                    values[(int) Math.ceil(length * .99) - 1] / 1e6, max / 1e6, overBudget);
        }
    }
}
