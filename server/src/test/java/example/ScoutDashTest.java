package example;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class ScoutDashTest extends JobsTest {
    private void scout() {
        setup();
        start("scout");
        player.x = 940; player.y = 1900;
    }

    private void move(double dt) throws Exception {
        call("updatePlayers", new Class<?>[]{double.class}, dt);
    }

    @Test void clickDirectionOverridesMovementAndCostsStaminaOnce() throws Exception {
        scout(); player.moveX = -1; player.dashHeld = true;
        double remaining = JobRules.staminaMax(player.job) - JobRules.SCOUT_DASH_STAMINA;
        game.handleMessage(player, "SCOUT_DASH:1500:1900");
        assertEquals(remaining, player.stamina);
        assertEquals(JobRules.SCOUT_DASH_COOLDOWN, player.jobCooldown);
        game.handleMessage(player, "SCOUT_DASH:0:1900");
        assertEquals(remaining, player.stamina, "repeat click cannot spend again during cooldown");
        move(.05);
        assertEquals(980, player.x, 1e-6);
        assertEquals(1900, player.y, 1e-6);
        assertEquals(remaining, player.stamina, "sprint does not drain stamina during burst");
        move(.15);
        assertEquals(1100, player.x, 1e-6);
        assertEquals(0, player.scoutDashRemaining, 1e-6);
        move(.1);
        assertTrue(player.x < 1100, "held movement resumes after burst");
    }

    @Test void burstCanBeUsedAgainAfterEightTenthsOfASecond() {
        scout();
        game.handleMessage(player, "SCOUT_DASH:1500:1900");
        assertEquals(.8, player.jobCooldown);
        game.update(.79);
        game.handleMessage(player, "SCOUT_DASH:1500:1900");
        assertEquals(0, player.scoutDashRemaining);
        game.update(.02);
        game.handleMessage(player, "SCOUT_DASH:1500:1900");
        assertEquals(JobRules.SCOUT_DASH_DURATION, player.scoutDashRemaining);
        assertEquals(.8, player.jobCooldown);
    }

    @Test void diagonalIsNormalizedAndLargeTickCannotExtendDistance() throws Exception {
        scout();
        game.handleMessage(player, "SCOUT_DASH:1240:2200");
        assertEquals(1, Math.hypot(player.scoutDashDx, player.scoutDashDy), 1e-6);
        move(1);
        assertEquals(160, Math.hypot(player.x - 940, player.y - 1900), 1e-6);
    }

    @Test void sweepStopsAtWallClosedAreaAndBarricadeWithoutTunneling() throws Exception {
        scout(); player.x = 1260;
        game.handleMessage(player, "SCOUT_DASH:2000:1900"); move(1);
        assertTrue(player.x <= 1275); assertEquals(0, player.scoutDashRemaining);
        scout(); player.x = 1020; player.y = 1740;
        game.handleMessage(player, "SCOUT_DASH:1020:1000"); move(1);
        assertTrue(player.y >= 1685); assertTrue(player.y < 1740);
        scout();
        TrapSlot slot = new TrapSlot("dash-block", "free", 1020, 1900, null);
        slot.defense = new Defense("barricade"); game.trapSlots.add(slot);
        game.handleMessage(player, "SCOUT_DASH:1500:1900"); move(1);
        assertTrue(player.x <= 997); assertTrue(player.x > 940);
    }

    @Test void wrongJobBusyStatesLowStaminaAndInvalidTargetsAreRejected() {
        scout();
        for (String job : new String[]{"healer", "spy", "tp"}) {
            player.job = job; game.handleMessage(player, "SCOUT_DASH:1500:1900");
            assertEquals(0, player.scoutDashRemaining);
        }
        player.job = "scout";
        player.down = true; game.handleMessage(player, "SCOUT_DASH:1500:1900"); player.down = false;
        player.movingCore = true; game.handleMessage(player, "SCOUT_DASH:1500:1900"); player.movingCore = false;
        player.selectedBuild = "block"; game.handleMessage(player, "SCOUT_DASH:1500:1900"); player.selectedBuild = null;
        player.railgunCharge = 1; game.handleMessage(player, "SCOUT_DASH:1500:1900"); player.railgunCharge = 0;
        player.stamina = 19; game.handleMessage(player, "SCOUT_DASH:1500:1900"); player.stamina = 100;
        for (String target : new String[]{"NaN:1900", "Infinity:1900", "940:1900"}) {
            game.handleMessage(player, "SCOUT_DASH:" + target);
        }
        assertEquals(0, player.scoutDashRemaining); assertEquals(0, player.jobCooldown);
        assertEquals(100, player.stamina);
        game.phase = GamePhase.LOBBY; game.handleMessage(player, "SCOUT_DASH:1500:1900");
        assertEquals(0, player.scoutDashRemaining);
    }

    @Test void cooldownExpiresAndHumanAndCpuShareMovementRules() throws Exception {
        scout(); player.human = false;
        game.handleMessage(player, "SCOUT_DASH:1500:1900"); move(.2);
        assertEquals(1100, player.x, 1e-6);
        player.human = true;
        game.update(3);
        game.handleMessage(player, "SCOUT_DASH:940:1900");
        assertEquals(JobRules.SCOUT_DASH_DURATION, player.scoutDashRemaining);
    }

    @Test void snapshotIncludesPredictionParametersAndDisconnectStopsBurst() throws Exception {
        scout();
        game.handleMessage(player, "SCOUT_DASH:1500:1900");
        var snapshot = new ObjectMapper().readTree(SnapshotBuilder.build(game));
        com.fasterxml.jackson.databind.JsonNode me = null;
        for (var member : snapshot.get("players")) {
            if (member.get("id").asText().equals(player.id)) me = member;
        }
        assertNotNull(me);
        assertEquals(.2, me.get("scoutDashRemaining").asDouble());
        assertEquals(800, me.get("scoutDashSpeed").asDouble());
        assertEquals(4, me.get("scoutDashStep").asDouble());
        game.disconnectPlayer(player);
        assertEquals(0, player.scoutDashRemaining);
    }

    @Test void sharedSweepCannotSkipThinObstacleAndRuleRejectsInvalidDirection() {
        var position = JobRules.advanceScoutDash(0, 0, 1, 0, 160,
                (x, y) -> x < 40 || x >= 80);
        assertEquals(36, position.x());
        assertNull(JobRules.scoutDashDirection(0, 0, Double.NaN, 0));
        assertNull(JobRules.scoutDashDirection(0, 0, 0, 0));
        var direction = JobRules.scoutDashDirection(0, 0, 3, 4);
        assertEquals(.6, direction.x()); assertEquals(.8, direction.y());
    }

    @Test void burstPreventsEnemyContactAndProtectionEndsWithBurst() throws Exception {
        scout();
        game.players.stream().filter(p -> p != player).forEach(p -> { p.x = 1220; p.y = 1900; });
        Enemy enemy = new Enemy(99, "grunt", GameMap.SPAWN_POINTS.get(0), 100, 0, 10, 0);
        enemy.x = player.x + 10; enemy.y = player.y; game.enemies.add(enemy);
        game.phase = GamePhase.WAVE; game.queuedEnemies = 1;
        game.handleMessage(player, "SCOUT_DASH:1500:1900");
        call("updateEnemies", new Class<?>[]{double.class}, .05);
        assertEquals(100, player.hp);
        assertEquals(0, player.medbayDamageDelay);
        move(.2); enemy.x = player.x + 10; enemy.attackCooldown = 0;
        call("updateEnemies", new Class<?>[]{double.class}, .05);
        assertEquals(90, player.hp);
        assertEquals(GameConfig.MEDBAY_DAMAGE_DELAY, player.medbayDamageDelay);
    }

    @Test void sprintAndOtherJobsStillTakeContactAndBurstStillTakesAreaDamage() throws Exception {
        scout();
        player.dashing = true;
        assertFalse(JobRules.avoidsContactDamage(player));
        player.scoutDashRemaining = .1;
        assertTrue(JobRules.avoidsContactDamage(player));
        player.job = "healer";
        assertFalse(JobRules.avoidsContactDamage(player));
        player.job = "scout";
        call("damagePlayer", new Class<?>[]{Player.class, double.class}, player, 10.0);
        assertEquals(90, player.hp, "other damage sources remain effective during burst");
    }
}
