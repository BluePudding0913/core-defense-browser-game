package example;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import java.io.InputStream;
import java.util.stream.Collectors;
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
        assertEquals(definition.resourceNodes().size(), GameMap.createResourceNodes().size());
        assertEquals(definition.shopUnits(), GameMap.SHOP_UNITS);
        assertTrue(definition.spawnPoints().size() >= 7,
                "the outdoor field should provide several spawn candidates");
        assertTrue(definition.spawnPoints().stream().allMatch(spawn -> spawn.y() >= 1_760),
                "every enemy spawn should remain in the compact outdoor field");
        assertTrue(definition.spawnPoints().stream().allMatch(spawn -> spawn.route().size() >= 3),
                "every enemy entry should include a corridor route");
        assertTrue(definition.spawnPoints().stream()
                .map(SpawnPoint::targetPriority).distinct().count() >= 3,
                "entries should provide different target priorities");
    }

    @Test
    void collisionUsesTilesBoundsAndUnlockedAreasFromMap() {
        assertEquals(2_080, GameMap.WORLD_W);
        assertEquals(2_080, GameMap.WORLD_H);
        assertTrue(GameMap.canOccupy(GameMap.CORE_X, GameMap.CORE_Y, 5, Set.of()));
        assertTrue(GameMap.canOccupy(1_020, 1_220, 5, Set.of()),
                "the single route to the first room should remain walkable");
        assertFalse(GameMap.canOccupy(1_020, 1_460, 5, Set.of()),
                "the first room should be sealed before it is unlocked");
        assertTrue(GameMap.canOccupy(1_020, 1_460, 5, Set.of("entry-room")));
        assertFalse(GameMap.canOccupy(1_300, 1_300, 5, Set.of()),
                "terrain beside the route must block movement");
        assertFalse(GameMap.canOccupy(3, GameMap.CORE_Y, 5, Set.of()),
                "the world boundary must block movement");
        assertEquals(8, GameMap.AREAS.size());
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
        assertEquals(GameMap.createResourceNodes().size(), message.path("map").path("resourceNodes").size());
        assertEquals(GameMap.SHOP_UNITS.size(), message.path("map").path("shopUnits").size());
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
    void shopsAreDistributedAcrossTheSingleRouteAreas() {
        Set<String> shopAreas = GameMap.SHOP_UNITS.stream().map(shop -> GameMap.AREAS.stream()
                .filter(area -> shop.x() >= area.x() && shop.x() <= area.x() + area.width()
                        && shop.y() >= area.y() && shop.y() <= area.y() + area.height())
                .findFirst().map(UnlockArea::id).orElse("outside"))
                .collect(Collectors.toSet());

        assertEquals(5, GameMap.SHOP_UNITS.size());
        assertEquals(GameMap.SHOP_UNITS.size(), shopAreas.size(),
                "each shop should occupy a different progression area");
    }

    @Test
    void areaLabelsArePositionedOnSolidBlackTiles() {
        Set<String> allAreas = GameMap.AREAS.stream().map(UnlockArea::id)
                .collect(Collectors.toSet());
        for (UnlockArea area : GameMap.AREAS) {
            assertFalse(GameMap.canOccupy(area.labelX(), area.labelY(), 1, allAreas),
                    () -> area.id() + " label must stay on a black wall tile");
        }
    }

    @Test
    void enemyRoutesStayInsideWalkableCorridors() {
        Set<String> allAreas = GameMap.AREAS.stream().map(UnlockArea::id)
                .collect(Collectors.toSet());
        for (SpawnPoint spawn : GameMap.SPAWN_POINTS) {
            for (MapPoint point : spawn.route()) {
                assertTrue(GameMap.canOccupy(point.x(), point.y(), 17, allAreas),
                        () -> spawn.id() + " route crosses a wall at " + point);
            }
        }
    }

    @Test
    void freeBuildingAcceptsFloorTilesAndRejectsWallTiles() {
        assertTrue(GameMap.canPlaceDefense(1_180, 1_900, Set.of()));
        assertFalse(GameMap.canPlaceDefense(1_300, 1_300, Set.of()));
        MapPoint snapped = GameMap.snapToTile(1_179, 1_899);
        assertEquals(1_180, snapped.x());
        assertEquals(1_900, snapped.y());
    }

    @Test
    void wallsBlockWeaponLinesWhileTheDefenseRoadRemainsClear() {
        assertTrue(GameMap.hasClearLine(1_020, 1_900, 1_020, 1_700));
        assertFalse(GameMap.hasClearLine(1_200, 1_900, 1_200, 1_500));
        assertTrue(GameMap.distanceToWall(1_200, 1_900, 0, -1, 400) < 400);
    }
}
