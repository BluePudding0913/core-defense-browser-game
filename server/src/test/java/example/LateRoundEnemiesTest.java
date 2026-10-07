package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import java.util.HashSet;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class LateRoundEnemiesTest {
    GameSession game;

    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
    }

    Object invoke(String name, Class<?>[] types, Object... args) throws Exception {
        Method method = GameSession.class.getDeclaredMethod(name, types);
        method.setAccessible(true);
        return method.invoke(game, args);
    }

    Enemy spawn(String type) throws Exception {
        invoke("spawnEnemy", new Class<?>[]{String.class, SpawnPoint.class}, type, GameMap.SPAWN_POINTS.get(0));
        return game.enemies.get(game.enemies.size() - 1);
    }

    @Test void elitesUnlockGraduallyThroughAllFiftyRounds() throws Exception {
        var field = GameSession.class.getDeclaredField("random");
        field.setAccessible(true);
        ((Random) field.get(game)).setSeed(20261006L);
        Map<String, Integer> unlocks = Map.of("shield", 7, "armored", 10, "artillery", 12, "hunter", 18, "siege", 26, "champion", 34);
        for (int round = 1; round <= 50; round++) {
            game.round = round;
            Set<String> seen = new HashSet<>();
            for (int sample = 0; sample < 600; sample++) {
                seen.add((String) invoke("selectEnemyType", new Class<?>[]{SpawnPoint.class}, GameMap.SPAWN_POINTS.get(0)));
            }
            for (var entry : unlocks.entrySet()) {
                assertEquals(round >= entry.getValue(), seen.contains(entry.getKey()), entry.getKey() + " at R" + round);
            }
            assertTrue(seen.contains("grunt"), "Basic enemies should remain in late rounds");
            assertEquals(round >= 3, seen.contains("runner"));
            assertEquals(round >= 5, seen.contains("brute"));
            assertFalse(seen.contains("boss"));
            assertFalse(seen.contains("tiny"), "Tiny enemies only spawn as a scheduled swarm");
        }
    }

    @Test void newEnemiesHaveDistinctStrengthsAndTargetPriorities() throws Exception {
        game.round = 40;
        Enemy brute = spawn("brute"), runner = spawn("runner");
        Enemy armored = spawn("armored"), hunter = spawn("hunter"), siege = spawn("siege"), champion = spawn("champion");
        assertTrue(armored.maxHp > brute.maxHp);
        assertTrue(hunter.maxHp > runner.maxHp);
        assertTrue(hunter.speed > runner.speed);
        assertEquals("players", hunter.targetPriority);
        assertEquals("defenses", siege.targetPriority);
        assertTrue(siege.damage > brute.damage);
        assertTrue(champion.speed > brute.speed);
        assertTrue(champion.maxHp > brute.maxHp);
        assertTrue(champion.damage > brute.damage);
        assertTrue(champion.reward > brute.reward);
        var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals("champion", snapshot.path("enemies").get(5).path("type").asText());
    }

    @Test void tinyEnemiesRequirePreciseAimButRemainDamageable() throws Exception {
        game.round = 40;
        Enemy tiny = spawn("tiny"), grunt = spawn("grunt");
        assertFalse(tiny.isBoss());
        assertTrue(tiny.maxHp < grunt.maxHp);
        assertTrue(tiny.speed > grunt.speed);
        assertTrue(tiny.damage > 0);
        assertTrue(tiny.reward > 0);
        tiny.x = grunt.x = 100;
        tiny.y = grunt.y = 10;
        Class<?>[] signature = {Enemy.class, double.class, double.class, double.class,
                double.class, WeaponCatalog.WeaponStats.class, double.class};
        for (String weapon : new String[]{"pistol", "smg", "rifle", "sniper", "revolver", "lmg", "ricochet"}) {
            var stats = GameSession.weaponStats(weapon);
            assertEquals(true, invoke("isInsideAttack", signature, grunt, 0., 0., 1., 0., stats, 200.), weapon);
            assertEquals(false, invoke("isInsideAttack", signature, tiny, 0., 0., 1., 0., stats, 200.), weapon);
            assertEquals(true, invoke("isInsideAttack", signature, tiny, 0., 10., 1., 0., stats, 200.), weapon);
        }
        var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals("tiny", snapshot.path("enemies").get(0).path("type").asText());
    }

    @Test void scheduledBossesUpgradeAndStayWithinTheQueuedBudget() throws Exception {
        for (int round : new int[]{4, 20, 24, 36, 40, 48}) {
            game.round = round - 1; game.enemies.clear();
            invoke("beginRound", new Class<?>[]{});
            game.queuedEnemies = 0; game.queuedBosses = round / 4;
            invoke("updateSpawning", new Class<?>[]{double.class}, 10.0);
            Enemy boss = game.enemies.get(0);
            assertEquals(round >= 40 ? "titan" : round >= 24 ? "warlord" : "boss", boss.type);
            assertTrue(boss.isBoss());
            assertEquals(round / 4 - game.enemies.size(), game.queuedBosses);
        }
        game.round = 40;
        Enemy boss = spawn("boss"), warlord = spawn("warlord"), titan = spawn("titan");
        assertTrue(warlord.maxHp > boss.maxHp && titan.maxHp > warlord.maxHp);
        assertTrue(warlord.damage > boss.damage && titan.damage > warlord.damage);
        assertTrue(warlord.reward > boss.reward && titan.reward > warlord.reward);
    }

    @Test void upgradedBossesUseFasterCorePulses() throws Exception {
        for (String type : new String[]{"boss", "warlord", "titan"}) {
            game.enemies.clear(); game.round = 40; game.coreHp = 10000;
            Enemy boss = spawn(type);
            boss.x = game.coreX + 100; boss.y = game.coreY; boss.specialCooldown = 0;
            invoke("updateEnemies", new Class<?>[]{double.class}, .05);
            assertEquals(10000 - boss.damage * .55, game.coreHp, .001);
            assertEquals(type.equals("titan") ? 4 : type.equals("warlord") ? 5 : 6, boss.specialCooldown);
        }
    }
}
