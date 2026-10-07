package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

class EnemyNavigationTest {
    private GameSession game() {
        GameSession game = new GameSession(new GameEventSink() {
            public void broadcast(String message) {}
            public void send(Player player, String message) {}
        });
        game.players.clear();
        game.trapSlots.clear();
        game.coreHp = 1000000;
        return game;
    }

    private void update(GameSession game, double dt) throws Exception {
        Method method = GameSession.class.getDeclaredMethod("updateEnemies", double.class);
        method.setAccessible(true);
        method.invoke(game, dt);
    }

    @Test void everyEntranceReachesRecoveryCoreWithoutOutsideDetour() throws Exception {
        for (boolean allUnlocked : new boolean[]{false, true}) {
            for (SpawnPoint spawn : GameMap.SPAWN_POINTS) {
                if (!allUnlocked && GameMap.spawnArea(spawn) != null
                        && !GameMap.spawnArea(spawn).equals("recovery-room")) continue;
                GameSession game = game();
                game.unlockedAreas.add("recovery-room");
                if (allUnlocked) GameMap.AREAS.forEach(area -> game.unlockedAreas.add(area.id()));
                game.coreX = 460; game.coreY = 1900;
                assertTrue(GameMap.canPlaceCore(game.coreX, game.coreY, game.unlockedAreas));
                Enemy enemy = new Enemy(13, "grunt", spawn, 100, 100, 10, 0);
                game.enemies.add(enemy);
                for (int tick = 0; tick < 2400 && game.coreHp == 1000000; tick++) {
                    update(game, .05);
                    assertTrue(GameMap.canOccupy(enemy.x, enemy.y, 17, game.unlockedAreas), spawn.id());
                    if (GameMap.spawnArea(spawn) == null) assertTrue(enemy.y > 1600, "outside detour: " + spawn.id());
                }
                assertTrue(game.coreHp < 1000000, "failed to reach core: " + spawn.id() + " all=" + allUnlocked
                        + " at " + enemy.x + "," + enemy.y);
                assertTrue(enemy.path.isEmpty(), "CORE movement must not search individual paths");
            }
        }
    }

    @Test void fieldIsSharedAndRebuiltOnlyForCoreOrUnlockChanges() {
        EnemyNavigation navigation = new EnemyNavigation();
        Set<String> areas = new HashSet<>();
        navigation.prepare(1020, 1900, areas);
        int generation = navigation.generation;
        for (int tick = 0; tick < 100; tick++) {
            navigation.prepare(1020, 1900, areas);
            for (int id = 1; id <= 500; id++) {
                Enemy enemy = new Enemy(id, "grunt", GameMap.SPAWN_POINTS.get(0), 100, 30, 10, 0);
                navigation.coreTarget(enemy, .05);
            }
        }
        assertEquals(generation, navigation.generation, "50,000 steering calls reuse one field");
        for (int tick = 0; tick < 100; tick++) navigation.prepare(1001 + tick * .3, 1900, areas);
        assertEquals(generation, navigation.generation, "carrying CORE within a tile must reuse the field");
        areas.add("recovery-room");
        navigation.prepare(460, 1900, areas);
        assertEquals(generation + 1, navigation.generation);
        areas.add("entry-room");
        navigation.prepare(460, 1900, areas);
        assertEquals(generation + 2, navigation.generation);
        navigation.prepare(500, 1900, areas);
        assertEquals(generation + 3, navigation.generation);
    }

    @Test void visiblePlayerIsPursuedAtRangeAndWallHiddenPlayerIsIgnored() throws Exception {
        GameSession game = game();
        Player player = new Player(1);
        player.x = 1260; player.y = 1900;
        game.players.add(player);
        game.coreX = 1020; game.coreY = 1900;
        Enemy enemy = new Enemy(1, "grunt", GameMap.spawnById("south-gate"), 100, 100, 10, 0);
        enemy.x = 1020; enemy.y = 1900;
        game.enemies.add(enemy);
        update(game, .05);
        assertSame(player, enemy.visiblePlayer);
        assertTrue(enemy.x > 1020, "moves to visible player instead of attacking core");
        assertEquals(1000000, game.coreHp);
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        MapPoint hidden = null;
        for (int row = 0; row < 52 && hidden == null; row++) for (int col = 0; col < 52; col++) {
            double x = (col + .5) * 40, y = (row + .5) * 40;
            if (GameSupport.distance(enemy.x, enemy.y, x, y) < 300
                    && GameMap.canOccupy(x, y, 17, game.unlockedAreas)
                    && !GameMap.hasClearLine(enemy.x, enemy.y, x, y)) {
                hidden = new MapPoint(x, y);
                break;
            }
        }
        assertNotNull(hidden);
        player.x = hidden.x(); player.y = hidden.y();
        enemy.slow = 0;
        assertFalse(GameMap.hasClearLine(enemy.x, enemy.y, player.x, player.y));
        for (int i = 0; i < 12; i++) update(game, .05);
        assertNull(enemy.visiblePlayer);
        assertTrue(enemy.path.isEmpty(), "losing sight must not start a path search");
    }

    @Test void existingEnemiesFollowCoreAfterRelocation() throws Exception {
        GameSession game = game();
        game.coreX = 1020; game.coreY = 1540;
        game.unlockedAreas.add("entry-room");
        Enemy enemy = new Enemy(7, "grunt", GameMap.SPAWN_POINTS.get(0), 100, 100, 10, 0);
        game.enemies.add(enemy);
        for (int i = 0; i < 15; i++) update(game, .05);
        game.unlockedAreas.add("recovery-room");
        game.coreX = 460; game.coreY = 1900;
        for (int i = 0; i < 800 && game.coreHp == 1000000; i++) update(game, .05);
        assertTrue(game.coreHp < 1000000);
        assertTrue(enemy.y > 1800);
    }

    @Test void outsideEnemiesReachCoreInEachUnlockedRoom() throws Exception {
        Set<String> areas = new HashSet<>(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        for (UnlockArea area : GameMap.AREAS) {
            MapPoint core = area.tiles().stream().map(GameMap.TILE_MAP::center)
                    .filter(point -> GameMap.canPlaceCore(point.x(), point.y(), areas)).findFirst().orElseThrow();
            GameSession game = game();
            game.unlockedAreas.addAll(areas);
            game.coreX = core.x(); game.coreY = core.y();
            Enemy enemy = new Enemy(24, "grunt", GameMap.spawnById("south-gate"), 100, 100, 10, 0);
            game.enemies.add(enemy);
            for (int i = 0; i < 4000 && game.coreHp == 1000000; i++) update(game, .05);
            assertTrue(game.coreHp < 1000000, "unreachable CORE in " + area.id()
                    + " enemy=" + enemy.x + "," + enemy.y);
        }
    }

    @Test void openSpaceSteeringVariesButNarrowPassageRemainsBodySafe() {
        EnemyNavigation navigation = new EnemyNavigation();
        Set<String> areas = new HashSet<>(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        navigation.prepare(1020, 1900, areas);
        Set<MapPoint> targets = new HashSet<>();
        EnemyTravel travel = new EnemyTravel();
        for (int id = 1; id <= 30; id++) {
            Enemy enemy = new Enemy(id, "grunt", GameMap.SPAWN_POINTS.get(0), 100, 30, 10, 0);
            enemy.x = 1260; enemy.y = 1900;
            targets.add(navigation.coreTarget(enemy, .05));
            enemy.x = 860; enemy.y = 420;
            enemy.navigationTimer = 0;
            MapPoint target = navigation.coreTarget(enemy, .05);
            assertTrue(travel.canTravel(enemy.x, enemy.y, target.x(), target.y(), 17, areas));
        }
        assertTrue(targets.size() > 10, "enemies use different safe approach lines");
    }
}
