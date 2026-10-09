package example;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class UpgradeRulesTest {
    @Test void enchantDecisionRequiresAnOwnedRecoveredWeaponAndTheFullNextTierPrice() {
        assertFalse(UpgradeRules.canEnchant(true, false, 0, 39_999));
        assertTrue(UpgradeRules.canEnchant(true, false, 0, 40_000));
        assertFalse(UpgradeRules.canEnchant(false, false, 0, 1_000_000));
        assertFalse(UpgradeRules.canEnchant(true, true, 0, 1_000_000));
        assertFalse(UpgradeRules.canEnchant(true, false, 3, 1_000_000));
        assertFalse(UpgradeRules.canEnchant(true, false, 1, 159_999));
        assertTrue(UpgradeRules.canEnchant(true, false, 1, 160_000));
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
