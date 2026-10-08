package example;

final class SilverAmmoRules {
    static final int COST = 1;
    static final int PACK_SIZE = 10;
    static final double DAMAGE_MULTIPLIER = 2.0;

    static boolean eligible(String weapon) {
        var definition = WeaponCatalog.find(weapon);
        return definition != null && switch (definition.mode()) {
            case RAY, SPREAD, RICOCHET -> true;
            default -> false;
        };
    }

    static WeaponCatalog.WeaponStats boost(WeaponCatalog.WeaponStats stats) {
        return new WeaponCatalog.WeaponStats(stats.range(), stats.damage() * DAMAGE_MULTIPLIER,
                stats.cooldown(), stats.knockback(), stats.width());
    }

    private SilverAmmoRules() { }
}
