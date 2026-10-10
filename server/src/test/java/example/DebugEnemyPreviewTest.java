package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.*;
import com.fasterxml.jackson.databind.ObjectMapper;

class DebugEnemyPreviewTest {
    GameSession game; Player host;
    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String s) {}
            public void send(Player p, String s) {}
        });
        host = game.connectPlayer("debug-console"); game.setRoomOwner(host);
        game.handleMessage(host, "START:DEBUG");
        host.job = "hacker";
        game.unlockedAreas.add("command-room");
        host.x = GameMap.BACKUP_TERMINAL.x(); host.y = GameMap.BACKUP_TERMINAL.y();
    }
    void begin(int round) throws Exception {
        game.enemies.clear(); game.round = round - 1;
        var random = GameSession.class.getDeclaredField("random"); random.setAccessible(true);
        random.set(game, new Random(123));
        var method = GameSession.class.getDeclaredMethod("beginRound"); method.setAccessible(true); method.invoke(game);
    }
    void spawn(double dt) throws Exception {
        var method = GameSession.class.getDeclaredMethod("updateSpawning", double.class); method.setAccessible(true); method.invoke(game, dt);
    }
    @Test void summonEveryEnemyAtTheRoomCenterAndKeepNormalQueues() throws Exception {
        var snapshot = new ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertTrue(snapshot.path("debugMode").asBoolean());
        assertEquals(23, snapshot.path("debugEnemyTypes").size());
        game.queuedEnemies = 7; game.queuedBosses = 2;
        for (String type : GameSession.DEBUG_ENEMY_TYPES) {
            game.handleMessage(host, "DEBUG:SUMMON:" + type);
            Enemy enemy = game.enemies.get(game.enemies.size() - 1);
            assertEquals(type, enemy.type); assertEquals(240, enemy.x); assertEquals(280, enemy.y);
            assertTrue(enemy.hp > 0); assertEquals(enemy.hp, enemy.maxHp);
        }
        assertEquals(23, game.enemies.size()); assertEquals(23, game.roundEnemyTotal);
        assertEquals(7, game.queuedEnemies); assertEquals(2, game.queuedBosses);
        game.handleMessage(host, "DEBUG:SUMMON:unknown"); game.handleMessage(host, "DEBUG:SUMMON");
        assertEquals(23, game.enemies.size());
        game.backupUsed = true; game.phase = GamePhase.WAVE;
        game.handleMessage(host, "DEBUG:SUMMON:grunt"); assertEquals(24, game.enemies.size());
    }
    @Test void goldAddsExactlyOneHundredThousandEachTime() {
        game.handleMessage(host, "DEBUG:GOLD"); assertEquals(600_000, host.credits);
        game.phase = GamePhase.WAVE; game.backupUsed = true;
        game.handleMessage(host, "DEBUG:GOLD"); assertEquals(700_000, host.credits);
    }
    void assertRejected() {
        int gold = host.credits, count = game.enemies.size();
        game.handleMessage(host, "DEBUG:GOLD"); game.handleMessage(host, "DEBUG:SUMMON:warden");
        assertEquals(gold, host.credits); assertEquals(count, game.enemies.size());
    }
    @Test void consoleEnforcesModeJobDistanceAccessAndPlayerState() throws Exception {
        host.job = "scout"; assertRejected(); host.job = "hacker";
        host.x += 100; assertRejected(); host.x -= 100;
        game.unlockedAreas.remove("command-room"); assertRejected(); game.unlockedAreas.add("command-room");
        host.down = true; assertRejected(); host.down = false;
        host.movingCore = true; assertRejected(); host.movingCore = false;
        host.missileControl = true; assertRejected(); host.missileControl = false;
        host.selectedBuild = "barricade"; assertRejected(); host.selectedBuild = null;
        game.phase = GamePhase.LOST; assertRejected();
        game.handleMessage(host, "START"); host.job = "hacker";
        game.unlockedAreas.add("command-room"); host.x = 100; host.y = 100;
        assertRejected();
        var snapshot = new ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertFalse(snapshot.path("debugMode").asBoolean()); assertTrue(snapshot.path("debugEnemyTypes").isEmpty());
    }
    @Test void debugRoundsUseExactlyTheNormalPopulationsEventsAndTiming() throws Exception {
        for (int round : new int[]{4, 5, 6, 16, 32, 48}) {
            game.debugMode = true; begin(round);
            assertEquals(EnemyWaveRules.regularCount(round), game.queuedEnemies);
            assertEquals(EnemyWaveRules.bossCount(round), game.queuedBosses);
            String event = game.roundEvent;
            spawn(1); assertTrue(game.enemies.isEmpty(), "Keep the normal eight-second delay");
            for (int i = 0; i < 500; i++) spawn(10);
            var types = game.enemies.stream().map(e -> e.type).toList();
            game.debugMode = false; begin(round);
            assertEquals(event, game.roundEvent);
            spawn(1); for (int i = 0; i < 500; i++) spawn(10);
            assertEquals(types, game.enemies.stream().map(e -> e.type).toList(), "Round " + round);
        }
    }
    @Test void summonedBossDoesNotReplaceTheScheduledBoss() throws Exception {
        for (int round : new int[]{16, 25}) {
            begin(round); game.queuedEnemies = game.queuedTinyEnemies = 0;
            String type = round == 16 ? "warden" : "explosionBoss";
            game.handleMessage(host, "DEBUG:SUMMON:" + type);
            for (int i = 0; i < 100; i++) spawn(10);
            assertEquals(2, game.enemies.stream().filter(e -> e.type.equals(type)).count());
        }
    }
}
