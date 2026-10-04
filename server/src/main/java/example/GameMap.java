package example;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

record WorldSize(int width, int height) { }

record MapPoint(double x, double y) { }

record Station(String id, double x, double y) { }

record Stations(Station armory, Station medBay, Station woodcutter, Station quarry,
        Station workbench) { }

record TileType(String name, boolean solid, boolean buildable, String color) { }

/** Full rectangular grid: every symbol, including floor, occupies one cell. */
record TileMapDefinition(int tileSize, Map<String, TileType> legend, List<String> rows) {
    AreaTile cellAt(double x, double y) {
        return new AreaTile((int) Math.floor(x / tileSize), (int) Math.floor(y / tileSize));
    }

    MapPoint center(AreaTile cell) {
        return new MapPoint((cell.column() + .5) * tileSize, (cell.row() + .5) * tileSize);
    }

    TileType typeAt(int column, int row) {
        if (row < 0 || row >= rows.size()) return null;
        String cells = rows.get(row);
        if (column < 0 || column >= cells.length()) return null;
        return legend.get(String.valueOf(cells.charAt(column)));
    }
}

record AreaTile(int column, int row) { }

record UnlockArea(String id, String name, List<AreaTile> tiles,
        double terminalX, double terminalY, double labelX, double labelY,
        String color, String detail) {
    boolean contains(double x, double y) {
        return tiles.contains(GameMap.TILE_MAP.cellAt(x, y));
    }

    boolean overlaps(double x, double y, double radius) {
        if (radius == 0) return contains(x, y);
        return tiles.stream().anyMatch(tile ->
                x + radius > tile.column() * GameMap.TILE_SIZE
                && x - radius < (tile.column() + 1) * GameMap.TILE_SIZE
                && y + radius > tile.row() * GameMap.TILE_SIZE
                && y - radius < (tile.row() + 1) * GameMap.TILE_SIZE);
    }
}

record SpawnPoint(String id, String name, double x, double y, String lane,
        String enemyBias, double speedMultiplier, String targetPriority,
        List<MapPoint> route) { }

record TrapSlotDefinition(String id, String lane, double x, double y, String requiredArea) { }

record ResourceNodeDefinition(String id, String type, double x, double y, String requiredArea) { }

record ShopUnit(String id, String item, String label, double x, double y, int cost,
        String detail) { }

record BreakerTerminal(String id, String label, double x, double y, String requiredArea) { }

record WorkbenchUnit(String id, double x, double y, String requiredArea) { }

record PrepConsole(String id, double x, double y, String requiredArea, int cost,
        int seconds) { }

record MapDefinition(int version, WorldSize world, MapPoint core, Stations stations,
        TileMapDefinition tileMap, List<UnlockArea> areas, List<SpawnPoint> spawnPoints,
        List<TrapSlotDefinition> trapSlots, List<ResourceNodeDefinition> resourceNodes,
        List<ShopUnit> shopUnits, List<WorkbenchUnit> workbenchUnits,
        PrepConsole prepConsole, List<BreakerTerminal> breakerTerminals) { }

/** Static research-facility layout loaded from the shared map resource. */
final class GameMap {
    private static final String RESOURCE_PATH = "/map.json";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final MapDefinition DEFINITION = loadDefinition();

    static final int WORLD_W = DEFINITION.world().width();
    static final int WORLD_H = DEFINITION.world().height();
    static final double CORE_X = DEFINITION.core().x();
    static final double CORE_Y = DEFINITION.core().y();
    static final double ARMORY_X = DEFINITION.stations().armory().x();
    static final double ARMORY_Y = DEFINITION.stations().armory().y();
    static final double MED_X = DEFINITION.stations().medBay().x();
    static final double MED_Y = DEFINITION.stations().medBay().y();
    static final double WOODCUTTER_X = DEFINITION.stations().woodcutter().x();
    static final double WOODCUTTER_Y = DEFINITION.stations().woodcutter().y();
    static final double QUARRY_X = DEFINITION.stations().quarry().x();
    static final double QUARRY_Y = DEFINITION.stations().quarry().y();
    static final double WORKBENCH_X = DEFINITION.stations().workbench().x();
    static final double WORKBENCH_Y = DEFINITION.stations().workbench().y();
    static final int TILE_SIZE = DEFINITION.tileMap().tileSize();
    static final TileMapDefinition TILE_MAP = DEFINITION.tileMap();
    static final List<UnlockArea> AREAS = List.copyOf(DEFINITION.areas());
    static final List<SpawnPoint> SPAWN_POINTS = buildSpawnPoints();
    static final List<ShopUnit> SHOP_UNITS = List.copyOf(DEFINITION.shopUnits());
    static final List<ResourceNodeDefinition> RESOURCE_NODES = List.copyOf(DEFINITION.resourceNodes());
    static final List<WorkbenchUnit> WORKBENCH_UNITS = List.copyOf(DEFINITION.workbenchUnits());
    static final PrepConsole PREP_CONSOLE = DEFINITION.prepConsole();
    static final List<BreakerTerminal> BREAKER_TERMINALS = List.copyOf(DEFINITION.breakerTerminals());
    private static final String CLIENT_MAP_MESSAGE = buildClientMapMessage();

    private GameMap() { }

    static List<TrapSlot> createTrapSlots() {
        return new ArrayList<>(DEFINITION.trapSlots().stream()
                .map(slot -> new TrapSlot(slot.id(), slot.lane(), slot.x(), slot.y(), slot.requiredArea()))
                .toList());
    }

    static List<ResourceNode> createResourceNodes() {
        return new ArrayList<>(RESOURCE_NODES.stream()
                .map(node -> new ResourceNode(node.id(), node.type(), node.x(), node.y(),
                        node.requiredArea()))
                .toList());
    }

    static UnlockArea areaById(String id) {
        return AREAS.stream().filter(area -> area.id().equals(id)).findFirst().orElse(null);
    }

    static SpawnPoint spawnById(String id) {
        return SPAWN_POINTS.stream().filter(spawn -> spawn.id().equals(id))
                .findFirst().orElse(SPAWN_POINTS.get(0));
    }

    static ShopUnit shopByItem(String item) {
        return SHOP_UNITS.stream().filter(shop -> shop.item().equals(item))
                .findFirst().orElse(null);
    }

    static BreakerTerminal breakerById(String id) {
        return BREAKER_TERMINALS.stream().filter(breaker -> breaker.id().equals(id))
                .findFirst().orElse(null);
    }

    static String clientMapMessage() {
        return CLIENT_MAP_MESSAGE;
    }

    static boolean canOccupy(double x, double y, double radius, Set<String> unlockedAreas) {
        if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(radius) || radius < 0) return false;
        if (x - radius < 0 || y - radius < 0 || x + radius > WORLD_W || y + radius > WORLD_H
                || x >= WORLD_W || y >= WORLD_H) {
            return false;
        }
        for (UnlockArea area : AREAS) {
            if (!unlockedAreas.contains(area.id())
                    && area.overlaps(x, y, radius)) {
                return false;
            }
        }
        int minColumn = (int) Math.floor((x - radius) / TILE_SIZE);
        int maxColumn = (int) (radius == 0 ? Math.floor(x / TILE_SIZE) : Math.ceil((x + radius) / TILE_SIZE) - 1);
        int minRow = (int) Math.floor((y - radius) / TILE_SIZE);
        int maxRow = (int) (radius == 0 ? Math.floor(y / TILE_SIZE) : Math.ceil((y + radius) / TILE_SIZE) - 1);
        for (int row = minRow; row <= maxRow; row++) {
            for (int column = minColumn; column <= maxColumn; column++) {
                TileType type = tileTypeAt(column, row);
                if (type == null || type.solid()) return false;
            }
        }
        return true;
    }

    static MapPoint snapToTile(double x, double y) {
        if (!Double.isFinite(x) || !Double.isFinite(y)) return new MapPoint(Double.NaN, Double.NaN);
        return TILE_MAP.center(TILE_MAP.cellAt(x, y));
    }

    static boolean canPlaceDefense(double x, double y, Set<String> unlockedAreas) {
        MapPoint point = snapToTile(x, y);
        int column = (int) (point.x() / TILE_SIZE);
        int row = (int) (point.y() / TILE_SIZE);
        TileType tile = tileTypeAt(column, row);
        if (tile == null || !tile.buildable() || !canOccupy(point.x(), point.y(), 15, unlockedAreas)) {
            return false;
        }
        if (GameSupport.distance(point.x(), point.y(), ARMORY_X, ARMORY_Y) < 36
                || GameSupport.distance(point.x(), point.y(), MED_X, MED_Y) < 36
                || GameSupport.distance(point.x(), point.y(), WOODCUTTER_X, WOODCUTTER_Y) < 36
                || GameSupport.distance(point.x(), point.y(), QUARRY_X, QUARRY_Y) < 36) {
            return false;
        }
        if (AREAS.stream().anyMatch(area ->
                GameSupport.distance(point.x(), point.y(), area.terminalX(), area.terminalY()) < 36)) return false;
        if (WORKBENCH_UNITS.stream().anyMatch(workbench ->
                GameSupport.distance(point.x(), point.y(), workbench.x(), workbench.y()) < 36)) {
            return false;
        }
        if (SHOP_UNITS.stream().anyMatch(shop ->
                GameSupport.distance(point.x(), point.y(), shop.x(), shop.y()) < 36)) return false;
        if (BREAKER_TERMINALS.stream().anyMatch(breaker ->
                GameSupport.distance(point.x(), point.y(), breaker.x(), breaker.y()) < 36)) return false;
        if (GameSupport.distance(point.x(), point.y(), PREP_CONSOLE.x(), PREP_CONSOLE.y()) < 36) {
            return false;
        }
        if (RESOURCE_NODES.stream().anyMatch(node ->
                GameSupport.distance(point.x(), point.y(), node.x(), node.y()) < 36)) return false;
        return SPAWN_POINTS.stream().noneMatch(spawn ->
                GameSupport.distance(point.x(), point.y(), spawn.x(), spawn.y()) < 80);
    }

    static boolean canPlaceCore(double x, double y, Set<String> unlockedAreas) {
        return canPlaceDefense(x, y, unlockedAreas);
    }

    static double distanceToWall(double x, double y, double directionX,
            double directionY, double maxDistance) {
        if (maxDistance <= 0) return 0;
        double step = Math.max(4, TILE_SIZE / 8.0);
        double lastClear = 0;
        for (double traveled = step; traveled <= maxDistance; traveled += step) {
            if (isSolidAt(x + directionX * traveled, y + directionY * traveled)) {
                return lastClear;
            }
            lastClear = traveled;
        }
        if (lastClear < maxDistance
                && isSolidAt(x + directionX * maxDistance, y + directionY * maxDistance)) {
            return lastClear;
        }
        return maxDistance;
    }

    static boolean hasClearLine(double fromX, double fromY, double toX, double toY) {
        double dx = toX - fromX;
        double dy = toY - fromY;
        double distance = Math.hypot(dx, dy);
        if (distance < 0.001) return true;
        return distanceToWall(fromX, fromY, dx / distance, dy / distance, distance)
                >= distance - 0.001;
    }

    private static boolean isSolidAt(double x, double y) {
        if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return true;
        TileType tile = tileTypeAt((int) Math.floor(x / TILE_SIZE),
                (int) Math.floor(y / TILE_SIZE));
        return tile == null || tile.solid();
    }

    static TileType tileTypeAt(int column, int row) {
        return TILE_MAP.typeAt(column, row);
    }

    private static MapDefinition loadDefinition() {
        try (InputStream input = GameMap.class.getResourceAsStream(RESOURCE_PATH)) {
            if (input == null) throw new IllegalStateException("Missing shared map resource: " + RESOURCE_PATH);
            MapDefinition definition = JSON.readValue(input, MapDefinition.class);
            validate(definition);
            return definition;
        } catch (IOException error) {
            throw new ExceptionInInitializerError("Could not read shared map resource: " + error.getMessage());
        }
    }

    private static String buildClientMapMessage() {
        try {
            ObjectNode clientMap = JSON.valueToTree(DEFINITION);
            clientMap.set("tileMap", JSON.valueToTree(TILE_MAP));
            clientMap.set("areas", JSON.valueToTree(AREAS));
            clientMap.set("spawnPoints", JSON.valueToTree(SPAWN_POINTS));
            clientMap.set("breakerTerminals", JSON.valueToTree(BREAKER_TERMINALS));
            clientMap.set("workbenchUnits", JSON.valueToTree(WORKBENCH_UNITS));
            clientMap.set("prepConsole", JSON.valueToTree(PREP_CONSOLE));
            clientMap.set("resourceNodes", JSON.valueToTree(RESOURCE_NODES));
            return "{\"type\":\"map\",\"map\":" + JSON.writeValueAsString(clientMap) + "}";
        } catch (IOException error) {
            throw new ExceptionInInitializerError(
                    "Could not serialize shared map resource: " + error.getMessage());
        }
    }

    private static List<SpawnPoint> buildSpawnPoints() {
        List<SpawnPoint> spawns = new ArrayList<>(DEFINITION.spawnPoints());
        for (UnlockArea area : AREAS) {
            MapPoint best = null;
            double farthest = -1;
            for (AreaTile tile : area.tiles()) {
                MapPoint center = TILE_MAP.center(tile);
                double x = center.x(), y = center.y();
                if (!canOccupy(x, y, 17, AREAS.stream().map(UnlockArea::id).collect(java.util.stream.Collectors.toSet()))) continue;
                double distance = GameSupport.distance(x, y, area.terminalX(), area.terminalY());
                if (distance > farthest) { farthest = distance; best = new MapPoint(x, y); }
            }
            if (best != null) spawns.add(new SpawnPoint("area-" + area.id(), area.name(), best.x(), best.y(),
                    "interior", "balanced", 1, "core", List.of(best)));
        }
        return List.copyOf(spawns);
    }

    static String spawnArea(SpawnPoint spawn) {
        return spawn.id().startsWith("area-") ? spawn.id().substring(5) : null;
    }

    private static void validate(MapDefinition map) {
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
            if (spawn.speedMultiplier() <= 0) {
                throw new IllegalStateException("Spawn speed multiplier must be positive: " + spawn.id());
            }
            if (!Set.of("core", "players", "defenses").contains(spawn.targetPriority())) {
                throw new IllegalStateException("Unknown target priority for spawn " + spawn.id());
            }
        }
        for (TrapSlotDefinition slot : map.trapSlots()) {
            if (slot.requiredArea() != null && !areaIds.contains(slot.requiredArea())) {
                throw new IllegalStateException("Unknown area for trap slot " + slot.id()
                        + ": " + slot.requiredArea());
            }
        }
        for (ResourceNodeDefinition node : map.resourceNodes()) {
            if (!Set.of("wood", "ore").contains(node.type())) {
                throw new IllegalStateException("Unknown resource type for " + node.id());
            }
            if (node.requiredArea() != null && !areaIds.contains(node.requiredArea())) {
                throw new IllegalStateException("Unknown area for resource node " + node.id());
            }
        }
        for (ShopUnit shop : map.shopUnits()) {
            if (!Set.of("shotgun", "smg", "rifle", "sniper", "revolver", "lmg", "ammo").contains(shop.item())
                    || shop.cost() <= 0) {
                throw new IllegalStateException("Invalid shop unit: " + shop.id());
            }
        }
    }

    static void validatePositions(MapDefinition map, Set<String> areaIds) {
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
                    area.terminalX(), area.terminalY(), slot.x(), slot.y()) < 36)) {
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
            if (spawn.route() != null) for (MapPoint point : spawn.route()) {
                if (point != null) validatePoint(map, spawn.id() + " route", point.x(), point.y(), true);
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
                if (tile == null || tile.row() < 0 || tile.row() >= tiles.rows().size()
                        || tile.column() < 0 || tile.column() >= tiles.rows().get(tile.row()).length()
                        || tiles.legend().get(String.valueOf(tiles.rows().get(tile.row()).charAt(tile.column()))).solid()
                        || !occupied.add(tile)) {
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
                if (!tiles.legend().containsKey(String.valueOf(row.charAt(index)))) {
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
