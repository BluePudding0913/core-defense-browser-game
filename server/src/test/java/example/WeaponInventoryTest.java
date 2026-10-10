package example;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class WeaponInventoryTest {
    @Test void attackerHasFourSlotsAndJobChangesPreserveWeaponsAndExchanges() {
        String[] job = {"attacker"};
        var inventory = new WeaponInventory(() -> job[0]);
        assertEquals(4, inventory.weaponLimit());
        assertTrue(inventory.grant("shotgun")); assertTrue(inventory.grant("smg"));
        assertFalse(inventory.canExchange("rifle", "pistol"));
        assertTrue(inventory.grant("rifle")); assertEquals(4, inventory.weaponCount());
        assertFalse(inventory.grant("sniper"));
        assertTrue(inventory.exchange("sniper", "rifle")); assertEquals(4, inventory.weaponCount());
        assertTrue(inventory.grant("plasmaBlade")); assertEquals(4, inventory.weaponCount());
        job[0] = "healer";
        assertEquals(3, inventory.weaponLimit()); assertEquals(4, inventory.weaponCount());
        assertFalse(inventory.grant("rifle"));
        assertTrue(inventory.exchange("rifle", "sniper"));
        assertEquals(4, inventory.weaponCount()); assertTrue(inventory.owns("rifle"));
        assertTrue(inventory.grant("shotgun"));
        assertEquals(WeaponCatalog.capacity("shotgun"), inventory.ammo("shotgun"));
    }

    @Test void countsPistolButNotBatAndRejectsFourthWeaponWithoutAmmo() {
        var inventory = new WeaponInventory();
        assertEquals(1, inventory.weaponCount());
        assertTrue(inventory.grant("shotgun"));
        assertTrue(inventory.grant("smg"));
        assertEquals(3, inventory.weaponCount());
        assertTrue(inventory.canAcquire("bat"));
        assertTrue(inventory.canAcquire("pistol"));
        inventory.setAmmo("shotgun", 0);
        assertFalse(inventory.canAcquire("rifle"));
        assertFalse(inventory.grant("rifle"));
        assertFalse(inventory.owns("rifle"));
        assertEquals(0, inventory.ammo("rifle"));
        assertTrue(inventory.grant("shotgun"));
        assertEquals(WeaponCatalog.capacity("shotgun"), inventory.ammo("shotgun"));
        assertFalse(inventory.grant("unknown"));
        assertFalse(inventory.exchange("rifle", "bat"));
        assertFalse(inventory.exchange("rifle", "sniper"));
        assertTrue(inventory.exchange("rifle", "pistol"));
        assertEquals(3, inventory.weaponCount());
        assertFalse(inventory.owns("pistol"));
        assertTrue(inventory.exchange("sniper", "shotgun"));
        assertFalse(inventory.owns("shotgun"));
        assertEquals(0, inventory.ammo("shotgun"));
        assertEquals(WeaponCatalog.capacity("sniper"), inventory.ammo("sniper"));
        inventory.clear();
        assertEquals(1, inventory.weaponCount());
        assertTrue(inventory.canAcquire("rifle"));
    }
}
