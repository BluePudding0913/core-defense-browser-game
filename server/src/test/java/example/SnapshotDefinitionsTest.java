package example;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class SnapshotDefinitionsTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private GameSession game() {
        return new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
    }

    @Test void compactStateAndDefinitionsReconstructFullLegacyState() throws Exception {
        GameSession game = game();
        ObjectNode definitions = (ObjectNode)mapper.readTree(SnapshotBuilder.definitionsMessage()).get("rules");
        assertSame(SnapshotBuilder.definitionsMessage(), SnapshotBuilder.definitionsMessage());
        for (int upgrade = 0; upgrade < 3; upgrade++) {
            game.coreMaxHp += 500; game.coreMaxShield += 200; game.coreDefenseLevel++;
            ObjectNode full = (ObjectNode)mapper.readTree(SnapshotBuilder.build(game, "room", 1, 4));
            ObjectNode compact = (ObjectNode)mapper.readTree(SnapshotBuilder.build(game, "room", 1, 4, false));
            ObjectNode dynamic = (ObjectNode)compact.get("rules");
            assertFalse(dynamic.has("weapons")); assertTrue(dynamic.has("coreCosts"));
            assertEquals(game.coreUpgradeCost("hp"), dynamic.get("coreCosts").get("hp").asInt());
            ObjectNode restored = definitions.deepCopy(); restored.setAll(dynamic); compact.set("rules", restored);
            assertEquals(full, compact);
        }
    }

    @Test void fixedRulesAreSubstantialAndContainNoMutableCorePrice() throws Exception {
        GameSession game = game();
        String full = SnapshotBuilder.build(game, "room", 1, 4);
        String compact = SnapshotBuilder.build(game, "room", 1, 4, false);
        int saved = full.getBytes(StandardCharsets.UTF_8).length - compact.getBytes(StandardCharsets.UTF_8).length;
        assertTrue(saved > 5000);
        var definitions = mapper.readTree(SnapshotBuilder.definitionsMessage()).get("rules");
        assertTrue(definitions.has("weapons")); assertTrue(definitions.has("recipes"));
        assertFalse(definitions.has("coreCosts")); assertFalse(definitions.has("unlockCost"));
        System.out.println("Snapshot fixed definitions: " + saved + " UTF-8 bytes omitted per compact state");
    }
}
