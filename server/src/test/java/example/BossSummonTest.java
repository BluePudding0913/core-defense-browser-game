package example;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.*;
import com.fasterxml.jackson.databind.ObjectMapper;

class BossSummonTest {
    GameSession game; Player player; Enemy boss;
    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String s) {}
            public void send(Player p, String s) {}
        });
        player = game.connectPlayer("summon-test"); game.players.clear(); game.players.add(player); game.trapSlots.clear();
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        game.phase = GamePhase.WAVE; game.round = 24; game.roundEnemyTotal = 20;
        game.queuedEnemies = 7; game.queuedBosses = 1;
        player.x = 1220; player.y = 1900;
        game.coreX = 980; game.coreY = 1980;
        boss = new Enemy(9900, "warlord", GameMap.SPAWN_POINTS.get(0), 10000, 50, 68, 100);
        boss.x = 1020; boss.y = 1900; boss.specialCooldown = 0; game.enemies.add(boss);
    }
    void update(double dt) throws Exception {
        var method = GameSession.class.getDeclaredMethod("updateEnemies", double.class); method.setAccessible(true); method.invoke(game, dt);
    }
    void warn() throws Exception {
        boss.nextSummon = true; boss.specialCooldown = 0; update(.05);
        assertEquals(1, boss.summonRemaining);
    }
    @Test void salvoThenWarningThenEighteenOrdinaryEnemies() throws Exception {
        update(.05); assertEquals(3, game.artilleryShells.size()); assertTrue(boss.nextSummon);
        game.artilleryShells.clear(); boss.specialCooldown = 0; update(.05);
        assertEquals(1, boss.summonRemaining); assertFalse(boss.nextSummon);
        var json = new ObjectMapper().readTree(SnapshotBuilder.build(game)).path("enemies").get(0);
        assertEquals("SUMMON_WARNING", json.path("bossAction").asText());
        assertEquals(1, json.path("actionDuration").asDouble()); assertEquals(1, json.path("actionRemaining").asDouble());
        update(.99); assertEquals(1, game.enemies.size()); assertEquals(1020, boss.x); assertEquals(1900, boss.y);
        update(.02); assertEquals(19, game.enemies.size()); assertEquals(0, boss.summonRemaining);
        assertEquals(12, game.enemies.stream().filter(e -> e.type.equals("runner")).count());
        assertEquals(6, game.enemies.stream().filter(e -> e.type.equals("armored")).count());
        assertTrue(game.enemies.stream().skip(1).allMatch(e -> e.summonerId == boss.id && e.hp > 0 && e.reward > 0));
        assertEquals(38, game.roundEnemyTotal); assertEquals(7, game.queuedEnemies); assertEquals(1, game.queuedBosses);
        assertEquals(8, boss.specialCooldown); boss.specialCooldown = 0; update(.05);
        assertEquals(3, game.artilleryShells.size()); assertEquals(0, boss.summonRemaining);
    }
    @Test void deathCancelsPendingSummonAndFreezeAndHookPauseIt() throws Exception {
        warn(); boss.frozenRemaining = 1; update(.5); assertEquals(1, boss.summonRemaining);
        boss.frozenRemaining = 0; boss.hookPulled = true; update(.5); assertEquals(1, boss.summonRemaining);
        boss.hookPulled = false; boss.hp = 0; update(10); assertEquals(1, game.enemies.size());
        assertEquals(20, game.roundEnemyTotal);
    }
    @Test void summonedEnemiesCannotAccumulateBeyondThirtySixAlive() throws Exception {
        warn(); update(1); assertEquals(19, game.enemies.size());
        warn(); update(1); assertEquals(37, game.enemies.size());
        boss.specialCooldown = 0; boss.nextSummon = true; update(.05);
        assertEquals(0, boss.summonRemaining); assertEquals(3, game.artilleryShells.size());
        game.enemies.stream().filter(e -> e.summonerId == boss.id).limit(18).forEach(e -> e.hp = 0);
        game.artilleryShells.clear(); warn(); update(1);
        assertEquals(36, game.enemies.stream().filter(e -> e.summonerId == boss.id && e.hp > 0).count());
    }
    @Test void placementStaysInReachableUnlockedFloorNearAWall() throws Exception {
        boss.x = 820; boss.y = 1820; player.x = 900; player.y = 1820;
        warn(); update(1);
        assertEquals(19, game.enemies.size());
        assertTrue(game.enemies.stream().skip(1).allMatch(e -> GameMap.canOccupy(e.x, e.y, 17, game.unlockedAreas)
                && GameMap.hasClearLine(boss.x, boss.y, e.x, e.y, game.unlockedAreas)));
    }
    @Test void summonsPayCombatRewardsAndPreventPrematureRoundCompletion() throws Exception {
        warn(); update(1);
        Enemy minion = game.enemies.get(1); int gold = player.credits;
        game.combat.damageEnemy(minion, minion.maxHp, player); assertTrue(player.credits > gold);
        game.enemies.removeIf(e -> e.hp <= 0 || e == boss);
        game.queuedEnemies = game.queuedBosses = 0; game.update(.05);
        assertEquals(GamePhase.WAVE, game.phase); assertFalse(game.enemies.isEmpty());
    }
}
