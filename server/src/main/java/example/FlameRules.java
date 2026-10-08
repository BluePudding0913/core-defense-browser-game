package example;

/** Cone geometry shared by every source of flamethrower fire. */
final class FlameRules {
    static final double HALF_ANGLE = Math.PI / 7;
    static boolean contains(double x, double y, double radius, double originX, double originY,
            double dx, double dy, double range) {
        double offsetX = x - originX, offsetY = y - originY;
        double forward = offsetX * dx + offsetY * dy;
        if (forward < 0 || Math.hypot(offsetX, offsetY) > range) return false;
        return Math.abs(offsetX * dy - offsetY * dx) <= forward * Math.tan(HALF_ANGLE) + radius;
    }
    private FlameRules() { }
}
