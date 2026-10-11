package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import org.junit.jupiter.api.Test;

class RoundDifficultyTest {
    private GameSession game(int humans) {
        var game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
        for (int i = 0; i < humans; i++) game.connectPlayer("human-" + i);
        return game;
    }
    private void begin(GameSession game, int round) throws Exception {
        game.round = round - 1;
        var method = GameSession.class.getDeclaredMethod("beginRound");
        method.setAccessible(true); method.invoke(game);
    }
    private Enemy spawn(GameSession game, String type) throws Exception {
        var method = GameSession.class.getDeclaredMethod("spawnEnemy", String.class, SpawnPoint.class);
        method.setAccessible(true); method.invoke(game, type, GameMap.SPAWN_POINTS.get(0));
        return game.enemies.get(game.enemies.size() - 1);
    }
    @Test void allFiftyRoundsScalePopulationsAndKeepBossSchedules() throws Exception {
        for (int round = 1; round <= 50; round++) {
            int previous = 0;
            for (int humans = 1; humans <= 4; humans++) {
                var game = game(humans); begin(game, round);
                assertEquals(humans, game.roundHumanCount);
                assertEquals((int) Math.ceil(EnemyWaveRules.regularCount(round) * ((6 + humans) / 10.0)), game.queuedEnemies);
                assertTrue(game.queuedEnemies >= previous);
                assertEquals(EnemyWaveRules.bossCount(round), game.queuedBosses);
                assertEquals(game.queuedEnemies + game.queuedBosses, game.roundEnemyTotal);
                assertTrue(game.queuedTinyEnemies <= game.queuedEnemies);
                if (round >= 40 && (round - 40) % 3 == 0)
                    assertEquals((int) Math.ceil(Math.round((48 + (round - 40) * 4) * .8)
                            * ((6 + humans) / 10.0)), game.queuedTinyEnemies);
                previous = game.queuedEnemies;
            }
            assertEquals(EnemyWaveRules.regularCount(round), previous);
        }
    }
    @Test void bossHealthScalesWhileOtherStatsAndOrdinaryHealthStayUnchanged() throws Exception {
        for (String type : List.of("boss", "warden", "warlord", "titan", "explosionBoss", "finalBoss", "grunt")) {
            var baselineGame = game(4); begin(baselineGame, 40);
            Enemy baseline = spawn(baselineGame, type);
            for (int humans = 1; humans <= 4; humans++) {
                var game = game(humans); begin(game, 40);
                Enemy enemy = spawn(game, type);
                double factor = type.equals("grunt") ? 1 : (6 + humans) / 10.0;
                assertEquals(baseline.maxHp * factor, enemy.maxHp, .000001);
                assertEquals(enemy.maxHp, enemy.hp);
                assertEquals(baseline.damage, enemy.damage);
                assertEquals(baseline.speed, enemy.speed);
                assertEquals(baseline.reward, enemy.reward);
            }
        }
    }
    @Test void departuresKeepQueuesAndLaterBossHealthFixedUntilNextRound() throws Exception {
        var game = game(4); begin(game, 16);
        int queued = game.queuedEnemies; double hp = spawn(game, "warden").maxHp;
        for (int i = 1; i < 4; i++) game.disconnectPlayer(game.players.get(i), false);
        assertEquals(4, game.roundHumanCount); assertEquals(queued, game.queuedEnemies);
        assertEquals(hp, spawn(game, "warden").maxHp);
        begin(game, 16);
        assertEquals(1, game.roundHumanCount); assertTrue(game.queuedEnemies < queued);
        assertEquals(hp * .7, spawn(game, "warden").maxHp, .000001);
    }
    @Test void reconnectRaisesDifficultyOnlyAtTheNextRound() throws Exception {
        var game = game(2); var guest = game.players.get(1);
        game.disconnectPlayer(guest); game.update(30); begin(game, 16);
        assertEquals(1, game.roundHumanCount); double hp = spawn(game, "warden").maxHp;
        assertSame(guest, game.connectPlayer("human-1"));
        assertEquals(1, game.roundHumanCount); assertEquals(hp, spawn(game, "warden").maxHp);
        begin(game, 16); assertEquals(2, game.roundHumanCount);
        assertEquals(hp / .7 * .8, spawn(game, "warden").maxHp, .000001);
    }
    @Test void shortDisconnectsCountButThirtySecondsAndExplicitLeavingDoNot() throws Exception {
        for (double elapsed : new double[]{0, 29.99, 30, 31}) {
            var game = game(2); game.disconnectPlayer(game.players.get(1)); game.update(elapsed);
            begin(game, 8); assertEquals(elapsed < 30 ? 2 : 1, game.roundHumanCount);
        }
        var game = game(2); game.disconnectPlayer(game.players.get(1), false);
        begin(game, 8); assertEquals(1, game.roundHumanCount);
    }
    @Test void firstRoundUsesPreparationEndAndRestartClearsPreviousDifficulty() {
        var game = game(1); var host = game.players.get(0); game.setRoomOwner(host);
        game.handleMessage(host, "START"); assertEquals(GamePhase.PREPARING, game.phase);
        game.handleMessage(host, "READY"); game.update(.05);
        assertEquals(1, game.roundHumanCount); assertEquals(4, game.queuedEnemies);
        game.phase = GamePhase.LOST; game.handleMessage(host, "START");
        assertEquals(4, game.roundHumanCount);
        game.handleMessage(host, "READY"); game.update(.05); assertEquals(1, game.roundHumanCount);
    }
    @Test void ruleBoundariesKeepMinimumAndIgnoreUnreservedCpuSlots() {
        assertEquals(.7, RoundDifficultyRules.multiplier(0));
        assertEquals(1, RoundDifficultyRules.multiplier(5));
        assertFalse(RoundDifficultyRules.countsAsHuman(false, false, 0));
        assertTrue(RoundDifficultyRules.countsAsHuman(true, false, 600));
        assertFalse(RoundDifficultyRules.countsAsHuman(false, true, 30));
    }
}
