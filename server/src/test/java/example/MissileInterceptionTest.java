package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.*;
import com.fasterxml.jackson.databind.ObjectMapper;

class MissileInterceptionTest {
    GameSession game; Player player; List<String> messages;
    @BeforeEach void setup() {
        messages = new ArrayList<>();
        game = new GameSession(new GameEventSink() {
            public void broadcast(String s) { messages.add(s); }
            public void send(Player p, String s) {}
        });
        player = game.connectPlayer("interception"); game.setRoomOwner(player);
        game.handleMessage(player, "START"); game.phase = GamePhase.WAVE;
        game.players.clear(); game.players.add(player); player.human = true;
        game.enemies.clear(); game.trapSlots.clear();
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        player.x = 1020; player.y = 1900;
    }
    Enemy enemy(double x, double y) {
        Enemy enemy = new Enemy(100, "seeker", GameMap.SPAWN_POINTS.get(0), 1000, 0, 30, 30);
        enemy.x = x; enemy.y = y; return enemy;
    }
    EnemyProjectileSystem.Shot shot(double x, double y) {
        var shot = new EnemyProjectileSystem.Shot(game.enemyProjectiles.size(), enemy(x, y), player);
        game.enemyProjectiles.add(shot); return shot;
    }
    void shoot(String weapon) {
        player.weapons.grant(weapon); player.equipWeapon(weapon); player.cooldown = 0;
        player.firing = true;
        game.combat.attackAt(player, 1220, 1900);
        if (weapon.equals("railgun")) game.combat.updateRailgun(player, GameConfig.RAILGUN_CHARGE + .1);
        if (weapon.equals("rocket")) game.combat.updateRockets(.5);
    }
    @Test void rayIntersectionRejectsMissesAndFindsTheFrontOfTheMissile() {
        var shot = shot(1120, 1900);
        assertEquals(90, EnemyProjectileSystem.rayEntry(shot, 1020, 1900, 1, 0, 200, 2));
        assertFalse(Double.isFinite(EnemyProjectileSystem.rayEntry(shot, 1020, 1900, -1, 0, 200, 2)));
        assertFalse(Double.isFinite(EnemyProjectileSystem.rayEntry(shot, 1020, 1880, 1, 0, 200, 2)));
        assertFalse(Double.isFinite(EnemyProjectileSystem.rayEntry(shot, 1020, 1900, 1, 0, 80, 2)));
    }
    @Test void directWeaponsDestroyMissilesWithoutGoldOrEnemyKill() throws Exception {
        for (String weapon : List.of("bat", "pistol", "shotgun", "smg", "rifle", "sniper", "revolver",
                "ricochet", "lmg", "laserCannon", "freezeGun", "flamethrower", "plasmaBlade", "railgun", "rocket")) {
            setup(); shot(1070, 1900);
            int credits = player.credits; int kills = player.kills;
            shoot(weapon);
            assertTrue(game.enemyProjectiles.isEmpty(), weapon);
            assertEquals(credits, player.credits, weapon); assertEquals(kills, player.kills, weapon);
            assertTrue(new ObjectMapper().readTree(SnapshotBuilder.build(game)).path("projectiles").isEmpty(), weapon);
        }
        assertTrue(messages.stream().anyMatch(s -> s.contains("\"effect\":\"intercept\"")));
    }
    @Test void secondaryGunAndControlledDroneUseTheSameInterception() {
        player.job = "attacker"; player.equipWeapon("bat"); player.secondaryWeapon = "pistol";
        shot(1120, 1900); game.combat.attackSecondary(player, 1220, 1900);
        assertTrue(game.enemyProjectiles.isEmpty());
        player.job = "drone"; player.drone = new Drone();
        player.drone.active = true; player.drone.controlled = true; player.drone.weapon = "pistol";
        player.drone.x = player.x; player.drone.y = player.y;
        shot(1120, 1900); game.combat.attackAt(player, 1220, 1900);
        assertTrue(game.enemyProjectiles.isEmpty());
    }
    @Test void ordinaryBulletStopsAtMissileBeforeEnemyAndCannotHitMissileBehindEnemy() {
        Enemy enemy = enemy(1180, 1900); game.enemies.add(enemy); shot(1120, 1900);
        shoot("pistol"); assertTrue(game.enemyProjectiles.isEmpty()); assertEquals(1000, enemy.hp);
        enemy.x = 1080; shot(1120, 1900);
        shoot("pistol"); assertEquals(1, game.enemyProjectiles.size()); assertTrue(enemy.hp < 1000);
    }
    @Test void piercingBulletDestroysMultipleMissilesAndStillDamagesEnemy() {
        Enemy enemy = enemy(1180, 1900); game.enemies.add(enemy);
        shot(1080, 1900); shot(1120, 1900);
        shoot("sniper"); assertTrue(game.enemyProjectiles.isEmpty()); assertTrue(enemy.hp < 1000);
    }
    @Test void missedShotAndWallsDoNotDestroyMissiles() {
        var shot = shot(1120, 1940); shoot("pistol"); assertEquals(1, game.enemyProjectiles.size());
        shot.x = 1240; shot.y = 1580; player.y = 1580;
        player.cooldown = 0; game.combat.attackAt(player, shot.x, shot.y);
        assertEquals(1, game.enemyProjectiles.size());
        game.combat.missileImpact(player, player.x, player.y);
        assertEquals(1, game.enemyProjectiles.size());
    }
    @Test void missileExplosionDestroysNearbyShotsAndPreventsLaterPlayerDamage() {
        shot(1120, 1900); game.combat.missileImpact(player, 1120, 1900);
        assertTrue(game.enemyProjectiles.isEmpty());
        EnemyProjectileSystem.update(game.enemyProjectiles, 1, new EnemyProjectileSystem.World() {
            public List<Player> players() { return game.players; }
            public List<TrapSlot> slots() { return game.trapSlots; }
            public Set<String> unlocked() { return game.unlockedAreas; }
            public void damage(Player p, double amount) { fail("Intercepted missile must not hit"); }
        });
        assertEquals(100, player.hp);
    }
}
