package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class SpyDetectionTest {
    Enemy enemy(int id) {
        Enemy enemy = new Enemy(id, "grunt", GameMap.SPAWN_POINTS.get(0), 1000, 0, 10, 100);
        enemy.x = 1140; enemy.y = 1880; return enemy;
    }
    Player spy() {
        Player player = new Player(1); player.job = "spy"; player.spyRemaining = 8;
        player.x = 1140; player.y = 1900; player.hp = 100; return player;
    }
    @Test void eightyPercentAreConcealedAndTwentyPercentAreDetectedAtBoundary() {
        int detected = 0;
        for (int i = 0; i < 100; i++) {
            Player spy = spy(); Enemy enemy = enemy(i);
            final double roll = i / 100.0;
            JobRules.recordSpyAttack(spy, enemy, () -> roll);
            if (!JobRules.concealedFrom(spy, enemy)) detected++;
        }
        assertEquals(20, detected);
    }
    @Test void repeatedHitsDoNotRerollAndOtherEnemiesRemainIndependent() {
        Player spy = spy(); Enemy first = enemy(1), second = enemy(2);
        JobRules.recordSpyAttack(spy, first, () -> .79);
        for (int i = 0; i < 100; i++) JobRules.recordSpyAttack(spy, first, () -> { fail("Only one roll per enemy per disguise"); return 1; });
        assertTrue(JobRules.concealedFrom(spy, first));
        JobRules.recordSpyAttack(spy, second, () -> .8);
        assertFalse(JobRules.concealedFrom(spy, second));
        assertTrue(JobRules.disguised(spy));
        assertFalse(JobRules.avoidsContactDamage(spy, second));
        assertTrue(JobRules.avoidsContactDamage(spy, first));
    }
    @Test void navigationDropsCachedHiddenSpiesAndRecognizesExposedSpies() {
        Player spy = spy(); Enemy enemy = enemy(1); EnemyNavigation navigation = new EnemyNavigation();
        navigation.prepare(1020,1900,Set.of());
        enemy.visiblePlayer = spy; enemy.perceptionTimer = 1;
        assertNull(navigation.visiblePlayer(enemy, List.of(spy), .05));
        JobRules.recordSpyAttack(spy, enemy, () -> 1);
        assertSame(spy, navigation.visiblePlayer(enemy, List.of(spy), .05));
    }
    @Test void combatRecordsExposureOnlyForActualDamageAndKeepsDamageRewards() {
        Player spy = spy(); Enemy enemy = enemy(1);
        var combat = new CombatSystem(new CombatSystem.World() {
            public boolean canAttack() { return true; }
            public Set<String> unlockedAreas() { return Set.of(); }
            public List<Enemy> enemies() { return List.of(enemy); }
            public List<Player> players() { return List.of(spy); }
            public void damagePlayer(Player player, double damage) { player.hp -= damage; }
            public boolean canOccupy(double x, double y, double radius) { return true; }
            public void onEnemyDefeated(Enemy target) { }
        }, new GameEffects(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player recipient, String message) { }
        }), () -> 1);
        combat.damageEnemy(enemy, 0, spy); assertTrue(spy.spyCheckedEnemies.isEmpty());
        combat.damageEnemy(enemy, 100, null); assertTrue(spy.spyCheckedEnemies.isEmpty());
        combat.damageEnemy(enemy, 100, spy);
        assertFalse(JobRules.concealedFrom(spy, enemy));
        assertEquals(800, enemy.hp); assertEquals(10, spy.credits);
    }
    @Test void reactivatingDisguiseClearsExposureAndRestoresProtection() {
        var game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player recipient, String message) { }
        });
        Player player = game.connectPlayer("spy-detection"); player.job = "spy";
        game.phase = GamePhase.PREPARING;
        player.spyHostileEnemies.add(1); player.spyCheckedEnemies.add(1);
        game.handleMessage(player, "JOB_ABILITY");
        assertTrue(player.spyHostileEnemies.isEmpty()); assertTrue(player.spyCheckedEnemies.isEmpty());
        assertEquals(JobRules.SPY_DURATION, player.spyRemaining);
        assertTrue(JobRules.concealedFrom(player, enemy(1)));
        player.spyRemaining = 0; assertFalse(JobRules.concealedFrom(player, enemy(1)));
    }
}
