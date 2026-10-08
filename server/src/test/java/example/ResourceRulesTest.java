package example;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class ResourceRulesTest {
    @Test
    void woodNodesShareASlowerIntervalAndForestHasMoreSpawnLocations() {
        int forestCount = 0;
        int openingCount = 0;
        for (ResourceNode node : GameMap.createResourceNodes()) {
            if (!"wood".equals(node.type)) continue;
            assertEquals(6, ResourceRules.respawnSeconds(node.type, node.requiredArea, node.id));
            if ("forest".equals(node.requiredArea)) forestCount++;
            if ("wood-room".equals(node.requiredArea)) openingCount++;
        }
        assertEquals(4, forestCount);
        assertEquals(2, openingCount);
        assertTrue(forestCount > openingCount);
    }

    @Test
    void otherMaterialsKeepTheirSupplyRates() {
        for (ResourceNode node : GameMap.createResourceNodes()) {
            if ("wood".equals(node.type)) continue;
            double rate = switch (node.type) {
                case "ore" -> 3;
                case "copper" -> 2;
                default -> 1;
            };
            double expected = "ore-room".equals(node.requiredArea)
                    ? 3 : (7 + Math.floorMod(node.id.hashCode(), 5)) / rate;
            assertEquals(expected, ResourceRules.respawnSeconds(node.type, node.requiredArea, node.id));
        }
    }
}
