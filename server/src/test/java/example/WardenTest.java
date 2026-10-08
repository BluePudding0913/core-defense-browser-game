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
        update(1); assertEquals(WardenRules.Action.CHARGING, boss.warden.action);
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
        update(1.1); assertEquals(100, player.hp);
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
        assertEquals(1.2, snapshot.path("actionRemaining").asDouble());
        assertEquals(1.2, snapshot.path("actionDuration").asDouble());
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
}
