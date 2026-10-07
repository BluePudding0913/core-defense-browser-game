package example;

import static example.GameSupport.distance;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Read-only construction decisions. Consumption, mutations and notifications belong to callers. */
final class BuildingRules {
    record Materials(int wood, int ore, int copper, int silver) {
        int count(String type) {
            return switch (type) {
                case "wood" -> wood;
                case "ore" -> ore;
                case "copper" -> copper;
                case "silver" -> silver;
                default -> 0;
            };
        }
    }

    /** Only the occupants relevant to placement; lists are borrowed and never modified. */
    record PlacementState(double coreX, double coreY, List<MaterialFactory> factories,
            List<TrapSlot> defenses, List<Player> players, List<Enemy> enemies) { }

    enum RepairStatus { FULL, MISSING_MATERIAL, READY }
    record RepairPlan(RepairStatus status, String resource) { }
    private static final Set<String> METAL_DEFENSES = Set.of("turret", "copperTurret", "silverTurret", "wire", "mine");

    static boolean canAfford(Map<String, Integer> recipe, Materials materials) {
        return recipe != null && recipe.entrySet().stream()
                .allMatch(entry -> materials.count(entry.getKey()) >= entry.getValue());
    }

    static RepairPlan repair(String type, double hp, double maxHp, Materials materials) {
        String resource = METAL_DEFENSES.contains(type) ? "ore" : "wood";
        return new RepairPlan(hp >= maxHp ? RepairStatus.FULL
                : materials.count(resource) < 1 ? RepairStatus.MISSING_MATERIAL : RepairStatus.READY, resource);
    }

    static boolean canPlaceDefense(MapPoint point, boolean terrainAllowed, PlacementState state, TrapSlot ignored) {
        return terrainAllowed && distance(point.x(), point.y(), state.coreX(), state.coreY()) >= 40
                && state.factories().stream().noneMatch(unit -> distance(point.x(), point.y(), unit.x, unit.y) < 36)
                && state.defenses().stream().noneMatch(slot -> slot != ignored && slot.defense != null
                        && distance(point.x(), point.y(), slot.x, slot.y) < 36)
                && state.players().stream().noneMatch(player -> Math.abs(point.x() - player.x) < 23
                        && Math.abs(point.y() - player.y) < 23)
                && state.enemies().stream().noneMatch(enemy -> enemy.hp > 0
                        && distance(point.x(), point.y(), enemy.x, enemy.y) < 48);
    }

    static boolean canPlaceCore(MapPoint point, boolean terrainAllowed, PlacementState state, Player actor) {
        return terrainAllowed
                && state.factories().stream().noneMatch(unit -> distance(point.x(), point.y(), unit.x, unit.y) < 45)
                && state.defenses().stream().noneMatch(slot -> slot.defense != null
                        && distance(point.x(), point.y(), slot.x, slot.y) < 45)
                && state.players().stream().noneMatch(player -> player != actor && !player.down
                        && distance(point.x(), point.y(), player.x, player.y) < 24)
                && state.enemies().stream().noneMatch(enemy -> enemy.hp > 0
                        && distance(point.x(), point.y(), enemy.x, enemy.y) < 55);
    }

    private BuildingRules() { }
}
