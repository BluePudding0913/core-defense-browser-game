package example;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashSet;
import org.junit.jupiter.api.Test;

class WeaponCatalogTest {
    @Test void everyDefinitionPublishesMatchingOwnershipAmmoAndCapacity() throws Exception {
        var game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
        var player = game.players.get(0);
        WeaponCatalog.ALL.forEach(weapon -> player.weapons.grant(weapon.id()));
        var snapshot = new ObjectMapper().readTree(SnapshotBuilder.build(game));
        var rules = snapshot.path("rules").path("weapons");
        var state = snapshot.path("players").get(0);
        var ids = new HashSet<String>();
        for (var weapon : WeaponCatalog.ALL) {
            assertTrue(ids.add(weapon.id()), "Duplicate weapon id");
            var rule = rules.path(weapon.id());
            assertEquals(weapon.capacity(), rule.path("capacity").asInt());
            assertEquals(weapon.stats().damage(), rule.path("damage").asDouble());
            if (weapon.usesAmmo()) {
                assertTrue(state.path(rule.path("owned").asText()).asBoolean());
                assertEquals(weapon.capacity(), state.path(rule.path("ammo").asText()).asInt());
            }
        }
        // Ricochet has always consumed one round; its published rule must agree.
        player.weapon = "ricochet";
        player.weapons.consume(player.weapon);
        assertEquals(rules.path("ricochet").path("ammoPerShot").asInt(),
                WeaponCatalog.capacity("ricochet") - player.weapons.ammo("ricochet"));
    }

    @Test void allInventoriesClampConsumeAndResetWithoutWeaponSpecificFields() {
        var inventory = new WeaponInventory();
        for (var weapon : WeaponCatalog.ALL) {
            inventory.grant(weapon.id());
            assertTrue(inventory.owns(weapon.id()));
            inventory.setAmmo(weapon.id(), Integer.MAX_VALUE);
            assertEquals(weapon.capacity(), inventory.ammo(weapon.id()));
            assertTrue(inventory.consume(weapon.id()));
            assertEquals(Math.max(0, weapon.capacity() - 1), inventory.ammo(weapon.id()));
            inventory.setAmmo(weapon.id(), -1);
            assertEquals(0, inventory.ammo(weapon.id()));
            assertEquals(!weapon.usesAmmo(), inventory.consume(weapon.id()));
        }
        inventory.clear();
        for (var weapon : WeaponCatalog.ALL) {
            assertEquals(!weapon.usesAmmo(), inventory.owns(weapon.id()));
            assertEquals(0, inventory.ammo(weapon.id()));
        }
        inventory.grant("unknown");
        assertFalse(inventory.owns("unknown"));
        assertFalse(inventory.consume("unknown"));
        assertEquals(0, inventory.ammo("unknown"));
    }
}
