package example;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class HealingAttackerTest extends JobsTest {
    @Test void healingAreaHealsLivingAlliesInsideThreeTilesAndExpires() {
        start("healer");
        player.hp = 40;
        game.handleMessage(player, "JOB_ABILITY");
        assertEquals(10, player.healRemaining);
        assertEquals(30, player.jobCooldown);
        Player ally = game.players.get(1);
        ally.x = player.healX + 59; ally.y = player.healY; ally.hp = 50;
        Player outside = game.players.get(2);
        outside.x = player.healX + 60; outside.y = player.healY; outside.hp = 50;
        game.update(1);
        assertEquals(45, player.hp);
        assertEquals(55, ally.hp);
        assertEquals(50, outside.hp);
        ally.down = true;
        game.update(1);
        assertEquals(55, ally.hp);
        game.handleMessage(player, "JOB_ABILITY");
        assertEquals(8, player.healRemaining);
        game.update(9);
        assertEquals(0, player.healRemaining);
        assertTrue(SnapshotBuilder.build(game).contains("\"healHalfSize\":60.0"));
    }

    @Test void attackerCanFireBothGunsWithIndependentCooldownsAndRelease() {
        start("attacker");
        game.handleMessage(player, "FIRE:1240:1900:1");
        double cooldown = player.cooldown;
        assertTrue(cooldown > 0);
        game.handleMessage(player, "SECONDARY_FIRE:1240:1900:1");
        assertTrue(player.secondaryCooldown > 0);
        assertEquals(cooldown, player.cooldown);
        assertTrue(player.firing && player.secondaryFiring);
        game.handleMessage(player, "SECONDARY_FIRE:0:0:0");
        assertFalse(player.secondaryFiring);
        assertTrue(player.firing);
        player.secondaryCooldown = 0; player.down = true;
        game.handleMessage(player, "SECONDARY_FIRE:1240:1900:1");
        assertEquals(0, player.secondaryCooldown);
        player.down = false; player.job = "healer";
        game.handleMessage(player, "SECONDARY_FIRE:1240:1900:1");
        assertEquals(0, player.secondaryCooldown);
    }
}
