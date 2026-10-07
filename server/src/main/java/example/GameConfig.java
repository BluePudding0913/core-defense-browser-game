package example;

import java.util.Map;

/** Values shared by the server loop and the game simulation. */
final class GameConfig {
    static final int PLAYER_COUNT = 4;
    static final int MAX_ROUNDS = 50;
    static final double TICK_SECONDS = 0.05;
    static final double SNAPSHOT_INTERVAL = 0.1;
    static final double PREP_SECONDS = 10;

    static double prepSeconds(int upcomingRound) {
        if (upcomingRound >= 40) return 240;
        if (upcomingRound >= 30) return 180;
        if (upcomingRound >= 20) return 120;
        if (upcomingRound >= 10) return 60;
        if (upcomingRound >= 5) return 30;
        return PREP_SECONDS;
    }

    static double goldMultiplier(int currentRound) {
        return 1 + Math.max(0, currentRound - 10) * .1;
    }
    static final double RECONNECT_GRACE_SECONDS = 30;
    static final double GATHER_COOLDOWN_SECONDS = 3.5;
    // Fixed terminal prices keep later weapons accessible without long saving periods.
    static final Map<String, Integer> AREA_UNLOCK_COSTS = Map.ofEntries(
            Map.entry("entry-room", 150),
            Map.entry("transit-hall", 350),
            Map.entry("armory-wing", 350),
            Map.entry("forest", 1_000),
            Map.entry("relay-gallery", 1_000),
            Map.entry("mine", 1_000),
            Map.entry("security-hall", 2_000),
            Map.entry("command-room", 2_000),
            Map.entry("wood-room", 200),
            Map.entry("ore-room", 300),
            Map.entry("operations-room", 500),
            Map.entry("shotgun-room", 300),
            Map.entry("ricochet-room", 300),
            Map.entry("smg-room", 500),
            Map.entry("lmg-room", 1_500),
            Map.entry("rifle-room", 2_000),
            Map.entry("sniper-room", 3_000),
            Map.entry("heavy-arms-area", 12_000),
            Map.entry("revolver-room", 2_000),
            Map.entry("recovery-room", 250));
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
    static final double MEDBAY_PREP_HEAL_PER_SECOND = 100;
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
    static final double RAILGUN_CHARGE = 1.2;
    static final double RAILGUN_DURATION = 3;
    static final double RAILGUN_TICK = .1;


    private GameConfig() { }
}
