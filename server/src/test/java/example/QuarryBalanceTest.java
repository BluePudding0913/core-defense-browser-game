package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class QuarryBalanceTest {
    @Test void openingRoomsProduceEqualCountsAtEqualIntervals() throws Exception {
        GameSession game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
        Player player = game.connectPlayer("opening-resources");
        var update = GameSession.class.getDeclaredMethod("updateResources", double.class);
        update.setAccessible(true);
        game.unlockedAreas.addAll(List.of("wood-room", "ore-room"));
        var nodes = game.resourceNodes.stream().filter(n ->
                "wood-room".equals(n.requiredArea) || "ore-room".equals(n.requiredArea)).toList();
        assertEquals(2, nodes.stream().filter(n -> n.type.equals("wood")).count());
        assertEquals(2, nodes.stream().filter(n -> n.type.equals("ore")).count());
        for (ResourceNode node : nodes) {
            player.x = node.x; player.y = node.y;
            update.invoke(game, .05);
            assertFalse(node.available);
            assertEquals(3, node.respawnTimer);
            player.x = 0; player.y = 0;
            update.invoke(game, 2.9);
            assertFalse(node.available);
            update.invoke(game, .11);
            assertTrue(node.available);
        }
        assertEquals(player.wood, player.ore);
    }

    @Test void quarryGatherActionAlsoAwardsOneIronAndPreservesSupplyRate() {
        GameSession game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
        Player player = game.connectPlayer("gather-test");
        game.setRoomOwner(player);
        game.handleMessage(player, "ROOM_READY:1");
        game.handleMessage(player, "START");
        game.unlockedAreas.add("mine");
        player.x = GameMap.QUARRY_X; player.y = GameMap.QUARRY_Y;
        int before = player.ore;
        game.handleMessage(player, "GATHER:ore");
        assertEquals(before + 1, player.ore);
        assertEquals(GameConfig.GATHER_COOLDOWN_SECONDS / 3, player.gatherCooldown);
        game.handleMessage(player, "GATHER:ore");
        assertEquals(before + 1, player.ore, "Gathering remains rate limited");
    }

    @Test void quarryPickupsHaveBalancedAmountsAndRespawnAtTheNewLocation() {
        List<String> effects = new ArrayList<>();
        GameSession game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { effects.add(message); }
            public void send(Player player, String message) { }
        });
        Player player = game.connectPlayer("quarry-test");
        game.setRoomOwner(player);
        game.handleMessage(player, "ROOM_READY:1");
        game.handleMessage(player, "START");
        game.players.forEach(p -> p.human = true);
        ResourceNode iron = game.resourceNodes.stream().filter(n -> n.id.equals("ore-5")).findFirst().orElseThrow();
        player.x = iron.x; player.y = iron.y;
        int initialIron = player.ore;
        game.update(.05);
        assertEquals(initialIron, player.ore, "Locked quarry must not award resources");
        game.unlockedAreas.add("mine");
        game.update(.05);
        assertEquals(initialIron + 1, player.ore);
        assertEquals((7 + Math.floorMod(iron.id.hashCode(), 5)) / 3.0, iron.respawnTimer);
        assertFalse(iron.available);
        game.update(.05);
        assertEquals(initialIron + 1, player.ore, "Collected node must wait for respawn");
        ResourceNode copper = game.resourceNodes.stream().filter(n -> n.type.equals("copper")).findFirst().orElseThrow();
        player.x = copper.x; player.y = copper.y; game.update(.05);
        assertEquals(1, player.copper);
        assertEquals((7 + Math.floorMod(copper.id.hashCode(), 5)) / 2.0, copper.respawnTimer);
        assertTrue(effects.stream().anyMatch(e -> e.contains("\"resource\":\"copper\",\"amount\":1")));
        ResourceNode silver = game.resourceNodes.stream().filter(n -> n.type.equals("silver")).findFirst().orElseThrow();
        player.x = silver.x; player.y = silver.y; game.update(.05);
        assertEquals(1, player.silver);
        assertEquals(7 + Math.floorMod(silver.id.hashCode(), 5), silver.respawnTimer);
        iron.respawnTimer = .01;
        player.x = iron.x; player.y = iron.y;
        game.update(.05); game.update(.05);
        assertEquals(initialIron + 2, player.ore);
    }
}
