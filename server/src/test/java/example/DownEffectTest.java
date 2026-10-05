package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.ArrayList;
import org.junit.jupiter.api.Test;
import com.fasterxml.jackson.databind.ObjectMapper;

class DownEffectTest {
    @Test void lethalDamageBroadcastsOneDownEffectAtThePlayerPosition() throws Exception {
        var messages = new ArrayList<String>();
        var game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { messages.add(message); }
            public void send(Player player, String message) { }
        });
        var player = game.players.get(0);
        player.hp = 100;
        player.down = false;
        player.x = 1020;
        player.y = 1900;
        var damage = GameSession.class.getDeclaredMethod("damagePlayer", Player.class, double.class);
        damage.setAccessible(true);
        damage.invoke(game, player, 1);
        assertTrue(messages.stream().noneMatch(message -> message.contains("player-down")));
        damage.invoke(game, player, 100);
        damage.invoke(game, player, 100);
        var down = messages.stream().filter(message -> message.contains("player-down")).toList();
        assertEquals(1, down.size());
        var event = new ObjectMapper().readTree(down.get(0));
        assertEquals(player.id, event.path("playerId").asText());
        assertEquals(player.x, event.path("x").asDouble());
        assertEquals(player.y, event.path("y").asDouble());
        assertTrue(player.down);
    }
}
