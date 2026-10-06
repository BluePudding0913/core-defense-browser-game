package example;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class EnemyNavigationTest {
    GameSession game;
    Method move;
    Method update;

    @BeforeEach void setup() throws Exception {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        game.players.clear();
        game.trapSlots.clear();
        move = GameSession.class.getDeclaredMethod("moveEnemyToward", Enemy.class,
                double.class, double.class, double.class);
        move.setAccessible(true);
        update = GameSession.class.getDeclaredMethod("updateEnemies", double.class);
        update.setAccessible(true);
    }

    Enemy enemy(double x, double y) {
        Enemy enemy = new Enemy(9000, "grunt", GameMap.SPAWN_POINTS.get(0), 100, 60, 1, 1);
        enemy.x = x;
        enemy.y = y;
        assertTrue(GameMap.canOccupy(x, y, 17, game.unlockedAreas));
        return enemy;
    }

    @Test void offCenterEnemyTurnsOutOfOneTileCorridorAtDifferentSpeeds() throws Exception {
        // Column 21 is a one-tile corridor at rows 10 and 11; its east exit is row 12.
        assertTrue(GameMap.tileTypeAt(20, 11).solid());
        assertTrue(GameMap.tileTypeAt(22, 11).solid());
        for (double amount : new double[]{.7, 2.8, 12, 80}) {
            for (double offset : new double[]{-3, 0, 3}) {
                Enemy enemy = enemy(860 + offset, 420);
                for (int tick = 0; tick < 400; tick++) {
                    enemy.pathTimer -= .05;
                    double fromX = enemy.x, fromY = enemy.y;
                    move.invoke(game, enemy, 900.0, 500.0, amount);
                    // Check intermediate positions too, so large steps cannot tunnel through corners.
                    for (int sample = 0; sample <= 100; sample++) {
                        assertTrue(GameMap.canOccupy(fromX + (enemy.x - fromX) * sample / 100,
                                fromY + (enemy.y - fromY) * sample / 100, 17, game.unlockedAreas));
                    }
                }
                assertEquals(900, enemy.x, .001, "step=" + amount + ", offset=" + offset);
                assertEquals(500, enemy.y, .001);
            }
        }
    }

    @Test void normalUpdatesKeepWanderingEnemiesMovingThroughOneTileCorridor() throws Exception {
        game.coreX = 860;
        game.coreY = 580;
        for (int seed = 0; seed < 20; seed++) {
            var randomField = GameSession.class.getDeclaredField("random");
            randomField.setAccessible(true);
            ((Random) randomField.get(game)).setSeed(seed);
            SpawnPoint spawn = new SpawnPoint("narrow-test", "test", 862, 420, "test", "grunt", 1, "core",
                    List.of(new MapPoint(860, 460), new MapPoint(860, 500)));
            Enemy enemy = new Enemy(9000 + seed, "grunt", spawn, 100, 60, 1, 1);
            game.enemies.clear();
            game.enemies.add(enemy);
            for (int tick = 0; tick < 200; tick++) {
                update.invoke(game, .05);
                assertTrue(GameMap.canOccupy(enemy.x, enemy.y, 17, game.unlockedAreas));
            }
            assertTrue(enemy.y >= 508, "must exit the corridor despite wandering, seed=" + seed);
        }
    }

    @Test void shortFinalStepStopsAtTargetWithoutOscillation() throws Exception {
        Enemy enemy = enemy(1020, 1900);
        for (int tick = 0; tick < 20; tick++) move.invoke(game, enemy, 1021.0, 1901.0, 12.0);
        assertEquals(1021, enemy.x, .001);
        assertEquals(1901, enemy.y, .001);
    }

    @Test void enemiesEnterSideRoomsInsteadOfFollowingTheRouteDeeperIntoTheMap() throws Exception {
        for (MapPoint core : List.of(new MapPoint(740, 1660), new MapPoint(1300, 1620),
                new MapPoint(780, 1460), new MapPoint(1940, 1020))) {
            game.coreX = core.x();
            game.coreY = core.y();
            game.coreHp = 1000;
            assertTrue(GameMap.canOccupy(core.x(), core.y(), 17, game.unlockedAreas));
            for (SpawnPoint spawn : GameMap.SPAWN_POINTS) {
                Enemy enemy = new Enemy(9000, "grunt", spawn, 100, 120, 1, 1);
                game.enemies.clear();
                game.enemies.add(enemy);
                game.coreHp = 1000;
                for (int tick = 0; tick < 1800 && game.coreHp == 1000; tick++) {
                    update.invoke(game, .05);
                    assertTrue(GameMap.canOccupy(enemy.x, enemy.y, 17, game.unlockedAreas));
                }
                assertTrue(game.coreHp < 1000, "must reach core " + core + " from " + spawn.id());
                assertTrue(GameMap.hasClearLine(enemy.x, enemy.y, core.x(), core.y()));
            }
        }
    }

    @Test void movingCoreRedirectsAnEnemyAlreadyFollowingAPath() throws Exception {
        Enemy enemy = enemy(1020, 1340);
        game.enemies.add(enemy);
        game.coreX = 740;
        game.coreY = 1660;
        update.invoke(game, .05);
        assertFalse(enemy.path.isEmpty());
        game.coreX = 1300;
        game.coreY = 1620;
        game.coreHp = 1000;
        for (int tick = 0; tick < 500 && game.coreHp == 1000; tick++) update.invoke(game, .05);
        assertTrue(game.coreHp < 1000, "must attack the relocated core");
        assertTrue(GameMap.hasClearLine(enemy.x, enemy.y, game.coreX, game.coreY));
    }

    @Test void enemyDoesNotAttackCoreThroughASideRoomWall() throws Exception {
        Enemy enemy = enemy(937, 1400);
        game.enemies.add(enemy);
        game.coreX = 900;
        game.coreY = 1460;
        game.coreHp = 1000;
        assertTrue(GameMap.canOccupy(game.coreX, game.coreY, 17, game.unlockedAreas));
        assertFalse(GameMap.hasClearLine(enemy.x, enemy.y, game.coreX, game.coreY));
        update.invoke(game, .05);
        assertEquals(1000, game.coreHp);
    }

    @Test void changingTargetReplacesAnActiveDetourImmediately() throws Exception {
        Enemy enemy = enemy(860, 420);
        move.invoke(game, enemy, 900.0, 500.0, 2.0);
        assertFalse(enemy.path.isEmpty());
        assertTrue(enemy.pathTimer > 0);
        // Both goals need a detour, but lie on opposite sides of the surrounding walls.
        move.invoke(game, enemy, 780.0, 420.0, 2.0);
        assertEquals(780, enemy.pathTargetX);
        assertEquals(420, enemy.pathTargetY);
    }

    @Test void directTravelCannotCutAcrossALockedArea() throws Exception {
        Method travel = GameSession.class.getDeclaredMethod("canEnemyTravel",
                double.class, double.class, double.class, double.class);
        travel.setAccessible(true);
        UnlockArea area = GameMap.AREAS.get(0);
        MapPoint center = GameMap.TILE_MAP.center(area.tiles().get(0));
        assertEquals(true, travel.invoke(game, center.x(), center.y(), center.x(), center.y()));
        game.unlockedAreas.remove(area.id());
        assertEquals(false, travel.invoke(game, center.x(), center.y(), center.x(), center.y()));
    }
}
