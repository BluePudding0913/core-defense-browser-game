package example;

/** Shared boss walking speed and HP phases, without session state. */
final class BossRules {
    static double baseSpeed(String type, double ordinarySpeed, double runnerSpeed) {
        return switch (type) {
            case "boss", "warden", "warlord", "titan" -> runnerSpeed;
            default -> ordinarySpeed;
        };
    }

    static int phase(String type, double hp, double maxHp) {
        return type.equals("warlord") || type.equals("titan") ? WardenRules.phase(hp, maxHp) : 1;
    }

    static double movementMultiplier(String type, double hp, double maxHp) {
        return WardenRules.movementMultiplier(phase(type, hp, maxHp));
    }

    static double attackRate(String type, double hp, double maxHp) {
        return switch (phase(type, hp, maxHp)) {
            case 3 -> 2;
            case 2 -> 1.5;
            default -> 1;
        };
    }

    private BossRules() {}
}
