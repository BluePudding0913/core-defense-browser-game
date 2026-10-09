package example;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class BuildingIntegrationTest {
    @Test void metalBarricadesCraftConsumeRepairRecoverAndPreserveDurability() throws Exception {
        for (String type : List.of("copperBarricade", "silverBarricade")) {
            var bench = GameMap.WORKBENCH_UNITS.get(0);
            player.x = bench.x(); player.y = bench.y();
            player.wood = player.ore = player.copper = player.silver = 20;
            game.handleMessage(player, "CRAFT:" + type);
            var recipe = GameConfig.BUILD_RECIPES.get(type);
            assertEquals(20 - recipe.get("wood"), player.wood);
            assertEquals(20 - recipe.get("ore"), player.ore);
            assertEquals(20 - recipe.get("copper"), player.copper);
            assertEquals(20 - recipe.getOrDefault("silver", 0), player.silver);
            assertEquals(1, player.buildItemCount(type));
            assertEquals(type, player.selectedBuild);
            assertEquals(1, new ObjectMapper().readTree(SnapshotBuilder.build(game)).path("players").get(player.slot - 1).path("buildItems").path(type).asInt());
            player.x = 1020; player.y = 1900; player.facingX = 1; player.facingY = 0;
            game.handleMessage(player, "PLACE_FRONT");
            assertEquals(0, player.buildItemCount(type));
            var slot = game.trapSlots.get(game.trapSlots.size() - 1);
            assertEquals(type.equals("copperBarricade") ? 2400 : 4800, slot.defense.maxHp);
            assertTrue(BuildingRules.blocksMovement(type));
            slot.defense.hp = 300;
            String resource = type.equals("copperBarricade") ? "copper" : "silver";
            int count = materialsCount(resource);
            game.handleMessage(player, "REPAIR:" + slot.id);
            assertEquals(count - 1, materialsCount(resource)); assertEquals(slot.defense.maxHp, slot.defense.hp);
            slot.defense.hp = 500;
            game.handleMessage(player, "REMOVE:" + slot.id);
            assertEquals(1, player.buildItemCount(type));
            game.handleMessage(player, "EQUIP_BUILD:" + type); game.handleMessage(player, "PLACE_FRONT");
            assertEquals(500, game.trapSlots.get(game.trapSlots.size() - 1).defense.hp);
            game.trapSlots.clear();
        }
    }

    @Test void carryNearestRecoversSelectedTurretWithoutChangingSelectionAndKeepsDamage() {
        player.turretItems = 1;
        game.handleMessage(player, "EQUIP_BUILD:turret");
        var slot = new TrapSlot("recover-held", "free", 1060, 1900, null);
        slot.defense = new Defense("turret"); slot.defense.hp = 123;
        game.trapSlots.add(slot);
        game.handleMessage(player, "CARRY_NEAREST:" + slot.id);
        assertFalse(game.trapSlots.contains(slot)); assertEquals(2, player.turretItems);
        assertEquals("turret", player.selectedBuild); assertEquals("pistol", player.weapon);
        assertEquals(123, player.takeDefense("turret").hp);
        player.movingCore = true;
        game.trapSlots.add(slot);
        game.handleMessage(player, "CARRY_NEAREST:" + slot.id);
        assertTrue(game.trapSlots.contains(slot), "core carrier cannot recover");
    }

    @Test void carryNearestRecoversFactoryWhileHoldingAnotherOfTheSameType() {
        player.addBuildItem("oreFactory", 1); player.selectedBuild = "oreFactory";
        var factory = new MaterialFactory("recover-factory", GameMap.shopByItem("oreFactory"), new MapPoint(1060, 1900));
        game.factories.add(factory);
        game.handleMessage(player, "CARRY_NEAREST:" + factory.id);
        assertFalse(game.factories.contains(factory)); assertEquals(2, player.buildItemCount("oreFactory"));
        assertEquals("oreFactory", player.selectedBuild);
    }
    private int materialsCount(String type) { return type.equals("copper") ? player.copper : player.silver; }
    @Test void pickupPreservesSelectedBuildWeaponAndCoreWhileRecoveringInventory() {
        for (String selection : new String[]{null, "wire"}) {
            player.selectedBuild = selection; player.weapon = "pistol";
            var slot = new TrapSlot("pickup-" + selection, "free", 1060, 1900, null);
            slot.defense = new Defense("block"); game.trapSlots.add(slot);
            int before = player.blockItems;
            game.handleMessage(player, "REMOVE:" + slot.id);
            assertEquals(before + 1, player.blockItems); assertEquals(selection, player.selectedBuild);
            assertEquals("pistol", player.weapon); assertFalse(game.trapSlots.contains(slot));
        }
        player.movingCore = true; player.selectedBuild = null;
        var slot = new TrapSlot("pickup-core", "free", 1060, 1900, null);
        slot.defense = new Defense("block"); game.trapSlots.add(slot);
        game.handleMessage(player, "REMOVE:" + slot.id);
        assertTrue(player.movingCore); assertNull(player.selectedBuild);
    }
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
