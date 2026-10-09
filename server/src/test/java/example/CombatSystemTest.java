package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class CombatSystemTest {
    @Test void spyPistolDealsTripleDamageWithHeadshotsAndSilverButOtherJobsAndWeaponsStayNormal() {
        for (String job : List.of("spy", "healer", "attacker")) {
            for (String weapon : List.of("pistol", "smg")) {
                for (boolean silver : List.of(false, true)) {
                    var world = new World(); world.active = true;
                    var combat = new CombatSystem(world, new Events(), () -> 0);
                    var player = shooter(weapon, silver); player.job = job;
                    var enemy = new Enemy(1, "grunt", GameMap.SPAWN_POINTS.get(0), 1000, 0, 0, 0);
                    enemy.x = player.x + 100; enemy.y = player.y;
                    world.enemies.add(enemy);
                    combat.attackAt(player, enemy.x, enemy.y);
                    double base = WeaponCatalog.stats(weapon).damage();
                    double multiplier = job.equals("spy") && weapon.equals("pistol") ? 3 : 1;
                    assertEquals(1000 - base * multiplier * (silver ? 2 : 1), enemy.hp, 1e-9);
                    player.cooldown = 0; enemy.hp = 1000;
                    combat.attackAt(player, enemy.x, enemy.y - 10.5);
                    assertEquals(1000 - base * multiplier * (silver ? 2 : 1) * 2, enemy.hp, 1e-9);
                }
            }
        }
    }

    @Test void combatRewardsUseTheWeaponMultiplierAndNeverRepeatAfterDeath() {
        for (var weapon : WeaponCatalog.ALL) {
            var world = new World();
            var combat = new CombatSystem(world, new Events());
            var player = shooter(weapon.id(), false);
            var enemy = new Enemy(1, "grunt", GameMap.SPAWN_POINTS.get(0), 100, 0, 0, 100);
            combat.damageEnemy(enemy, 1000, player);
            int expected = (int) Math.round(100 * weapon.goldMultiplier());
            assertEquals(expected, player.credits, weapon.id());
            combat.damageEnemy(enemy, 1000, player);
            assertEquals(expected, player.credits, weapon.id());
        }
    }

    @Test void missilesHaveTheirOwnRewardRateRegardlessOfEquippedWeapon() {
        for (String weapon : List.of("bat", "pistol", "railgun")) {
            var world = new World(); world.active = true;
            var combat = new CombatSystem(world, new Events());
            var player = shooter(weapon, false);
            var enemy = new Enemy(1, "grunt", GameMap.SPAWN_POINTS.get(0), 100, 0, 0, 100);
            enemy.x = 1100; enemy.y = 1900; world.enemies.add(enemy);
            combat.missileImpact(player, 1100, 1900);
            assertEquals(40, player.credits, weapon);
        }
    }

    @Test void subWeaponRewardsUseTheSubWeaponRateAndSnapshotsPublishRates() throws Exception {
        var world = new World(); world.active = true;
        var combat = new CombatSystem(world, new Events());
        var player = shooter("smg", false); player.job = "attacker";
        player.equipWeapon("bat"); player.equipSecondaryWeapon("smg");
        var enemy = new Enemy(1, "grunt", GameMap.SPAWN_POINTS.get(0), 18, 0, 0, 100);
        enemy.x = 1100; enemy.y = 1900; world.enemies.add(enemy);
        combat.attackSecondary(player, 1100, 1900);
        assertEquals(100, player.credits);
        var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(
                SnapshotBuilder.build(new GameSession(new GameEventSink() {
                    public void broadcast(String message) { }
                    public void send(Player p, String message) { }
                })));
        for (var weapon : WeaponCatalog.ALL) assertEquals(weapon.goldMultiplier(),
                snapshot.path("rules").path("weapons").path(weapon.id()).path("goldMultiplier").asDouble());
    }

    @Test void rightHandUsesTheSameDamageAmmoAndCooldownRulesForEveryWeaponMode() {
        for (var definition : WeaponCatalog.ALL) {
            String weapon = definition.id();
            double[] damage = new double[2];
            for (int hand = 0; hand < 2; hand++) {
                var world = new World(); world.active = true;
                var combat = new CombatSystem(world, new Events());
                var player = shooter(weapon, true);
                var enemy = target(world, 1, 1100);
                int ammo = player.weapons.ammo(weapon);
                if (hand == 0) {
                    player.firing = true; player.aimX = 1100; player.aimY = 1900;
                    combat.attackAt(player, 1100, 1900);
                    if (weapon.equals("railgun")) combat.updateRailgun(player, GameConfig.RAILGUN_CHARGE + .1);
                } else {
                    player.equipWeapon(weapon.equals("pistol") ? "bat" : "pistol"); player.job = "attacker";
                    player.equipSecondaryWeapon(weapon); player.secondaryFiring = true;
                    player.secondaryAimX = 1100; player.secondaryAimY = 1900;
                    combat.attackSecondary(player, 1100, 1900);
                    if (weapon.equals("railgun")) combat.updateSecondaryRailgun(player, GameConfig.RAILGUN_CHARGE + .1);
                    assertEquals(weapon.equals("pistol") ? "bat" : "pistol", player.weapon, weapon);
                    assertEquals(0, player.cooldown, weapon);
                    if (!weapon.equals("railgun")) assertEquals(definition.stats().cooldown(), player.secondaryCooldown, weapon);
                }
                damage[hand] = enemy.maxHp - enemy.hp;
                assertEquals(ammo - (definition.capacity() > 0 ? 1 : 0), player.weapons.ammo(weapon), weapon);
                assertEquals(SilverAmmoRules.eligible(weapon) ? 9 : 10, player.weapons.silverAmmo(), weapon);
            }
            if (weapon.equals("hook")) assertEquals(0, damage[0], weapon);
            else assertTrue(damage[0] > 0, weapon);
            assertEquals(damage[0], damage[1], 1e-7, weapon);
        }
    }

    private static Player shooter(String weapon, boolean silver) {
        var player = new Player(1);
        player.x = 1020; player.y = 1900;
        if (!weapon.equals("bat")) player.weapons.grant(weapon);
        player.equipWeapon(weapon);
        if (silver) assertTrue(player.weapons.buySilverAmmo(1));
        return player;
    }

    private static Enemy target(World world, int id, double x) {
        var enemy = new Enemy(id, "grunt", GameMap.SPAWN_POINTS.get(0), 100000, 0, 0, 0);
        enemy.x = x; enemy.y = 1900;
        world.enemies.add(enemy);
        return enemy;
    }

    @Test void silverBoostsAllBulletWeaponsAndConsumesOnePerTriggerIncludingSpreadAndPiercing() {
        for (String weapon : List.of("pistol", "shotgun", "smg", "rifle", "sniper", "ricochet", "revolver", "lmg")) {
            double[] damage = new double[2];
            for (int variant = 0; variant < 2; variant++) {
                var world = new World(); world.active = true;
                var combat = new CombatSystem(world, new Events());
                var player = shooter(weapon, variant == 1);
                var first = target(world, 1, 1100);
                var second = target(world, 2, 1180);
                int normalAmmo = player.weapons.ammo(weapon);
                combat.attackAt(player, 1400, 1900);
                damage[variant] = 200000 - first.hp - second.hp;
                assertEquals(variant == 1 ? 9 : 0, player.weapons.silverAmmo(), weapon);
                if (WeaponCatalog.capacity(weapon) > 0) assertEquals(normalAmmo - 1, player.weapons.ammo(weapon));
                if (WeaponCatalog.find(weapon).piercing()) assertTrue(second.hp < second.maxHp, weapon);
            }
            assertTrue(damage[0] > 0, weapon);
            assertEquals(damage[0] * 2.0, damage[1], 1e-7, weapon);
        }
    }

    @Test void silverIsSpentOnMissesButNotBlockedOrEmptyShotsAndLastRoundKeepsItsBoost() {
        var world = new World(); world.active = true;
        var combat = new CombatSystem(world, new Events());
        var player = shooter("smg", true);
        player.cooldown = 1; combat.attackAt(player, 1400, 1900);
        assertEquals(10, player.weapons.silverAmmo());
        player.cooldown = 0; player.weapons.setAmmo("smg", 0);
        combat.attackAt(player, 1400, 1900);
        assertEquals(10, player.weapons.silverAmmo());
        player.weapons.setAmmo("smg", 20);
        for (int i = 0; i < 9; i++) {
            player.cooldown = 0; combat.attackAt(player, 1400, 1900);
        }
        assertEquals(1, player.weapons.silverAmmo());
        var enemy = target(world, 1, 1100);
        player.cooldown = 0; combat.attackAt(player, 1400, 1900);
        double boosted = enemy.maxHp - enemy.hp;
        assertEquals(0, player.weapons.silverAmmo());
        double before = enemy.hp;
        player.cooldown = 0; combat.attackAt(player, 1400, 1900);
        assertEquals((before - enemy.hp) * 2.0, boosted, 1e-7);
    }

    @Test void excludedWeaponsAndMissilesNeitherSpendSilverNorGainDamage() {
        for (String weapon : List.of("bat", "rocket", "flamethrower", "railgun")) {
            double[] damage = new double[2];
            for (int variant = 0; variant < 2; variant++) {
                var world = new World(); world.active = true;
                var combat = new CombatSystem(world, new Events());
                var player = shooter(weapon, variant == 1);
                var enemy = target(world, 1, 1100);
                player.firing = true; player.aimX = 1100; player.aimY = 1900;
                combat.attackAt(player, 1100, 1900);
                if (weapon.equals("railgun")) combat.updateRailgun(player, GameConfig.RAILGUN_CHARGE + .1);
                damage[variant] = enemy.maxHp - enemy.hp;
                assertEquals(variant == 1 ? 10 : 0, player.weapons.silverAmmo(), weapon);
            }
            assertTrue(damage[0] > 0, weapon);
            assertEquals(damage[0], damage[1], 1e-7, weapon);
        }
        var world = new World(); world.active = true;
        var combat = new CombatSystem(world, new Events());
        var player = shooter("pistol", true);
        var enemy = target(world, 1, 1100);
        combat.missileImpact(player, 1100, 1900);
        assertEquals(MissileRules.damage(), enemy.maxHp - enemy.hp, 1e-7);
        assertEquals(10, player.weapons.silverAmmo());
    }

    @Test void secondaryPistolAndDroneShareSilverAmmoWithTheOwner() {
        var world = new World(); world.active = true;
        var combat = new CombatSystem(world, new Events());
        var player = shooter("smg", true); player.job = "attacker"; player.equipSecondaryWeapon("pistol");
        var enemy = target(world, 1, 1100);
        combat.attackSecondary(player, 1400, 1900);
        assertEquals(9, player.weapons.silverAmmo());
        double enhancedPistolDamage = enemy.maxHp - enemy.hp;
        var ordinary = shooter("pistol", false);
        double before = enemy.hp;
        combat.attackAt(ordinary, 1400, 1900);
        assertEquals((before - enemy.hp) * 2.0, enhancedPistolDamage, 1e-7);
        player.drone = new Drone(); player.drone.active = true; player.drone.controlled = true;
        player.drone.weapon = "smg"; player.drone.x = player.x; player.drone.y = player.y;
        before = enemy.hp;
        combat.attackAt(player, 1400, 1900);
        assertEquals(8, player.weapons.silverAmmo());
        ordinary.weapon = "smg"; ordinary.weapons.grant("smg"); ordinary.cooldown = 0;
        double droneDamage = before - enemy.hp; before = enemy.hp;
        combat.attackAt(ordinary, 1400, 1900);
        assertEquals((before - enemy.hp) * 2.0, droneDamage, 1e-7);
    }

    private static final class World implements CombatSystem.World {
        boolean active;
        int deaths;
        final List<Enemy> enemies = new ArrayList<>();
        public boolean canAttack() { return active; }
        public java.util.Set<String> unlockedAreas() {
            return GameMap.AREAS.stream().map(UnlockArea::id).collect(java.util.stream.Collectors.toSet());
        }
        public List<Enemy> enemies() { return enemies; }
        public List<Player> players() { return List.of(); }
        public void damagePlayer(Player player, double damage) { fail("No player targets in this fixture"); }
        public boolean canOccupy(double x, double y, double radius) { return true; }
        public void onEnemyDefeated(Enemy enemy) { deaths++; }
    }

    private static final class Events implements CombatEvents {
        int shots, feedback;
        record Segment(double fromX, double fromY, double x, double y) {
            double length() { return Math.hypot(x - fromX, y - fromY); }
        }
        final List<Segment> trajectories = new ArrayList<>();
        public void hit(String playerId, String weapon, double fromX, double fromY,
                double x, double y, double damage, boolean defeated, int credits, boolean headshot, Integer enemyId) {
            if (enemyId == null) trajectories.add(new Segment(fromX, fromY, x, y));
        }
        public void sound(Player player, String effect, String item) { shots++; }
        public void explosion(double x, double y, double radius) { }
        public void outOfAmmo(Player player) { feedback++; }
    }

    @Test void ricochetSharesItsRangeAcrossZeroOneAndTwoReflections() {
        // Open floor, one wall, and a narrow corridor with two wall hits.
        double[][] origins = {{100, 100}, {1020, 1900}, {1200, 1980}};
        double[] endXs = {700, 940, 1000};
        for (int i = 0; i < origins.length; i++) {
            var world = new World();
            world.active = true;
            var events = new Events();
            var combat = new CombatSystem(world, events);
            var player = new Player(1);
            player.x = origins[i][0]; player.y = origins[i][1];
            player.weapons.grant("ricochet");
            player.equipWeapon("ricochet");
            combat.attackAt(player, player.x + 100, player.y);
            assertEquals(i + 1, events.trajectories.size());
            double total = events.trajectories.stream().mapToDouble(Events.Segment::length).sum();
            assertTrue(total <= 600, "Reflections must not renew the range");
            assertEquals(600, total, .01);
            assertEquals(endXs[i], events.trajectories.get(i).x(), .01);
        }
    }

    @Test void damageRewardsAndDeathCallbackWorkWithoutGameSessionOrTransport() {
        var world = new World();
        var combat = new CombatSystem(world, new Events());
        var player = new Player(1);
        var enemy = new Enemy(1, "grunt", GameMap.SPAWN_POINTS.get(0), 100, 0, 0, 100);
        assertEquals(25, combat.damageEnemy(enemy, 25, player));
        assertEquals(75, enemy.hp);
        assertEquals(25, player.credits);
        assertEquals(0, world.deaths);
        assertEquals(999, combat.damageEnemy(enemy, 999, player), "Preserve overkill hit feedback");
        assertEquals(0, enemy.hp);
        assertEquals(100, player.credits);
        assertEquals(1, player.kills);
        assertEquals(1, world.deaths);
        assertEquals(0, combat.damageEnemy(enemy, 999, player));
        assertEquals(1, world.deaths, "Death callback and reward happen only once");
        assertEquals(100, player.credits);
    }

    @Test void blockedAndEmptyAttacksDoNotSpendAmmoOrStartCooldown() {
        var world = new World();
        var events = new Events();
        var combat = new CombatSystem(world, events);
        var player = new Player(1);
        assertTrue(player.weapons.buySilverAmmo(1));
        player.weapons.grant("smg");
        player.equipWeapon("smg");
        combat.attackAt(player, 100, 100);
        world.active = true;
        player.down = true;
        combat.attackAt(player, 100, 100);
        player.down = false;
        player.movingCore = true;
        combat.attackAt(player, 100, 100);
        player.movingCore = false;
        player.cooldown = 1;
        combat.attackAt(player, 100, 100);
        assertEquals(WeaponCatalog.capacity("smg"), player.weapons.ammo("smg"));
        assertEquals(10, player.weapons.silverAmmo());
        assertEquals(0, events.shots);
        assertEquals(0, events.feedback);
        player.cooldown = 0;
        player.weapons.setAmmo("smg", 0);
        player.firing = true;
        combat.attackAt(player, 100, 100);
        assertEquals(0, player.weapons.ammo("smg"));
        assertEquals(0, player.cooldown);
        assertFalse(player.firing);
        assertEquals(0, events.shots);
        assertEquals(1, events.feedback);
        assertEquals(10, player.weapons.silverAmmo());
    }
}
