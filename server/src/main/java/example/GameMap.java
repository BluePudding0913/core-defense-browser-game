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

record TileMapDefinition(int tileSize, Map<String, TileType> legend, List<String> rows) { }

record UnlockArea(String id, String name, double x, double y, double width, double height,
        double terminalX, double terminalY, double labelX, double labelY,
        String color, String detail) { }

record SpawnPoint(String id, String name, double x, double y, String lane,
        String enemyBias, double speedMultiplier, String targetPriority,
        List<MapPoint> route) { }

record TrapSlotDefinition(String id, String lane, double x, double y, String requiredArea) { }

record ResourceNodeDefinition(String id, String type, double x, double y, String requiredArea) { }

record ShopUnit(String id, String item, String label, double x, double y, int cost,
        String detail) { }

record BreakerTerminal(String id, String label, double x, double y, String requiredArea) { }

record MapDefinition(int version, WorldSize world, MapPoint core, Stations stations,
        TileMapDefinition tileMap, List<UnlockArea> areas, List<SpawnPoint> spawnPoints,
        List<TrapSlotDefinition> trapSlots, List<ResourceNodeDefinition> resourceNodes,
        List<ShopUnit> shopUnits) { }

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
    static final TileMapDefinition TILE_MAP = buildGameplayTileMap();
    static final List<UnlockArea> AREAS = buildGameplayAreas();
    static final List<SpawnPoint> SPAWN_POINTS = List.copyOf(DEFINITION.spawnPoints());
    static final List<ShopUnit> SHOP_UNITS = List.copyOf(DEFINITION.shopUnits());
    static final List<ResourceNodeDefinition> RESOURCE_NODES = buildResourceNodeDefinitions();
    static final List<BreakerTerminal> BREAKER_TERMINALS = List.of(
            new BreakerTerminal("breaker-outside", "OUTSIDE", 820, 1940, null),
            new BreakerTerminal("breaker-entry", "ENTRY ROOM", 1140, 1620, "entry-room"),
            new BreakerTerminal("breaker-transit", "TRANSIT HALL", 1300, 1180, "transit-hall"),
            new BreakerTerminal("breaker-armory", "ARMORY WING", 1780, 1020, "armory-wing"),
            new BreakerTerminal("breaker-forest", "FOREST LAB", 1660, 420, "forest"),
            new BreakerTerminal("breaker-relay", "RELAY GALLERY", 1220, 300, "relay-gallery"),
            new BreakerTerminal("breaker-mine", "MINE LAB", 820, 100, "mine"),
            new BreakerTerminal("breaker-security", "SECURITY HALL", 580, 220, "security-hall"),
            new BreakerTerminal("breaker-command", "COMMAND ROOM", 100, 300, "command-room"));
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
        if (x - radius < 0 || y - radius < 0 || x + radius > WORLD_W || y + radius > WORLD_H) {
            return false;
        }
        for (UnlockArea area : AREAS) {
            if (!unlockedAreas.contains(area.id())
                    && overlaps(x, y, radius, area.x(), area.y(), area.width(), area.height())) {
                return false;
            }
        }
        int minColumn = (int) Math.floor((x - radius) / TILE_SIZE);
        int maxColumn = (int) Math.floor((x + radius) / TILE_SIZE);
        int minRow = (int) Math.floor((y - radius) / TILE_SIZE);
        int maxRow = (int) Math.floor((y + radius) / TILE_SIZE);
        for (int row = minRow; row <= maxRow; row++) {
            for (int column = minColumn; column <= maxColumn; column++) {
                TileType type = tileTypeAt(column, row);
                if (type != null && type.solid()) return false;
            }
        }
        return true;
    }

    static MapPoint snapToTile(double x, double y) {
        return new MapPoint((Math.floor(x / TILE_SIZE) + 0.5) * TILE_SIZE,
                (Math.floor(y / TILE_SIZE) + 0.5) * TILE_SIZE);
    }

    static boolean canPlaceDefense(double x, double y, Set<String> unlockedAreas) {
        MapPoint point = snapToTile(x, y);
        int column = (int) (point.x() / TILE_SIZE);
        int row = (int) (point.y() / TILE_SIZE);
        TileType tile = tileTypeAt(column, row);
        if (tile == null || !tile.buildable() || !canOccupy(point.x(), point.y(), 15, unlockedAreas)) {
            return false;
        }
        if (GameSupport.distance(point.x(), point.y(), ARMORY_X, ARMORY_Y) < 70
                || GameSupport.distance(point.x(), point.y(), MED_X, MED_Y) < 70
                || GameSupport.distance(point.x(), point.y(), WOODCUTTER_X, WOODCUTTER_Y) < 70
                || GameSupport.distance(point.x(), point.y(), QUARRY_X, QUARRY_Y) < 70
                || GameSupport.distance(point.x(), point.y(), WORKBENCH_X, WORKBENCH_Y) < 70) {
            return false;
        }
        if (SHOP_UNITS.stream().anyMatch(shop ->
                GameSupport.distance(point.x(), point.y(), shop.x(), shop.y()) < 55)) return false;
        if (BREAKER_TERMINALS.stream().anyMatch(breaker ->
                GameSupport.distance(point.x(), point.y(), breaker.x(), breaker.y()) < 55)) return false;
        if (RESOURCE_NODES.stream().anyMatch(node ->
                GameSupport.distance(point.x(), point.y(), node.x(), node.y()) < 36)) return false;
        return SPAWN_POINTS.stream().noneMatch(spawn ->
                GameSupport.distance(point.x(), point.y(), spawn.x(), spawn.y()) < 80);
    }

    static boolean canPlaceCore(double x, double y, Set<String> unlockedAreas) {
        MapPoint point = snapToTile(x, y);
        int column = (int) (point.x() / TILE_SIZE);
        int row = (int) (point.y() / TILE_SIZE);
        TileType tile = tileTypeAt(column, row);
        if (tile == null || !tile.buildable() || !canOccupy(point.x(), point.y(), 15, unlockedAreas)) {
            return false;
        }
        if (GameSupport.distance(point.x(), point.y(), ARMORY_X, ARMORY_Y) < 70
                || GameSupport.distance(point.x(), point.y(), MED_X, MED_Y) < 70
                || GameSupport.distance(point.x(), point.y(), WOODCUTTER_X, WOODCUTTER_Y) < 70
                || GameSupport.distance(point.x(), point.y(), QUARRY_X, QUARRY_Y) < 70
                || GameSupport.distance(point.x(), point.y(), WORKBENCH_X, WORKBENCH_Y) < 70) {
            return false;
        }
        if (SHOP_UNITS.stream().anyMatch(shop ->
                GameSupport.distance(point.x(), point.y(), shop.x(), shop.y()) < 55)) return false;
        if (BREAKER_TERMINALS.stream().anyMatch(breaker ->
                GameSupport.distance(point.x(), point.y(), breaker.x(), breaker.y()) < 55)) return false;
        if (RESOURCE_NODES.stream().anyMatch(node ->
                GameSupport.distance(point.x(), point.y(), node.x(), node.y()) < 36)) return false;
        return SPAWN_POINTS.stream().noneMatch(spawn ->
                GameSupport.distance(point.x(), point.y(), spawn.x(), spawn.y()) < 80);
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

    private static TileType tileTypeAt(int column, int row) {
        if (row < 0 || row >= TILE_MAP.rows().size()) return null;
        String cells = TILE_MAP.rows().get(row);
        if (column < 0 || column >= cells.length()) return null;
        return TILE_MAP.legend().get(String.valueOf(cells.charAt(column)));
    }

    private static boolean overlaps(double x, double y, double radius,
            double left, double top, double width, double height) {
        return x + radius > left && x - radius < left + width
                && y + radius > top && y - radius < top + height;
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
            clientMap.set("breakerTerminals", JSON.valueToTree(BREAKER_TERMINALS));
            clientMap.set("resourceNodes", JSON.valueToTree(RESOURCE_NODES));
            return "{\"type\":\"map\",\"map\":" + JSON.writeValueAsString(clientMap) + "}";
        } catch (IOException error) {
            throw new ExceptionInInitializerError(
                    "Could not serialize shared map resource: " + error.getMessage());
        }
    }

    private static List<ResourceNodeDefinition> buildResourceNodeDefinitions() {
        List<ResourceNodeDefinition> nodes = new ArrayList<>(DEFINITION.resourceNodes());
        nodes.add(new ResourceNodeDefinition("early-wood-1", "wood", 1180, 980,
                "transit-hall"));
        nodes.add(new ResourceNodeDefinition("early-wood-2", "wood", 1300, 1060,
                "transit-hall"));
        nodes.add(new ResourceNodeDefinition("early-ore-1", "ore", 1340, 1260,
                "transit-hall"));
        nodes.add(new ResourceNodeDefinition("early-ore-2", "ore", 1460, 1340,
                "transit-hall"));
        return List.copyOf(nodes);
    }

    private static TileMapDefinition buildGameplayTileMap() {
        List<String> rows = new ArrayList<>(DEFINITION.tileMap().rows());
        for (int row = 24; row <= 26; row++) rows.set(row, carveFloor(rows.get(row), 29, 32));
        rows.set(27, carveFloor(rows.get(27), 30, 31));
        rows.set(30, carveFloor(rows.get(30), 34, 35));
        for (int row = 31; row <= 33; row++) rows.set(row, carveFloor(rows.get(row), 33, 36));
        return new TileMapDefinition(DEFINITION.tileMap().tileSize(),
                DEFINITION.tileMap().legend(), List.copyOf(rows));
    }

    private static String carveFloor(String row, int firstColumn, int lastColumn) {
        char[] cells = row.toCharArray();
        for (int column = firstColumn; column <= lastColumn; column++) cells[column] = '.';
        return new String(cells);
    }

    private static List<UnlockArea> buildGameplayAreas() {
        return DEFINITION.areas().stream().map(area -> area.id().equals("transit-hall")
                ? new UnlockArea(area.id(), area.name(), area.x(), 960, area.width(), 400,
                        area.terminalX(), area.terminalY(), area.labelX(), area.labelY(),
                        area.color(), area.detail())
                : area).toList();
    }

    private static void validate(MapDefinition map) {
        if (map.version() != 4) throw new IllegalStateException("Unsupported map version: " + map.version());
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
                || map.shopUnits() == null
                || map.spawnPoints().isEmpty()) {
            throw new IllegalStateException("Map lists and at least one spawn point are required");
        }
        validateTileMap(map);

        Set<String> areaIds = uniqueIds(map.areas().stream().map(UnlockArea::id).toList(), "area");
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
            if (!Set.of("shotgun", "smg", "rifle", "sniper", "ammo").contains(shop.item())
                    || shop.cost() <= 0) {
                throw new IllegalStateException("Invalid shop unit: " + shop.id());
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
