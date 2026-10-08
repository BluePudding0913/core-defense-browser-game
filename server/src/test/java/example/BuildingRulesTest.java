package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class BuildingRulesTest {
    final MapPoint point = new MapPoint(0, 0);
    final List<MaterialFactory> factories = new ArrayList<>();
    final List<TrapSlot> defenses = new ArrayList<>();
    final List<Player> players = new ArrayList<>();
    final List<Enemy> enemies = new ArrayList<>();

    BuildingRules.PlacementState state(double coreX) {
        return new BuildingRules.PlacementState(coreX, 0, factories, defenses, players, enemies);
    }

    Enemy enemy(double x) {
        var enemy = new Enemy(1, "grunt", GameMap.SPAWN_POINTS.get(0), 100, 0, 0, 0);
        enemy.x = x; enemy.y = 0;
        enemies.add(enemy);
        return enemy;
    }

    @Test void craftingRequiresEveryMaterialAndRejectsMissingRecipes() {
        var cost = Map.of("wood", 4, "ore", 8, "copper", 4, "silver", 8);
        assertTrue(BuildingRules.canAfford(cost, new BuildingRules.Materials(4, 8, 4, 8)));
        for (var shortage : List.of(new BuildingRules.Materials(3, 8, 4, 8),
                new BuildingRules.Materials(4, 7, 4, 8), new BuildingRules.Materials(4, 8, 3, 8),
                new BuildingRules.Materials(4, 8, 4, 7))) {
            assertFalse(BuildingRules.canAfford(cost, shortage));
        }
        assertFalse(BuildingRules.canAfford(null, new BuildingRules.Materials(100, 100, 100, 100)));
    }

    @Test void repairPlansDistinguishFullMissingAndReadyWithoutSpending() {
        for (String type : List.of("block", "barricade", "turret", "copperTurret", "silverTurret", "wire", "mine")) {
            boolean metal = !List.of("block", "barricade").contains(type);
            var materials = metal ? new BuildingRules.Materials(0, 1, 0, 0) : new BuildingRules.Materials(1, 0, 0, 0);
            var plan = BuildingRules.repair(type, 0, 100, materials);
            assertEquals(BuildingRules.RepairStatus.READY, plan.status(), type);
            assertEquals(metal ? "ore" : "wood", plan.resource());
            assertEquals(1, materials.count(plan.resource()), "Planning does not spend materials");
            assertEquals(BuildingRules.RepairStatus.MISSING_MATERIAL,
                    BuildingRules.repair(type, 0, 100, new BuildingRules.Materials(0, 0, 0, 0)).status());
            assertEquals(BuildingRules.RepairStatus.FULL,
                    BuildingRules.repair(type, 100, 100, new BuildingRules.Materials(0, 0, 0, 0)).status());
        }
    }

    @Test void defensePlacementKeepsStrictBoundariesAndIgnoresEmptySlotsAndDeadEnemies() {
        assertFalse(BuildingRules.canPlaceDefense(point, false, state(100), null));
        assertFalse(BuildingRules.canPlaceDefense(point, true, state(39.999), null));
        assertTrue(BuildingRules.canPlaceDefense(point, true, state(40), null));
        var slot = new TrapSlot("slot", "free", 0, 0, null);
        defenses.add(slot);
        assertTrue(BuildingRules.canPlaceDefense(point, true, state(100), null));
        slot.defense = new Defense("block");
        assertFalse(BuildingRules.canPlaceDefense(point, true, state(100), null));
        assertTrue(BuildingRules.canPlaceDefense(point, true, state(100), slot));
        defenses.clear();
        defenses.add(new TrapSlot("edge", "free", 36, 0, null));
        defenses.get(0).defense = new Defense("block");
        assertTrue(BuildingRules.canPlaceDefense(point, true, state(100), null));
        var enemy = enemy(47.999);
        assertFalse(BuildingRules.canPlaceDefense(point, true, state(100), null));
        enemy.x = 48;
        assertTrue(BuildingRules.canPlaceDefense(point, true, state(100), null));
        enemy.x = 0; enemy.hp = 0;
        assertTrue(BuildingRules.canPlaceDefense(point, true, state(100), null));
        var player = new Player(1); player.x = 22.999; player.y = 0; player.down = true;
        players.add(player);
        assertFalse(BuildingRules.canPlaceDefense(point, true, state(100), null));
        player.x = 23;
        assertTrue(BuildingRules.canPlaceDefense(point, true, state(100), null));
        factories.add(new MaterialFactory("factory", GameMap.shopByItem("woodFactory"), new MapPoint(35.999, 0)));
        assertFalse(BuildingRules.canPlaceDefense(point, true, state(100), null));
        factories.clear();
        factories.add(new MaterialFactory("factory", GameMap.shopByItem("woodFactory"), new MapPoint(36, 0)));
        assertTrue(BuildingRules.canPlaceDefense(point, true, state(100), null));
    }

    @Test void corePlacementExcludesCarrierAndDownedPlayersButUsesLargerClearance() {
        var actor = new Player(1); actor.x = actor.y = 0;
        var other = new Player(2); other.x = 24; other.y = 0;
        players.add(actor); players.add(other);
        assertFalse(BuildingRules.canPlaceCore(point, false, state(0), actor));
        assertTrue(BuildingRules.canPlaceCore(point, true, state(0), actor));
        other.x = 23.999;
        assertFalse(BuildingRules.canPlaceCore(point, true, state(0), actor));
        other.down = true;
        assertTrue(BuildingRules.canPlaceCore(point, true, state(0), actor));
        var enemy = enemy(54.999);
        assertFalse(BuildingRules.canPlaceCore(point, true, state(0), actor));
        enemy.x = 55;
        assertTrue(BuildingRules.canPlaceCore(point, true, state(0), actor));
        var slot = new TrapSlot("edge", "free", 45, 0, null); slot.defense = new Defense("block");
        defenses.add(slot);
        assertTrue(BuildingRules.canPlaceCore(point, true, state(0), actor));
        factories.add(new MaterialFactory("factory", GameMap.shopByItem("woodFactory"), new MapPoint(44.999, 0)));
        assertFalse(BuildingRules.canPlaceCore(point, true, state(0), actor));
        factories.clear();
        factories.add(new MaterialFactory("factory", GameMap.shopByItem("woodFactory"), new MapPoint(45, 0)));
        assertTrue(BuildingRules.canPlaceCore(point, true, state(0), actor));
    }
}
