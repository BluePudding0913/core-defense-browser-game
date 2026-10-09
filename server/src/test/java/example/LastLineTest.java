package example;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class LastLineTest {
    GameSession game;
    Player player;

    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player recipient, String message) { }
        });
        player = game.connectPlayer("last-line-test");
        game.setRoomOwner(player); game.handleMessage(player, "START");
        game.players.clear(); game.players.add(player); game.trapSlots.clear();
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        game.prepTime = 1000; player.credits = 1_000_000;
    }
    void at(String item) {
        ShopUnit shop = GameMap.shopByItem(item); player.x = shop.x(); player.y = shop.y();
    }
    void damage(double amount) throws Exception {
        var method = GameSession.class.getDeclaredMethod("damagePlayer", Player.class, double.class);
        method.setAccessible(true); method.invoke(game, player, amount);
    }
    void damageCore(double amount) throws Exception {
        var method = GameSession.class.getDeclaredMethod("damageCore", double.class);
        method.setAccessible(true); method.invoke(game, amount);
    }

    @Test void roomHasFiveDevicesAndWideDirectAccessFromHeavyArms() {
        UnlockArea area = GameMap.areaById(UpgradeRules.AREA);
        assertEquals(70, area.tiles().size());
        assertEquals(5, GameMap.SHOP_UNITS.stream().filter(s -> area.contains(s.x(), s.y())).count());
        for (int col = 5; col <= 14; col++) {
            assertTrue(GameMap.areaById("heavy-arms-area").tiles().contains(new AreaTile(col, 29)));
            assertTrue(area.tiles().contains(new AreaTile(col, 30)));
        }
        assertEquals(81, GameMap.areaById("relay-gallery").tiles().size());
        assertEquals(540, area.terminalX()); assertEquals(1220, area.terminalY());
        assertTrue(GameMap.SPAWN_POINTS.stream().noneMatch(s -> "last-line".equals(GameMap.spawnArea(s))));
        for (int row = 30; row <= 36; row++) for (int col = 15; col <= 17; col++) {
            assertTrue(GameMap.tileTypeAt(col, row).solid(), "wall separates LAST LINE from WOOD ROOM");
        }
    }

    @Test void purchasesRejectLockedRoomsRemotePlayersAndDownedPlayers() {
        at("armor"); int before = player.credits;
        game.unlockedAreas.remove(UpgradeRules.AREA);
        game.handleMessage(player, "BUY:armor:tops"); assertFalse(player.armorTops);
        game.unlockedAreas.add(UpgradeRules.AREA); player.x = 1020; player.y = 1900;
        game.handleMessage(player, "BUY:armor:tops"); assertFalse(player.armorTops);
        at("armor"); player.down = true;
        game.handleMessage(player, "BUY:armor:tops"); assertFalse(player.armorTops);
        assertEquals(before, player.credits);
    }

    @Test void armorChargesOnceAndStacksToThirtyPercentWithoutProtectingCarriedCore() throws Exception {
        at("armor"); player.credits = 160_000;
        game.handleMessage(player, "BUY:armor:bottoms");
        assertTrue(player.armorBottoms); assertEquals(100_000, player.credits);
        player.hp = 100; damage(50); assertEquals(55, player.hp, 1e-9);
        game.handleMessage(player, "BUY:armor:tops");
        assertTrue(player.armorTops); assertEquals(0, player.credits);
        player.hp = 100; player.movingCore = true;
        damage(50); assertEquals(65, player.hp, 1e-9); assertEquals(950, game.coreHp);
        player.credits = 160_000; game.handleMessage(player, "BUY:armor:bottoms"); game.handleMessage(player, "BUY:armor:tops");
        assertEquals(160_000, player.credits);
    }

    @Test void enchantmentsHaveTierCostsAndBoostActualDamageWithoutChangingBaseStats() throws Exception {
        at("enchant"); player.credits = 39_999;
        game.handleMessage(player, "BUY:enchant:pistol"); assertTrue(player.enchantments.isEmpty());
        player.credits = 560_000;
        for (int i = 1; i <= 3; i++) {
            game.handleMessage(player, "BUY:enchant:pistol"); assertEquals(i, player.enchantments.get("pistol"));
        }
        assertEquals(0, player.credits);
        player.credits = 1_000_000; game.handleMessage(player, "BUY:enchant:pistol");
        game.handleMessage(player, "BUY:enchant:railgun"); assertFalse(player.enchantments.containsKey("railgun"));
        assertEquals(1_000_000, player.credits);
        var combatField = GameSession.class.getDeclaredField("combat"); combatField.setAccessible(true);
        CombatSystem combat = (CombatSystem) combatField.get(game);
        Enemy target = new Enemy(1, "grunt", GameMap.SPAWN_POINTS.get(0), 1000, 0, 0, 100);
        combat.damageEnemy(target, 100, player); assertEquals(825, target.hp);
        player.drone = new Drone(); player.drone.active = true; player.drone.weapon = "pistol";
        player.enchantments.clear(); game.handleMessage(player, "BUY:enchant:pistol");
        assertTrue(player.enchantments.isEmpty(), "mounted weapons require recovery before upgrades");
    }

    @Test void compressionConsumesExactlyThirtyTwoAndSupportsPlacementRecoveryAndRepair() throws Exception {
        at("overclockSilver"); player.silverTurretItems = 31;
        game.handleMessage(player, "BUY:overclockSilver"); assertEquals(31, player.silverTurretItems);
        assertEquals(0, player.overclockSilverItems);
        player.recoverDefense(new Defense("silverTurret")); int before = player.credits;
        game.handleMessage(player, "BUY:overclockSilver");
        assertEquals(0, player.silverTurretItems); assertEquals(1, player.overclockSilverItems);
        assertTrue(player.recoveredDefenses.get("silverTurret").isEmpty()); assertEquals(before, player.credits);
        player.x = 500; player.y = 1300; player.facingX = 0; player.facingY = 1;
        game.handleMessage(player, "PLACE_FRONT");
        TrapSlot slot = game.trapSlots.stream().filter(s -> s.defense != null).findFirst().orElseThrow();
        assertEquals(0, player.overclockSilverItems); assertEquals(2400, slot.defense.maxHp);
        slot.defense.hp = 1000; player.ore = 1; player.x = 540; player.y = 1340;
        game.handleMessage(player, "REPAIR:" + slot.id); assertTrue(slot.defense.hp > 1000); assertEquals(0, player.ore);
        double hp = slot.defense.hp; game.handleMessage(player, "CARRY_NEAREST:" + slot.id);
        assertFalse(game.trapSlots.contains(slot)); assertEquals(1, player.overclockSilverItems);
        assertEquals(hp, player.takeDefense("overclockSilver").hp);
        at("enchant"); game.handleMessage(player, "CRAFT:overclockSilver");
        assertEquals(1, player.overclockSilverItems, "compression cannot be crafted through the workbench");
    }

    @Test void teamBuffOnlyProtectsAreaOccupantsAndCoreAndExpiresWithoutFreeExtension() throws Exception {
        at("teamMachine"); int before = player.credits;
        game.handleMessage(player, "BUY:teamMachine"); assertEquals(before - 50_000, player.credits);
        game.handleMessage(player, "BUY:teamMachine"); assertEquals(before - 50_000, player.credits);
        assertEquals(120, game.teamBuffRemaining);
        player.hp = 100; damage(50); assertEquals(60, player.hp);
        game.coreX = 500; game.coreY = 1340; damageCore(100); assertEquals(920, game.coreHp);
        player.x = 1020; player.y = 1900; player.hp = 100; damage(50); assertEquals(50, player.hp);
        game.coreX = 1020; game.coreY = 1900; damageCore(100); assertEquals(820, game.coreHp);
        at("teamMachine"); game.teamBuffRemaining = .04; game.update(.05);
        assertEquals(0, game.teamBuffRemaining); assertFalse(game.teamBuffAt(player.x, player.y));
    }

    @Test void compressedTurretFiresRepeatedlyThroughTheRealGameLoop() {
        player.overclockSilverItems = 1;
        game.handleMessage(player, "EQUIP_BUILD:overclockSilver");
        player.x = 500; player.y = 1300; player.facingX = 0; player.facingY = 1;
        game.handleMessage(player, "PLACE_FRONT");
        TrapSlot slot = game.trapSlots.stream().filter(s -> s.defense != null).findFirst().orElseThrow();
        Enemy target = new Enemy(9000, "grunt", GameMap.SPAWN_POINTS.get(0), 10000, 0, 0, 0);
        target.x = 500; target.y = 1420; game.enemies.add(target);
        game.phase = GamePhase.WAVE; game.round = 40; game.queuedEnemies = 0;
        game.update(.05); assertEquals(9482, target.hp); assertEquals(.15, slot.defense.cooldown);
        game.update(.05); assertEquals(9482, target.hp);
        game.update(.16); assertEquals(8964, target.hp);
    }

    @Test void teamFirepowerCombinesWithWeaponEnchantOnlyInsideTheArea() throws Exception {
        at("teamMachine"); game.handleMessage(player, "BUY:teamMachine");
        player.enchantments.put("pistol", 1);
        var field = GameSession.class.getDeclaredField("combat"); field.setAccessible(true);
        CombatSystem combat = (CombatSystem) field.get(game);
        Enemy target = new Enemy(1, "grunt", GameMap.SPAWN_POINTS.get(0), 1000, 0, 0, 100);
        combat.damageEnemy(target, 100, player); assertEquals(843.75, target.hp);
        player.x = 1020; player.y = 1900; target.hp = 1000;
        combat.damageEnemy(target, 100, player); assertEquals(875, target.hp);
        game.teamBuffRemaining = 0; at("teamMachine"); target.hp = 1000;
        combat.damageEnemy(target, 100, player); assertEquals(875, target.hp);
    }

    @Test void lateAmmoRefillsSnapshotAndRestartIncludeUpgradeState() throws Exception {
        at("frontlineAmmo"); player.weapons.setOwned("railgun", true); player.weapons.setAmmo("railgun", 0);
        player.credits = 11_999; game.handleMessage(player, "BUY:frontlineAmmo"); assertEquals(0, player.weapons.ammo("railgun"));
        player.credits = 12_000; game.handleMessage(player, "BUY:frontlineAmmo");
        assertEquals(0, player.credits); assertEquals(WeaponCatalog.capacity("railgun"), player.weapons.ammo("railgun"));
        player.armorTops = true; player.enchantments.put("pistol", 1); player.overclockSilverItems = 2; game.teamBuffRemaining = 100;
        var state = new ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertTrue(state.path("players").get(0).path("armorTops").asBoolean());
        assertEquals(1, state.path("players").get(0).path("enchantments").path("pistol").asInt());
        assertEquals(2, state.path("players").get(0).path("buildItems").path("overclockSilver").asInt());
        assertTrue(state.path("rules").path("recipes").path("overclockSilver").path("shopOnly").asBoolean());
        game.handleMessage(player, "JOB:tank"); assertTrue(player.armorTops); assertEquals(1, player.enchantments.get("pistol"));
        game.phase = GamePhase.LOST; player.roomReady = true; game.handleMessage(player, "START");
        assertFalse(player.armorTops); assertTrue(player.enchantments.isEmpty()); assertEquals(0, player.overclockSilverItems);
        assertEquals(0, game.teamBuffRemaining);
    }
}
