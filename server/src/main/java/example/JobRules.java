package example;

/** Shared job rules for humans and CPU players. No UI or transport dependencies. */
final class JobRules {
    static final String DEFAULT = "healer";
    static final double SPY_DURATION = 8;
    static final double SPY_COOLDOWN = 30;

    private JobRules() { }

    static boolean valid(String job) {
        return java.util.Set.of("spy", "tp", "healer", "scout").contains(job);
    }

    static double dashSpeed(String job) { return job.equals("scout") ? 305 : 265; }
    static double staminaDrain(String job) { return job.equals("scout") ? 23.75 : 38; }
    static double reviveSeconds(String job) { return job.equals("healer") ? 2 : 4; }
    static boolean disguised(Player player) {
        return player.job.equals("spy") && !player.down && player.spyRemaining > 0;
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
