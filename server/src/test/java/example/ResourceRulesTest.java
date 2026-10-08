package example;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class ResourceRulesTest {
    @Test
    void everyForestWoodNodeRespawnsFasterThanOpeningRoomWood() {
        double openingInterval = ResourceRules.respawnSeconds("wood", "wood-room", "early-wood-1");
        assertEquals(3, openingInterval);
        for (ResourceNode node : GameMap.createResourceNodes()) {
            if (!"wood".equals(node.type) || !"forest".equals(node.requiredArea)) continue;
            double interval = ResourceRules.respawnSeconds(node.type, node.requiredArea, node.id);
            assertEquals(2, interval);
            assertTrue(interval < openingInterval);
        }
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
