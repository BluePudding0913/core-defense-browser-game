package example;

import java.util.HashSet;
import java.util.Set;

/** HP thresholds and attack timing; no session, rendering or protocol dependencies. */
final class WardenRules {
    static final double CHARGE_WARNING = 1.0, CHARGE_SPEED = 480, CHARGE_DISTANCE = 360;
    static final double PULSE_WARNING = 1.2, PULSE_RADIUS = 160;
    enum Action { IDLE, CHARGE_WARNING, CHARGING, PULSE_WARNING }
    static final class State {
        Action action = Action.IDLE;
        double remaining, targetX, targetY;
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
}
