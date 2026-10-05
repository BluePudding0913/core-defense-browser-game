package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class EnemyTravelTest {
    private Set<String> allAreas() {
        return new HashSet<>(GameMap.AREAS.stream().map(UnlockArea::id).toList());
    }

    @Test void exactClearancePreservesNarrowCorridorsAndRejectsCornerCutting() {
        EnemyTravel travel = new EnemyTravel();
        Set<String> areas = allAreas();
        assertTrue(travel.canTravel(857, 420, 857, 460, 17, areas), "body may touch a wall edge");
        assertFalse(travel.canTravel(856.999, 420, 857, 460, 17, areas));
        assertFalse(travel.canTravel(857, 420, 900, 500, 17, areas), "inside corner blocks the whole body");
        assertTrue(travel.canTravel(860, 420, 860, 500, 17, areas));
        assertTrue(travel.canTravel(860, 500, 900, 500, 17, areas));
        assertFalse(travel.canTravel(Double.NaN, 420, 860, 500, 17, areas));
        assertFalse(travel.canTravel(860, 420, 3000, 500, 17, areas));
    }

    @Test void sweptTravelMatchesDenseOccupancyChecksAndAreaChanges() {
        EnemyTravel travel = new EnemyTravel();
        Set<String> areas = allAreas();
        List<MapPoint> points = new ArrayList<>();
        for (int row = 0; row < 52; row++) for (int col = 0; col < 52; col++) {
            double x = (col + .5) * 40, y = (row + .5) * 40;
            if (GameMap.canOccupy(x, y, 17, areas)) points.add(new MapPoint(x, y));
        }
        Random random = new Random(308);
        for (int test = 0; test < 200; test++) {
            MapPoint from = points.get(random.nextInt(points.size()));
            MapPoint to = points.get(random.nextInt(points.size()));
            boolean expected = true;
            int steps = (int) Math.ceil(Math.hypot(to.x() - from.x(), to.y() - from.y()) / .5);
            for (int i = 0; i <= steps; i++) {
                double t = steps == 0 ? 0 : (double) i / steps;
                if (!GameMap.canOccupy(from.x() + (to.x() - from.x()) * t,
                        from.y() + (to.y() - from.y()) * t, 17, areas)) { expected = false; break; }
            }
            assertEquals(expected, travel.canTravel(from.x(), from.y(), to.x(), to.y(), 17, areas));
        }
        UnlockArea area = GameMap.AREAS.get(0);
        MapPoint center = GameMap.TILE_MAP.center(area.tiles().get(0));
        assertTrue(travel.canTravel(center.x(), center.y(), center.x(), center.y(), 17, areas));
        areas.remove(area.id());
        assertFalse(travel.canTravel(center.x(), center.y(), center.x(), center.y(), 17, areas));
        areas.add(area.id());
        assertTrue(travel.canTravel(center.x(), center.y(), center.x(), center.y(), 17, areas));
    }
}
