package example;

/** Shared job rules for humans and CPU players. No UI or transport dependencies. */
final class JobRules {
    static final String DEFAULT = "healer";
    static final double SPY_DURATION = 8;
    static final double SPY_COOLDOWN = 30;
    static final double SCOUT_DASH_DURATION = .2;
    static final double SCOUT_DASH_SPEED = 800;
    static final double SCOUT_DASH_COOLDOWN = 3;
    static final double SCOUT_DASH_STAMINA = 20;
    static final double SCOUT_DASH_STEP = 4;

    private JobRules() { }

    static boolean valid(String job) {
        return java.util.Set.of("spy", "tp", "healer", "scout").contains(job);
    }

    static double dashSpeed(String job) { return job.equals("scout") ? 305 : 265; }
    static double staminaDrain(String job) { return job.equals("scout") ? 23.75 : 38; }
    static double reviveSeconds(String job) { return job.equals("healer") ? 2 : 4; }
    static boolean canScoutDash(String job, boolean down, boolean carrying, boolean placing,
            boolean railgunBusy, double cooldown, double stamina) {
        return job.equals("scout") && !down && !carrying && !placing && !railgunBusy
                && cooldown <= 0 && stamina >= SCOUT_DASH_STAMINA;
    }

    static MapPoint scoutDashDirection(double x, double y, double targetX, double targetY) {
        double dx = targetX - x, dy = targetY - y;
        double length = Math.hypot(dx, dy);
        if (!Double.isFinite(length) || length < 1) return null;
        return new MapPoint(dx / length, dy / length);
    }

    static MapPoint advanceScoutDash(double x, double y, double dx, double dy, double travel,
            java.util.function.BiPredicate<Double, Double> canOccupy) {
        int steps = (int) Math.ceil(travel / SCOUT_DASH_STEP);
        for (int i = 0; i < steps; i++) {
            double step = Math.min(SCOUT_DASH_STEP, travel - i * SCOUT_DASH_STEP);
            double nextX = x + dx * step, nextY = y + dy * step;
            if (!canOccupy.test(nextX, nextY)) break;
            x = nextX; y = nextY;
        }
        return new MapPoint(x, y);
    }
    static boolean disguised(Player player) {
        return player.job.equals("spy") && !player.down && player.spyRemaining > 0;
    }

    static boolean avoidsContactDamage(Player player) {
        return disguised(player) || (player.job.equals("scout") && !player.down && player.scoutDashRemaining > 0);
    }

    static boolean canHitDisguisedAlly(Player shooter, Player target) {
        return shooter != target && disguised(target);
    }

    static boolean canRecoverTeleport(String job, boolean owned, double range, boolean clearLine) {
        return job.equals("tp") && owned && range <= 45 && clearLine;
    }

    static boolean canTeleportTo(MapPoint point, boolean terrainAllowed, Player actor,
            java.util.List<Player> players, java.util.List<Enemy> enemies, double coreX, double coreY) {
        return terrainAllowed && GameSupport.distance(point.x(), point.y(), coreX, coreY) >= 24
                && players.stream().noneMatch(other -> other != actor
                    && GameSupport.distance(other.x, other.y, point.x(), point.y()) < 12)
                && enemies.stream().noneMatch(enemy -> enemy.hp > 0
                    && GameSupport.distance(enemy.x, enemy.y, point.x(), point.y()) < 24);
    }
}
