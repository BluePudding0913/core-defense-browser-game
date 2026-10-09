package example;

import java.util.*;
import static example.GameSupport.distance;

/** Enemy power disruption and steerable missiles, independent of UI and transport. */
final class EnemyProjectileSystem {
    static final double BLACKOUT_RANGE = 280, SHOT_RANGE = 420, SPEED = 170, TURN_RATE = 2.2;
    static final class Shot {
        final int id; final Player target; final double damage;
        double x, y, angle, remaining = 5;
        Shot(int id, Enemy enemy, Player target) {
            this.id = id; this.target = target; damage = enemy.damage;
            x = enemy.x; y = enemy.y; angle = Math.atan2(target.y-y, target.x-x);
        }
    }
    interface World {
        List<Player> players();
        List<TrapSlot> slots();
        Set<String> unlocked();
        void damage(Player player, double damage);
    }
    static boolean activeBlackout(List<Enemy> enemies) {
        return enemies.stream().anyMatch(e -> e.type.equals("blackout") && e.hp > 0 && e.powerCut);
    }
    static Player target(Enemy enemy, List<Player> players, double range, Set<String> unlocked) {
        return players.stream().filter(p -> !p.down && !JobRules.disguised(p)
                && distance(enemy.x, enemy.y, p.x, p.y) <= range
                && GameMap.hasClearLine(enemy.x, enemy.y, p.x, p.y, unlocked))
            .min(Comparator.comparingDouble(p -> distance(enemy.x, enemy.y, p.x, p.y))).orElse(null);
    }
    static void update(List<Shot> shots, double dt, World world) {
        var iterator = shots.iterator();
        while (iterator.hasNext()) {
            Shot shot = iterator.next();
            double time = Math.min(dt, shot.remaining);
            boolean hit = false;
            while (time > 1e-9 && !hit) {
                double step = Math.min(time, .025); time -= step; shot.remaining -= step;
                if (!shot.target.down && !JobRules.disguised(shot.target)) {
                    double desired = Math.atan2(shot.target.y-shot.y, shot.target.x-shot.x);
                    double delta = Math.atan2(Math.sin(desired-shot.angle), Math.cos(desired-shot.angle));
                    shot.angle += Math.max(-TURN_RATE*step, Math.min(TURN_RATE*step, delta));
                }
                double nx = shot.x + Math.cos(shot.angle)*SPEED*step;
                double ny = shot.y + Math.sin(shot.angle)*SPEED*step;
                if (!GameMap.hasClearLine(shot.x, shot.y, nx, ny, world.unlocked())) { hit = true; break; }
                shot.x = nx; shot.y = ny;
                for (TrapSlot slot : world.slots()) {
                    if (slot.defense != null && BuildingRules.blocksMovement(slot.defense.type)
                            && distance(nx, ny, slot.x, slot.y) < 24) {
                        slot.defense.hp -= shot.damage;
                        if (slot.defense.hp <= 0) slot.defense = null;
                        hit = true; break;
                    }
                }
                if (hit) break;
                for (Player player : world.players()) {
                    if (!player.down && distance(nx, ny, player.x, player.y) < 17) {
                        world.damage(player, shot.damage); hit = true; break;
                    }
                }
            }
            if (hit || shot.remaining <= 1e-9) iterator.remove();
        }
    }
}

