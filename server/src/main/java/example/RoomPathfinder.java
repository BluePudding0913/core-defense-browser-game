package example;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Room-owned navigation cache. All calls are made under the owning room's lock. */
final class RoomPathfinder {
    private static final int COLUMNS = GameMap.WORLD_W / GameMap.TILE_SIZE;
    private static final int ROWS = GameMap.WORLD_H / GameMap.TILE_SIZE;
    private static final int CELLS = COLUMNS * ROWS;
    private static final int[] DX = {0, 1, 0, -1};
    private static final int[] DY = {-1, 0, 1, 0};
    private final int[] parent = new int[CELLS];
    private final int[] visited = new int[CELLS];
    private final int[] queue = new int[CELLS];
    private int generation;
    private Set<String> areas = Set.of();
    private List<MapPoint> blocks = List.of();
    private final Map<Profile, boolean[]> masks = bounded(4);
    private final Map<RouteKey, List<MapPoint>> routes = bounded(128);
    private final Map<FieldKey, int[]> fields = bounded(8);
    private final Map<FieldKey, Integer> requests = bounded(32);
    private final PerformanceMetrics metrics;

    RoomPathfinder(PerformanceMetrics metrics) { this.metrics = metrics; }

    void clear() {
        masks.clear();
        routes.clear();
        fields.clear();
        requests.clear();
    }

    List<MapPoint> find(double fromX, double fromY, double targetX, double targetY,
            double radius, boolean avoidDefenses, Set<String> unlocked, List<TrapSlot> slots) {
        if (!Double.isFinite(fromX) || !Double.isFinite(fromY)
                || !Double.isFinite(targetX) || !Double.isFinite(targetY)) return List.of();
        List<MapPoint> obstacles = new ArrayList<>();
        for (TrapSlot slot : slots) {
            if (slot.defense != null && (slot.defense.type.equals("block")
                    || slot.defense.type.equals("barricade"))) obstacles.add(new MapPoint(slot.x, slot.y));
        }
        if (!areas.equals(unlocked) || !blocks.equals(obstacles)) {
            areas = Set.copyOf(unlocked);
            blocks = List.copyOf(obstacles);
            clear();
        }
        int start = cell(fromX, fromY);
        Profile profile = new Profile(radius, avoidDefenses);
        RouteKey key = new RouteKey(start, targetX, targetY, profile);
        List<MapPoint> cached = routes.get(key);
        if (cached != null) {
            metrics.pathHits.increment();
            return cached;
        }
        boolean[] walkable = masks.computeIfAbsent(profile, this::buildMask);
        int target = cell(targetX, targetY);
        // Strictly inside a tile, its center is the unique closest grid point.
        // Exact boundary ties and wall targets keep the legacy forward fallback.
        boolean nearestCell = Math.abs(x(target) - targetX) < GameMap.TILE_SIZE / 2.0
                && Math.abs(y(target) - targetY) < GameMap.TILE_SIZE / 2.0;
        FieldKey fieldKey = new FieldKey(target, profile);
        List<MapPoint> result = null;
        if (nearestCell && walkable[target] && walkable[start]) {
            int count = requests.merge(fieldKey, 1, Integer::sum);
            int[] next = fields.get(fieldKey);
            if (next == null && count >= 2) {
                next = buildField(target, walkable);
                fields.put(fieldKey, next);
            }
            if (next != null && next[start] >= 0) {
                metrics.pathHits.increment();
                result = follow(start, target, next);
            }
        }
        // Wall/unreachable/tied targets retain the original closest-reachable fallback.
        if (result == null) result = forward(start, targetX, targetY, walkable,
                nearestCell && walkable[target] ? target : -1);
        routes.put(key, result);
        return result;
    }

    private boolean[] buildMask(Profile profile) {
        boolean[] mask = new boolean[CELLS];
        for (int cell = 0; cell < CELLS; cell++) {
            double x = x(cell), y = y(cell);
            boolean open = GameMap.canOccupy(x, y, profile.radius, areas);
            if (open && profile.avoidDefenses) {
                for (MapPoint block : blocks) {
                    if (GameSupport.distance(x, y, block.x(), block.y()) < profile.radius + 18) {
                        open = false;
                        break;
                    }
                }
            }
            mask[cell] = open;
        }
        return mask;
    }

    private List<MapPoint> forward(int start, double targetX, double targetY, boolean[] walkable, int goal) {
        if (++generation == 0) { Arrays.fill(visited, 0); generation = 1; }
        int head = 0, tail = 0, best = start;
        double bestDistance = GameSupport.distance(x(start), y(start), targetX, targetY);
        visited[start] = generation;
        parent[start] = start;
        queue[tail++] = start;
        search: while (head < tail && bestDistance != 0 && best != goal) {
            int current = queue[head++];
            for (int direction = 0; direction < 4; direction++) {
                int next = neighbor(current, direction);
                if (next < 0 || visited[next] == generation || !walkable[next]) continue;
                visited[next] = generation;
                parent[next] = current;
                queue[tail++] = next;
                double distance = GameSupport.distance(x(next), y(next), targetX, targetY);
                if (distance < bestDistance) {
                    best = next;
                    bestDistance = distance;
                    if (distance == 0 || next == goal) break search;
                }
            }
        }
        metrics.pathVisits.add(head);
        if (best == start) return List.of();
        List<MapPoint> result = new ArrayList<>();
        for (int cell = best; cell != start; cell = parent[cell]) result.add(new MapPoint(x(cell), y(cell)));
        Collections.reverse(result);
        return List.copyOf(result);
    }

    private int[] buildField(int target, boolean[] walkable) {
        int[] next = new int[CELLS];
        Arrays.fill(next, -1);
        next[target] = target;
        int head = 0, tail = 0;
        queue[tail++] = target;
        while (head < tail) {
            int current = queue[head++];
            for (int direction = 0; direction < 4; direction++) {
                int neighbor = neighbor(current, direction);
                if (neighbor < 0 || next[neighbor] >= 0 || !walkable[neighbor]) continue;
                next[neighbor] = current;
                queue[tail++] = neighbor;
            }
        }
        metrics.pathVisits.add(head);
        return next;
    }

    private List<MapPoint> follow(int start, int target, int[] next) {
        List<MapPoint> result = new ArrayList<>();
        for (int cell = start; cell != target;) {
            cell = next[cell];
            result.add(new MapPoint(x(cell), y(cell)));
        }
        return List.copyOf(result);
    }

    private static int neighbor(int cell, int direction) {
        int column = cell % COLUMNS + DX[direction], row = cell / COLUMNS + DY[direction];
        return column < 0 || column >= COLUMNS || row < 0 || row >= ROWS ? -1 : row * COLUMNS + column;
    }

    private static int cell(double x, double y) {
        int column = (int) GameSupport.clamp(Math.floor(x / GameMap.TILE_SIZE), 0, COLUMNS - 1);
        int row = (int) GameSupport.clamp(Math.floor(y / GameMap.TILE_SIZE), 0, ROWS - 1);
        return row * COLUMNS + column;
    }

    private static double x(int cell) { return (cell % COLUMNS + .5) * GameMap.TILE_SIZE; }
    private static double y(int cell) { return (cell / COLUMNS + .5) * GameMap.TILE_SIZE; }

    private static <K, V> Map<K, V> bounded(int capacity) {
        return new LinkedHashMap<K, V>(capacity, .75f, true) {
            @Override protected boolean removeEldestEntry(Map.Entry<K, V> eldest) { return size() > capacity; }
        };
    }

    private record Profile(double radius, boolean avoidDefenses) { }
    private record RouteKey(int start, double x, double y, Profile profile) { }
    private record FieldKey(int target, Profile profile) { }
}
