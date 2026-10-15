package example;

/** Round strength, applied once when any enemy is created. */
final class EnemyTierRules {
    static double multiplier(int round) {
        double tier = 1 + Math.max(0, round / 10) * .2;
        return round >= 10 && round <= 20 ? tier * .9 : tier;
    }
    static double hp(String type, double baseHp, int round) {
        double value = BossRules.spawnHp(type, baseHp * multiplier(round));
        if (type.equals("boss") && round == 4) value *= .5;
        if (type.equals("boss") && round == 8) value = Math.round(value * .85 / 100) * 100.0;
        return type.equals("finalBoss") ? Math.round(value / 100) * 100.0 : value;
    }
    private EnemyTierRules() {}
}
