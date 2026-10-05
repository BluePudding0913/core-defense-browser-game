package example;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class MaterialFactoryTest {
    GameSession game;
    Player buyer;

    @BeforeEach void start() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
        buyer = game.connectPlayer("factory-test");
        game.setRoomOwner(buyer);
        game.handleMessage(buyer, "START");
        game.players.forEach(player -> player.human = true);
        game.prepTime = 10000;
    }

    void at(MaterialFactory factory) {
        buyer.x = factory.shop.x();
        buyer.y = factory.shop.y();
    }

    @Test void shopsAreDistributedAcrossFourLateAreas() {
        assertNull(GameMap.areaById("material-factory"));
        assertEquals(4, game.factories.size());
        String[] areas = {"forest", "mine", "security-hall", "command-room"};
        for (int i = 0; i < game.factories.size(); i++) {
            MaterialFactory factory = game.factories.get(i);
            UnlockArea area = GameMap.areaById(areas[i]);
            assertTrue(area.contains(factory.shop.x(), factory.shop.y()));
            assertTrue(factory.shop.y() < 600);
            assertFalse(GameMap.canOccupy(factory.shop.x(), factory.shop.y(), 5, Set.of("entry-room")));
            assertTrue(GameMap.canOccupy(factory.shop.x(), factory.shop.y(), 5,
                    Set.of("entry-room", areas[i])));
        }
    }

    void deploy() {
        buyer.x = 980; buyer.y = 1860; buyer.facingX = 0; buyer.facingY = -1;
        game.handleMessage(buyer, "PLACE_FRONT");
    }

    @Test void purchaseRequiresOpenAreaProximityFundsAndAnActivePlayer() {
        MaterialFactory factory = game.factories.get(0);
        at(factory); buyer.credits = factory.shop.cost();
        game.handleMessage(buyer, "BUY:" + factory.shop.item());
        assertFalse(factory.purchased);
        game.unlockedAreas.add("forest");
        buyer.x = GameMap.CORE_X; buyer.y = GameMap.CORE_Y;
        game.handleMessage(buyer, "BUY:" + factory.shop.item());
        assertFalse(factory.purchased);
        at(factory); buyer.down = true;
        game.handleMessage(buyer, "BUY:" + factory.shop.item());
        assertFalse(factory.purchased);
        buyer.down = false; buyer.credits = factory.shop.cost() - 1;
        game.handleMessage(buyer, "BUY:" + factory.shop.item());
        assertFalse(factory.purchased);
        assertEquals(factory.shop.cost() - 1, buyer.credits);
        buyer.credits++;
        game.handleMessage(buyer, "BUY:" + factory.shop.item());
        assertTrue(factory.purchased);
        assertFalse(factory.placed);
        assertEquals(buyer.id, factory.carriedBy);
        assertEquals(1, buyer.buildItemCount(factory.shop.item()));
        factory.produce(100);
        assertEquals(0, factory.stock);
        assertEquals(0, buyer.credits);
        buyer.credits = 10000;
        game.handleMessage(buyer, "BUY:" + factory.shop.item());
        assertEquals(10000, buyer.credits, "Repeated purchases do not charge again");
    }

    @Test void allMaterialsProduceAtTheirOwnRateAndStopAtCapacity() {
        for (MaterialFactory factory : game.factories) {
            factory.produce(1000);
            assertEquals(0, factory.stock);
            factory.purchased = true;
            factory.placed = true;
            factory.produce(factory.interval / 2);
            assertEquals(0, factory.stock);
            factory.produce(factory.interval / 2);
            assertEquals(1, factory.stock);
            factory.produce(1000);
            assertEquals(20, factory.stock);
            factory.stock = 0;
            factory.produce(.05);
            assertEquals(0, factory.stock, "Full machines cannot accumulate unlimited production time");
        }
        assertEquals(5, game.factories.get(0).interval);
        assertEquals(5, game.factories.get(1).interval);
        assertEquals(8, game.factories.get(2).interval);
        assertEquals(12, game.factories.get(3).interval);
    }

    @Test void teammatesCollectSharedStockOnceAndDownedPlayersCannotCollect() {
        game.unlockedAreas.add("forest");
        MaterialFactory factory = game.factories.get(0);
        at(factory); buyer.credits = 10000;
        game.handleMessage(buyer, "BUY:" + factory.shop.item());
        deploy();
        assertTrue(factory.placed);
        buyer.x = GameMap.CORE_X; buyer.y = GameMap.CORE_Y;
        game.update(10);
        assertEquals(2, factory.stock);
        Player teammate = game.players.stream().filter(player -> player != buyer).findFirst().orElseThrow();
        teammate.x = factory.x; teammate.y = factory.y;
        teammate.down = true;
        game.update(.05);
        assertEquals(2, factory.stock);
        teammate.down = false;
        int before = teammate.wood;
        game.update(.05);
        assertEquals(before + 2, teammate.wood);
        assertEquals(0, factory.stock);
        game.update(.05);
        assertEquals(before + 2, teammate.wood);
        assertEquals(0, buyer.wood);
    }

    @Test void combatProducesAndEndStatesPauseThenRestartResetsMachines() throws Exception {
        game.unlockedAreas.add("command-room");
        MaterialFactory factory = game.factories.get(3);
        at(factory); buyer.credits = 10000;
        game.handleMessage(buyer, "BUY:" + factory.shop.item());
        deploy();
        buyer.x = GameMap.CORE_X; buyer.y = GameMap.CORE_Y;
        game.phase = GamePhase.WAVE;
        game.update(12);
        assertEquals(1, factory.stock);
        var snapshot = new ObjectMapper().readTree(SnapshotBuilder.build(game)).path("factories").get(3);
        assertTrue(snapshot.path("purchased").asBoolean());
        assertTrue(snapshot.path("placed").asBoolean());
        assertEquals(980, snapshot.path("x").asDouble());
        assertEquals(1, snapshot.path("stock").asInt());
        game.phase = GamePhase.LOST;
        game.update(100);
        assertEquals(1, factory.stock);
        game.players.forEach(player -> player.roomReady = true);
        game.handleMessage(buyer, "START");
        assertEquals(GamePhase.PREPARING, game.phase);
        assertFalse(factory.purchased);
        assertFalse(factory.placed);
        assertNull(factory.carriedBy);
        assertEquals(0, buyer.buildItemCount(factory.shop.item()));
        assertEquals(0, factory.stock);
        assertEquals(0, factory.elapsed);
        assertFalse(game.unlockedAreas.contains("material-factory"));
    }

    @Test void relocationPreservesStockAndProgressAndRejectsInvalidActions() throws Exception {
        MaterialFactory factory = game.factories.get(0);
        game.unlockedAreas.add("forest"); at(factory); buyer.credits = 4000;
        game.handleMessage(buyer, "BUY:woodFactory");
        buyer.x = 40; buyer.y = 40; buyer.facingY = -1;
        game.handleMessage(buyer, "PLACE_FRONT");
        assertFalse(factory.placed);
        assertEquals(1, buyer.buildItemCount("woodFactory"));
        deploy(); assertTrue(factory.placed);
        factory.produce(12); assertEquals(2, factory.stock);
        buyer.x = factory.x; buyer.y = factory.y; buyer.down = true;
        game.handleMessage(buyer, "PICKUP_FACTORY:woodFactory"); assertTrue(factory.placed);
        buyer.down = false; buyer.x = GameMap.CORE_X; buyer.y = GameMap.CORE_Y;
        game.handleMessage(buyer, "PICKUP_FACTORY:woodFactory"); assertTrue(factory.placed);
        Player teammate = game.players.get(1);
        teammate.x = factory.x; teammate.y = factory.y;
        game.handleMessage(teammate, "CARRY_NEAREST:woodFactory");
        assertFalse(factory.placed); assertEquals(teammate.id, factory.carriedBy);
        assertEquals(1, teammate.buildItemCount("woodFactory"));
        factory.produce(100); assertEquals(2, factory.stock); assertEquals(2, factory.elapsed);
        game.handleMessage(buyer, "PICKUP_FACTORY:woodFactory");
        assertEquals(0, buyer.buildItemCount("woodFactory"));
        teammate.x = 1060; teammate.y = 1820; teammate.facingX = -1; teammate.facingY = 0;
        game.handleMessage(teammate, "PLACE_FRONT"); assertTrue(factory.placed);
        assertEquals(1020, factory.x); assertEquals(1820, factory.y);
        factory.produce(3); assertEquals(3, factory.stock);
        buyer.x = 1060; buyer.y = 1820; buyer.facingX = -1; buyer.facingY = 0;
        game.handleMessage(buyer, "EQUIP_CORE");
        assertTrue(buyer.movingCore);
        game.handleMessage(buyer, "PLACE_FRONT");
        assertTrue(buyer.movingCore, "The overlapping placement must be rejected");
        assertNotEquals(factory.x, game.coreX, "A core cannot overlap a deployed quarry");
        var snapshot = new ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals(0, snapshot.path("players").get(1).path("buildItems").path("woodFactory").asInt());
    }
}
