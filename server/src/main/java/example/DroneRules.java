package example;

import java.util.Comparator;
import java.util.List;

/** Drone targeting and repair rules shared by all operators. */
final class DroneRules {
    static final double HP = 45, SPEED = 210, RECOVERY_RANGE = 45;
    static final int REPAIR_ORE = 5, REPAIR_COPPER = 2;

    static boolean canRepair(int ore, int copper) {
        return ore >= REPAIR_ORE && copper >= REPAIR_COPPER;
    }

    static boolean controlling(Player player) {
        return player.drone != null && player.drone.active && player.drone.controlled && !player.down;
    }

    static boolean mountable(String weapon) {
        var definition = WeaponCatalog.find(weapon);
        return definition != null && definition.mode() != WeaponCatalog.AttackMode.MELEE
                && !java.util.Set.of("rocket", "railgun", "lmg").contains(weapon);
    }

    static boolean mounted(Player player, String weapon) {
        return player.drone != null && player.drone.active && weapon.equals(player.drone.weapon);
    }

    static boolean canRecover(double range, boolean clearLine) {
        return range <= RECOVERY_RANGE && clearLine;
    }

    static Player target(Enemy enemy, List<Player> players) {
        return players.stream().filter(p -> p.drone != null && p.drone.active && p.drone.hp > 0
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
