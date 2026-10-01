package example;

import java.util.Map;

/** Values shared by the server loop and the game simulation. */
final class GameConfig {
    static final int WORLD_W = 1800;
    static final int WORLD_H = 1200;
    static final int PLAYER_COUNT = 4;
    static final int MAX_ROUNDS = 12;
    static final double TICK_SECONDS = 0.05;
    static final double SNAPSHOT_INTERVAL = 0.1;
    static final double PREP_SECONDS = 20;
    static final double CORE_X = 900;
    static final double CORE_Y = 600;
    static final double ARMORY_X = 790;
    static final double ARMORY_Y = 660;
    static final double MED_X = 1010;
    static final double MED_Y = 660;

    static final Map<String, Integer> BUILD_COSTS = Map.of(
            "turret", 250,
            "wire", 120,
            "mine", 100,
            "barricade", 160);

    private GameConfig() { }
}
