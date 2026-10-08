package example;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Validates map data without initializing the running game map. */
final class MapValidator {
    private MapValidator() { }

    static void validate(MapDefinition map) {
        if (map == null) throw new IllegalStateException("Map definition is required");
        if (map.version() != 5) throw new IllegalStateException("Unsupported map version: " + map.version());
        if (map.world() == null || map.world().width() <= 0 || map.world().height() <= 0) {
            throw new IllegalStateException("Map world size must be positive");
        }
        if (map.core() == null || map.stations() == null
                || map.stations().armory() == null || map.stations().medBay() == null
                || map.stations().woodcutter() == null || map.stations().quarry() == null
                || map.stations().workbench() == null) {
            throw new IllegalStateException("Map core and stations are required");
        }
        if (map.tileMap() == null || map.areas() == null || map.spawnPoints() == null
                || map.trapSlots() == null || map.resourceNodes() == null
                || map.shopUnits() == null || map.workbenchUnits() == null
                || map.prepConsole() == null || map.breakerTerminals() == null
                || map.spawnPoints().isEmpty()) {
            throw new IllegalStateException("Map lists and at least one spawn point are required");
        }
        for (List<?> entries : List.of(map.areas(), map.spawnPoints(), map.trapSlots(),
                map.resourceNodes(), map.shopUnits(), map.workbenchUnits(), map.breakerTerminals())) {
            if (entries.stream().anyMatch(java.util.Objects::isNull)) {
                throw new IllegalStateException("Map lists must not contain null entries");
            }
        }
        validateTileMap(map);
        validateAreas(map.areas(), map.tileMap());

        Set<String> areaIds = uniqueIds(map.areas().stream().map(UnlockArea::id).toList(), "area");
        validatePositions(map, areaIds);
        uniqueIds(map.spawnPoints().stream().map(SpawnPoint::id).toList(), "spawn point");
        uniqueIds(map.trapSlots().stream().map(TrapSlotDefinition::id).toList(), "trap slot");
        uniqueIds(map.resourceNodes().stream().map(ResourceNodeDefinition::id).toList(), "resource node");
        uniqueIds(map.shopUnits().stream().map(ShopUnit::id).toList(), "shop unit");

        for (SpawnPoint spawn : map.spawnPoints()) {
            if (spawn.route() == null || spawn.route().isEmpty()
                    || spawn.route().stream().anyMatch(point -> point == null)) {
                throw new IllegalStateException("Spawn requires a non-empty route: " + spawn.id());
            }
            if (!Set.of("balanced", "runner", "brute").contains(spawn.enemyBias())) {
                throw new IllegalStateException("Unknown enemy bias for spawn " + spawn.id());
            }
            if (!Double.isFinite(spawn.speedMultiplier()) || spawn.speedMultiplier() <= 0) {
                throw new IllegalStateException("Spawn speed multiplier must be positive: " + spawn.id());
            }
            if (!Set.of("core", "players", "defenses").contains(spawn.targetPriority())) {
                throw new IllegalStateException("Unknown target priority for spawn " + spawn.id());
            }
        }
        for (ResourceNodeDefinition node : map.resourceNodes()) {
            if (!Set.of("wood", "ore", "copper", "silver").contains(node.type())) {
                throw new IllegalStateException("Unknown resource type for " + node.id());
            }
        }
        for (ShopUnit shop : map.shopUnits()) {
            if (WeaponCatalog.find(shop.item()) == null && !Set.of("medkit", "ammo", "woodFactory", "oreFactory", "copperFactory", "silverFactory").contains(shop.item())
                    || shop.cost() <= 0) {
                throw new IllegalStateException("Invalid shop unit: " + shop.id());
            }
        }
    }

    static void validatePositions(MapDefinition map, Set<String> areaIds) {
        if (map.medBayUnits() != null) {
            uniqueIds(map.medBayUnits().stream().map(Station::id).toList(), "medbay");
            for (Station station : map.medBayUnits()) {
                validatePoint(map, station.id(), station.x(), station.y(), true);
            }
        }
        for (WorkbenchUnit unit : java.util.Arrays.asList(map.missileComputer(), map.jobStation())) {
            if (unit == null) continue;
            validatePoint(map, unit.id(), unit.x(), unit.y(), true);
            if (!areaIds.contains(unit.requiredArea())) throw new IllegalStateException("Invalid terminal area");
            if (map.areas().stream().noneMatch(area -> area.id().equals(unit.requiredArea())
                    && area.tiles().contains(map.tileMap().cellAt(unit.x(), unit.y())))) {
                throw new IllegalStateException("Terminal outside its area: " + unit.id());
            }
        }
        validatePoint(map, "core", map.core().x(), map.core().y(), true);
        for (Station station : List.of(map.stations().armory(), map.stations().medBay(),
                map.stations().woodcutter(), map.stations().quarry(), map.stations().workbench())) {
            validatePoint(map, station.id(), station.x(), station.y(), true);
        }
        uniqueIds(map.workbenchUnits().stream().map(WorkbenchUnit::id).toList(), "workbench");
        uniqueIds(map.breakerTerminals().stream().map(BreakerTerminal::id).toList(), "breaker");
        for (UnlockArea area : map.areas()) {
            validatePoint(map, area.id(), area.terminalX(), area.terminalY(), false);
            validatePoint(map, area.id() + " label", area.labelX(), area.labelY(), false);
            if (map.trapSlots().stream().anyMatch(slot -> GameSupport.distance(
                    area.terminalX(), area.terminalY(), slot.x(), slot.y()) < GameMap.FACILITY_CLEARANCE)) {
                throw new IllegalStateException("Terminal overlaps defense slot: " + area.id());
            }
            boolean approach = false;
            for (int[] offset : new int[][]{{0,0},{1,0},{-1,0},{0,1},{0,-1}}) {
                AreaTile cell = map.tileMap().cellAt(area.terminalX() + offset[0] * map.tileMap().tileSize(),
                        area.terminalY() + offset[1] * map.tileMap().tileSize());
                TileType type = map.tileMap().typeAt(cell.column(), cell.row());
                approach |= type != null && !type.solid() && !area.tiles().contains(cell);
            }
            if (!approach) throw new IllegalStateException("No outside approach for terminal: " + area.id());
        }
        for (SpawnPoint spawn : map.spawnPoints()) {
            validatePoint(map, spawn.id(), spawn.x(), spawn.y(), true);
            if (spawn.route() != null) {
                for (MapPoint point : spawn.route()) {
                    if (point != null) validatePoint(map, spawn.id() + " route", point.x(), point.y(), true);
                }
            }
        }
        for (TrapSlotDefinition slot : map.trapSlots()) {
            validateFacility(map, areaIds, slot.id(), slot.x(), slot.y(), slot.requiredArea());
        }
        for (ShopUnit shop : map.shopUnits()) validatePoint(map, shop.id(), shop.x(), shop.y(), true);
        for (ResourceNodeDefinition node : map.resourceNodes()) {
            validateFacility(map, areaIds, node.id(), node.x(), node.y(), node.requiredArea());
        }
        for (WorkbenchUnit unit : map.workbenchUnits()) {
            validateFacility(map, areaIds, unit.id(), unit.x(), unit.y(), unit.requiredArea());
        }
        for (BreakerTerminal unit : map.breakerTerminals()) {
            validateFacility(map, areaIds, unit.id(), unit.x(), unit.y(), unit.requiredArea());
        }
        PrepConsole prep = map.prepConsole();
        validateFacility(map, areaIds, prep.id(), prep.x(), prep.y(), prep.requiredArea());
        if (prep.cost() <= 0 || prep.seconds() <= 0) throw new IllegalStateException("Invalid prep console");
    }

    private static void validateFacility(MapDefinition map, Set<String> areaIds, String id,
            double x, double y, String requiredArea) {
        validatePoint(map, id, x, y, true);
        if (requiredArea != null && (!areaIds.contains(requiredArea)
                || map.areas().stream().noneMatch(area -> area.id().equals(requiredArea)
                    && area.tiles().contains(map.tileMap().cellAt(x, y))))) {
            throw new IllegalStateException("Facility is outside its required area: " + id);
        }
    }

    private static void validatePoint(MapDefinition map, String id, double x, double y, boolean floor) {
        if (!Double.isFinite(x) || !Double.isFinite(y) || x < 0 || y < 0
                || x >= map.world().width() || y >= map.world().height()) {
            throw new IllegalStateException("Point outside map: " + id);
        }
        AreaTile cell = map.tileMap().cellAt(x, y);
        TileType type = map.tileMap().typeAt(cell.column(), cell.row());
        if (type == null || (floor && type.solid())) throw new IllegalStateException("Invalid tile for: " + id);
    }

    static void validateAreas(List<UnlockArea> areas, TileMapDefinition tiles) {
        Set<AreaTile> occupied = new HashSet<>();
        for (UnlockArea area : areas) {
            if (area.tiles() == null || area.tiles().isEmpty()) {
                throw new IllegalStateException("Area requires tiles: " + area.id());
            }
            for (AreaTile tile : area.tiles()) {
                TileType type = tile == null ? null : tiles.typeAt(tile.column(), tile.row());
                if (type == null || type.solid() || !occupied.add(tile)) {
                    throw new IllegalStateException("Invalid or overlapping area tile: " + area.id());
                }
            }
        }
    }

    private static void validateTileMap(MapDefinition map) {
        TileMapDefinition tiles = map.tileMap();
        if (tiles.tileSize() <= 0 || tiles.legend() == null || tiles.legend().isEmpty()
                || tiles.rows() == null || tiles.rows().isEmpty()) {
            throw new IllegalStateException("Tile map, legend, and rows are required");
        }
        if (map.world().width() % tiles.tileSize() != 0
                || map.world().height() % tiles.tileSize() != 0) {
            throw new IllegalStateException("World size must align to the tile size");
        }
        int expectedColumns = map.world().width() / tiles.tileSize();
        int expectedRows = map.world().height() / tiles.tileSize();
        if (tiles.rows().size() != expectedRows) {
            throw new IllegalStateException("Tile row count must be " + expectedRows);
        }
        for (String row : tiles.rows()) {
            if (row == null || row.length() != expectedColumns) {
                throw new IllegalStateException("Every tile row must contain " + expectedColumns + " cells");
            }
            for (int index = 0; index < row.length(); index++) {
                if (tiles.legend().get(String.valueOf(row.charAt(index))) == null) {
                    throw new IllegalStateException("Unknown tile symbol: " + row.charAt(index));
                }
            }
        }
    }

    private static Set<String> uniqueIds(List<String> ids, String label) {
        Set<String> unique = new HashSet<>();
        for (String id : ids) {
            if (id == null || id.isBlank() || !unique.add(id)) {
                throw new IllegalStateException("Invalid or duplicate " + label + " id: " + id);
            }
        }
        return unique;
    }
}
