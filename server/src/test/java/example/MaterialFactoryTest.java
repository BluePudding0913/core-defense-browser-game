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

    @Test void machinesOccupyANewLockedRoomWithAReachableEntrance() {
        UnlockArea area = GameMap.areaById("material-factory");
        assertNotNull(area);
        assertEquals(4, game.factories.size());
        for (MaterialFactory factory : game.factories) {
            assertTrue(area.contains(factory.shop.x(), factory.shop.y()));
            assertFalse(GameMap.canOccupy(factory.shop.x(), factory.shop.y(), 5, Set.of("entry-room")));
            assertTrue(GameMap.canOccupy(factory.shop.x(), factory.shop.y(), 5,
                    Set.of("entry-room", "material-factory")));
        }
        game.unlockedAreas.add("entry-room");
        buyer.x = 1140; buyer.y = 1460; buyer.credits = 10000;
        game.handleMessage(buyer, "UNLOCK:material-factory");
        assertTrue(game.unlockedAreas.contains(area.id()));
    }

    @Test void purchaseRequiresOpenAreaProximityFundsAndAnActivePlayer() {
        MaterialFactory factory = game.factories.get(0);
        at(factory); buyer.credits = factory.shop.cost();
        game.handleMessage(buyer, "BUY:" + factory.shop.item());
        assertFalse(factory.purchased);
        game.unlockedAreas.add("material-factory");
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
        game.unlockedAreas.add("material-factory");
        MaterialFactory factory = game.factories.get(0);
        at(factory); buyer.credits = 10000;
        game.handleMessage(buyer, "BUY:" + factory.shop.item());
        buyer.x = GameMap.CORE_X; buyer.y = GameMap.CORE_Y;
        game.update(10);
        assertEquals(2, factory.stock);
        Player teammate = game.players.stream().filter(player -> player != buyer).findFirst().orElseThrow();
        teammate.x = factory.shop.x(); teammate.y = factory.shop.y();
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
        game.unlockedAreas.add("material-factory");
        MaterialFactory factory = game.factories.get(3);
        at(factory); buyer.credits = 10000;
        game.handleMessage(buyer, "BUY:" + factory.shop.item());
        buyer.x = GameMap.CORE_X; buyer.y = GameMap.CORE_Y;
        game.phase = GamePhase.WAVE;
        game.update(12);
        assertEquals(1, factory.stock);
        var snapshot = new ObjectMapper().readTree(SnapshotBuilder.build(game)).path("factories").get(3);
        assertTrue(snapshot.path("purchased").asBoolean());
        assertEquals(1, snapshot.path("stock").asInt());
        game.phase = GamePhase.LOST;
        game.update(100);
        assertEquals(1, factory.stock);
        game.players.forEach(player -> player.roomReady = true);
        game.handleMessage(buyer, "START");
        assertEquals(GamePhase.PREPARING, game.phase);
        assertFalse(factory.purchased);
        assertEquals(0, factory.stock);
        assertEquals(0, factory.elapsed);
        assertFalse(game.unlockedAreas.contains("material-factory"));
    }
}
