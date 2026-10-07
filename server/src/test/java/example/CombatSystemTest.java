package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class CombatSystemTest {
    private static final class World implements CombatSystem.World {
        boolean active;
        int deaths;
        final List<Enemy> enemies = new ArrayList<>();
        public boolean canAttack() { return active; }
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
    }
}
