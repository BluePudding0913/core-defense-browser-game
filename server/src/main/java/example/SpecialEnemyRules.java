package example;

/** Special enemy decisions and hit geometry, independent of the session and protocol. */
final class SpecialEnemyRules {
    static final double BAG_HP = 600, BAG_RADIUS = 14, BAG_OFFSET = 26;
    static final int HUNTERS = 6;
    static boolean armsExplosion(long remaining, int total) { return total > 0 && remaining * 10 <= total; }
    static boolean overlapsBlast(double x, double y, double targetX, double targetY, double targetRadius, double blastRadius) {
        return Math.hypot(targetX - x, targetY - y) <= blastRadius + targetRadius;
    }
    static MapPoint bag(Enemy enemy) { return new MapPoint(enemy.x - enemy.facingX * BAG_OFFSET, enemy.y - enemy.facingY * BAG_OFFSET); }
    static boolean carriesHunters(Enemy enemy) { return enemy.type.equals("carrier") && enemy.bagHp > 0 && !enemy.offspringSpawned; }
    static boolean canRelease(Enemy enemy, Player player, boolean visible) {
        return carriesHunters(enemy) && player != null && !player.down && !JobRules.concealedFrom(player, enemy)
                && visible && Math.hypot(enemy.x - player.x, enemy.y - player.y) <= 260;
    }
    static double rayEntry(double x, double y, double radius, double ox, double oy, double dx, double dy, double range) {
        double projection = (x - ox) * dx + (y - oy) * dy;
        double perpendicular = Math.abs((x - ox) * dy - (y - oy) * dx);
        if (perpendicular > radius || projection + radius < 0) return Double.POSITIVE_INFINITY;
        double entry = Math.max(0, projection - Math.sqrt(Math.max(0, radius * radius - perpendicular * perpendicular)));
        return entry <= range ? entry : Double.POSITIVE_INFINITY;
    }
    static boolean hitsBag(Enemy enemy, double ox, double oy, double dx, double dy, double range, double width) {
        if (!carriesHunters(enemy)) return false;
        MapPoint bag = bag(enemy);
        double bagEntry = rayEntry(bag.x(), bag.y(), BAG_RADIUS + width, ox, oy, dx, dy, range);
        return Double.isFinite(bagEntry) && bagEntry < rayEntry(enemy.x, enemy.y, 21 + width, ox, oy, dx, dy, range);
    }
    private SpecialEnemyRules() { }
}