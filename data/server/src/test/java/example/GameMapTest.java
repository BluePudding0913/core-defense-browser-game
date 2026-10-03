package example;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import java.io.InputStream;
import java.util.Set;
import org.junit.jupiter.api.Test;

class GameMapTest {
    @Test
    void sharedMapResourceSuppliesEveryServerMapElement() throws Exception {
        MapDefinition definition;
        try (InputStream input = GameMap.class.getResourceAsStream("/map.json")) {
            assertNotNull(input, "shared/map.json must be packaged as a server resource");
            definition = new ObjectMapper().readValue(input, MapDefinition.class);
        }

        assertEquals(definition.world().width(), GameMap.WORLD_W);
        assertEquals(definition.world().height(), GameMap.WORLD_H);
        assertEquals(definition.core().x(), GameMap.CORE_X);
        assertEquals(definition.core().y(), GameMap.CORE_Y);
        assertEquals(definition.stations().armory().x(), GameMap.ARMORY_X);
        assertEquals(definition.stations().medBay().y(), GameMap.MED_Y);
        assertEquals(definition.stations().woodcutter().x(), GameMap.WOODCUTTER_X);
        assertEquals(definition.stations().quarry().y(), GameMap.QUARRY_Y);
        assertEquals(definition.stations().workbench().x(), GameMap.WORKBENCH_X);
        assertEquals(definition.tileMap(), GameMap.TILE_MAP);
        assertEquals(definition.areas(), GameMap.AREAS);
        assertEquals(definition.spawnPoints(), GameMap.SPAWN_POINTS);
        assertEquals(definition.trapSlots().size(), GameMap.createTrapSlots().size());
        assertTrue(definition.spawnPoints().stream().allMatch(spawn -> spawn.route().size() >= 3),
                "every enemy entry should include a corridor route");
        assertTrue(definition.spawnPoints().stream()
                .map(SpawnPoint::targetPriority).distinct().count() >= 3,
                "entries should provide different target priorities");
    }

    @Test
    void collisionUsesTilesBoundsAndUnlockedAreasFromMap() {
        assertEquals(5_400, GameMap.WORLD_W);
        assertEquals(3_600, GameMap.WORLD_H);
        assertTrue(GameMap.canOccupy(GameMap.CORE_X, GameMap.CORE_Y, 21, Set.of()));
        assertFalse(GameMap.canOccupy(100, 100, 21, Set.of()), "a wall must block movement");
        assertFalse(GameMap.canOccupy(10, GameMap.CORE_Y, 21, Set.of()),
                "the world boundary must block movement");
        assertTrue(GameMap.AREAS.isEmpty(), "the map must not be divided into unlock districts");
    }

    @Test
    void serverCanDeliverTheSharedMapToClients() throws Exception {
        JsonNode message = new ObjectMapper().readTree(GameMap.clientMapMessage());

        assertEquals("map", message.path("type").asText());
        assertEquals(4, message.path("map").path("version").asInt());
        assertEquals(GameMap.WORLD_H / GameMap.TILE_SIZE,
                message.path("map").path("tileMap").path("rows").size());
        assertEquals(GameMap.SPAWN_POINTS.size(), message.path("map").path("spawnPoints").size());
        assertEquals(GameMap.createTrapSlots().size(), message.path("map").path("trapSlots").size());
    }

    @Test
    void unlockTerminalsDoNotOverlapDefenseSlots() {
        for (UnlockArea area : GameMap.AREAS) {
            for (TrapSlot slot : GameMap.createTrapSlots()) {
                double separation = GameSupport.distance(
                        area.terminalX(), area.terminalY(), slot.x, slot.y);
                assertTrue(separation >= 60,
                        () -> area.id() + " terminal overlaps defense slot " + slot.id);
            }
        }
    }

    @Test
    void enemyRoutesStayInsideWalkableCorridors() {
        for (SpawnPoint spawn : GameMap.SPAWN_POINTS) {
            for (MapPoint point : spawn.route()) {
                assertTrue(GameMap.canOccupy(point.x(), point.y(), 17, Set.of()),
                        () -> spawn.id() + " route crosses a wall at " + point);
            }
        }
    }

    @Test
    void freeBuildingAcceptsFloorTilesAndRejectsWallTiles() {
        assertTrue(GameMap.canPlaceDefense(2_460, 2_020, Set.of()));
        assertFalse(GameMap.canPlaceDefense(100, 100, Set.of()));
        MapPoint snapped = GameMap.snapToTile(2_479, 2_039);
        assertEquals(2_460, snapped.x());
        assertEquals(2_020, snapped.y());
    }
}
