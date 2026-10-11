package example;

/** Tactical priorities receive values only; movement and actions stay in the session. */
final class BotCombatRules {
    static double urgentThreatBonus(double coreDistance, double playerDistance, boolean clearShot) {
        double coreDanger = coreDistance < 160 ? 600 * (1 - coreDistance / 160) : 0;
        double personalDanger = playerDistance < 130 ? 300 * (1 - playerDistance / 130) : 0;
        return coreDanger + personalDanger + (clearShot ? 125 : -125);
    }
    static boolean shouldHeal(boolean combat, double cooldown, boolean active, int woundedNearby) {
        return combat && cooldown <= 0 && !active && woundedNearby > 0;
    }
    static double safePositionScore(double closestEnemy, double teamSpacing, boolean clearShot) {
        return Math.min(350, closestEnemy) * 2 + Math.min(100, teamSpacing) * .35 + (clearShot ? 45 : -35);
    }
    static MapPoint poisonEscape(double x, double y, java.util.List<EnemyPoisonSystem.Cloud> threats,
            java.util.function.BiPredicate<Double, Double> reachable) {
        double best = Double.NEGATIVE_INFINITY;
        MapPoint destination = null;
        for (int i = 0; i < 16; i++) {
            double angle = i * Math.PI / 8;
            double tx = x + Math.cos(angle) * 100, ty = y + Math.sin(angle) * 100;
            if (!reachable.test(tx, ty)) continue;
            double score = threats.stream().mapToDouble(c -> GameSupport.distance(c.x, c.y, tx, ty)).min().orElse(0);
            if (score > best) { best = score; destination = new MapPoint(tx, ty); }
        }
        return destination;
    }
    private BotCombatRules() { }
}
