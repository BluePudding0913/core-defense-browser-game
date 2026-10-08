package example;

import java.util.HashSet;
import java.util.Set;

/** HP thresholds and attack timing; no session, rendering or protocol dependencies. */
final class WardenRules {
    static final double CHARGE_WARNING = 1.0, CHARGE_SPEED = 480, CHARGE_DISTANCE = 360;
    static final double PULSE_WARNING = 1.2, PULSE_RADIUS = 160;
    static final double CHARGE_RADIUS = 42;
    enum Action { IDLE, CHARGE_WARNING, CHARGING, PULSE_WARNING }
    static final class State {
        Action action = Action.IDLE;
        double remaining, targetX, targetY;
        double chargeX, chargeY;
        boolean nextPulse;
        final Set<String> struck = new HashSet<>();
    }
    static int phase(double hp, double maxHp) {
        double ratio = maxHp > 0 ? hp / maxHp : 1;
        return ratio <= .30 ? 3 : ratio <= .60 ? 2 : 1;
    }
    static double cooldown(int phase) { return phase == 3 ? 4 : 6; }
    static double movementMultiplier(int phase) { return phase == 3 ? 1.5 : phase == 2 ? 1.2 : 1; }
    static boolean appearsInRound(int round) { return round >= 16 && round % 16 == 0; }
    static double clearance(Action action, double fromX, double fromY, double toX, double toY, double x, double y) {
        if (action == Action.PULSE_WARNING) return Math.hypot(x - fromX, y - fromY) - PULSE_RADIUS - 24;
        if (action != Action.CHARGE_WARNING && action != Action.CHARGING) return Double.POSITIVE_INFINITY;
        double dx = toX - fromX, dy = toY - fromY;
        double lengthSquared = dx * dx + dy * dy;
        double projection = lengthSquared > 0 ? GameSupport.clamp(((x - fromX) * dx + (y - fromY) * dy) / lengthSquared, 0, 1) : 0;
        return Math.hypot(x - fromX - dx * projection, y - fromY - dy * projection) - CHARGE_RADIUS - 24;
    }
}
