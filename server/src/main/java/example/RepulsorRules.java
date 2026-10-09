package example;
final class RepulsorRules {
    static boolean contains(double x, double y, double dx, double dy, double range,
            double targetX, double targetY, double radius) {
        double ex = targetX-x, ey = targetY-y;
        return ex*dx + ey*dy >= -radius && Math.hypot(ex,ey) <= range + radius;
    }
    private RepulsorRules() { }
}
