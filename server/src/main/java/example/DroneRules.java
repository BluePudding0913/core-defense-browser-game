package example;

import java.util.Comparator;
import java.util.List;

/** Drone targeting and repair rules shared by all operators. */
final class DroneRules {
    static final double HP = 60, SPEED = 210, RANGE = 260, DAMAGE = 12, COOLDOWN = .4;
    static final int REPAIR_ORE = 5, REPAIR_COPPER = 2;

    static boolean canRepair(int ore, int copper) {
        return ore >= REPAIR_ORE && copper >= REPAIR_COPPER;
    }

    static Player target(Enemy enemy, List<Player> players) {
        return players.stream().filter(p -> p.drone != null && p.drone.active && p.drone.hp > 0 && !p.down
                && p.drone.attackers.contains(enemy.id))
                .min(Comparator.comparingDouble(p -> GameSupport.distance(enemy.x, enemy.y, p.drone.x, p.drone.y)))
                .orElse(null);
    }

    static Enemy hit(List<Enemy> enemies, double x, double y, double dx, double dy, double range) {
        return enemies.stream().filter(e -> {
            double along = (e.x - x) * dx + (e.y - y) * dy;
            double across = Math.abs((e.x - x) * dy - (e.y - y) * dx);
            return e.hp > 0 && along >= 0 && along <= range && across <= 18
                    && GameMap.hasClearLine(x, y, e.x, e.y);
        }).min(Comparator.comparingDouble(e -> GameSupport.distance(x, y, e.x, e.y))).orElse(null);
    }
}
