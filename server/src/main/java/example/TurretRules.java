package example;

/** Autonomous turret firing rules, independent of session state and transport. */
final class TurretRules {
    static final double SHOT_HP_COST = 4;
    static boolean canHit(String enemyType) { return !enemyType.equals("tiny"); }
    static double range(String type) {
        return type.equals("overclockSilver") ? 480 : type.equals("silverTurret") ? 380 : 300;
    }
    static double damage(String type, int round) {
        return (17 + round * .5) * (type.equals("overclockSilver") ? 14 : type.equals("silverTurret") ? 3.5 : type.equals("copperTurret") ? 2 : 1);
    }
    static double cooldown(String type) {
        return type.equals("overclockSilver") ? .15 : type.equals("silverTurret") ? .45 : .7;
    }
    private TurretRules() {}
}
