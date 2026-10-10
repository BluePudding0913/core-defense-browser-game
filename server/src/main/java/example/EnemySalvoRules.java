package example;

import java.util.List;

/** Fixed aim points for non-homing artillery salvos. */
final class EnemySalvoRules {
    static void fire(Enemy enemy, double x, double y, List<ArtilleryShell> shells) {
        int[] offsets = enemy.type.equals("artilleryElite") ? new int[]{-144,-72,0,72,144} : new int[]{0};
        double angle = Math.atan2(y-enemy.y, x-enemy.x);
        for (int offset : offsets) {
            double tx=x-Math.sin(angle)*offset, ty=y+Math.cos(angle)*offset;
            if (tx < 18 || ty < 18 || tx > GameMap.WORLD_W-18 || ty > GameMap.WORLD_H-18) continue;
            shells.add(new ArtilleryShell(enemy.x, enemy.y, tx, ty, enemy.damage * 3, enemy.id));
        }
    }
    private EnemySalvoRules() {}
}
