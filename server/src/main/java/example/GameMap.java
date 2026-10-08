package example;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

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
    static final List<Station> MEDBAYS = buildMedbays();
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
    static final WorkbenchUnit MISSILE_COMPUTER = DEFINITION.missileComputer();
    static final WorkbenchUnit JOB_STATION = DEFINITION.jobStation();
    static final PrepConsole PREP_CONSOLE = DEFINITION.prepConsole();
    static final List<BreakerTerminal> BREAKER_TERMINALS = List.copyOf(DEFINITION.breakerTerminals());
    private static final List<MapPoint> FACILITY_POSITIONS = buildFacilityPositions();
    static final double FACILITY_CLEARANCE = 36;
    private static final double SPAWN_CLEARANCE = 80;
    private static final double PLACEMENT_RADIUS = 15;
    private static final String CLIENT_MAP_MESSAGE = buildClientMapMessage();

    private GameMap() { }

    private static List<Station> buildMedbays() {
        List<Station> stations = new ArrayList<>();
        stations.add(DEFINITION.stations().medBay());
        if (DEFINITION.medBayUnits() != null) stations.addAll(DEFINITION.medBayUnits());
        return List.copyOf(stations);
    }

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
        return canPlaceOnMap(x, y, unlockedAreas);
    }

    static boolean canPlaceCore(double x, double y, Set<String> unlockedAreas) {
        return canPlaceOnMap(x, y, unlockedAreas);
    }

    private static boolean canPlaceOnMap(double x, double y, Set<String> unlockedAreas) {
        MapPoint point = snapToTile(x, y);
        int column = (int) (point.x() / TILE_SIZE);
        int row = (int) (point.y() / TILE_SIZE);
        TileType tile = tileTypeAt(column, row);
        if (tile == null || !tile.buildable()
                || !canOccupy(point.x(), point.y(), PLACEMENT_RADIUS, unlockedAreas)) {
            return false;
        }
        if (FACILITY_POSITIONS.stream().anyMatch(facility -> GameSupport.distance(
                point.x(), point.y(), facility.x(), facility.y()) < FACILITY_CLEARANCE)) return false;
        return SPAWN_POINTS.stream().noneMatch(spawn ->
                GameSupport.distance(point.x(), point.y(), spawn.x(), spawn.y()) < SPAWN_CLEARANCE);
    }

    private static List<MapPoint> buildFacilityPositions() {
        List<MapPoint> positions = new ArrayList<>(List.of(
                new MapPoint(ARMORY_X, ARMORY_Y),
                new MapPoint(WOODCUTTER_X, WOODCUTTER_Y), new MapPoint(QUARRY_X, QUARRY_Y),
                new MapPoint(PREP_CONSOLE.x(), PREP_CONSOLE.y())));
        for (WorkbenchUnit unit : java.util.Arrays.asList(MISSILE_COMPUTER, JOB_STATION))
            if (unit != null) positions.add(new MapPoint(unit.x(), unit.y()));
        AREAS.forEach(area -> positions.add(new MapPoint(area.terminalX(), area.terminalY())));
        MEDBAYS.forEach(station -> positions.add(new MapPoint(station.x(), station.y())));
        WORKBENCH_UNITS.forEach(unit -> positions.add(new MapPoint(unit.x(), unit.y())));
        SHOP_UNITS.forEach(unit -> positions.add(new MapPoint(unit.x(), unit.y())));
        BREAKER_TERMINALS.forEach(unit -> positions.add(new MapPoint(unit.x(), unit.y())));
        RESOURCE_NODES.forEach(node -> positions.add(new MapPoint(node.x(), node.y())));
        return List.copyOf(positions);
    }

    static double distanceToWall(double x, double y, double directionX,
            double directionY, double maxDistance) {
        return distanceToWall(x, y, directionX, directionY, maxDistance, null);
    }

    static double distanceToWall(double x, double y, double directionX,
            double directionY, double maxDistance, Set<String> unlockedAreas) {
        if (maxDistance <= 0) return 0;
        double step = Math.max(4, TILE_SIZE / 8.0);
        double lastClear = 0;
        for (double traveled = step; traveled <= maxDistance; traveled += step) {
            if (isShotBlockedAt(x + directionX * traveled, y + directionY * traveled, unlockedAreas)) {
                return lastClear;
            }
            lastClear = traveled;
        }
        if (lastClear < maxDistance
                && isShotBlockedAt(x + directionX * maxDistance, y + directionY * maxDistance, unlockedAreas)) {
            return lastClear;
        }
        return maxDistance;
    }

    record WallImpact(double distance, boolean flipX, boolean flipY) { }

    // Traverse tile boundaries so reflection uses the wall face, including corners.
    static WallImpact rayWall(double x, double y, double dx, double dy, double range) {
        return rayWall(x, y, dx, dy, range, null);
    }

    static WallImpact rayWall(double x, double y, double dx, double dy, double range,
            Set<String> unlockedAreas) {
        int column = (int) Math.floor(x / TILE_SIZE), row = (int) Math.floor(y / TILE_SIZE);
        int sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
        double deltaX = dx == 0 ? Double.POSITIVE_INFINITY : TILE_SIZE / Math.abs(dx);
        double deltaY = dy == 0 ? Double.POSITIVE_INFINITY : TILE_SIZE / Math.abs(dy);
        double nextX = dx == 0 ? Double.POSITIVE_INFINITY
                : ((column + (dx > 0 ? 1 : 0)) * TILE_SIZE - x) / dx;
        double nextY = dy == 0 ? Double.POSITIVE_INFINITY
                : ((row + (dy > 0 ? 1 : 0)) * TILE_SIZE - y) / dy;
        while (Math.min(nextX, nextY) < range) {
            double distance = Math.min(nextX, nextY);
            boolean crossX = nextX <= nextY + 1e-8, crossY = nextY <= nextX + 1e-8;
            boolean wallX = crossX && isShotBlockedAt((column + sx + .5) * TILE_SIZE, (row + .5) * TILE_SIZE, unlockedAreas);
            boolean wallY = crossY && isShotBlockedAt((column + .5) * TILE_SIZE, (row + sy + .5) * TILE_SIZE, unlockedAreas);
            if (wallX || wallY) return new WallImpact(distance, wallX, wallY);
            if (crossX) { column += sx; nextX += deltaX; }
            if (crossY) { row += sy; nextY += deltaY; }
            if (isShotBlockedAt((column + .5) * TILE_SIZE, (row + .5) * TILE_SIZE, unlockedAreas))
                return new WallImpact(distance, crossX, crossY);
        }
        return new WallImpact(range, false, false);
    }

    static boolean hasClearLine(double fromX, double fromY, double toX, double toY) {
        return hasClearLine(fromX, fromY, toX, toY, null);
    }

    static boolean hasClearLine(double fromX, double fromY, double toX, double toY,
            Set<String> unlockedAreas) {
        double dx = toX - fromX;
        double dy = toY - fromY;
        double distance = Math.hypot(dx, dy);
        if (distance < 0.001) return true;
        return distanceToWall(fromX, fromY, dx / distance, dy / distance, distance, unlockedAreas)
                >= distance - 0.001;
    }

    private static boolean isShotBlockedAt(double x, double y, Set<String> unlockedAreas) {
        return unlockedAreas == null ? isSolidAt(x, y) : !canOccupy(x, y, 0, unlockedAreas);
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
            MapValidator.validate(definition);
            return definition;
        } catch (IOException error) {
            throw new ExceptionInInitializerError("Could not read shared map resource: " + error.getMessage());
        }
    }

    private static String buildClientMapMessage() {
        try {
            ObjectNode clientMap = JSON.valueToTree(DEFINITION);
            clientMap.set("spawnPoints", JSON.valueToTree(SPAWN_POINTS));
            return "{\"type\":\"map\",\"map\":" + JSON.writeValueAsString(clientMap) + "}";
        } catch (IOException error) {
            throw new ExceptionInInitializerError(
                    "Could not serialize shared map resource: " + error.getMessage());
        }
    }

    private static List<SpawnPoint> buildSpawnPoints() {
        List<SpawnPoint> spawns = new ArrayList<>();
        for (SpawnPoint original : DEFINITION.spawnPoints()) {
            MapPoint best = null;
            double nearest = Double.MAX_VALUE;
            for (int row = 0; row < TILE_MAP.rows().size(); row++) {
                for (int column = 0; column < TILE_MAP.rows().get(row).length(); column++) {
                    AreaTile tile = new AreaTile(column, row);
                    MapPoint center = TILE_MAP.center(tile);
                    if (!isWallEntrance(tile) || !canOccupy(center.x(), center.y(), 17, Set.of())) continue;
                    if (spawns.stream().anyMatch(spawn -> GameSupport.distance(
                            center.x(), center.y(), spawn.x(), spawn.y()) < TILE_SIZE * 2)) continue;
                    double distance = GameSupport.distance(center.x(), center.y(), original.x(), original.y());
                    if (distance < nearest) { nearest = distance; best = center; }
                }
            }
            if (best == null) throw new IllegalStateException("No wall entrance for " + original.id());
            spawns.add(new SpawnPoint(original.id(), original.name(), best.x(), best.y(),
                    original.lane(), original.enemyBias(), original.speedMultiplier(),
                    original.targetPriority(), original.route()));
        }
        Set<String> allAreas = AREAS.stream().map(UnlockArea::id)
                .collect(java.util.stream.Collectors.toSet());
        for (UnlockArea area : AREAS) {
            List<MapPoint> entrances = new ArrayList<>();
            int entranceCount = area.id().equals("recovery-room") ? DEFINITION.spawnPoints().size() : 1;
            for (int index = 0; index < entranceCount; index++) {
                MapPoint best = null;
                double farthest = -1;
                for (AreaTile tile : area.tiles()) {
                    MapPoint center = TILE_MAP.center(tile);
                    double x = center.x(), y = center.y();
                    if (!isWallEntrance(tile) || !canOccupy(x, y, 17, allAreas)) continue;
                    double distance = entrances.isEmpty()
                            ? GameSupport.distance(x, y, area.terminalX(), area.terminalY())
                            : entrances.stream().mapToDouble(point -> GameSupport.distance(x, y, point.x(), point.y()))
                                    .min().orElse(0);
                    if (!entrances.isEmpty() && distance < TILE_SIZE * 2) continue;
                    if (distance > farthest) {
                        farthest = distance;
                        best = center;
                    }
                }
                if (best == null) break;
                entrances.add(best);
                String suffix = index == 0 ? "" : ":" + (index + 1);
                spawns.add(new SpawnPoint("area-" + area.id() + suffix, area.name(), best.x(), best.y(),
                        "interior", "balanced", 1, "core", List.of(best)));
            }
        }
        return List.copyOf(spawns);
    }

    static boolean isWallEntrance(AreaTile tile) {
        TileType floor = TILE_MAP.typeAt(tile.column(), tile.row());
        if (floor == null || floor.solid()) return false;
        for (int[] offset : new int[][]{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}) {
            TileType wall = TILE_MAP.typeAt(tile.column() + offset[0], tile.row() + offset[1]);
            if (wall != null && wall.solid()) return true;
        }
        return false;
    }

    static String spawnArea(SpawnPoint spawn) {
        return spawn.id().startsWith("area-") ? spawn.id().substring(5).split(":", 2)[0] : null;
    }

}
