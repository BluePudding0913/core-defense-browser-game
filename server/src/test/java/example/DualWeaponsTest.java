package example;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class DualWeaponsTest extends JobsTest {
    @Test void handsSelectOwnedWeaponsAndFireIndependentlyWhileHeld() {
        start("attacker");
        player.weapons.grant("smg"); player.weapons.grant("shotgun");
        game.handleMessage(player, "WEAPON:smg");
        game.handleMessage(player, "SECONDARY_WEAPON:shotgun");
        game.handleMessage(player, "SECONDARY_WEAPON:rocket");
        assertEquals("shotgun", player.secondaryWeapon, "unowned weapon is rejected");
        int left = player.weapons.ammo("smg"), right = player.weapons.ammo("shotgun");
        game.handleMessage(player, "FIRE:1240:1900:1");
        game.handleMessage(player, "SECONDARY_FIRE:1240:1900:1");
        assertEquals(left - 1, player.weapons.ammo("smg"));
        assertEquals(right - 1, player.weapons.ammo("shotgun"));
        assertEquals("smg", player.weapon);
        assertEquals(WeaponCatalog.stats("smg").cooldown(), player.cooldown);
        assertEquals(WeaponCatalog.stats("shotgun").cooldown(), player.secondaryCooldown);
        game.update(WeaponCatalog.stats("smg").cooldown() + .01);
        assertEquals(left - 2, player.weapons.ammo("smg"));
        assertEquals(right - 1, player.weapons.ammo("shotgun"));
        game.handleMessage(player, "FIRE:1240:1900:0");
        assertTrue(player.secondaryFiring);
        game.update(WeaponCatalog.stats("shotgun").cooldown());
        assertEquals(left - 2, player.weapons.ammo("smg"));
        assertEquals(right - 2, player.weapons.ammo("shotgun"));
        game.handleMessage(player, "SECONDARY_FIRE:0:0:0");
        game.update(1);
        assertEquals(right - 2, player.weapons.ammo("shotgun"));
    }

    @Test void rejectsTheOtherHandsWeaponFromBothCommands() {
        start("attacker"); player.weapons.grant("smg");
        assertEquals("bat", player.secondaryWeapon);
        game.handleMessage(player, "WEAPON:smg");
        game.handleMessage(player, "SECONDARY_WEAPON:smg");
        assertEquals("bat", player.secondaryWeapon);
        game.handleMessage(player, "SECONDARY_WEAPON:pistol");
        game.handleMessage(player, "WEAPON:pistol");
        assertEquals("smg", player.weapon); assertEquals("pistol", player.secondaryWeapon);
        player.secondaryWeapon = "smg";
        int ammo = player.weapons.ammo("smg");
        game.handleMessage(player, "SECONDARY_FIRE:1240:1900:1");
        assertEquals(ammo, player.weapons.ammo("smg"), "invalid matching loadout cannot shoot");
    }
    @Test void switchingRightWeaponRetainsCooldownAndRejectsOtherJobsAndDownPlayers() {
        start("attacker"); player.weapons.grant("shotgun");
        game.handleMessage(player, "SECONDARY_WEAPON:shotgun");
        game.handleMessage(player, "SECONDARY_FIRE:1240:1900:1");
        double cooldown = player.secondaryCooldown;
        game.handleMessage(player, "SECONDARY_WEAPON:pistol");
        game.update(.1);
        game.handleMessage(player, "SECONDARY_WEAPON:shotgun");
        assertEquals(cooldown - .1, player.secondaryCooldown, 1e-9);
        int rounds = player.weapons.ammo("shotgun");
        game.handleMessage(player, "SECONDARY_FIRE:1240:1900:1");
        assertEquals(rounds, player.weapons.ammo("shotgun"));
        player.down = true;
        game.handleMessage(player, "SECONDARY_WEAPON:pistol");
        assertEquals("shotgun", player.secondaryWeapon);
        player.down = false; player.job = "healer";
        game.handleMessage(player, "SECONDARY_WEAPON:pistol");
        assertEquals("shotgun", player.secondaryWeapon);
    }

    @Test void rightRailgunChargesAndStopsWithoutInterruptingLeftFire() {
        start("attacker");
        CombatTestRandom.center(game);
        player.weapons.grant("smg"); player.weapons.grant("railgun");
        game.handleMessage(player, "WEAPON:smg");
        game.handleMessage(player, "SECONDARY_WEAPON:railgun");
        int rounds = player.weapons.ammo("railgun");
        game.handleMessage(player, "FIRE:1240:1900:1");
        game.handleMessage(player, "SECONDARY_FIRE:1140:2000:1");
        assertTrue(player.secondaryRailgunCharge > 0); assertEquals(0, player.railgunCharge);
        game.update(GameConfig.RAILGUN_CHARGE + .1);
        assertEquals(rounds - 1, player.weapons.ammo("railgun"));
        assertTrue(player.secondaryRailgunRemaining > 0);
        assertEquals(0, player.secondaryRailgunDx, 1e-9); assertEquals(1, player.secondaryRailgunDy, 1e-9);
        assertEquals("smg", player.weapon); assertTrue(player.firing);
        String snapshot = SnapshotBuilder.build(game);
        assertTrue(snapshot.contains("\"secondaryWeapon\":\"railgun\""));
        assertTrue(snapshot.contains("\"secondaryRailgunRange\":"));
        game.handleMessage(player, "SECONDARY_FIRE:0:0:0");
        assertEquals(0, player.secondaryRailgunRemaining);
        assertEquals(WeaponCatalog.stats("railgun").cooldown(), player.secondaryCooldown);
        assertTrue(player.firing);
    }
}
