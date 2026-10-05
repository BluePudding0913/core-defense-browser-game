package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ShieldEnemyTest {
    GameSession game;
    Player player;
    Enemy shield;
    List<String> effects = new ArrayList<>();

    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { effects.add(message); }
            public void send(Player recipient, String message) { }
        });
        player = game.connectPlayer("shield-test");
        game.players.forEach(p -> p.human = true);
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        shield = new Enemy(9000, "shield", GameMap.SPAWN_POINTS.get(0), 2000, 20, 14, 100);
        shield.x = 1020; shield.y = 1900;
        shield.faceToward(1120, 1900);
        game.enemies.add(shield);
    }

    Object invoke(String name, Class<?>[] types, Object... args) throws Exception {
        Method method = GameSession.class.getDeclaredMethod(name, types);
        method.setAccessible(true);
        return method.invoke(game, args);
    }

    void shoot(String weapon, double x, double y) throws Exception {
        player.weapon = weapon; player.x = x; player.y = y;
        double dx = shield.x - x, dy = shield.y - y, length = Math.hypot(dx, dy);
        invoke("fireSegment", new Class<?>[]{Player.class, GameConfig.WeaponStats.class,
                double.class, double.class, double.class, double.class, double.class},
                player, GameSession.weaponStats(weapon), x, y, dx / length, dy / length, length + 30);
    }

    @Test void frontalArcHasClearBoundariesAndRotatesWithFacing() {
        for (double degrees : new double[]{0, 59, 60, -60}) {
            double radians = Math.toRadians(degrees);
            assertEquals(20, shield.shieldedDamage(100, shield.x + 100 * Math.cos(radians),
                    shield.y + 100 * Math.sin(radians)), .001);
        }
        for (double degrees : new double[]{61, 90, 180, -90}) {
            double radians = Math.toRadians(degrees);
            assertEquals(100, shield.shieldedDamage(100, shield.x + 100 * Math.cos(radians),
                    shield.y + 100 * Math.sin(radians)), .001);
        }
        shield.faceToward(shield.x, shield.y - 100);
        assertEquals(20, shield.shieldedDamage(100, shield.x, shield.y - 100));
        assertEquals(100, shield.shieldedDamage(100, shield.x + 100, shield.y));
        shield.faceToward(shield.x, shield.y);
        assertEquals(-1, shield.facingY);
    }

    @Test void bulletsAndPiercingWeaponsAreReducedAndRewardsUseReducedDamage() throws Exception {
        for (String weapon : List.of("pistol", "sniper", "revolver", "ricochet")) {
            shield.hp = 2000; shield.creditProgress = 0; shield.paidCredits = 0;
            player.credits = 0; effects.clear();
            shoot(weapon, 1120, 1900);
            double damage = GameSession.weaponStats(weapon).damage() * .2;
            assertEquals(2000 - damage, shield.hp, .001, weapon);
            assertEquals((int) Math.floor(100 * damage / 2000), player.credits, weapon);
            assertTrue(effects.stream().anyMatch(e -> e.contains("\"damage\":" + damage)), weapon);
            shield.hp = 2000;
            shoot(weapon, 920, 1900);
            assertEquals(2000 - GameSession.weaponStats(weapon).damage(), shield.hp, .001, weapon);
        }
        shield.hp = 2000;
        shoot("pistol", 1020, 2000);
        // This vertical shot also crosses the head, retaining the existing 2x bonus.
        assertEquals(2000 - GameSession.weaponStats("pistol").damage() * 2, shield.hp, .001);
    }

    @Test void meleeAndExplosionsBypassShield() throws Exception {
        shoot("bat", 1040, 1900);
        assertEquals(2000 - GameSession.weaponStats("bat").damage(), shield.hp, .001);
        shield.x = 1020; shield.y = 1900; shield.hp = 2000;
        TrapSlot mine = new TrapSlot("test-mine", shield.lane, 1040, 1900, null);
        mine.defense = new Defense("mine"); game.trapSlots.clear(); game.trapSlots.add(mine);
        invoke("updateDefenses", new Class<?>[]{double.class}, .05);
        assertEquals(1550, shield.hp);
        assertNull(mine.defense);
        shield.hp = 2000; player.weapon = "rocket"; player.x = 1120; player.y = 1900;
        invoke("fireRocket", new Class<?>[]{Player.class, GameConfig.WeaponStats.class,
                double.class, double.class, double.class}, player, GameSession.weaponStats("rocket"), -1., 0., 100.);
        assertTrue(2000 - shield.hp > GameSession.weaponStats("rocket").damage() * .5);
    }

    @Test void turretUsesItsOwnPositionAndReportsReducedDamage() throws Exception {
        game.round = 7; game.trapSlots.clear();
        TrapSlot turret = new TrapSlot("test-turret", shield.lane, 1120, 1900, null);
        turret.defense = new Defense("turret"); game.trapSlots.add(turret);
        invoke("updateDefenses", new Class<?>[]{double.class}, .05);
        assertEquals(2000 - (17 + 7 * .5) * .2, shield.hp, .001);
        shield.hp = 2000; turret.defense.cooldown = 0;
        shield.faceToward(920, 1900);
        invoke("updateDefenses", new Class<?>[]{double.class}, .05);
        assertEquals(2000 - (17 + 7 * .5), shield.hp, .001);
    }

    @Test void shieldFacesMovementAndAttackTargetsAndSnapshotMatches() throws Exception {
        invoke("moveEnemyToward", new Class<?>[]{Enemy.class, double.class, double.class, double.class},
                shield, 1020., 2000., 1.);
        assertEquals(0, shield.facingX, .001); assertEquals(1, shield.facingY, .001);
        TrapSlot block = new TrapSlot("test-block", shield.lane, shield.x - 20, shield.y, null);
        block.defense = new Defense("block");
        invoke("attackDefense", new Class<?>[]{Enemy.class, TrapSlot.class}, shield, block);
        assertEquals(-1, shield.facingX, .001);
        var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals(-1, snapshot.path("enemies").get(0).path("facingX").asDouble());
        assertEquals(0, snapshot.path("enemies").get(0).path("facingY").asDouble());
    }

    @Test void shieldIsSlowerThanGruntAndDoesNotChangeOtherEnemiesDamage() throws Exception {
        game.round = 7;
        invoke("spawnEnemy", new Class<?>[]{String.class, SpawnPoint.class}, "shield", GameMap.SPAWN_POINTS.get(0));
        invoke("spawnEnemy", new Class<?>[]{String.class, SpawnPoint.class}, "grunt", GameMap.SPAWN_POINTS.get(0));
        Enemy spawned = game.enemies.get(1), grunt = game.enemies.get(2);
        assertTrue(spawned.speed < grunt.speed);
        assertTrue(spawned.maxHp > grunt.maxHp);
        assertFalse(spawned.isBoss());
        assertEquals(100, grunt.shieldedDamage(100, grunt.x, grunt.y + 100));
    }
}
