package example;

/** Converts combat rewards without dropping fractional gold from rapid or drone shots. */
final class GoldRewardRules {
    static final double MISSILE_MULTIPLIER = .4;
    record Payout(int credits, double remainder) { }

    static double multiplier(String weapon) {
        if ("missile".equals(weapon)) return MISSILE_MULTIPLIER;
        var definition = WeaponCatalog.find(weapon);
        return definition == null ? 1 : definition.goldMultiplier();
    }

    static Payout payout(int baseCredits, String weapon, boolean drone, double remainder) {
        double total = remainder + baseCredits * multiplier(weapon) * (drone ? .5 : 1);
        int credits = (int) Math.floor(total + 1e-9);
        return new Payout(credits, Math.max(0, total - credits));
    }
    private GoldRewardRules() { }
}
