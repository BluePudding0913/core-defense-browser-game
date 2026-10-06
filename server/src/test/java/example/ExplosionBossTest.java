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

    @Test void requiresStrictlyBelowFivePercentIncludingUnspawnedEnemiesAndIgnoresDeadEnemies() throws Exception {
        game.queuedEnemies = 4; game.queuedBosses = 1;
        update(10);
        assertEquals(-1, boss.fuse);
        game.queuedBosses = 0;
        Enemy dead = new Enemy(999, "grunt", GameMap.SPAWN_POINTS.get(0), 10, 0, 0, 0);
        dead.hp = 0; game.enemies.add(dead);
        update(.05);
        assertEquals(59.95, boss.fuse, .0001);
        game.queuedEnemies = 100;
        update(1);
        assertEquals(58.95, boss.fuse, .0001, "Started countdown must keep running");
        var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals(boss.fuse, snapshot.path("enemies").get(0).path("fuse").asDouble());
    }

    @Test void livingEnemiesKeepFuseUnarmedAndFirstRoundCanArmWithOnlyBossLeft() throws Exception {
        game.roundEnemyTotal = 9;
        Enemy other = new Enemy(999, "grunt", GameMap.SPAWN_POINTS.get(0), 10, 0, 0, 0);
        game.enemies.add(other);
        update(60);
        assertEquals(-1, boss.fuse);
        other.hp = 0;
        update(.05);
        assertEquals(59.95, boss.fuse, .0001);
    }

    @Test void survivesHeavyDamageAndNeverMeleesNearbyPlayer() throws Exception {
        player.x = boss.x; player.y = boss.y;
        game.queuedEnemies = 100;
        double hp = boss.hp;
        invoke("damageEnemy", new Class<?>[]{Enemy.class, double.class, Player.class}, boss, 1_000_000., player);
        assertEquals(hp - 1000, boss.hp);
        assertEquals(1_000_000_000, boss.maxHp);
        assertTrue(boss.speed <= 24);
        update(10);
        assertEquals(100, player.hp);
        assertFalse(boss.exploded);
    }

    @Test void sixtySecondBlastIsUniformIncludesBoundaryIgnoresWallsAndSparesAllTurrets() throws Exception {
        double x = boss.x, y = boss.y, radius = GameConfig.EXPLOSION_BOSS_BLAST_RADIUS;
        for (Player p : game.players) p.hp = 200;
        player.x = x; player.y = y;
        Player edge = game.players.get(1); edge.x = x + radius; edge.y = y;
        Player outside = game.players.get(2); outside.x = x + radius + .01; outside.y = y;
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
        for (String type : List.of("turret", "copperTurret", "silverTurret")) {
            TrapSlot slot = new TrapSlot(type, "free", x, y, null);
            slot.defense = new Defense(type); game.trapSlots.add(slot);
        }
        update(59.9);
        assertFalse(boss.exploded); assertEquals(200, player.hp);
        boss.x = x; boss.y = y;
        update(.1);
        assertTrue(boss.exploded);
        assertEquals(90, player.hp, .0001); assertEquals(90, edge.hp, .0001);
        assertEquals(200, outside.hp); assertEquals(90, behindWall.hp, .0001);
        game.trapSlots.forEach(slot -> assertEquals(slot.defense.maxHp, slot.defense.hp));
        update(100);
        assertEquals(1, effects.stream().filter(s -> s.contains("\"effect\":\"explosion\"")).count());
    }

    @Test void blastDownsDefaultPlayer() throws Exception {
        player.x = boss.x; player.y = boss.y;
        update(60);
        assertTrue(player.down); assertEquals(0, player.hp);
    }

    @Test void debugFirstRoundContainsExactlyOneBossAndRestartClearsIt() throws Exception {
        for (int restart = 0; restart < 2; restart++) {
            invoke("startMatch", new Class<?>[]{Player.class, boolean.class}, player, true);
            invoke("beginRound", new Class<?>[]{});
            for (int i = 0; i < 12; i++) invoke("updateSpawning", new Class<?>[]{double.class}, 10.);
            assertEquals(9, game.enemies.size());
            assertEquals(1, game.enemies.stream().filter(e -> e.type.equals("explosionBoss")).count());
            assertEquals(9, game.roundEnemyTotal);
        }
        invoke("startMatch", new Class<?>[]{Player.class, boolean.class}, player, false);
        invoke("beginRound", new Class<?>[]{});
        for (int i = 0; i < 12; i++) invoke("updateSpawning", new Class<?>[]{double.class}, 10.);
        assertTrue(game.enemies.stream().noneMatch(e -> e.type.equals("explosionBoss")));
    }
}
