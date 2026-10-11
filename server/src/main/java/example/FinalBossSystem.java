package example;

import java.util.HashSet;
import java.util.List;

/** R50 boss: five fixed artillery shots and a broad telegraphed shockwave. */
final class FinalBossSystem {
    static final double RADIUS=260, WARNING=1.2, COOLDOWN=5;
    static boolean update(Enemy enemy, double dt, MapPoint target, WardenCombatSystem.World world, List<ArtilleryShell> shells) {
        enemy.specialCooldown=Math.max(0,enemy.specialCooldown-dt*BossRules.attackRate(enemy.type,enemy.hp,enemy.maxHp));
        if (enemy.bossPulseRemaining>0) {
            enemy.bossPulseRemaining=Math.max(0,enemy.bossPulseRemaining-dt);
            if (enemy.bossPulseRemaining<=1e-9) {
                enemy.bossPulseRemaining=0;
                WardenCombatSystem.areaImpact(enemy,RADIUS,enemy.damage*.8,world,new HashSet<>());
                world.pulse(enemy.x,enemy.y,RADIUS);
                enemy.specialCooldown=COOLDOWN;
                enemy.attackCooldown=Math.max(.5,enemy.attackCooldown);
            }
            return true;
        }
        if (enemy.specialCooldown>0 || target==null
                || GameSupport.distance(enemy.x,enemy.y,target.x(),target.y())>620
                || !world.clearLine(enemy.x,enemy.y,target.x(),target.y())) return false;
        if (enemy.nextSummon && GameSupport.distance(enemy.x,enemy.y,target.x(),target.y())<=RADIUS+24) {
            enemy.bossPulseRemaining=WARNING;
            enemy.nextSummon=false;
        } else {
            double angle=Math.atan2(target.y()-enemy.y,target.x()-enemy.x);
            for(int offset:new int[]{-144,-72,0,72,144}) {
                double x=target.x()-Math.sin(angle)*offset, y=target.y()+Math.cos(angle)*offset;
                if(x<18 || y<18 || x>GameMap.WORLD_W-18 || y>GameMap.WORLD_H-18) continue;
                shells.add(new ArtilleryShell(enemy.x,enemy.y,x,y,enemy.damage*.5,enemy.id,WARNING));
            }
            enemy.nextSummon=true;
            enemy.specialCooldown=COOLDOWN;
        }
        return true;
    }
    private FinalBossSystem() {}
}
