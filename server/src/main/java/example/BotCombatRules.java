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
    private BotCombatRules() { }
}
