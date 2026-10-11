package example;

/** Extra decade pressure, applied once when any enemy is created. */
final class EnemyTierRules {
    static double multiplier(int round) { return 1 + Math.max(0, round / 10) * .2; }
    static double hp(String type, double baseHp, int round) {
        double value = BossRules.spawnHp(type, baseHp * multiplier(round));
        if (type.equals("boss") && round == 4) value *= .5;
        return type.equals("finalBoss") ? Math.round(value / 100) * 100.0 : value;
    }
    private EnemyTierRules() {}
}
