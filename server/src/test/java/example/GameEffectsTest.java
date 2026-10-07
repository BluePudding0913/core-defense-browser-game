package example;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import org.junit.jupiter.api.Test;

class GameEffectsTest {
    @Test void outOfAmmoProducesPrivateHumanFeedbackWithoutExposingTextToCombat() throws Exception {
        var messages = new ArrayList<String>();
        var effects = new GameEffects(new GameEventSink() {
            public void broadcast(String message) { fail("Empty ammo feedback must stay private"); }
            public void send(Player player, String message) { messages.add(message); }
        });
        var player = new Player(1);
        effects.outOfAmmo(player);
        assertTrue(messages.isEmpty());
        player.human = true;
        effects.outOfAmmo(player);
        var message = new ObjectMapper().readTree(messages.get(0));
        assertEquals("feedback", message.path("type").asText());
        assertEquals("弾薬がありません", message.path("message").asText());
    }

    @Test void adapterPreservesBrowserFieldsRoundingAndPrivateFeedback() throws Exception {
        var broadcasts = new ArrayList<String>();
        var privateMessages = new ArrayList<String>();
        var effects = new GameEffects(new GameEventSink() {
            public void broadcast(String message) { broadcasts.add(message); }
            public void send(Player player, String message) { privateMessages.add(message); }
        });
        var mapper = new ObjectMapper();
        effects.hit("player-1", "smg", 1.26, 2.24, 3, 4, 5.1236, true, 6, true, 9800);
        var hit = mapper.readTree(broadcasts.get(0));
        assertEquals("effect", hit.path("type").asText());
        assertEquals("hit", hit.path("effect").asText());
        assertEquals("player-1", hit.path("playerId").asText());
        assertEquals("smg", hit.path("weapon").asText());
        assertEquals(9800, hit.path("enemyId").asInt());
        assertEquals(1.3, hit.path("fromX").asDouble());
        assertEquals(2.2, hit.path("fromY").asDouble());
        assertEquals(3, hit.path("x").asInt());
        assertEquals(4, hit.path("y").asInt());
        assertEquals(5.124, hit.path("damage").asDouble());
        assertTrue(hit.path("defeated").asBoolean());
        assertTrue(hit.path("headshot").asBoolean());
        assertEquals(6, hit.path("credits").asInt());
        var player = new Player(1);
        player.weapon = "quoted\"weapon";
        effects.sound(player, "shot", "item\nname");
        var sound = mapper.readTree(broadcasts.get(1));
        assertEquals(player.id, sound.path("playerId").asText());
        assertEquals(player.weapon, sound.path("weapon").asText());
        assertEquals("shot", sound.path("effect").asText());
        assertEquals("item\nname", sound.path("item").asText());
        effects.explosion(1.26, 2.24, 200);
        var blast = mapper.readTree(broadcasts.get(2));
        assertEquals("explosion", blast.path("effect").asText());
        assertEquals(1.3, blast.path("x").asDouble());
        assertEquals(2.2, blast.path("y").asDouble());
        assertEquals(200, blast.path("radius").asInt());
        effects.feedback(player, "CPU");
        assertTrue(privateMessages.isEmpty());
        player.human = true;
        effects.feedback(player, "message \"with quotes\"\n");
        var feedback = mapper.readTree(privateMessages.get(0));
        assertEquals("feedback", feedback.path("type").asText());
        assertEquals("message \"with quotes\"\n", feedback.path("message").asText());
        assertEquals(3, broadcasts.size(), "Feedback stays private");
    }
}
