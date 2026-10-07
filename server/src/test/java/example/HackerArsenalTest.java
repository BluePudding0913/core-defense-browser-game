package example;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class HackerArsenalTest {
    GameSession game;
    Player player;
    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
        player = game.connectPlayer("hacker-test");
        game.phase = GamePhase.PREPARING; game.prepTime = 1000;
        game.players.forEach(p -> p.human = true);
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        player.job = "hacker";
        player.x = GameMap.MISSILE_COMPUTER.x(); player.y = GameMap.MISSILE_COMPUTER.y();
    }
    Enemy enemy(double x, double y) {
        Enemy e = new Enemy(game.enemies.size() + 1, "grunt", GameMap.SPAWN_POINTS.get(0), 10000, 0, 0, 100);
        e.x = x; e.y = y; game.enemies.add(e); return e;
    }
    void advance(double seconds) { for (int i = 0; i < Math.round(seconds / .05); i++) game.update(.05); }
    @Test void onlyNearbyHackerCanOpenUnlockedComputer() {
        player.job = "scout"; game.handleMessage(player, "COMPUTER"); assertFalse(player.missileControl);
        player.job = "hacker"; game.unlockedAreas.clear();
        game.handleMessage(player, "COMPUTER"); assertFalse(player.missileControl);
        game.unlockedAreas.add("heavy-arms-area"); player.x += 100;
        game.handleMessage(player, "COMPUTER"); assertFalse(player.missileControl);
        player.x -= 100; game.handleMessage(player, "COMPUTER"); assertTrue(player.missileControl);
        game.handleMessage(player, "MOVE:1:0"); advance(.2); assertEquals(GameMap.MISSILE_COMPUTER.x(), player.x);
        player.down = true; advance(.05); assertFalse(player.missileControl);
    }
    @Test void missileHitsAfterTwoSecondsWithRocketDpsAndSharedCooldown() {
        Enemy center = enemy(1020, 1900), edge = enemy(1020 + MissileRules.radius() * .5, 1900);
        game.handleMessage(player, "COMPUTER"); game.handleMessage(player, "MISSILE:1020:1900");
        assertEquals(1, game.missiles.size()); assertEquals(MissileRules.cooldown(), player.missileCooldown);
        game.handleMessage(player, "MISSILE:1020:1900"); assertEquals(1, game.missiles.size());
        game.handleMessage(player, "COMPUTER"); advance(1.95);
        assertEquals(10000, center.hp); advance(.05);
        assertEquals(10000 - MissileRules.damage(), center.hp, .001);
        assertEquals(10000 - MissileRules.damage() * .75, edge.hp, .001);
        assertTrue(game.missiles.isEmpty());
        assertEquals(WeaponCatalog.stats("rocket").damage() / WeaponCatalog.stats("rocket").cooldown(), MissileRules.damage() / MissileRules.cooldown());
    }
    @Test void invalidCoordinatesAndLockedTilesCannotLaunchOrConsumeCooldown() {
        game.handleMessage(player, "COMPUTER");
        for (String command : new String[]{"MISSILE:NaN:100", "MISSILE:Infinity:100", "MISSILE:-1:100", "MISSILE:10:10"}) game.handleMessage(player, command);
        game.unlockedAreas.remove("entry-room"); game.handleMessage(player, "MISSILE:1020:1500");
        assertTrue(game.missiles.isEmpty()); assertEquals(0, player.missileCooldown);
    }
    @Test void recoveryStationAllowsChangingJobOnlyNearUnlockedDevice() {
        game.handleMessage(player, "JOB:scout"); assertEquals("hacker", player.job);
        player.x = GameMap.JOB_STATION.x(); player.y = GameMap.JOB_STATION.y();
        game.unlockedAreas.remove("recovery-room");
        game.handleMessage(player, "JOB:scout"); assertEquals("hacker", player.job);
        game.unlockedAreas.add("recovery-room");
        game.handleMessage(player, "JOB:scout"); assertEquals("scout", player.job);
        player.stamina = 0; advance(1); assertEquals(JobRules.staminaRecovery("scout"), player.stamina, .001);
        assertTrue(JobRules.staminaRecovery("scout") > JobRules.staminaRecovery("healer"));
        player.down = true; game.handleMessage(player, "JOB:spy"); assertEquals("scout", player.job);
    }
    @Test void flameDamagesMultipleEnemiesConsumesFuelAndStopsAtWalls() {
        player.weapons.grant("flamethrower"); player.equipWeapon("flamethrower");
        Enemy near = enemy(player.x + 60, player.y), far = enemy(player.x + 120, player.y);
        game.handleMessage(player, "FIRE:700:860:1");
        assertEquals(10000 - WeaponCatalog.stats("flamethrower").damage(), near.hp);
        assertEquals(near.hp, far.hp);
        assertEquals(WeaponCatalog.capacity("flamethrower") - 1, player.weapons.ammo("flamethrower"));
        game.handleMessage(player, "FIRE:700:860:0"); advance(.1);
        Enemy wall = enemy(780, 860); game.handleMessage(player, "FIRE:900:860:1");
        assertEquals(10000, wall.hp);
        player.weapons.setAmmo("flamethrower", 0); advance(.1); assertFalse(player.firing);
    }
    @Test void snapshotPublishesControlMissilesAndAuthoritativeResources() throws Exception {
        game.handleMessage(player, "COMPUTER"); game.handleMessage(player, "MISSILE:1020:1900");
        var state = new ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertTrue(state.path("players").get(0).path("missileControl").asBoolean());
        assertEquals(1, state.path("missiles").size());
        assertEquals(MissileRules.DELAY, state.path("missiles").get(0).path("remaining").asDouble());
        assertEquals(WeaponCatalog.capacity("railgun"), state.path("rules").path("weapons").path("railgun").path("capacity").asInt());
        assertTrue(state.path("rules").path("weapons").has("flamethrower"));
    }
    @Test void cpuUsesTheSameFlameInventoryAndCombatRules() {
        player.human = false;
        player.weapons.grant("flamethrower");
        BotWeaponPolicy.select(player, 120);
        assertEquals("flamethrower", player.weapon);
        Enemy target = enemy(player.x + 120, player.y);
        game.combat.attackAt(player, target.x, target.y);
        assertEquals(10000 - WeaponCatalog.stats("flamethrower").damage(), target.hp);
        assertEquals(WeaponCatalog.capacity("flamethrower") - 1, player.weapons.ammo("flamethrower"));
    }
}
