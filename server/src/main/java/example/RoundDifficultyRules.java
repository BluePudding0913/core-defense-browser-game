package example;

/** Human-count difficulty, independent of session, transport and display state. */
final class RoundDifficultyRules {
    static final double DISCONNECT_GRACE_SECONDS = 30;

    static boolean countsAsHuman(boolean human, boolean reserved, double disconnectedSeconds) {
        return human || reserved && disconnectedSeconds < DISCONNECT_GRACE_SECONDS;
    }

    static int humanCount(int count) {
        return Math.max(1, Math.min(GameConfig.PLAYER_COUNT, count));
    }

    static double multiplier(int humans) {
        return (6 + humanCount(humans)) / 10.0;
    }

    static int population(int count, int humans) {
        return (int) Math.ceil(count * multiplier(humans));
    }

    static double enemyHp(String type, double hp, int humans) {
        return switch (type) {
            case "boss", "warden", "warlord", "titan", "explosionBoss", "finalBoss" -> hp * multiplier(humans);
            default -> hp;
        };
    }

    private RoundDifficultyRules() { }
}
