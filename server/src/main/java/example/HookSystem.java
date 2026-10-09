package example;

import java.util.Comparator;
import java.util.List;
import java.util.Set;

/** Damage-free target selection and swept pulling, shared by every weapon user. */
final class HookSystem {
    static final double RANGE = 1200, SPEED = 180, STOP_DISTANCE = 48;
    interface World {
        List<Enemy> enemies();
        List<Player> players();
        Set<String> unlockedAreas();
        boolean canOccupy(double x, double y, double radius);
    }
    static void click(Player player, double x, double y, World world) {
        if (player.hookTargetId >= 0) {
            if (!player.hookReeling) player.hookReeling = true;
            else clear(player);
            return;
        }
        Enemy selected = world.enemies().stream().filter(e -> e.hp > 0)
                .filter(e -> Math.hypot(e.x - x, e.y - y) <= CombatSystem.enemyRadius(e) + 16)
                .filter(e -> Math.hypot(e.x - player.x, e.y - player.y) <= RANGE)
                .filter(e -> GameMap.hasClearLine(player.x, player.y, e.x, e.y, world.unlockedAreas()))
                .filter(e -> world.players().stream().noneMatch(p -> p != player && p.hookTargetId == e.id))
                .min(Comparator.comparingDouble(e -> Math.hypot(e.x - x, e.y - y))).orElse(null);
        if (selected != null) { player.hookTargetId = selected.id; player.hookReeling = false; }
    }
    static void update(double dt, boolean active, World world) {
        world.enemies().forEach(e -> e.hookPulled = false);
        for (Player player : world.players()) {
            if (player.hookTargetId < 0) continue;
            Enemy enemy = world.enemies().stream().filter(e -> e.id == player.hookTargetId && e.hp > 0).findFirst().orElse(null);
            if (!active || player.down || player.movingCore || player.selectedBuild != null || player.missileControl
                    || DroneRules.controlling(player) || !player.weapons.owns("hook") || JobRules.attackBlocked(player)
                    || !(player.weapon.equals("hook") || player.job.equals("attacker") && player.secondaryWeapon.equals("hook"))
                    || enemy == null || Math.hypot(enemy.x - player.x, enemy.y - player.y) > RANGE
                    || !GameMap.hasClearLine(player.x, player.y, enemy.x, enemy.y, world.unlockedAreas())) { clear(player); continue; }
            if (!player.hookReeling) continue;
            enemy.hookPulled = true;
            double distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
            double amount = Math.min(Math.max(0, distance - STOP_DISTANCE), SPEED * dt);
            double dx = (player.x - enemy.x) / Math.max(1, distance), dy = (player.y - enemy.y) / Math.max(1, distance);
            while (amount > 0) {
                double step = Math.min(4, amount), x = enemy.x + dx * step, y = enemy.y + dy * step;
                if (!world.canOccupy(x, y, Math.min(17, CombatSystem.enemyRadius(enemy)))) { clear(player); break; }
                enemy.x = x; enemy.y = y; amount -= step;
                enemy.navigationTimer = enemy.pathTimer = 0;
            }
        }
    }
    static void clear(Player player) { player.hookTargetId = -1; player.hookReeling = false; }
    private HookSystem() { }
}