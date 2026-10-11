package example;

import java.util.List;
import java.util.Set;

/** Small hostile poison areas. World applies the same damage rules to humans and CPUs. */
final class EnemyPoisonSystem {
    static final double RADIUS = 55, DURATION = 4, INTERVAL = .5, COOLDOWN = 4, RANGE = 260;
    static final int MAX_CLOUDS = 24;
    static final class Cloud {
        final double x, y, damage;
        double remaining = DURATION, tick;
        Cloud(double x, double y, double damage) { this.x=x; this.y=y; this.damage=damage; }
    }
    interface World {
        List<Player> players();
        Set<String> unlocked();
        void damage(Player player, double amount);
    }
    static boolean emit(Enemy enemy, double dt, List<Cloud> clouds, World world) {
        enemy.specialCooldown = Math.max(0, enemy.specialCooldown - dt);
        Player target = EnemyProjectileSystem.target(enemy, world.players(), RANGE, world.unlocked());
        if (target == null) return false;
        enemy.faceToward(target.x, target.y);
        if (enemy.specialCooldown <= 0) {
            if (clouds.size() >= MAX_CLOUDS) clouds.remove(0);
            clouds.add(new Cloud(target.x, target.y, enemy.damage * .2));
            enemy.specialCooldown = COOLDOWN;
        }
        return true;
    }
    static void update(List<Cloud> clouds, double dt, World world) {
        for (Cloud cloud : clouds) {
            double elapsed = Math.min(Math.max(0, dt), cloud.remaining);
            cloud.remaining = Math.max(0, cloud.remaining - elapsed);
            cloud.tick += elapsed;
            int ticks = (int)Math.floor((cloud.tick + 1e-9) / INTERVAL);
            cloud.tick = Math.max(0, cloud.tick - ticks * INTERVAL);
            for (int i=0; i<ticks; i++) for (Player player : world.players()) {
                if (!player.down && contains(cloud, player.x, player.y)
                        && GameMap.hasClearLine(cloud.x, cloud.y, player.x, player.y, world.unlocked()))
                    world.damage(player, cloud.damage);
            }
        }
        clouds.removeIf(cloud -> cloud.remaining <= 1e-9);
    }
    static boolean contains(Cloud cloud, double x, double y) {
        return GameSupport.distance(cloud.x, cloud.y, x, y) <= RADIUS + 12;
    }
    private EnemyPoisonSystem() {}
}
