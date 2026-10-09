package example;
/** Range and clock rules for persistent gas, independent of sessions and transport. */
final class PoisonGasRules {
    static final double RADIUS = 120, DURATION = 6, INTERVAL = .5;
    static final int MAX_CLOUDS = 24;
    static final class Cloud {
        final String ownerId;
        final double x, y, damage;
        double remaining = DURATION, tick;
        Cloud(String ownerId, double x, double y, double damage) {
            this.ownerId = ownerId; this.x = x; this.y = y; this.damage = damage;
        }
    }
    static int advance(Cloud cloud, double dt) {
        double elapsed = Math.min(Math.max(0, dt), cloud.remaining);
        cloud.remaining = Math.max(0, cloud.remaining - elapsed);
        cloud.tick += elapsed;
        int ticks = (int)Math.floor((cloud.tick + 1e-9) / INTERVAL);
        cloud.tick = Math.max(0, cloud.tick - ticks * INTERVAL);
        return ticks;
    }
    static boolean contains(Cloud cloud, double x, double y, double radius) {
        return Math.hypot(x-cloud.x, y-cloud.y) <= RADIUS + radius;
    }
    private PoisonGasRules() { }
}
