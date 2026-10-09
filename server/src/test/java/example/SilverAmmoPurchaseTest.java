package example;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class SilverAmmoPurchaseTest {
    @Test void silverCraftRequiresUnlockedNearbyWorkbenchAndConsumesOnlySilver() throws Exception {
        List<String> messages = new ArrayList<>();
        var game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { messages.add(message); }
        });
        var player = game.connectPlayer("silver-test");
        game.setRoomOwner(player); game.handleMessage(player, "START");
        var bench = GameMap.WORKBENCH_UNITS.get(0);
        player.x = bench.x(); player.y = bench.y(); player.silver = 2; player.credits = 137;
        game.handleMessage(player, "CRAFT:silverAmmo");
        assertEquals(0, player.weapons.silverAmmo()); assertEquals(2, player.silver);
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        var ammoShop = GameMap.shopByItem("ammo");
        player.x = ammoShop.x(); player.y = ammoShop.y();
        game.handleMessage(player, "BUY:silverAmmo");
        game.handleMessage(player, "CRAFT:silverAmmo");
        assertEquals(0, player.weapons.silverAmmo()); assertEquals(2, player.silver);
        player.x = 1020; player.y = 1900;
        game.handleMessage(player, "CRAFT:silverAmmo"); assertEquals(0, player.weapons.silverAmmo());
        player.x = bench.x(); player.y = bench.y(); player.down = true;
        game.handleMessage(player, "CRAFT:silverAmmo"); assertEquals(0, player.weapons.silverAmmo());
        player.down = false; messages.clear();
        player.selectedBuild = "wire";
        game.handleMessage(player, "CRAFT:silverAmmo");
        assertEquals(20, player.weapons.silverAmmo()); assertEquals(1, player.silver); assertEquals(137, player.credits);
        assertEquals("wire", player.selectedBuild);
        assertEquals("pistol", player.weapon);
        assertTrue(messages.stream().anyMatch(message -> message.contains("purchase-complete") && message.contains("\"closeMenu\":false")));
        game.handleMessage(player, "CRAFT:silverAmmo");
        assertEquals(40, player.weapons.silverAmmo()); assertEquals(0, player.silver);
        messages.clear(); game.handleMessage(player, "CRAFT:silverAmmo");
        assertEquals(40, player.weapons.silverAmmo()); assertEquals(137, player.credits);
        assertFalse(messages.stream().anyMatch(message -> message.contains("purchase-complete")));
        var snapshot = new ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals(40, snapshot.path("players").get(player.slot - 1).path("silverAmmo").asInt());
        assertEquals(1, snapshot.path("rules").path("silverAmmo").path("cost").asInt());
        assertEquals(20, snapshot.path("rules").path("silverAmmo").path("amount").asInt());
        assertEquals(3.0, snapshot.path("rules").path("silverAmmo").path("damageMultiplier").asDouble());
        for (var definition : WeaponCatalog.ALL) {
            assertEquals(SilverAmmoRules.eligible(definition.id()), snapshot.path("rules").path("weapons")
                    .path(definition.id()).path("silverAmmoEligible").asBoolean());
        }
        player.selectedBuild = null;
        player.x = 1020; player.y = 1900;
        var enemy = new Enemy(9999, "grunt", GameMap.SPAWN_POINTS.get(0), 1000, 0, 0, 0);
        enemy.x = 1100; enemy.y = 1900; game.enemies.add(enemy);
        game.handleMessage(player, "FIRE:1400:1900:1");
        game.handleMessage(player, "FIRE:1400:1900:0");
        assertEquals(39, player.weapons.silverAmmo());
        assertTrue(enemy.hp < enemy.maxHp);
        snapshot = new ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals(39, snapshot.path("players").get(player.slot - 1).path("silverAmmo").asInt());
        game.phase = GamePhase.LOST; game.players.forEach(candidate -> candidate.roomReady = true);
        game.handleMessage(player, "START");
        assertEquals(GamePhase.PREPARING, game.phase);
        assertEquals(0, player.weapons.silverAmmo());
    }
}
