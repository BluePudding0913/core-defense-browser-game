package example;

import java.util.Map;

/** Values shared by the server loop and the game simulation. */
final class GameConfig {
    static final int PLAYER_COUNT = 4;
    static final int MAX_ROUNDS = 50;
    static final double TICK_SECONDS = 0.05;
    static final double SNAPSHOT_INTERVAL = 0.1;
    static final double PREP_SECONDS = 30;
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
            "barricade", Map.of("wood", 6, "ore", 2),
            "copperTurret", Map.of("wood", 4, "ore", 6, "copper", 5),
            "silverTurret", Map.of("wood", 4, "ore", 8, "copper", 4, "silver", 6));

    static final int MEDKIT_PRICE = 120;
    static final int MEDKIT_HEAL = 60;
    static final int MEDKIT_CAPACITY = 5;
    static final int HEAL_PRICE = 80;
    static final int SHOTGUN_PELLETS = 4;
    static final int SHOTGUN_MAX_TARGETS = 4;
    static final Map<String, Integer> AMMO_CAPACITIES = Map.of(
            "shotgun", 90, "smg", 600, "rifle", 96, "sniper", 48,
            "revolver", 108, "lmg", 600, "dualPistol", 240);
    static final Map<String, WeaponStats> WEAPONS = Map.of(
            "pistol", new WeaponStats(285, 26, .38, 0, 10),
            "bat", new WeaponStats(96, 20, 1, 115, 26),
            "shotgun", new WeaponStats(220, 24, 1.25, 55, 2),
            "smg", new WeaponStats(270, 12, .14, 0, 11),
            "rifle", new WeaponStats(430, 58, 1.15, 0, 8),
            "sniper", new WeaponStats(650, 125, 1.8, 0, 5),
            "revolver", new WeaponStats(360, 320, 1.6, 12, 5),
            "dualPistol", new WeaponStats(340, 72, .30, 0, 12),
            "lmg", new WeaponStats(360, 18, .18, 0, 14));

    record WeaponStats(double range, double damage, double cooldown, double knockback, double width) { }

    private GameConfig() { }
}
