package example;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class BossRulesTest {
    @Test void bossSpawnHpIsReducedAndRoundedForNormalAndDebugSpawns() throws Exception {
        GameSession game = new GameSession(new GameEventSink() {
            public void broadcast(String s) {}
            public void send(Player p, String s) {}
        });
        game.round = 40;
        var spawn = GameSession.class.getDeclaredMethod("spawnEnemy", String.class, SpawnPoint.class, boolean.class);
        spawn.setAccessible(true);
        String[] types = {"boss", "warden", "warlord", "titan", "explosionBoss", "grunt"};
        double[] expected = {67400, 84200, 84200, 101100, 161500, 1101.6};
        for (boolean summoned : new boolean[]{false, true}) {
            for (int i = 0; i < types.length; i++) {
                game.enemies.clear();
                spawn.invoke(game, types[i], GameMap.SPAWN_POINTS.get(0), summoned);
                Enemy enemy = game.enemies.get(0);
                assertEquals(expected[i], enemy.maxHp, 1e-9, types[i]);
                assertEquals(expected[i], enemy.hp, 1e-9, types[i]);
                var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game)).path("enemies").get(0);
                assertEquals(expected[i], snapshot.path("maxHp").asDouble(), types[i]);
            }
        }
    }

    @Test void generatedBossSpeedMatchesRunnerAcrossRoundsAndEntrances() throws Exception {
        GameSession game = new GameSession(new GameEventSink() {
            public void broadcast(String s) {}
            public void send(Player p, String s) {}
        });
        var spawn = GameSession.class.getDeclaredMethod("spawnEnemy", String.class, SpawnPoint.class);
        spawn.setAccessible(true);
        for (int round : new int[]{1, 8, 16, 24, 40, 50}) {
            game.round = round;
            for (double multiplier : new double[]{1, 1.2}) {
                var point = new SpawnPoint("test", "test", 1020, 1900, "west", "balanced", multiplier, "core", java.util.List.of());
                game.enemies.clear(); spawn.invoke(game, "runner", point);
                double runnerSpeed = game.enemies.get(0).speed;
                for (String type : new String[]{"boss", "warden", "warlord", "titan"}) {
                    spawn.invoke(game, type, point);
                    assertEquals(runnerSpeed, game.enemies.get(game.enemies.size()-1).speed, 1e-9, type + " R" + round);
                }
            }
        }
    }
    @Test void ordinaryArtilleryRetainsItsOriginalFlightTime() throws Exception {
        GameSession game = new GameSession(new GameEventSink() {
            public void broadcast(String s) {}
            public void send(Player p, String s) {}
        });
        var shell = new ArtilleryShell(100, 100, 200, 200, 10);
        game.artilleryShells.add(shell);
        assertEquals(1.5, shell.duration); assertEquals(1.5, shell.remaining);
        var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals(1.5, snapshot.path("artilleryShells").get(0).path("duration").asDouble());
    }

    @Test void titanAndWarlordFollowTheExistingWardenPhaseBoundaries() {
        for (String type : new String[]{"titan", "warlord"}) {
            for (double hp : new double[]{1000, 601, 600, 301, 300, 1}) {
                assertEquals(WardenRules.phase(hp, 1000), BossRules.phase(type, hp, 1000));
            }
            assertEquals(1, BossRules.attackRate(type, 601, 1000));
            assertEquals(1.5, BossRules.attackRate(type, 600, 1000));
            assertEquals(1.5, BossRules.attackRate(type, 301, 1000));
            assertEquals(2, BossRules.attackRate(type, 300, 1000));
            assertEquals(1, BossRules.movementMultiplier(type, 601, 1000));
            assertEquals(1.2, BossRules.movementMultiplier(type, 600, 1000));
            assertEquals(1.5, BossRules.movementMultiplier(type, 300, 1000));
        }
    }
    @Test void otherEnemiesDoNotGainTheNewAttackTempo() {
        for (String type : new String[]{"grunt", "boss", "warden", "explosionBoss"}) {
            assertEquals(1, BossRules.attackRate(type, 1, 1000));
            assertEquals(1, BossRules.movementMultiplier(type, 1, 1000));
        }
    }
}
