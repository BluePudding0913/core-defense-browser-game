package example;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class WardenTest {
    GameSession game;
    Player player;
    Enemy boss;
    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player recipient, String message) { }
        });
        player = game.connectPlayer("warden-test");
        game.players.clear(); game.players.add(player); game.trapSlots.clear();
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        game.round = 16; game.phase = GamePhase.WAVE;
        boss = new Enemy(9000, "warden", GameMap.SPAWN_POINTS.get(0), 1000, 22, 40, 100);
        boss.x = 1020; boss.y = 1900; boss.specialCooldown = 0;
        player.x = 1220; player.y = 1900; player.hp = 100;
        game.coreX = 980; game.coreY = 1980; game.enemies.add(boss);
    }
    void invoke(String name, double dt) throws Exception {
        var method = GameSession.class.getDeclaredMethod(name, double.class); method.setAccessible(true); method.invoke(game, dt);
    }
    void update(double dt) throws Exception { invoke("updateEnemies", dt); }

    @Test void spawnedWardenHasTenfoldHealthInDebugAndNormalRounds() throws Exception {
        var spawn = GameSession.class.getDeclaredMethod("spawnEnemy", String.class, SpawnPoint.class);
        spawn.setAccessible(true);
        for (int round : new int[]{5,16,32,48}) {
            game.round = round; game.enemies.clear();
            spawn.invoke(game, "warden", GameMap.SPAWN_POINTS.get(0));
            Enemy spawned = game.enemies.get(0);
            double previousHp = (1600 + round * 50) * 2;
            assertEquals(previousHp * 10, spawned.hp);
            assertEquals(previousHp * 10, spawned.maxHp);
            var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game)).path("enemies").get(0);
            assertEquals(spawned.maxHp, snapshot.path("maxHp").asDouble());
        }
    }

    @Test void hpThresholdsAndAppearanceAreExplicit() {
        assertEquals(1, WardenRules.phase(601, 1000));
        assertEquals(2, WardenRules.phase(600, 1000));
        assertEquals(2, WardenRules.phase(301, 1000));
        assertEquals(3, WardenRules.phase(300, 1000));
        assertTrue(boss.isBoss());
        for (int round : new int[]{16,32,48}) assertTrue(WardenRules.appearsInRound(round));
        for (int round : new int[]{0,4,8,24,40}) assertFalse(WardenRules.appearsInRound(round));
    }
    @Test void fullHealthUsesNormalPursuit() throws Exception {
        update(.05); assertTrue(boss.x > 1020);
        assertEquals(WardenRules.Action.IDLE, boss.warden.action); assertEquals(100, player.hp);
    }
    @Test void chargeWarnsAndKeepsItsOriginalDirectionSoPlayersCanDodge() throws Exception {
        boss.hp = 600; update(.05);
        assertEquals(WardenRules.Action.CHARGE_WARNING, boss.warden.action);
        assertEquals(1020, boss.x); assertEquals(100, player.hp);
        assertEquals(1900, boss.warden.targetY);
        player.y = 1980;
        update(.64); assertEquals(WardenRules.Action.CHARGE_WARNING, boss.warden.action);
        update(.02); assertEquals(WardenRules.Action.CHARGING, boss.warden.action);
        update(.5); assertTrue(boss.x > 1020); assertEquals(1900, boss.y);
        assertEquals(100, player.hp);
    }
    @Test void chargeCannotDealRepeatedDamageToTheSamePlayer() throws Exception {
        boss.hp = 600; player.x = 1120;
        update(.05); update(1);
        for (int i = 0; i < 40; i++) update(.02);
        assertEquals(56, player.hp, 1e-6);
        assertEquals(WardenRules.Action.IDLE, boss.warden.action);
        assertTrue(boss.specialCooldown > 0);
    }
    @Test void barricadeStopsChargeAndReceivesOneImpact() throws Exception {
        var slot = new TrapSlot("wall", "test", 1140, 1900, null);
        slot.defense = new Defense("barricade"); game.trapSlots.add(slot);
        player.x = 1240; boss.hp = 600; update(.05); update(1); update(.75);
        assertTrue(boss.x < slot.x - 33);
        assertEquals(100, player.hp); assertEquals(1200 - 44, slot.defense.hp, 1e-6);
        assertEquals(WardenRules.Action.IDLE, boss.warden.action);
    }
    @Test void finalPhasePulseWarnsThenUsesPlayerDamageAndCoreShieldRules() throws Exception {
        boss.hp = 300; boss.warden.nextPulse = true; player.x = 1120;
        game.coreX = 1070; game.coreY = 1900; game.coreShield = 50;
        double coreHp = game.coreHp;
        update(.05); assertEquals(WardenRules.Action.PULSE_WARNING, boss.warden.action);
        update(.79); assertEquals(100, player.hp);
        update(.1); assertEquals(74, player.hp, 1e-6); assertEquals(24, game.coreShield, 1e-6);
        assertEquals(coreHp, game.coreHp);
        update(.1); assertEquals(74, player.hp, 1e-6);
    }
    @Test void snapshotExposesCurrentPhaseAndTelegraph() throws Exception {
        boss.hp = 300; boss.warden.nextPulse = true; update(.05);
        var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game)).path("enemies").get(0);
        assertEquals(3, snapshot.path("bossPhase").asInt());
        assertEquals("PULSE_WARNING", snapshot.path("bossAction").asText());
        assertEquals(160, snapshot.path("pulseRadius").asInt());
        assertEquals(.8, snapshot.path("actionRemaining").asDouble());
        assertEquals(.8, snapshot.path("actionDuration").asDouble());
    }
    @Test void defeatingBossCancelsAPendingPulse() throws Exception {
        boss.hp = 300; boss.warden.nextPulse = true; player.x = 1120;
        update(.05); boss.hp = 0; update(2);
        assertEquals(100, player.hp);
    }
    @Test void closeTargetsTriggerPulseInsteadOfBlockingFinalPhaseAbilities() throws Exception {
        boss.hp = 300; player.x = 1050;
        update(.05);
        assertEquals(WardenRules.Action.PULSE_WARNING, boss.warden.action);
    }
    @Test void selectedRoundsSpawnExactlyOneWardenWithoutIncreasingBossCount() throws Exception {
        for (int round : new int[]{16,32,48}) {
            game.enemies.clear(); game.round = round - 1;
            var begin = GameSession.class.getDeclaredMethod("beginRound"); begin.setAccessible(true); begin.invoke(game);
            int total = game.queuedBosses; game.queuedEnemies = 0; game.queuedTinyEnemies = 0;
            for (int i = 0; i < 100; i++) invoke("updateSpawning", 2);
            assertEquals(total, game.enemies.size());
            assertEquals(1, game.enemies.stream().filter(e -> e.type.equals("warden")).count());
            assertTrue(game.enemies.stream().allMatch(Enemy::isBoss));
        }
    }
    @Test void debugUsesNormalWardenScheduleAndNormalRestartRestoresCredits() throws Exception {
        game.setRoomOwner(player); game.phase = GamePhase.LOST; player.roomReady = true;
        game.handleMessage(player, "START:DEBUG");
        assertEquals(500_000, player.credits);
        var begin = GameSession.class.getDeclaredMethod("beginRound"); begin.setAccessible(true);
        for (int round : new int[]{1, 4, 5, 6, 10, 16, 32, 48}) {
            game.enemies.clear(); game.round = round - 1; begin.invoke(game);
            int total = game.queuedBosses;
            game.queuedEnemies = 0;
            game.queuedTinyEnemies = 0;
            for (int i = 0; i < 100; i++) invoke("updateSpawning", 2);
            assertEquals(total, game.enemies.size());
            assertEquals(WardenRules.appearsInRound(round) ? 1 : 0, game.enemies.stream().filter(e -> e.type.equals("warden")).count(), "Round " + round);
        }
        game.phase = GamePhase.LOST; player.roomReady = true;
        game.handleMessage(player, "START"); assertEquals(0, player.credits);
        game.round = 4; begin.invoke(game); assertEquals(0, game.queuedBosses);
        game.enemies.clear(); game.round = 15; begin.invoke(game);
        game.queuedEnemies = game.queuedTinyEnemies = 0;
        for (int i = 0; i < 100; i++) invoke("updateSpawning", 2);
        assertEquals(1, game.enemies.stream().filter(e -> e.type.equals("warden")).count());
    }

    void hitWith(String weapon) {
        player.weapons.grant(weapon); player.equipWeapon(weapon); player.cooldown = 0;
        player.x = boss.x + 70; player.y = boss.y;
        double hp = boss.hp;
        game.combat.attackAt(player, boss.x, boss.y);
        assertTrue(boss.hp < hp, "the hit must still deal damage");
    }

    @Test void repeatedHitsCannotCancelOrRedirectChargeWarning() throws Exception {
        boss.hp = 600; update(.05);
        double targetX = boss.warden.targetX, targetY = boss.warden.targetY;
        for (int i = 0; i < 5; i++) {
            hitWith("pistol"); update(.1);
            assertEquals(WardenRules.Action.CHARGE_WARNING, boss.warden.action);
            assertEquals(1020, boss.x); assertEquals(1900, boss.y);
            assertEquals(targetX, boss.warden.targetX); assertEquals(targetY, boss.warden.targetY);
        }
        update(.5); assertEquals(WardenRules.Action.CHARGING, boss.warden.action);
        update(.2); assertTrue(boss.x > 1020);
        assertTrue(player.hp < 100, "the announced charge still hits");
    }

    @Test void meleeHitCannotMoveOrCancelPendingPulse() throws Exception {
        boss.hp = 300; boss.warden.nextPulse = true; update(.05);
        hitWith("bat");
        assertEquals(1020, boss.x); assertEquals(1900, boss.y);
        update(1.2);
        assertEquals(74, player.hp, 1e-6);
        assertEquals(WardenRules.Action.IDLE, boss.warden.action);
    }

    @Test void hitCannotInterruptActiveCharge() throws Exception {
        boss.hp = 600; update(.05); update(1); update(.1);
        double x = boss.x;
        hitWith("pistol"); assertEquals(x, boss.x);
        update(.1);
        assertTrue(boss.x > x); assertEquals(WardenRules.Action.CHARGING, boss.warden.action);
    }

    @Test void idleWardenStillReceivesOrdinaryKnockback() {
        hitWith("bat");
        assertTrue(boss.x < 1020);
        assertEquals(WardenRules.Action.IDLE, boss.warden.action);
    }
    @Test void knockbackInterruptsChargeWarningInsteadOfChangingTheAnnouncedPath() throws Exception {
        boss.hp = 600; update(.05); boss.y += 30; update(.05);
        assertEquals(WardenRules.Action.IDLE, boss.warden.action);
        assertEquals(2, boss.specialCooldown); assertEquals(100, player.hp);
    }
    @Test void knockbackAlsoInterruptsAnActiveCharge() throws Exception {
        boss.hp = 600; update(.05); update(1); update(.1);
        boss.y += 30; double x = boss.x; update(.05);
        assertEquals(x, boss.x); assertEquals(WardenRules.Action.IDLE, boss.warden.action);
    }
    @Test void warningClearanceIncludesChargeWidthAndPulseSafetyMargin() {
        assertTrue(WardenRules.clearance(WardenRules.Action.CHARGE_WARNING, 0,0,360,0,180,0) < 0);
        assertTrue(WardenRules.clearance(WardenRules.Action.CHARGE_WARNING, 0,0,360,0,180,100) > 0);
        assertTrue(WardenRules.clearance(WardenRules.Action.CHARGING, 0,0,360,0,420,0) < 0);
        assertTrue(WardenRules.clearance(WardenRules.Action.PULSE_WARNING, 0,0,0,0,170,0) < 0);
        assertTrue(WardenRules.clearance(WardenRules.Action.PULSE_WARNING, 0,0,0,0,200,0) > 0);
        assertEquals(Double.POSITIVE_INFINITY, WardenRules.clearance(WardenRules.Action.IDLE,0,0,0,0,0,0));
    }
    @Test void cpuPrioritizesEscapingAPulseBeforeShooting() throws Exception {
        boss.hp = 300; boss.warden.nextPulse = true; player.x = 1120; update(.05);
        player.human = false; player.botTargetEnemyId = boss.id;
        invoke("updateBots", .05);
        assertTrue(Math.hypot(player.x + player.moveX * 30 - boss.x, player.y + player.moveY * 30 - boss.y) > 100,
                "moves away from the pulse origin: " + player.moveX + "," + player.moveY);
        assertFalse(player.firing); assertEquals(0, player.cooldown);
    }
}
