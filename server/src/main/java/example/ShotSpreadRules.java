package example;

/** Angular shot cones, shared by humans, CPU and mounted guns. Area/melee attacks retain their own shape. */
final class ShotSpreadRules {
    private ShotSpreadRules() {}
    static double radius(String weapon) {
        return switch(weapon) {
            case "rifle" -> 70; case "sniper" -> 90;
            case "shotgun" -> 72.8;
            default -> 0;
        };
    }
    static double slope(String weapon) { return radius(weapon)*SniperRules.PIXEL_SLOPE; }
}
