package example;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.InputStream;
import java.util.List;
import org.junit.jupiter.api.Test;

class MapValidatorTest {
    private final ObjectMapper json = new ObjectMapper();

    private ObjectNode readMap() throws Exception {
        try (InputStream input = getClass().getResourceAsStream("/map.json")) {
            return (ObjectNode) json.readTree(input);
        }
    }

    private void validate(ObjectNode map) throws Exception {
        MapValidator.validate(json.treeToValue(map, MapDefinition.class));
    }

    @Test void sharedDefinitionCanBeValidatedIndependently() throws Exception {
        ObjectNode map = readMap();
        assertDoesNotThrow(() -> validate(map));
        assertThrows(IllegalStateException.class, () -> MapValidator.validate(null));
    }

    @Test void nullEntriesAreReportedAsInvalidMapData() throws Exception {
        for (String field : List.of("areas", "spawnPoints", "trapSlots", "resourceNodes",
                "shopUnits", "workbenchUnits", "breakerTerminals")) {
            ObjectNode map = readMap();
            ((ArrayNode) map.get(field)).addNull();
            IllegalStateException error = assertThrows(IllegalStateException.class, () -> validate(map));
            assertTrue(error.getMessage().contains("null entries"), field);
        }
    }

    @Test void nullTileDefinitionsAreRejectedBeforeAreaValidation() throws Exception {
        ObjectNode map = readMap();
        ((ObjectNode) map.path("tileMap").path("legend")).putNull(".");
        IllegalStateException error = assertThrows(IllegalStateException.class, () -> validate(map));
        assertTrue(error.getMessage().contains("Unknown tile symbol"));
    }

    @Test void nonFiniteSpawnSpeedsAreRejected() throws Exception {
        for (double speed : new double[]{Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY}) {
            ObjectNode map = readMap();
            ((ObjectNode) map.path("spawnPoints").get(0)).put("speedMultiplier", speed);
            IllegalStateException error = assertThrows(IllegalStateException.class, () -> validate(map));
            assertTrue(error.getMessage().contains("speed multiplier"));
        }
    }
}
