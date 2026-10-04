package example;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import java.io.InputStream;
import java.util.List;
import java.util.stream.Collectors;
import java.util.Set;
import org.junit.jupiter.api.Test;

class GameMapTest {
    @Test
    void weaponShopsAreInSeparateUnlockableSideRoomsConnectedToTheMainRoute() {
        Set<String> weapons = Set.of("shotgun", "smg", "rifle", "sniper", "revolver", "lmg");
        Set<String> mainAreas = GameMap.AREAS.stream().map(UnlockArea::id)
                .filter(id -> weapons.stream().noneMatch(weapon -> id.equals(weapon + "-room")))
                .collect(Collectors.toSet());
        Set<AreaTile> mainFloor = reachableTiles(mainAreas);
        for (String weapon : weapons) {
            ShopUnit shop = GameMap.shopByItem(weapon);
            UnlockArea room = GameMap.areaById(weapon + "-room");
            assertTrue(room.contains(shop.x(), shop.y()));
            AreaTile shopTile = new AreaTile((int) (shop.x() / GameMap.TILE_SIZE),
                    (int) (shop.y() / GameMap.TILE_SIZE));
            assertFalse(mainFloor.contains(shopTile), weapon + " must be locked");
            boolean terminalReachable = false;
            for (int[] offset : new int[][]{{1,0},{-1,0},{0,1},{0,-1}}) {
                terminalReachable |= mainFloor.contains(new AreaTile(
                        (int) (room.terminalX() / GameMap.TILE_SIZE) + offset[0],
                        (int) (room.terminalY() / GameMap.TILE_SIZE) + offset[1]));
            }
            assertTrue(terminalReachable, weapon + " terminal must be accessible before unlocking");
            Set<String> opened = new java.util.HashSet<>(mainAreas);
            opened.add(room.id());
            assertTrue(reachableTiles(opened).contains(shopTile), weapon + " room must connect to the main route");
        }
        for (SpawnPoint spawn : GameMap.SPAWN_POINTS) {
            if (GameMap.spawnArea(spawn) != null) continue;
            for (MapPoint point : spawn.route()) {
                assertTrue(mainFloor.contains(new AreaTile((int) (point.x() / GameMap.TILE_SIZE),
                        (int) (point.y() / GameMap.TILE_SIZE))), "weapon rooms must not block the main route");
            }
        }
    }

    private static Set<AreaTile> reachableTiles(Set<String> unlocked) {
        Set<AreaTile> visited = new java.util.HashSet<>();
        Set<AreaTile> reachable = new java.util.HashSet<>();
        var queue = new java.util.ArrayDeque<AreaTile>();
        queue.add(new AreaTile((int) (GameMap.CORE_X / GameMap.TILE_SIZE),
                (int) (GameMap.CORE_Y / GameMap.TILE_SIZE)));
        while (!queue.isEmpty()) {
            AreaTile tile = queue.remove();
            if (!visited.add(tile) || !GameMap.canOccupy((tile.column() + .5) * GameMap.TILE_SIZE,
                    (tile.row() + .5) * GameMap.TILE_SIZE, 5, unlocked)) continue;
            reachable.add(tile);
            for (int[] delta : new int[][]{{1,0},{-1,0},{0,1},{0,-1}}) {
                queue.add(new AreaTile(tile.column() + delta[0], tile.row() + delta[1]));
            }
        }
        return reachable;
    }

    @Test
    void concaveAreasLeaveTheirMissingCornerAvailableToAnotherArea() {
        UnlockArea concave = testArea("concave", List.of(
                new AreaTile(25, 47), new AreaTile(26, 47), new AreaTile(25, 48)));
        UnlockArea corner = testArea("corner", List.of(new AreaTile(26, 48)));
        GameMap.validateAreas(List.of(concave, corner), GameMap.TILE_MAP);
        assertTrue(concave.contains(1020, 1940));
        assertFalse(concave.contains(1060, 1940));
        assertFalse(concave.overlaps(1060, 1940, 5));
        assertTrue(concave.overlaps(1042, 1940, 5), "body crossing a tile edge must collide");
        assertTrue(corner.contains(1060, 1940));
    }

    @Test
    void areaValidationRejectsOverlapWallsAndOutOfBoundsTiles() {
        UnlockArea area = testArea("first", List.of(new AreaTile(25, 47)));
        org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,
                () -> GameMap.validateAreas(List.of(area,
                        testArea("second", area.tiles())), GameMap.TILE_MAP));
        for (List<AreaTile> tiles : List.of(List.<AreaTile>of(),
                List.of(new AreaTile(0, 0)), List.of(new AreaTile(-1, 47)),
                List.of(new AreaTile(52, 47)),
                List.of(new AreaTile(25, 47), new AreaTile(25, 47)))) {
            org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,
                    () -> GameMap.validateAreas(List.of(testArea("invalid", tiles)), GameMap.TILE_MAP));
        }
    }

    private static UnlockArea testArea(String id, List<AreaTile> tiles) {
        return new UnlockArea(id, id, tiles, 0, 0, 0, 0, "#fff", "", false);
    }

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
        assertEquals(definition.tileMap().tileSize(), GameMap.TILE_MAP.tileSize());
        assertEquals(definition.areas().size(), GameMap.AREAS.size());
        assertEquals(definition.spawnPoints(), GameMap.SPAWN_POINTS.stream().filter(spawn -> GameMap.spawnArea(spawn) == null).toList());
        assertEquals(definition.trapSlots().size(), GameMap.createTrapSlots().size());
        assertEquals(definition.resourceNodes().size() + 4, GameMap.createResourceNodes().size());
        assertEquals(definition.shopUnits(), GameMap.SHOP_UNITS);
        assertEquals(9, GameMap.BREAKER_TERMINALS.size());
        assertEquals(4, GameMap.WORKBENCH_UNITS.size());
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
        assertEquals(17, GameMap.AREAS.size());
    }

    @Test
    void serverCanDeliverTheSharedMapToClients() throws Exception {
        JsonNode message = new ObjectMapper().readTree(GameMap.clientMapMessage());

        assertEquals("map", message.path("type").asText());
        assertEquals(5, message.path("map").path("version").asInt());
        assertEquals(GameMap.WORLD_H / GameMap.TILE_SIZE,
                message.path("map").path("tileMap").path("rows").size());
        assertEquals(GameMap.SPAWN_POINTS.size(), message.path("map").path("spawnPoints").size());
        assertEquals(GameMap.createTrapSlots().size(), message.path("map").path("trapSlots").size());
        assertEquals(GameMap.RESOURCE_NODES.size(), message.path("map").path("resourceNodes").size());
        assertEquals(GameMap.SHOP_UNITS.size(), message.path("map").path("shopUnits").size());
        assertEquals(GameMap.BREAKER_TERMINALS.size(),
                message.path("map").path("breakerTerminals").size());
        assertEquals(GameMap.WORKBENCH_UNITS.size(),
                message.path("map").path("workbenchUnits").size());
        assertEquals(GameMap.PREP_CONSOLE.id(),
                message.path("map").path("prepConsole").path("id").asText());
    }

    @Test
    void unlockTerminalsDoNotOverlapDefenseSlots() {
        for (UnlockArea area : GameMap.AREAS) {
            for (TrapSlot slot : GameMap.createTrapSlots()) {
                double separation = GameSupport.distance(
                        area.terminalX(), area.terminalY(), slot.x, slot.y);
                assertTrue(separation >= (area.fixedTerminal() ? GameMap.TILE_SIZE : 60),
                        () -> area.id() + " terminal overlaps defense slot " + slot.id);
            }
        }
    }

    @Test
    void breakersAreReachableAndMountedBesideWalls() {
        Set<String> allAreas = GameMap.AREAS.stream().map(UnlockArea::id)
                .collect(Collectors.toSet());
        for (BreakerTerminal breaker : GameMap.BREAKER_TERMINALS) {
            assertTrue(GameMap.canOccupy(breaker.x(), breaker.y(), 5, allAreas),
                    () -> breaker.id() + " must be reachable");
            double nearestWall = Math.min(
                    Math.min(GameMap.distanceToWall(breaker.x(), breaker.y(), 1, 0, 80),
                            GameMap.distanceToWall(breaker.x(), breaker.y(), -1, 0, 80)),
                    Math.min(GameMap.distanceToWall(breaker.x(), breaker.y(), 0, 1, 80),
                            GameMap.distanceToWall(breaker.x(), breaker.y(), 0, -1, 80)));
            assertTrue(nearestWall <= 20,
                    () -> breaker.id() + " must be mounted beside a wall");
        }
    }

    @Test
    void shopsAreDistributedAcrossTheSingleRouteAreas() {
        Set<String> shopAreas = GameMap.SHOP_UNITS.stream().map(shop -> GameMap.AREAS.stream()
                .filter(area -> area.contains(shop.x(), shop.y()))
                .findFirst().map(UnlockArea::id).orElse("outside"))
                .collect(Collectors.toSet());

        assertEquals(7, GameMap.SHOP_UNITS.size());
        assertEquals(GameMap.SHOP_UNITS.size(), shopAreas.size(),
                "each shop should occupy a different progression area");
    }

    @Test
    void earlyWoodAndOrePocketsAreSeparatePaidSideAreas() {
        List<ResourceNodeDefinition> earlyNodes = GameMap.RESOURCE_NODES.stream()
                .filter(node -> node.id().startsWith("early-"))
                .toList();

        assertEquals(4, earlyNodes.size());
        assertEquals(Set.of("wood", "ore"), earlyNodes.stream()
                .map(ResourceNodeDefinition::type).collect(Collectors.toSet()));
        assertEquals(Set.of("wood-room", "ore-room"), earlyNodes.stream()
                .map(ResourceNodeDefinition::requiredArea).collect(Collectors.toSet()));
        assertTrue(earlyNodes.stream().noneMatch(node -> node.y() == 1_140 || node.y() == 1_180),
                "resource nodes must not remain in the main corridor");
        for (ResourceNodeDefinition node : earlyNodes) {
            assertFalse(GameMap.canOccupy(node.x(), node.y(), 5, Set.of()),
                    () -> node.id() + " must stay sealed before its area opens");
            assertTrue(GameMap.canOccupy(node.x(), node.y(), 5, Set.of(node.requiredArea())),
                    () -> node.id() + " must be reachable inside its side room");
        }
        assertTrue(GameMap.areaById("wood-room").terminalY()
                > GameMap.areaById("ore-room").terminalY(),
                "the wood room must branch from the earlier entry area");
        assertEquals("operations-room", GameMap.PREP_CONSOLE.requiredArea());
    }

    @Test
    void timeControlRoomConnectsToTransitImmediatelyAfterUnlock() {
        assertTrue(GameMap.canOccupy(1_220, 1_100, 5, Set.of("transit-hall")),
                "the two-tile doorway from transit must be open");
        assertFalse(GameMap.canOccupy(1_220, 900, 5,
                Set.of("transit-hall", "operations-room", "armory-wing")),
                "the upper edge of TIME CONTROL must not leak into the neighboring area");
        assertFalse(GameMap.canOccupy(GameMap.PREP_CONSOLE.x(), GameMap.PREP_CONSOLE.y(), 5,
                Set.of("transit-hall")), "the room must remain locked before purchase");
        assertTrue(GameMap.canOccupy(GameMap.PREP_CONSOLE.x(), GameMap.PREP_CONSOLE.y(), 5,
                Set.of("transit-hall", "operations-room")),
                "unlocking TIME CONTROL must make the console reachable immediately");
    }

    @Test
    void workbenchesAreDistributedAcrossSeveralProgressionAreas() {
        Set<String> workbenchAreas = GameMap.WORKBENCH_UNITS.stream()
                .map(WorkbenchUnit::requiredArea).collect(Collectors.toSet());
        Set<String> allAreas = GameMap.AREAS.stream().map(UnlockArea::id)
                .collect(Collectors.toSet());

        assertEquals(4, GameMap.WORKBENCH_UNITS.size());
        assertEquals(4, workbenchAreas.size());
        for (WorkbenchUnit workbench : GameMap.WORKBENCH_UNITS) {
            assertTrue(GameMap.canOccupy(workbench.x(), workbench.y(), 5, allAreas),
                    () -> workbench.id() + " must be reachable");
        }
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
