package example;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class BotWeaponPolicyTest {
    @Test void rangeAndOwnershipOverrideTheOldFixedWeaponPriority() {
        var bot = new Player(2);
        bot.weapons.grant("revolver"); bot.weapons.grant("rifle");
        BotWeaponPolicy.select(bot, 400, 500, 1);
        assertEquals("rifle", bot.weapon, "revolver cannot reach this target");
        bot.weapons.setOwned("pistol", false); bot.weapons.setAmmo("revolver", 0);
        BotWeaponPolicy.select(bot, 190, 500, 1);
        assertEquals("rifle", bot.weapon, "never fall back to an exchanged or empty weapon");
    }
    @Test void lowHealthKeepsDistanceWhileHeavyAmmoIsSavedForDenseOrStrongTargets() {
        var bot = new Player(2); bot.hp = 30;
        BotWeaponPolicy.select(bot, 50, 500, 1);
        assertEquals("pistol", bot.weapon);
        bot.weapons.grant("rocket"); bot.weapons.grant("smg");
        BotWeaponPolicy.select(bot, 200, 30, 1);
        assertEquals("smg", bot.weapon);
        BotWeaponPolicy.select(bot, 400, 3000, 3);
        assertEquals("rocket", bot.weapon);
    }
    @Test void chargingWeaponIsRetainedAndMountedWeaponsStayExclusive() {
        var bot = new Player(2); bot.weapons.grant("railgun"); bot.weapons.grant("smg");
        BotWeaponPolicy.select(bot, 450, 3000, 3); assertEquals("railgun", bot.weapon);
        bot.railgunCharge = .5;
        BotWeaponPolicy.select(bot, 100, 20, 1); assertEquals("railgun", bot.weapon);
        bot.railgunCharge = 0;
        bot.drone = new Drone(); bot.drone.active = true; bot.drone.weapon = "smg";
        bot.weapons.setAmmo("railgun", 0);
        BotWeaponPolicy.select(bot, 200, 500, 1); assertEquals("pistol", bot.weapon);
    }
    @Test void upgradesRequireAnAvailableSlotAndOfferUsefulRangeOrDamage() {
        var bot = new Player(2); bot.weapons.grant("smg");
        assertTrue(BotWeaponPolicy.worthwhileUpgrade(bot, "sniper"));
        assertFalse(BotWeaponPolicy.worthwhileUpgrade(bot, "shotgun"));
        bot.weapons.grant("rifle");
        assertFalse(BotWeaponPolicy.worthwhileUpgrade(bot, "sniper"));
    }
    @Test void tacticalRulesPreferCoreEmergenciesAndSafeRecoveryPositions() {
        assertTrue(BotCombatRules.urgentThreatBonus(30, 200, true)
                > BotCombatRules.urgentThreatBonus(400, 200, true));
        assertTrue(BotCombatRules.safePositionScore(150, 80, true)
                > BotCombatRules.safePositionScore(30, 100, true));
        assertTrue(BotCombatRules.shouldHeal(true, 0, false, 1));
        assertFalse(BotCombatRules.shouldHeal(true, 5, false, 1));
        assertFalse(BotCombatRules.shouldHeal(true, 0, true, 1));
    }
}
