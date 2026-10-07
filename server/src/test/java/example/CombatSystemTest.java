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
        public boolean canOccupy(double x, double y, double radius) { return true; }
        public void onEnemyDefeated(Enemy enemy) { deaths++; }
    }

    private static final class Events implements CombatEvents {
        int shots, feedback;
        public void hit(String playerId, String weapon, double fromX, double fromY,
                double x, double y, double damage, boolean defeated, int credits, boolean headshot) { }
        public void sound(Player player, String effect, String item) { shots++; }
        public void explosion(double x, double y, double radius) { }
        public void feedback(Player player, String message) { feedback++; }
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
