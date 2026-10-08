package example;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class MatchRewardTimeTest {
    @Test void timerIncludesPreparationFreezesAtResultsAndResetsForReplay() {
        var game = session(); var player = game.connectPlayer("timer"); game.setRoomOwner(player);
        game.update(2); assertEquals(0, game.elapsedSeconds);
        game.handleMessage(player, "START"); game.players.forEach(p -> p.human = true);
        game.prepTime = 1000; game.update(2.5);
        assertEquals(2.5, game.elapsedSeconds);
        assertTrue(SnapshotBuilder.build(game).contains("\"elapsedSeconds\":2.5"));
        for (var phase : new GamePhase[]{GamePhase.WON, GamePhase.LOST}) {
            game.phase = phase; game.update(3); assertEquals(2.5, game.elapsedSeconds);
        }
        game.players.forEach(p -> p.roomReady = true);
        game.handleMessage(player, "START"); assertEquals(0, game.elapsedSeconds);
    }
    @Test void roundRewardGivesScoutThirtyPercentMore() throws Exception {
        var game = session(); var scout = game.connectPlayer("scout"); game.setRoomOwner(scout);
        game.handleMessage(scout, "JOB:scout"); game.handleMessage(scout, "START");
        var other = game.players.stream().filter(p -> p != scout).findFirst().orElseThrow();
        other.job = "healer"; scout.credits = other.credits = 0; game.round = 1;
        var finish = GameSession.class.getDeclaredMethod("finishRound"); finish.setAccessible(true); finish.invoke(game);
        assertEquals(Math.floor(other.credits * 1.3), scout.credits);
        assertEquals(other.credits * 1.3 - scout.credits, scout.goldRewardRemainder, 1e-8);
    }
    private GameSession session() {
        return new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
    }
}
