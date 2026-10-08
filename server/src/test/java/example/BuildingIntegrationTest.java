package example;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class BuildingIntegrationTest {
    final List<String> broadcasts = new ArrayList<>();
    final List<String> feedback = new ArrayList<>();
    GameSession game;
    Player player;

    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { broadcasts.add(message); }
            public void send(Player recipient, String message) { feedback.add(message); }
        });
        player = game.connectPlayer("building-test");
        game.phase = GamePhase.PREPARING;
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        game.trapSlots.clear();
        game.players.forEach(other -> { other.human = true; other.x = other.y = 6000; });
        player.x = 1020; player.y = 1900;
        broadcasts.clear(); feedback.clear();
    }

    @Test void craftingRejectsShortageBeforeAnyConsumptionAndPublishesSuccessfulInventory() throws Exception {
        var bench = GameMap.WORKBENCH_UNITS.get(0);
        player.x = bench.x(); player.y = bench.y();
        player.wood = player.ore = player.copper = 10; player.silver = 7;
        game.handleMessage(player, "CRAFT:silverTurret");
        assertEquals(10, player.wood); assertEquals(10, player.ore); assertEquals(10, player.copper);
        assertEquals(7, player.silver); assertEquals(0, player.silverTurretItems);
        assertNull(player.selectedBuild);
        assertTrue(feedback.get(0).contains("素材が足りません"));
        player.silver = 8;
        game.handleMessage(player, "CRAFT:silverTurret");
        assertEquals(6, player.wood); assertEquals(2, player.ore); assertEquals(6, player.copper);
        assertEquals(0, player.silver); assertEquals(1, player.silverTurretItems);
        assertEquals("silverTurret", player.selectedBuild);
        assertTrue(feedback.get(1).contains("製作しました"));
        var snapshot = new ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals(1, snapshot.path("players").get(player.slot - 1).path("buildItems").path("silverTurret").asInt());
    }

    @Test void rejectedPlacementKeepsItemAndSuccessfulPlacementConsumesAndNotifiesOnce() {
        player.blockItems = 1; player.selectedBuild = "block";
        player.facingX = 1; player.facingY = 0;
        var enemy = new Enemy(1, "grunt", GameMap.SPAWN_POINTS.get(0), 100, 0, 0, 0);
        enemy.x = 1060; enemy.y = 1900; game.enemies.add(enemy);
        game.handleMessage(player, "PLACE_FRONT");
        assertEquals(1, player.blockItems); assertEquals("block", player.selectedBuild);
        assertTrue(game.trapSlots.isEmpty()); assertTrue(broadcasts.isEmpty());
        assertTrue(feedback.get(0).contains("ここには設置できません"));
        enemy.hp = 0;
        game.handleMessage(player, "PLACE_FRONT");
        assertEquals(0, player.blockItems); assertNull(player.selectedBuild);
        assertEquals(1, game.trapSlots.size());
        assertEquals(player.id, game.trapSlots.get(0).ownerId);
        assertEquals("block", game.trapSlots.get(0).defense.type);
        assertEquals(1, broadcasts.size());
        assertTrue(broadcasts.get(0).contains("\"effect\":\"item-use\""));
        assertTrue(feedback.get(1).contains("設置しました"));
        game.handleMessage(player, "PLACE_FRONT");
        assertEquals(0, player.blockItems); assertEquals(1, game.trapSlots.size());
        assertEquals(1, broadcasts.size());
    }

    @Test void repairUsesCorrectMaterialAndFullOrRejectedRepairsDoNotSpend() {
        var slot = new TrapSlot("repair", "free", 1060, 1900, null);
        slot.defense = new Defense("turret"); slot.defense.hp = 10; game.trapSlots.add(slot);
        player.wood = 5;
        game.handleMessage(player, "REPAIR:repair");
        assertEquals(10, slot.defense.hp); assertEquals(5, player.wood);
        assertTrue(feedback.get(0).contains("素材が足りません"));
        player.ore = 2;
        game.handleMessage(player, "REPAIR:repair");
        assertEquals(slot.defense.maxHp, slot.defense.hp);
        assertEquals(1, player.ore); assertEquals(5, player.wood);
        assertTrue(feedback.get(1).contains("設備を修理しました"));
        game.handleMessage(player, "REPAIR:repair");
        assertEquals(1, player.ore); assertEquals(5, player.wood);
        assertTrue(feedback.get(2).contains("設備の耐久値は満タンです"));
    }
}
