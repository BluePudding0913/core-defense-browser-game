package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class BomberEnemyTest {
    GameSession game;
    Player player;
    List<String> effects = new ArrayList<>();
    double x, y;
    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { effects.add(message); }
            public void send(Player p, String message) { }
        });
        player = game.connectPlayer("bomber-test");
        game.players.forEach(p -> { p.human = true; p.x = 0; p.y = 0; });
        game.trapSlots.clear();
        game.coreX = 0; game.coreY = 0;
        double r = GameConfig.BOMBER_BLAST_RADIUS;
        outer: for (int row = 1; row < 52; row++) for (int col = 1; col < 52; col++) {
            x = (col + .5) * GameMap.TILE_SIZE; y = (row + .5) * GameMap.TILE_SIZE;
            if (GameMap.hasClearLine(x, y, x + r + 1, y)) break outer;
        }
        assertTrue(GameMap.hasClearLine(x, y, x + r + 1, y));
    }
    Enemy enemy(String type, double offset, double hp) {
        Enemy e = new Enemy(game.enemies.size() + 9000, type, GameMap.SPAWN_POINTS.get(0), hp, 0, 60, 100);
        e.x = x + offset; e.y = y; game.enemies.add(e); return e;
    }
    Object invoke(String name, Class<?>[] types, Object... args) throws Exception {
        Method m = GameSession.class.getDeclaredMethod(name, types); m.setAccessible(true); return m.invoke(game, args);
    }
    @Test void deathHitsPlayersAtFourTileBoundaryButNotBeyond() throws Exception {
        Enemy bomber = enemy("bomber", 0, 100);
        Player edge = player; edge.x = x + GameConfig.BOMBER_BLAST_RADIUS; edge.y = y;
        Player outside = game.players.get(1); outside.x = x + GameConfig.BOMBER_BLAST_RADIUS + 1; outside.y = y;
        invoke("damageEnemy", new Class<?>[]{Enemy.class, double.class, Player.class}, bomber, 100., player);
        assertEquals(40, edge.hp); assertEquals(100, outside.hp);
        assertEquals(100, player.credits); assertEquals(1, player.kills);
        assertEquals(1, effects.stream().filter(e -> e.contains("\"effect\":\"explosion\"")).count());
        assertEquals(4 * GameMap.TILE_SIZE, GameConfig.BOMBER_BLAST_RADIUS);
    }
    @Test void blastDoesNotDamageEnemiesOrChainToOtherBombers() throws Exception {
        Enemy first = enemy("bomber", 0, 100);
        Enemy second = enemy("bomber", 30, 100);
        Enemy target = enemy("grunt", 60, 400);
        invoke("damageEnemy", new Class<?>[]{Enemy.class, double.class, Player.class}, first, 100., player);
        assertTrue(first.exploded); assertFalse(second.exploded); assertEquals(100, second.hp); assertEquals(400, target.hp);
        assertEquals(100, player.credits); assertEquals(1, player.kills);
        assertEquals(1, effects.stream().filter(e -> e.contains("\"effect\":\"explosion\"")).count());
    }
    @Test void deathBlastDamagesPlayersDefensesAndCoreWithoutCountdown() throws Exception {
        Enemy bomber = enemy("bomber", 0, 100);
        player.x = x + 30; player.y = y;
        game.coreX = x + 40; game.coreY = y;
        double oldCore = game.coreHp + game.coreShield;
        TrapSlot slot = new TrapSlot("blast-test", "free", x + 50, y, null);
        slot.defense = new Defense("block"); game.trapSlots.add(slot);
        var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertFalse(snapshot.path("enemies").get(0).has("fuse"));
        invoke("damageEnemy", new Class<?>[]{Enemy.class, double.class, Player.class}, bomber, 100., null);
        assertEquals(40, player.hp);
        assertEquals(200, slot.defense.hp);
        assertTrue(game.coreHp + game.coreShield < oldCore);
    }
    @Test void appearsOnlyFromRoundSixWithBomberStats() throws Exception {
        var randomField = GameSession.class.getDeclaredField("random");
        randomField.setAccessible(true);
        ((java.util.Random) randomField.get(game)).setSeed(12345);
        SpawnPoint spawn = GameMap.SPAWN_POINTS.get(0);
        game.round = 5;
        for (int i = 0; i < 200; i++) assertNotEquals("bomber", invoke("selectEnemyType", new Class<?>[]{SpawnPoint.class}, spawn));
        game.round = 6;
        boolean found = false;
        for (int i = 0; i < 200; i++) found |= "bomber".equals(invoke("selectEnemyType", new Class<?>[]{SpawnPoint.class}, spawn));
        assertTrue(found);
        invoke("spawnEnemy", new Class<?>[]{String.class, SpawnPoint.class}, "bomber", spawn);
        assertEquals(138, game.enemies.get(0).maxHp);
        assertEquals(67, game.enemies.get(0).damage);
    }
    @Test void debugRoundOneGuaranteesBomberAndNormalRestartClearsDebugMode() throws Exception {
        invoke("startMatch", new Class<?>[]{Player.class, boolean.class}, player, true);
        game.round = 1;
        game.queuedEnemies = 9;
        invoke("updateSpawning", new Class<?>[]{double.class}, 20.);
        assertEquals(3, game.enemies.size());
        assertTrue(game.enemies.stream().allMatch(e -> e.type.equals("bomber")));
        assertEquals(1, game.enemies.stream().map(e -> e.spawnId).distinct().count());
        assertEquals(6, game.queuedEnemies);
        invoke("updateSpawning", new Class<?>[]{double.class}, .05);
        assertEquals(3, game.enemies.size());
        invoke("startMatch", new Class<?>[]{Player.class, boolean.class}, player, false);
        game.round = 1;
        for (int i = 0; i < 200; i++) assertNotEquals("bomber",
                invoke("selectEnemyType", new Class<?>[]{SpawnPoint.class}, GameMap.SPAWN_POINTS.get(0)));
    }
    @Test void proximityAndTimeNeverDetonateLivingBomber() throws Exception {
        Enemy bomber = enemy("bomber", 0, 100); player.x = x + 30; player.y = y;
        for (int i = 0; i < 40; i++) invoke("updateEnemies", new Class<?>[]{double.class}, .1);
        assertEquals(100, bomber.hp);
        assertFalse(bomber.exploded);
        assertTrue(effects.stream().noneMatch(e -> e.contains("\"effect\":\"explosion\"")));
        invoke("damageEnemy", new Class<?>[]{Enemy.class, double.class, Player.class}, bomber, 50., null);
        assertFalse(bomber.exploded);
        invoke("damageEnemy", new Class<?>[]{Enemy.class, double.class, Player.class}, bomber, 50., null);
        assertTrue(bomber.exploded);
        invoke("damageEnemy", new Class<?>[]{Enemy.class, double.class, Player.class}, bomber, 100., null);
        assertEquals(1, effects.stream().filter(e -> e.contains("\"effect\":\"explosion\"")).count());
    }
    @Test void wallsBlockBlastAndTrigger() throws Exception {
        Enemy bomber = enemy("bomber", 0, 100);
        Player target = player;
        boolean found = false;
        for (int dx = -200; dx <= 200 && !found; dx += 20) for (int dy = -200; dy <= 200 && !found; dy += 20) {
            if (Math.hypot(dx, dy) <= GameConfig.BOMBER_BLAST_RADIUS && !GameMap.hasClearLine(x, y, x + dx, y + dy)) {
                target.x = x + dx; target.y = y + dy; found = true;
            }
        }
        assertTrue(found);
        invoke("damageEnemy", new Class<?>[]{Enemy.class, double.class, Player.class}, bomber, 100., player);
        assertEquals(100, target.hp);
    }
}
