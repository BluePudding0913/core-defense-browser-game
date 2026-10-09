package example;

/** Late-game upgrade balance. Validations are read-only; the session owns purchases. */
final class UpgradeRules {
    static final String AREA = "last-line";
    static final int ENCHANT_MAX = 3;
    static final double ENCHANT_STEP = .25, BOTTOMS_REDUCTION = .1, TOPS_REDUCTION = .2;
    static final int BOTTOMS_COST = 60_000, TOPS_COST = 100_000;
    static final int COMPRESSION_COST = 32;
    static final int TEAM_COST = 50_000;
    static final double TEAM_DURATION = 120;
    static final double TEAM_DAMAGE = 1.25, TEAM_DEFENSE = .8;

    static int enchantCost(int level) { return 40_000 * (level + 1) * (level + 1); }
    static double weaponMultiplier(int level) { return 1 + ENCHANT_STEP * Math.min(ENCHANT_MAX, Math.max(0, level)); }
    static double armorMultiplier(boolean bottoms, boolean tops) {
        return 1 - (bottoms ? BOTTOMS_REDUCTION : 0) - (tops ? TOPS_REDUCTION : 0);
    }
    static boolean canEnchant(boolean owned, boolean mounted, int level, int credits) {
        return owned && !mounted && level < ENCHANT_MAX && credits >= enchantCost(level);
    }
    private UpgradeRules() { }
}
