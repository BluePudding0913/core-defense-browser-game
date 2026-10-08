package example;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class VictoryMovementTest {
    @Test void clearingFinalRoundAllowsTenSecondsOfMovementWithoutContinuingCombatOrMatchTime() throws Exception {
        GameSession game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
        Player player = game.connectPlayer("victory-movement");
        game.setRoomOwner(player);
        game.handleMessage(player, "START");
        game.players.clear(); game.players.add(player); game.trapSlots.clear();
        player.x = 1140; player.y = 1900;
        game.round = 50; game.phase = GamePhase.WAVE;
        game.queuedEnemies = game.queuedBosses = 0; game.enemies.clear();
        game.update(.05);
        assertEquals(GamePhase.WON, game.phase);
        assertEquals(10, game.victoryMoveRemaining);
        double elapsed = game.elapsedSeconds, startX = player.x;
        game.handleMessage(player, "MOVE:1:0"); game.update(.1);
        assertTrue(player.x > startX, "Player can move after victory");
        assertEquals(elapsed, game.elapsedSeconds, "Result time remains frozen");
        var snapshot = new ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals(9.9, snapshot.path("victoryMoveRemaining").asDouble(), .001);
        Enemy enemy = new Enemy(999, "grunt", GameMap.SPAWN_POINTS.get(0), 100, 0, 0, 0);
        enemy.x = player.x + 40; enemy.y = player.y; game.enemies.add(enemy);
        game.handleMessage(player, "FIRE:1300:1900:1"); game.update(.1);
        assertEquals(100, enemy.hp, "Victory movement does not resume combat");
        game.handleMessage(player, "MOVE:0:0");
        game.update(10);
        assertEquals(0, game.victoryMoveRemaining);
        double stoppedX = player.x;
        game.handleMessage(player, "MOVE:1:0"); game.update(.1);
        assertEquals(stoppedX, player.x, "Movement stops after the victory window");
        game.phase = GamePhase.LOST;
        game.handleMessage(player, "MOVE:1:0"); game.update(.1);
        assertEquals(stoppedX, player.x, "Defeat does not allow movement");
        game.handleMessage(player, "START");
        assertEquals(0, game.victoryMoveRemaining);
    }
}
