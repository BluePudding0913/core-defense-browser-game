package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class SpyFriendlyFireTest {
    GameSession game;
    Player shooter, spy;
    final List<String> messages = new ArrayList<>();

    @BeforeEach void setup() {
        messages.clear();
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { messages.add(message); }
            public void send(Player player, String message) { }
        });
        game.phase = GamePhase.WAVE;
        game.players.forEach(player -> { player.human = true; player.x = 980; player.y = 1820; });
        shooter = game.players.get(0); shooter.x = 1020; shooter.y = 1900;
        spy = game.players.get(1); spy.x = 1100; spy.y = 1900;
        spy.job = "spy"; spy.spyRemaining = 8;
    }

    Object call(String name, Class<?>[] types, Object... args) throws Exception {
        Method method = GameSession.class.getDeclaredMethod(name, types);
        method.setAccessible(true);
        return method.invoke(game, args);
    }

    Enemy enemy(double x) {
        Enemy enemy = new Enemy(99, "grunt", GameMap.SPAWN_POINTS.get(0), 1000, 0, 0, 100);
        enemy.x = x; enemy.y = 1900; game.enemies.add(enemy);
        return enemy;
    }

    void shoot(String weapon, double x, double y) {
        shooter.weapons.grant(weapon); shooter.equipWeapon(weapon);
        shooter.cooldown = 0; shooter.firing = false;
        game.handleMessage(shooter, "FIRE:" + x + ":" + y + ":1");
    }

    @Test void rangedWeaponsHurtOnlyDisguisedAlliesWithoutRewards() {
        for (String weapon : List.of("pistol", "smg", "rifle", "shotgun", "lmg", "sniper", "revolver", "ricochet")) {
            setup();
            shoot(weapon, spy.x, spy.y);
            assertTrue(spy.hp < 100, weapon);
            assertEquals(GameConfig.MEDBAY_DAMAGE_DELAY, spy.medbayDamageDelay);
            assertEquals(0, shooter.credits);
            assertEquals(0, shooter.kills);
            assertTrue(messages.stream().anyMatch(message -> message.contains("player-hit") && message.contains(spy.id)));
        }
    }

    @Test void ordinaryAlliesExpiredDisguiseSelfAndMeleeAreSafe() {
        spy.spyRemaining = 0;
        shoot("pistol", spy.x, spy.y);
        assertEquals(100, spy.hp);
        spy.job = "healer"; spy.spyRemaining = 8;
        shoot("pistol", spy.x, spy.y);
        assertEquals(100, spy.hp);
        spy.job = "spy";
        shoot("bat", spy.x, spy.y);
        assertEquals(100, spy.hp);
        shooter.job = "spy"; shooter.spyRemaining = 8;
        spy.x = 1100; spy.y = 1820;
        shoot("pistol", shooter.x, shooter.y);
        assertEquals(100, shooter.hp);
        spy.down = true; spy.hp = 0; spy.x = 1100; spy.y = 1900;
        shoot("pistol", spy.x, spy.y);
        assertEquals(0, spy.hp);
    }

    @Test void singleBulletStopsAtFirstTargetWhilePiercingPassesThrough() {
        Enemy enemy = enemy(1180);
        shoot("pistol", enemy.x, enemy.y);
        assertEquals(74, spy.hp);
        assertEquals(1000, enemy.hp, "spy blocks a non-piercing bullet");
        setup(); spy.x = 1180; enemy = enemy(1100);
        shoot("pistol", spy.x, spy.y);
        assertEquals(100, spy.hp, "enemy in front blocks the shot");
        assertTrue(enemy.hp < 1000);
        setup(); enemy = enemy(1180);
        shoot("sniper", enemy.x, enemy.y);
        assertTrue(spy.down);
        assertTrue(enemy.hp < 1000, "piercing shot continues through spy");
    }

    @Test void offAxisOutOfRangeAndWallsPreventFriendlyHits() {
        spy.y = 1820;
        shoot("pistol", 1200, 1900);
        assertEquals(100, spy.hp);
        spy.x = 1300; spy.y = 1900;
        shoot("pistol", spy.x, spy.y);
        assertEquals(100, spy.hp);
        shooter.x = 900; shooter.y = 600; spy.x = 1000; spy.y = 600;
        shoot("sniper", spy.x, spy.y);
        assertEquals(100, spy.hp, "solid wall blocks friendly fire");
    }

    @Test void ricochetCanHitDisguisedAllyOnReflectedSegment() {
        spy.x = 1000;
        shoot("ricochet", 1220, 1900);
        assertEquals(70, spy.hp);
    }

    @Test void railgunAndRocketUseExistingDownAndDamageNotifications() throws Exception {
        Enemy enemy = enemy(1180);
        shoot("railgun", enemy.x, enemy.y);
        game.phase = GamePhase.PREPARING; game.prepTime = 1000;
        game.update(GameConfig.RAILGUN_CHARGE + GameConfig.RAILGUN_TICK);
        assertTrue(spy.down);
        assertTrue(enemy.hp < 1000);
        assertTrue(messages.stream().anyMatch(message -> message.contains("player-down") && message.contains(spy.id)));
        setup();
        shoot("rocket", 1200, 1900);
        assertTrue(spy.down);
        assertEquals(0, shooter.credits);
        assertEquals(0, shooter.kills);
        assertEquals(100, shooter.hp, "shooter cannot hit themself");
    }

    @Test void cpuNeverTargetsSpyButCanAccidentallyHitWhileAimingAtEnemy() throws Exception {
        shooter.human = false; shooter.botSpendCooldown = 1000;
        for (int i = 0; i < 40; i++) call("updateBots", new Class<?>[]{double.class}, .05);
        assertEquals(-1, shooter.botTargetEnemyId);
        assertEquals(0, shooter.cooldown);
        assertEquals(100, spy.hp);
        shooter.x = 1020; shooter.y = 1900; shooter.moveX = shooter.moveY = 0;
        Enemy enemy = enemy(1180);
        for (int i = 0; i < 30; i++) call("updateBots", new Class<?>[]{double.class}, .05);
        assertEquals(enemy.id, shooter.botTargetEnemyId);
        assertTrue(spy.hp < 100, "CPU fires at enemy through disguised ally");
        assertEquals(1000, enemy.hp);
    }

    @Test void sharedEligibilityRequiresAnotherLivingDisguisedSpy() {
        assertTrue(JobRules.canHitDisguisedAlly(shooter, spy));
        assertFalse(JobRules.canHitDisguisedAlly(spy, spy));
        spy.down = true;
        assertFalse(JobRules.canHitDisguisedAlly(shooter, spy));
        spy.down = false; spy.spyRemaining = 0;
        assertFalse(JobRules.canHitDisguisedAlly(shooter, spy));
    }
}
