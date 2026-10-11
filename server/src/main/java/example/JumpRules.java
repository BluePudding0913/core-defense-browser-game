package example;

/** Vertical movement in world units. Geometry and state ownership stay with callers. */
final class JumpRules {
    static final double SPEED = 196, GRAVITY = 627.2, OBSTACLE_HEIGHT = 24, BODY_HEIGHT = 32;
    record Motion(double height, double velocity) { }
    static Motion advance(double height, double velocity, double dt, double support, double ceiling) {
        double next = height + velocity * dt - GRAVITY * dt * dt / 2;
        double speed = velocity - GRAVITY * dt;
        double limit = Math.max(support, ceiling - BODY_HEIGHT);
        if (next > limit) { next = limit; speed = Math.min(0, speed); }
        if (next <= support && speed <= 0) return new Motion(support, 0);
        return new Motion(next, speed);
    }
    static boolean grounded(double height, double velocity, double support) {
        return velocity == 0 && Math.abs(height - support) < .01;
    }
    private JumpRules() { }
}
