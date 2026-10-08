package example;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class GoldRewardRulesTest {
    @Test void scoutBonusPreservesFractionsAndStacksWithWeaponRewards() {
        assertEquals(130, GoldRewardRules.payout(100, null, false, 0, "scout").credits());
        assertEquals(195, GoldRewardRules.payout(100, "bat", false, 0, "scout").credits());
        double remainder = 0; int credits = 0;
        for (int i = 0; i < 10; i++) {
            var payout = GoldRewardRules.payout(1, "pistol", false, remainder, "scout");
            credits += payout.credits(); remainder = payout.remainder();
        }
        assertEquals(13, credits); assertEquals(0, remainder, 1e-8);
    }
    @Test void riskyShortRangeWeaponsEarnMoreAndHeavyWeaponsEarnLess() {
        assertTrue(GoldRewardRules.multiplier("bat") > GoldRewardRules.multiplier("pistol"));
        assertTrue(GoldRewardRules.multiplier("shotgun") > GoldRewardRules.multiplier("rifle"));
        assertTrue(GoldRewardRules.multiplier("rocket") < GoldRewardRules.multiplier("smg"));
        assertTrue(GoldRewardRules.multiplier("railgun") < GoldRewardRules.multiplier("sniper"));
        assertTrue(GoldRewardRules.multiplier("missile") < GoldRewardRules.multiplier("rocket"));
        for (var weapon : WeaponCatalog.ALL) {
            assertEquals(Math.round(100 * weapon.goldMultiplier()),
                    GoldRewardRules.payout(100, weapon.id(), false, 0).credits());
        }
    }

    @Test void rapidSmallPayoutsPreserveFractionsAcrossWeaponsAndDroneUse() {
        double remainder = 0;
        int credits = 0;
        for (int i = 0; i < 100; i++) {
            var payout = GoldRewardRules.payout(1, "railgun", true, remainder);
            credits += payout.credits(); remainder = payout.remainder();
        }
        assertEquals(27, credits); assertEquals(.5, remainder, 1e-8);
        var bodyPayout = GoldRewardRules.payout(1, "bat", false, remainder);
        assertEquals(2, bodyPayout.credits()); assertEquals(0, bodyPayout.remainder(), 1e-8);
    }
}
