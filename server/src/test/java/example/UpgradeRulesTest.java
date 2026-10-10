package example;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class UpgradeRulesTest {
    @Test void enchantDecisionRequiresAnOwnedRecoveredWeaponAndTheFullNextTierPrice() {
        assertFalse(UpgradeRules.canEnchant(true, false, 0, 19_999));
        assertTrue(UpgradeRules.canEnchant(true, false, 0, 20_000));
        assertFalse(UpgradeRules.canEnchant(false, false, 0, 1_000_000));
        assertFalse(UpgradeRules.canEnchant(true, true, 0, 1_000_000));
        assertFalse(UpgradeRules.canEnchant(true, false, 3, 1_000_000));
        assertFalse(UpgradeRules.canEnchant(true, false, 1, 39_999));
        assertTrue(UpgradeRules.canEnchant(true, false, 1, 40_000));
    }
    @Test void finalTierKeepsItsOwnAffordabilityBoundary() {
        assertFalse(UpgradeRules.canEnchant(true, false, 2, 79_999));
        assertTrue(UpgradeRules.canEnchant(true, false, 2, 80_000));
        assertEquals(140_000, UpgradeRules.enchantCost(0) + UpgradeRules.enchantCost(1) + UpgradeRules.enchantCost(2));
    }
    @Test void armorPiecesComposeAndWeaponBoostIsBounded() {
        assertEquals(1, UpgradeRules.armorMultiplier(false, false));
        assertEquals(.9, UpgradeRules.armorMultiplier(true, false));
        assertEquals(.8, UpgradeRules.armorMultiplier(false, true));
        assertEquals(.7, UpgradeRules.armorMultiplier(true, true), 1e-9);
        assertEquals(1, UpgradeRules.weaponMultiplier(-1));
        assertEquals(1.75, UpgradeRules.weaponMultiplier(100));
    }
}
