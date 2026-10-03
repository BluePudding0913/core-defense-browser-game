package example;

import java.util.Map;

/** Values shared by the server loop and the game simulation. */
final class GameConfig {
    static final int PLAYER_COUNT = 4;
    static final int MAX_ROUNDS = 20;
    static final double TICK_SECONDS = 0.05;
    static final double SNAPSHOT_INTERVAL = 0.1;
    static final double PREP_SECONDS = 20;
    static final double RECONNECT_GRACE_SECONDS = 30;
    static final double GATHER_COOLDOWN_SECONDS = 3.5;
    static final Map<String, Integer> BUILD_COSTS = Map.of(
            "block", 60,
            "turret", 250,
            "wire", 120,
            "mine", 100,
            "barricade", 160);
    static final Map<String, Map<String, Integer>> BUILD_RECIPES = Map.of(
            "block", Map.of("wood", 4),
            "turret", Map.of("wood", 4, "ore", 8),
            "wire", Map.of("wood", 2, "ore", 4),
            "mine", Map.of("wood", 1, "ore", 5),
            "barricade", Map.of("wood", 6, "ore", 2));

    private GameConfig() { }
}
