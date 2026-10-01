package example;

import static example.GameConfig.WORLD_H;
import static example.GameConfig.WORLD_W;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

record Wall(double x, double y, double width, double height) { }

record UnlockArea(String id, String name, double x, double y, double width, double height,
        double terminalX, double terminalY) { }

record SpawnPoint(String id, String name, double x, double y, String lane,
        double routeX, double routeY) { }

/** Static research-facility layout and collision rules. */
final class GameMap {
    static final List<Wall> WALLS = List.of(
            new Wall(60, 80, 180, 420),
            new Wall(360, 80, 420, 420),
            new Wall(1020, 80, 420, 420),
            new Wall(1560, 80, 180, 420),
            new Wall(60, 700, 180, 420),
            new Wall(360, 700, 420, 420),
            new Wall(1020, 700, 420, 420),
            new Wall(1560, 700, 180, 420));

    static final List<UnlockArea> AREAS = List.of(
            new UnlockArea("depot", "BIO LAB", 380, 320, 400, 180, 740, 535),
            new UnlockArea("relay", "SECURITY LAB", 1020, 320, 400, 180, 1060, 535),
            new UnlockArea("workshop", "FABRICATION LAB", 1020, 700, 400, 180, 1060, 665));

    static final List<SpawnPoint> SPAWN_POINTS = List.of(
            new SpawnPoint("north-airlock", "NORTH AIRLOCK", 900, 28, "north", -1, -1),
            new SpawnPoint("reactor-duct", "REACTOR DUCT", 1500, 28, "east", 1500, 600),
            new SpawnPoint("east-loading", "LOADING BAY", 1772, 600, "east", -1, -1),
            new SpawnPoint("service-vent", "SERVICE VENT", 1500, 1172, "east", 1500, 600),
            new SpawnPoint("south-lock", "QUARANTINE", 900, 1172, "south", -1, -1),
            new SpawnPoint("waste-tunnel", "WASTE TUNNEL", 300, 1172, "west", 300, 600),
            new SpawnPoint("west-access", "WEST ACCESS", 28, 600, "west", -1, -1),
            new SpawnPoint("specimen-vent", "SPECIMEN VENT", 300, 28, "west", 300, 600));

    private GameMap() { }

    static List<TrapSlot> createTrapSlots() {
        List<TrapSlot> slots = new ArrayList<>();
        slots.add(new TrapSlot("north-1", "north", 850, 420, null));
        slots.add(new TrapSlot("north-2", "north", 950, 420, null));
        slots.add(new TrapSlot("east-1", "east", 1080, 550, null));
        slots.add(new TrapSlot("east-2", "east", 1080, 650, null));
        slots.add(new TrapSlot("south-1", "south", 850, 780, null));
        slots.add(new TrapSlot("south-2", "south", 950, 780, null));
        slots.add(new TrapSlot("west-1", "west", 720, 550, null));
        slots.add(new TrapSlot("west-2", "west", 720, 650, null));
        slots.add(new TrapSlot("depot-1", "west", 560, 430, "depot"));
        slots.add(new TrapSlot("depot-2", "west", 690, 430, "depot"));
        slots.add(new TrapSlot("relay-1", "north", 1080, 430, "relay"));
        slots.add(new TrapSlot("relay-2", "north", 1210, 430, "relay"));
        slots.add(new TrapSlot("workshop-1", "south", 1080, 770, "workshop"));
        slots.add(new TrapSlot("workshop-2", "south", 1210, 770, "workshop"));
        return slots;
    }

    static UnlockArea areaById(String id) {
        return AREAS.stream().filter(area -> area.id().equals(id)).findFirst().orElse(null);
    }

    static SpawnPoint spawnById(String id) {
        return SPAWN_POINTS.stream().filter(spawn -> spawn.id().equals(id))
                .findFirst().orElse(SPAWN_POINTS.get(0));
    }

    static boolean canOccupy(double x, double y, double radius, Set<String> unlockedAreas) {
        if (x - radius < 0 || y - radius < 0 || x + radius > WORLD_W || y + radius > WORLD_H) {
            return false;
        }
        for (Wall wall : WALLS) {
            if (x + radius > wall.x() && x - radius < wall.x() + wall.width()
                    && y + radius > wall.y() && y - radius < wall.y() + wall.height()
                    && !insideUnlockedArea(x, y, radius, unlockedAreas)) {
                return false;
            }
        }
        return true;
    }

    private static boolean insideUnlockedArea(double x, double y, double radius,
            Set<String> unlockedAreas) {
        for (UnlockArea area : AREAS) {
            if (unlockedAreas.contains(area.id())
                    && x >= area.x() - radius && x <= area.x() + area.width() + radius
                    && y >= area.y() - radius && y <= area.y() + area.height() + radius) {
                return true;
            }
        }
        return false;
    }
}
