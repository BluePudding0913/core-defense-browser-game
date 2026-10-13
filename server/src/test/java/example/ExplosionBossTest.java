package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ExplosionBossTest {
    GameSession game;
    Player player;
    Enemy boss;
    List<String> effects = new ArrayList<>();

    Object invoke(String name, Class<?>[] types, Object... args) throws Exception {
        Method method = GameSession.class.getDeclaredMethod(name, types);
        method.setAccessible(true);
        return method.invoke(game, args);
    }

    @BeforeEach void setup() throws Exception {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { effects.add(message); }
            public void send(Player p, String message) { }
        });
        player = game.connectPlayer("explosion-boss-test");
        game.players.forEach(p -> { p.human = true; p.x = 0; p.y = 0; });
        game.trapSlots.clear();
        invoke("spawnEnemy", new Class<?>[]{String.class, SpawnPoint.class},
                "explosionBoss", GameMap.SPAWN_POINTS.get(0));
        boss = game.enemies.get(0);
        game.roundEnemyTotal = 100;
    }

    void update(double dt) throws Exception {
        invoke("updateEnemies", new Class<?>[]{double.class}, dt);
    }

    @Test void requiresAtMostTenPercentIncludingUnspawnedEnemiesAndIgnoresDeadEnemies() throws Exception {
        game.queuedEnemies = 10; game.queuedBosses = 1;
        update(10);
        assertEquals(-1, boss.fuse);
        game.queuedBosses = 0;
        Enemy dead = new Enemy(999, "grunt", GameMap.SPAWN_POINTS.get(0), 10, 0, 0, 0);
        dead.hp = 0; game.enemies.add(dead);
        update(.05);
        assertEquals(29.95, boss.fuse, .0001);
        game.queuedEnemies = 100;
        update(1);
        assertEquals(28.95, boss.fuse, .0001, "Started countdown must keep running");
        var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals(boss.fuse, snapshot.path("enemies").get(0).path("fuse").asDouble());
    }

    @Test void livingEnemiesKeepFuseUnarmedAndFirstRoundCanArmWithOnlyBossLeft() throws Exception {
        game.roundEnemyTotal = 9;
        Enemy other = new Enemy(999, "grunt", GameMap.SPAWN_POINTS.get(0), 10, 0, 0, 0);
        game.enemies.add(other);
        update(30);
        assertEquals(-1, boss.fuse);
        other.hp = 0;
        update(.05);
        assertEquals(29.95, boss.fuse, .0001);
    }

    @Test void takesOrdinaryDamageAndNeverMeleesNearbyPlayer() throws Exception {
        player.x = boss.x; player.y = boss.y;
        game.queuedEnemies = 100;
        double hp = boss.hp;
        game.combat.damageEnemy(boss, 1000., player);
        assertEquals(hp - 1000, boss.hp);
        assertEquals(Math.round((2200 + game.round * 60) * 19.5 / 100) * 100.0, boss.maxHp);
        assertTrue(boss.speed <= 24);
        update(10);
        assertEquals(100, player.hp);
        assertFalse(boss.exploded);
    }

    @Test void thirtySecondBlastIsUniformIncludesBoundaryIgnoresWallsAndDestroysDefenses() throws Exception {
        double x = boss.x, y = boss.y, radius = GameConfig.EXPLOSION_BOSS_BLAST_RADIUS;
        for (Player p : game.players) p.hp = 200;
        player.x = x; player.y = y;
        Player edge = game.players.get(1); edge.x = x + radius + 11; edge.y = y;
        Player outside = game.players.get(2); outside.x = x + radius + 12 + .01; outside.y = y;
        Player behindWall = game.players.get(3);
        boolean found = false;
        for (int dx = -400; dx <= 400 && !found; dx += 20) {
            for (int dy = -400; dy <= 400 && !found; dy += 20) {
                if (Math.hypot(dx, dy) <= radius && !GameMap.hasClearLine(x, y, x + dx, y + dy)) {
                    behindWall.x = x + dx; behindWall.y = y + dy; found = true;
                }
            }
        }
        assertTrue(found);
        for (String type : List.of("turret", "copperTurret", "silverTurret", "barricade", "copperBarricade", "silverBarricade")) {
            TrapSlot slot = new TrapSlot(type, "free", x, y, null);
            slot.defense = new Defense(type); game.trapSlots.add(slot);
        }
        update(29.9);
        assertFalse(boss.exploded); assertEquals(200, player.hp);
        boss.x = x; boss.y = y;
        update(.1);
        assertTrue(boss.exploded);
        assertEquals(0, player.hp, .0001); assertEquals(0, edge.hp, .0001);
        assertEquals(200, outside.hp); assertEquals(0, behindWall.hp, .0001);
        game.trapSlots.forEach(slot -> assertNull(slot.defense));
        update(100);
        assertEquals(1, effects.stream().filter(s -> s.contains("\"effect\":\"explosion\"")).count());
    }

    @Test void blastDownsDefaultPlayer() throws Exception {
        player.x = boss.x; player.y = boss.y;
        update(30);
        assertTrue(player.down); assertEquals(0, player.hp);
    }

    @Test void ordinaryShotsApplyFullDamageAndHeadshotsWithoutGold() throws Exception {
        player.x = 1020; player.y = 1900;
        boss.x = 1120; boss.y = 1900;
        double before = boss.hp;
        for (double y : new double[]{1900, 1879}) {
            player.y = y;
            effects.clear();
            game.combat.fireRay(player, GameSession.weaponStats("pistol"), 1., 0.);
            boolean headshot = y == 1879;
            double damage = headshot ? 52 : 26;
            assertEquals(damage, before - boss.hp, .000001);
            assertTrue(effects.stream().anyMatch(s -> s.contains("\"damage\":" + damage)
                    && s.contains("\"headshot\":" + headshot)));
            assertEquals(0, player.credits, "including headshots");
            var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game));
            assertEquals(boss.hp, snapshot.path("enemies").get(0).path("hp").asDouble());
            before = boss.hp;
        }
    }

    @Test void playerKillSpawnsFiveRunnersOnceWithoutExplodingAndKeepsRoundRunning() throws Exception {
        game.phase = GamePhase.WAVE;
        player.x = 1020; player.y = 1900;
        boss.x = 1120; boss.y = 1900; boss.hp = 1; boss.fuse = .01;
        double x = boss.x, y = boss.y;
        game.combat.fireRay(player, GameSession.weaponStats("pistol"), 1., 0.);
        assertEquals(0, boss.hp);
        game.update(.05);
        assertEquals(GamePhase.WAVE, game.phase);
        assertEquals(5, game.enemies.size());
        assertEquals(5, game.enemies.stream().map(e -> e.id).distinct().count());
        for (Enemy runner : game.enemies) {
            assertEquals("runner", runner.type);
            assertEquals(x, runner.x); assertEquals(y, runner.y);
            assertEquals(runner.maxHp, runner.hp, "Offspring must not receive the killing shot");
        }
        assertFalse(boss.exploded);
        assertTrue(boss.offspringSpawned);
        assertEquals(100, player.hp);
        assertTrue(effects.stream().noneMatch(s -> s.contains("\"effect\":\"explosion\"")));
        game.update(.05);
        assertEquals(5, game.enemies.size());
        game.enemies.forEach(e -> e.hp = 0);
        game.update(.05);
        assertEquals(GamePhase.PREPARING, game.phase);
    }

    @Test void uncreditedDamageAlsoSpawnsOffspringOnlyOnce() throws Exception {
        game.combat.damageEnemy(boss, boss.hp, null);
        update(.05);
        update(.05);
        assertEquals(5, game.enemies.stream().filter(e -> e.type.equals("runner")).count());
        assertFalse(boss.exploded);
    }

    @Test void silverAmmoTriplesNormalDamageAgainstExplosionBoss() {
        game.phase = GamePhase.WAVE;
        player.x = 1020; player.y = 1900;
        boss.x = 1120; boss.y = 1900;
        assertTrue(player.weapons.buySilverAmmo(1));
        double hp = boss.hp;
        game.combat.attackAt(player, boss.x, boss.y);
        assertEquals(78, hp - boss.hp, .000001);
        assertEquals(19, player.weapons.silverAmmo());
    }

    @Test void areaAndSpreadKillsLeaveOneHealthyOffspringBatch() throws Exception {
        for (String weapon : List.of("shotgun", "rocket", "flamethrower", "missile")) {
            setup();
            game.phase = GamePhase.WAVE;
            player.x = 1020; player.y = 1900;
            boss.x = 1120; boss.y = 1900; boss.hp = 1;
            if (weapon.equals("missile")) game.combat.missileImpact(player, boss.x, boss.y);
            else {
                player.weapons.grant(weapon); player.equipWeapon(weapon);
                game.combat.attackAt(player, boss.x, boss.y);
            }
            if (weapon.equals("rocket")) game.combat.updateRockets(1);
            assertEquals(0, boss.hp, weapon);
            game.update(.05);
            assertEquals(5, game.enemies.size(), weapon);
            game.enemies.forEach(e -> assertEquals(e.maxHp, e.hp, weapon));
            assertFalse(boss.exploded, weapon);
        }
    }

    @Test void explosionSpawnsFiveRunnersAtItsPositionOnceAndKeepsRoundRunning() throws Exception {
        game.phase = GamePhase.WAVE;
        player.hp = 200; player.x = boss.x; player.y = boss.y;
        boss.fuse = 0;
        double x = boss.x, y = boss.y;
        game.update(.05);
        assertEquals(GamePhase.WAVE, game.phase);
        assertEquals(5, game.enemies.size());
        assertEquals(5, game.enemies.stream().map(e -> e.id).distinct().count());
        for (Enemy runner : game.enemies) {
            assertEquals("runner", runner.type);
            assertEquals(x, runner.x); assertEquals(y, runner.y);
        }
        game.update(.05);
        assertEquals(5, game.enemies.size(), "No repeated offspring on later ticks");
        game.enemies.forEach(e -> e.hp = 0);
        game.update(.05);
        assertEquals(GamePhase.PREPARING, game.phase);
    }

    @Test void normalBossRoundsNeverOverlapExplosionBossRounds() throws Exception {
        for (int round = 1; round <= 50; round++) {
            game.enemies.clear(); game.round = round - 1;
            invoke("beginRound", new Class<?>[]{});
            boolean explosionRound = round == 25 || round == 35 || round == 45;
            int expectedBosses = round == 50 || explosionRound || round >= 8 && round % 4 == 0 ? 1 : 0;
            assertEquals(expectedBosses, game.queuedBosses, "R" + round);
            game.queuedEnemies = 0; game.queuedTinyEnemies = 0;
            while (game.queuedBosses > 0) invoke("updateSpawning", new Class<?>[]{double.class}, 10.);
            assertEquals(expectedBosses, game.enemies.size(), "R" + round);
            assertEquals(explosionRound ? 1 : 0,
                    game.enemies.stream().filter(e -> e.type.equals("explosionBoss")).count(), "R" + round);
            if (explosionRound) assertEquals("boss_assault", game.roundEvent);
        }
    }

    @Test void prefersDeepestReachableUnlockedCombatAreaEvenInDebugRoundOne() throws Exception {
        for (int round : new int[]{1, 25}) {
            game.round = round;
            game.unlockedAreas.addAll(List.of("entry-room", "transit-hall", "armory-wing", "forest"));
            game.enemies.clear();
            // Moving the core should not reverse the map's progression order.
            game.coreX = 1580; game.coreY = 540;
            invoke("spawnEnemy", new Class<?>[]{String.class, SpawnPoint.class},
                    "explosionBoss", GameMap.SPAWN_POINTS.get(0));
            assertEquals("forest", GameMap.spawnArea(GameMap.spawnById(game.enemies.get(0).spawnId)));
        }
    }

    @Test void fallsBackToWaveEntranceWhenNoUnlockedCombatAreaIsReachable() throws Exception {
        game.unlockedAreas.add("command-room"); // Earlier connecting areas are still locked.
        game.round = 25; game.enemies.clear();
        SpawnPoint fallback = GameMap.SPAWN_POINTS.get(0);
        invoke("spawnEnemy", new Class<?>[]{String.class, SpawnPoint.class}, "explosionBoss", fallback);
        assertEquals(fallback.id(), game.enemies.get(0).spawnId);
    }

    @Test void debugFirstRoundKeepsNormalEnemiesAfterRestart() throws Exception {
        for (int restart = 0; restart < 2; restart++) {
            invoke("startMatch", new Class<?>[]{Player.class, boolean.class}, player, true);
            invoke("beginRound", new Class<?>[]{});
            for (int i = 0; i < 12; i++) invoke("updateSpawning", new Class<?>[]{double.class}, 10.);
            assertEquals(5, game.enemies.size());
            assertEquals(0, game.enemies.stream().filter(e -> e.type.equals("explosionBoss")).count());
            assertTrue(game.enemies.stream().noneMatch(e -> e.type.equals("bomber")));
            assertEquals(5, game.roundEnemyTotal);
        }
        invoke("startMatch", new Class<?>[]{Player.class, boolean.class}, player, false);
        invoke("beginRound", new Class<?>[]{});
        for (int i = 0; i < 12; i++) invoke("updateSpawning", new Class<?>[]{double.class}, 10.);
        assertTrue(game.enemies.stream().noneMatch(e -> e.type.equals("explosionBoss")));
    }
}
