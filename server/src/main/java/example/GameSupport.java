package example;

/** Small shared calculations and protocol-safe string conversion. */
final class GameSupport {
    private GameSupport() { }

    static double roundOne(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    static double distance(double ax, double ay, double bx, double by) {
        return Math.hypot(ax - bx, ay - by);
    }

    static String escapeJson(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "");
    }
}

/** Per-connection burst limit; combat and movement also have independent server-side timing. */
final class MessageBudget {
    private double tokens = 180;
    private long lastNanos;
    synchronized boolean take(long now) {
        if (lastNanos != 0) tokens = Math.min(180, tokens + Math.max(0, now - lastNanos) / 1_000_000_000.0 * 120);
        lastNanos = now;
        if (tokens < 1) return false;
        tokens--;
        return true;
    }
}
