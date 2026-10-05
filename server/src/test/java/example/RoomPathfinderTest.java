package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class RoomPathfinderTest {
    @Test void movingGoalAndBoundaryTiesDoNotReuseAStaleDestination() {
        RoomPathfinder finder = new RoomPathfinder(new PerformanceMetrics());
        Set<String> areas = allAreas();
        finder.find(100, 100, 140, 100, 17, false, areas, List.of());
        finder.find(180, 100, 140, 100, 17, false, areas, List.of());
        assertEquals(List.of(new MapPoint(140, 100), new MapPoint(180, 100)),
                finder.find(100, 100, 180, 100, 17, false, areas, List.of()));
        for (MapPoint goal : List.of(new MapPoint(1000, 1900), new MapPoint(0, 0), new MapPoint(140, 120))) {
            assertEquals(original(100, 100, goal.x(), goal.y(), 17, false, areas, List.of()),
                    finder.find(100, 100, goal.x(), goal.y(), 17, false, areas, List.of()));
        }
        assertEquals(original(60, 100, 100, 100, 17, false, areas, List.of()),
                finder.find(60, 100, 100, 100, 17, false, areas, List.of()), "escape from a blocked start");
        finder.clear();
        assertEquals(List.of(new MapPoint(140, 100)), finder.find(100, 100, 140, 100, 17, false, areas, List.of()));
    }

    @Test void adjacentGoalStopsEarlyAndRepeatedRouteDoesNoSearch() {
        PerformanceMetrics metrics = new PerformanceMetrics();
        RoomPathfinder finder = new RoomPathfinder(metrics);
        Set<String> areas = allAreas();
        List<MapPoint> first = finder.find(100, 100, 140, 100, 17, false, areas, List.of());
        assertEquals(List.of(new MapPoint(140, 100)), first);
        assertEquals(1, metrics.pathVisits.sum());
        assertSame(first, finder.find(100, 100, 140, 100, 17, false, areas, List.of()));
        assertEquals(1, metrics.pathVisits.sum());
        assertEquals(1, metrics.pathHits.sum());
    }

    @Test void sharedDestinationKeepsShortestPathsAndFallbackKeepsOriginalResult() {
        PerformanceMetrics metrics = new PerformanceMetrics();
        RoomPathfinder finder = new RoomPathfinder(metrics);
        Set<String> areas = allAreas();
        Random random = new Random(381);
        for (int i = 0; i < 100; i++) {
            double fromX = (random.nextInt(52) + .5) * 40;
            double fromY = (random.nextInt(52) + .5) * 40;
            if (!GameMap.canOccupy(fromX, fromY, 17, areas)) continue;
            double tx = i % 3 == 0 ? 1020 : i % 3 == 1 ? 1031 : 0;
            double ty = i % 3 == 0 ? 1900 : i % 3 == 1 ? 1897 : 0;
            List<MapPoint> expected = original(fromX, fromY, tx, ty, 17, false, areas, List.of());
            List<MapPoint> actual = finder.find(fromX, fromY, tx, ty, 17, false, areas, List.of());
            assertEquals(expected.size(), actual.size());
            if (!expected.isEmpty()) assertEquals(expected.get(expected.size() - 1), actual.get(actual.size() - 1));
            if (i % 3 == 2) assertEquals(expected, actual, "unreachable fallback");
            double x = fromX, y = fromY;
            for (MapPoint point : actual) {
                assertTrue(GameMap.canOccupy(point.x(), point.y(), 17, areas));
                assertEquals(40, Math.abs(point.x() - x) + Math.abs(point.y() - y));
                x = point.x(); y = point.y();
            }
        }
        assertTrue(metrics.pathHits.sum() > 0, "different starts share a destination field");
    }

    @Test void areaAndDefenseChangesInvalidateRoutesWithoutChangingEnemyPolicy() {
        RoomPathfinder finder = new RoomPathfinder(new PerformanceMetrics());
        Set<String> areas = allAreas();
        TrapSlot slot = new TrapSlot("probe", "probe", 140, 100, null);
        List<TrapSlot> slots = List.of(slot);
        assertEquals(List.of(new MapPoint(140, 100)), finder.find(100, 100, 140, 100, 5, true, areas, slots));
        slot.defense = new Defense("block");
        assertEquals(original(100, 100, 140, 100, 5, true, areas, slots),
                finder.find(100, 100, 140, 100, 5, true, areas, slots));
        assertEquals(List.of(new MapPoint(140, 100)), finder.find(100, 100, 140, 100, 17, false, areas, slots));
        slot.defense = null;
        assertEquals(List.of(new MapPoint(140, 100)), finder.find(100, 100, 140, 100, 5, true, areas, slots));
        areas.clear();
        assertEquals(original(420, 100, 100, 100, 17, false, areas, slots),
                finder.find(420, 100, 100, 100, 17, false, areas, slots));
        areas.addAll(allAreas());
        assertEquals(original(420, 100, 100, 100, 17, false, areas, slots).size(),
                finder.find(420, 100, 100, 100, 17, false, areas, slots).size());
        assertTrue(finder.find(100, 100, 100, 100, 17, false, areas, slots).isEmpty());
    }

    private static Set<String> allAreas() {
        Set<String> areas = new HashSet<>();
        GameMap.AREAS.forEach(area -> areas.add(area.id()));
        return areas;
    }

    // Legacy traversal is an oracle for the closest-reachable target and shortest length.
    private static List<MapPoint> original(double x, double y, double tx, double ty,
            double radius, boolean avoid, Set<String> areas, List<TrapSlot> slots) {
        int columns = 52, start = (int) (y / 40) * columns + (int) (x / 40);
        int[] parent = new int[2704];
        Arrays.fill(parent, -1);
        parent[start] = start;
        ArrayDeque<Integer> queue = new ArrayDeque<>(); queue.add(start);
        int best = start;
        double bestDistance = Math.hypot(x - tx, y - ty);
        int[][] directions = {{0,-1},{1,0},{0,1},{-1,0}};
        while (!queue.isEmpty()) {
            int current = queue.removeFirst();
            for (int[] direction : directions) {
                int col = current % columns + direction[0], row = current / columns + direction[1];
                if (col < 0 || col >= 52 || row < 0 || row >= 52) continue;
                int next = row * columns + col;
                double nx = (col + .5) * 40, ny = (row + .5) * 40;
                if (parent[next] >= 0 || !GameMap.canOccupy(nx, ny, radius, areas)) continue;
                if (avoid && slots.stream().anyMatch(slot -> slot.defense != null
                        && (slot.defense.type.equals("block") || slot.defense.type.equals("barricade"))
                        && Math.hypot(nx - slot.x, ny - slot.y) < radius + 18)) continue;
                parent[next] = current; queue.add(next);
                double distance = Math.hypot(nx - tx, ny - ty);
                if (distance < bestDistance) { bestDistance = distance; best = next; }
            }
        }
        List<MapPoint> result = new ArrayList<>();
        for (int current = best; current != start; current = parent[current])
            result.add(new MapPoint((current % columns + .5) * 40, (current / columns + .5) * 40));
        Collections.reverse(result);
        return List.copyOf(result);
    }
}
