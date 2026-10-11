package example;

/** Distance bonuses shared by human, CPU and drone weapon attacks. */
final class WeaponDamageRules {
    private static final double SNIPER_DAMAGE_DISTANCE = 2400;
    private WeaponDamageRules() {}
    static double atDistance(String weapon, double damage, double distance) {
        if (!weapon.equals("sniper")) return damage;
        return damage * (1 + Math.max(0, Math.min(1, distance / SNIPER_DAMAGE_DISTANCE)));
    }
}
