package example;

/** Angular shot cones, shared by humans, CPU and mounted guns. Area/melee attacks retain their own shape. */
final class ShotSpreadRules {
    private ShotSpreadRules() {}
    static double radius(String weapon) {
        return switch(weapon) {
            case "pistol" -> 100; case "smg" -> 140; case "rifle" -> 70;
            case "revolver" -> 85; case "lmg" -> 170; case "ricochet" -> 120;
            case "shotgun" -> 520; case "laserCannon" -> 80; case "freezeGun" -> 110;
            case "railgun" -> 75; case "rocket" -> 160; case "sniper" -> 90;
            default -> 0;
        };
    }
    static double slope(String weapon) { return radius(weapon)*SniperRules.PIXEL_SLOPE; }
}
