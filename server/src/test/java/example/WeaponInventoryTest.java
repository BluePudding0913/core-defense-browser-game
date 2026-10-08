package example;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class WeaponInventoryTest {
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
