package example;

import java.util.Map;

/** Values shared by the server loop and the game simulation. */
final class GameConfig {
    static final int PLAYER_COUNT = 4;
    static final int MAX_ROUNDS = 50;
    static final double TICK_SECONDS = 0.05;
    static final double SNAPSHOT_INTERVAL = 0.1;
    static final double PREP_SECONDS = 15;
    static final double RECONNECT_GRACE_SECONDS = 30;
    static final double GATHER_COOLDOWN_SECONDS = 3.5;
    // Fixed terminal prices: major progression gates create deliberate saving milestones.
    static final Map<String, Integer> AREA_UNLOCK_COSTS = Map.ofEntries(
            Map.entry("entry-room", 350),
            Map.entry("transit-hall", 700),
            Map.entry("armory-wing", 700),
            Map.entry("forest", 2_000),
            Map.entry("relay-gallery", 2_000),
            Map.entry("mine", 2_000),
            Map.entry("security-hall", 5_000),
            Map.entry("command-room", 5_000),
            Map.entry("wood-room", 400),
            Map.entry("ore-room", 600),
            Map.entry("operations-room", 1_000),
            Map.entry("shotgun-room", 600),
            Map.entry("ricochet-room", 600),
            Map.entry("smg-room", 1_000),
            Map.entry("lmg-room", 3_000),
            Map.entry("rifle-room", 5_000),
            Map.entry("sniper-room", 7_500),
            Map.entry("heavy-arms-area", 30_000),
            Map.entry("revolver-room", 5_000),
            Map.entry("recovery-room", 500));
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
            "silverTurret", Map.of("wood", 4, "ore", 8, "copper", 4, "silver", 8));

    static final int MEDKIT_PRICE = 120;
    static final int MEDKIT_HEAL = 60;
    static final int MEDKIT_CAPACITY = 5;
    static final double MEDBAY_HEAL_PER_SECOND = 4;
    static final double MEDBAY_DAMAGE_DELAY = 5;
    static final double MEDBAY_RANGE = 95;
    static final double BOMBER_BLAST_RADIUS = 4 * GameMap.TILE_SIZE;
    static final double EXPLOSION_BOSS_BLAST_RADIUS = 12 * GameMap.TILE_SIZE;
    static final double EXPLOSION_BOSS_FUSE_SECONDS = 30;
    static final double EXPLOSION_BOSS_DAMAGE = 100 * 1.10;
    static final double ROCKET_BLAST_RADIUS = 200;
    static final double ARTILLERY_RANGE = 420;
    static final double ARTILLERY_BLAST_RADIUS = 64;
    static final double ARTILLERY_FLIGHT_SECONDS = 1.5;
    static final double ARTILLERY_COOLDOWN = 4;
    static final int SHOTGUN_PELLETS = 4;
    static final int SHOTGUN_MAX_TARGETS = 4;
    static final Map<String, Integer> AMMO_CAPACITIES = Map.of(
            "shotgun", 50, "smg", 240, "rifle", 30, "sniper", 15,
            "revolver", 30, "lmg", 600, "ricochet", 240, "rocket", 8, "railgun", 8);
    static final Map<String, WeaponStats> WEAPONS = Map.ofEntries(
            Map.entry("pistol", new WeaponStats(5 * GameMap.TILE_SIZE, 26, .38, 0, 2)),
            Map.entry("bat", new WeaponStats(96, 20, 1, 115, 26)),
            Map.entry("shotgun", new WeaponStats(220, 24, 1.25, 45, 2)),
            Map.entry("smg", new WeaponStats(270, 12, .14, 0, 2)),
            Map.entry("rifle", new WeaponStats(430, 120, 1.15, 0, 2)),
            Map.entry("sniper", new WeaponStats(2400, 280, 1.8, 0, 2)),
            Map.entry("revolver", new WeaponStats(360, 320, 1.6, 10, 2)),
            Map.entry("ricochet", new WeaponStats(1000, 30, .30, 0, 2)),
            Map.entry("rocket", new WeaponStats(1200, 3000, 5, 100, 2)),
            Map.entry("lmg", new WeaponStats(360, 18, .18, 0, 2)),
            Map.entry("railgun", new WeaponStats(2400, 3000, 2, 0, GameMap.TILE_SIZE / 2.0)));

    static final double RAILGUN_CHARGE = 1.2;
    static final double RAILGUN_DURATION = 3;
    static final double RAILGUN_TICK = .1;

    record WeaponStats(double range, double damage, double cooldown, double knockback, double width) { }

    private GameConfig() { }
}
