package example;

/** Terminal missile balance and target validation shared by all actors. */
final class MissileRules {
    static final double DELAY = 2;
    static final int COST = 0;
    static double cooldown() { return 15; }
    static double damage() { return WeaponCatalog.stats("rocket").damage() * .72; }
    static double radius() { return WeaponCatalog.find("rocket").blastRadius(); }
    static boolean validTarget(double x, double y, java.util.Set<String> unlocked) {
        return Double.isFinite(x) && Double.isFinite(y) && GameMap.canOccupy(x, y, 0, unlocked);
    }
    private MissileRules() { }
}
