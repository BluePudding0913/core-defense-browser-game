package example;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class QuarryInstancesTest {
    GameSession game;
    Player buyer;

    @BeforeEach void start() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
        buyer = game.connectPlayer("quarry-test");
        game.setRoomOwner(buyer);
        game.handleMessage(buyer, "START");
        game.players.forEach(player -> player.human = true);
        game.prepTime = 10000;
    }

    void buy(String item, int count) {
        ShopUnit shop = GameMap.shopByItem(item);
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        buyer.x = shop.x(); buyer.y = shop.y(); buyer.credits = shop.cost() * count;
        for (int i = 0; i < count; i++) game.handleMessage(buyer, "BUY:" + item);
    }

    MaterialFactory deploy(Player player, double x) {
        player.x = x; player.y = 1860; player.facingX = 0; player.facingY = -1;
        int before = game.factories.size();
        game.handleMessage(player, "PLACE_FRONT");
        assertEquals(before + 1, game.factories.size());
        return game.factories.get(before);
    }

    void moveAway() {
        game.players.forEach(player -> { player.x = 1020; player.y = 2020; });
    }

    @Test void shopsRemainInFourLateAreasAndPurchasesRequireAccessProximityFundsAndActivePlayer() {
        assertNull(GameMap.areaById("material-factory"));
        String[] items = {"woodFactory", "oreFactory", "copperFactory", "silverFactory"};
        String[] areas = {"forest", "mine", "security-hall", "command-room"};
        for (int i = 0; i < items.length; i++) {
            ShopUnit shop = GameMap.shopByItem(items[i]);
            assertTrue(GameMap.areaById(areas[i]).contains(shop.x(), shop.y()));
            assertTrue(shop.y() < 600);
            assertFalse(GameMap.canOccupy(shop.x(), shop.y(), 5, Set.of("entry-room")));
        }
        ShopUnit shop = GameMap.shopByItem("woodFactory");
        buyer.x = shop.x(); buyer.y = shop.y(); buyer.credits = shop.cost();
        game.handleMessage(buyer, "BUY:woodFactory"); assertEquals(0, buyer.buildItemCount("woodFactory"));
        game.unlockedAreas.add("forest"); buyer.down = true;
        game.handleMessage(buyer, "BUY:woodFactory"); assertEquals(0, buyer.buildItemCount("woodFactory"));
        buyer.down = false; buyer.credits--;
        game.handleMessage(buyer, "BUY:woodFactory"); assertEquals(0, buyer.buildItemCount("woodFactory"));
        buyer.credits++; buyer.x = GameMap.CORE_X; buyer.y = GameMap.CORE_Y;
        game.handleMessage(buyer, "BUY:woodFactory"); assertEquals(0, buyer.buildItemCount("woodFactory"));
        buyer.x = shop.x(); buyer.y = shop.y();
        game.handleMessage(buyer, "BUY:woodFactory"); assertEquals(1, buyer.buildItemCount("woodFactory"));
        assertEquals(0, buyer.credits);
    }

    @Test void repeatedPurchasesStackAndDeployOneMachineAtATimeWithUniqueIds() throws Exception {
        buy("woodFactory", 2);
        assertEquals(2, buyer.buildItemCount("woodFactory")); assertEquals(0, buyer.credits);
        assertTrue(game.factories.isEmpty()); moveAway(); game.update(100);
        assertTrue(game.droppedResources.isEmpty(), "Inventory items do not produce");
        MaterialFactory first = deploy(buyer, 980);
        assertEquals(1, buyer.buildItemCount("woodFactory")); assertEquals("woodFactory", buyer.selectedBuild);
        MaterialFactory second = deploy(buyer, 1060);
        assertEquals(0, buyer.buildItemCount("woodFactory")); assertNull(buyer.selectedBuild);
        assertNotEquals(first.id, second.id);
        game.handleMessage(buyer, "PLACE_FRONT"); assertEquals(2, game.factories.size());
        var snapshot = new ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals(2, snapshot.path("factories").size());
        assertNotEquals(snapshot.path("factories").get(0).path("id").asText(),
                snapshot.path("factories").get(1).path("id").asText());
        assertFalse(snapshot.path("factories").get(0).has("stock"));
        assertFalse(snapshot.path("factories").get(0).has("capacity"));
    }

    @Test void eachInstanceProducesIndependentlyAndEachMaterialUsesSlowerRate() {
        String[] items = {"woodFactory", "oreFactory", "copperFactory", "silverFactory"};
        double[] intervals = {10, 10, 16, 24};
        for (int i = 0; i < items.length; i++) {
            MaterialFactory machine = new MaterialFactory("test", GameMap.shopByItem(items[i]), new MapPoint(980, 1820));
            assertEquals(intervals[i], machine.interval);
            assertEquals(0, machine.produce(intervals[i] / 2));
            assertEquals(1, machine.produce(intervals[i] / 2));
        }
        buy("woodFactory", 2);
        MaterialFactory first = deploy(buyer, 980); moveAway(); game.update(4);
        MaterialFactory second = deploy(buyer, 1060); moveAway(); game.update(6);
        assertEquals(1, game.droppedResources.size());
        assertEquals(0, first.elapsed); assertEquals(6, second.elapsed);
        game.update(4); assertEquals(2, game.droppedResources.size());
    }

    @Test void dropsUseDistinctEmptyUnlockedTilesWithinThreeByThreeAndCanBeCollected() {
        buy("silverFactory", 1);
        MaterialFactory factory = deploy(buyer, 980); moveAway();
        game.unlockedAreas.clear();
        game.update(240);
        assertEquals(8, game.droppedResources.size(), "Only the eight surrounding tiles can hold drops");
        Set<String> tiles = new HashSet<>();
        for (DroppedResource drop : game.droppedResources) {
            assertEquals("silver", drop.type); assertEquals(1, drop.amount);
            assertEquals(0, drop.pickupDelay);
            assertTrue(Math.abs(drop.x - factory.x) <= GameMap.TILE_SIZE);
            assertTrue(Math.abs(drop.y - factory.y) <= GameMap.TILE_SIZE);
            assertTrue(GameMap.canPlaceDefense(drop.x, drop.y, game.unlockedAreas));
            assertTrue(Math.hypot(drop.x - factory.x, drop.y - factory.y) >= 40);
            assertTrue(tiles.add(drop.x + "," + drop.y));
        }
        DroppedResource drop = game.droppedResources.get(0);
        Player teammate = game.players.get(1); teammate.x = drop.x; teammate.y = drop.y; teammate.down = true;
        game.update(.05); assertTrue(game.droppedResources.contains(drop));
        teammate.down = false; int before = teammate.silver;
        game.update(.05); assertEquals(before + 1, teammate.silver);
        assertFalse(game.droppedResources.contains(drop));
    }

    @Test void dropsAvoidPlayersDefensesOtherQuarriesAndExistingItems() {
        buy("woodFactory", 2);
        MaterialFactory first = deploy(buyer, 980);
        MaterialFactory second = deploy(buyer, 1060);
        moveAway();
        Player blocker = game.players.get(1); blocker.x = 1020; blocker.y = 1820; blocker.down = true;
        TrapSlot defense = new TrapSlot("test-defense", "free", 940, 1820, null);
        defense.defense = new Defense("block"); game.trapSlots.add(defense);
        DroppedResource existing = new DroppedResource(1000, "silver", 980, 1780, 1, null);
        existing.pickupDelay = 0; game.droppedResources.add(existing);
        game.update(10);
        assertEquals(3, game.droppedResources.size());
        for (DroppedResource drop : game.droppedResources) {
            if (drop == existing) continue;
            assertTrue(Math.hypot(drop.x - blocker.x, drop.y - blocker.y) >= 36);
            assertTrue(Math.hypot(drop.x - defense.x, drop.y - defense.y) >= 36);
            assertTrue(Math.hypot(drop.x - first.x, drop.y - first.y) >= 36);
            assertTrue(Math.hypot(drop.x - second.x, drop.y - second.y) >= 36);
            assertTrue(Math.hypot(drop.x - existing.x, drop.y - existing.y) >= 36);
        }
    }

    @Test void blockedProductionKeepsNoStockOrBacklog() {
        buy("woodFactory", 1); MaterialFactory factory = deploy(buyer, 980); moveAway();
        for (int row = -1; row <= 1; row++) for (int column = -1; column <= 1; column++) {
            DroppedResource drop = new DroppedResource(1000 + game.droppedResources.size(), "ore",
                    factory.x + column * 40, factory.y + row * 40, 1, null);
            drop.pickupDelay = 0; game.droppedResources.add(drop);
        }
        game.update(100); assertEquals(9, game.droppedResources.size());
        assertEquals(0, factory.elapsed);
        game.droppedResources.clear(); game.update(.05); assertTrue(game.droppedResources.isEmpty());
        game.update(9.95); assertEquals(1, game.droppedResources.size());
    }

    @Test void pickupTargetsOneInstanceResetsProgressAndRejectsInvalidActions() {
        buy("woodFactory", 2);
        buyer.x = 40; buyer.y = 40; buyer.facingY = -1;
        game.handleMessage(buyer, "PLACE_FRONT"); assertTrue(game.factories.isEmpty());
        assertEquals(2, buyer.buildItemCount("woodFactory"));
        MaterialFactory first = deploy(buyer, 980);
        game.handleMessage(buyer, "PLACE_FRONT"); assertEquals(1, game.factories.size(), "Cannot overlap machines");
        MaterialFactory second = deploy(buyer, 1060); moveAway(); game.update(6);
        game.handleMessage(buyer, "PICKUP_FACTORY:" + first.id); assertEquals(2, game.factories.size());
        Player teammate = game.players.get(1); teammate.x = first.x; teammate.y = first.y; teammate.down = true;
        game.handleMessage(teammate, "PICKUP_FACTORY:" + first.id); assertEquals(2, game.factories.size());
        teammate.down = false;
        game.handleMessage(teammate, "CARRY_NEAREST:" + first.id);
        assertEquals(1, game.factories.size()); assertSame(second, game.factories.get(0));
        assertEquals(1, teammate.buildItemCount("woodFactory"));
        game.handleMessage(teammate, "PICKUP_FACTORY:" + first.id);
        assertEquals(1, teammate.buildItemCount("woodFactory"), "Stale pickup cannot duplicate inventory");
        MaterialFactory replacement = deploy(teammate, 980);
        assertEquals(0, replacement.elapsed); assertNotEquals(first.id, replacement.id);
        moveAway(); game.update(4); assertEquals(0, replacement.elapsed - 4);
        assertEquals(1, game.droppedResources.size(), "Only the older instance completes this cycle");
    }

    @Test void endStatesPauseProductionAndRestartClearsInstancesInventoryAndDrops() {
        buy("woodFactory", 2); deploy(buyer, 980); moveAway();
        game.phase = GamePhase.WAVE; game.queuedEnemies = 100; game.update(10);
        assertEquals(1, game.droppedResources.size());
        game.phase = GamePhase.LOST; game.update(100);
        assertEquals(1, game.droppedResources.size());
        game.players.forEach(player -> player.roomReady = true);
        game.handleMessage(buyer, "START");
        assertEquals(GamePhase.PREPARING, game.phase);
        assertTrue(game.factories.isEmpty()); assertTrue(game.droppedResources.isEmpty());
        assertEquals(0, buyer.buildItemCount("woodFactory"));
    }
}
