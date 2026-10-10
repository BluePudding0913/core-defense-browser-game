package example;

import java.util.HashSet;
import java.util.List;
import static example.GameSupport.distance;

/** WARLORD salvos and TITAN telegraphed shockwaves share ordinary blast damage. */
final class BossAbilitySystem {
    static final double TITAN_WARNING = 1.0, WARLORD_WARNING = 1.0, TITAN_RADIUS = 200, COOLDOWN = 8;
    static final double SUMMON_WARNING = 1, SUMMON_RADIUS = 100;
    static final int SUMMON_COUNT = 18, SUMMON_LIMIT = 36;
    static double pulseRadius(String type) { return type.equals("finalBoss") ? FinalBossSystem.RADIUS : TITAN_RADIUS; }
    static String summonType(int index) { return index % 3 == 2 ? "armored" : "runner"; }
    static MapPoint summonPoint(double x, double y, int index) {
        double angle = Math.PI * 2 * index / SUMMON_COUNT;
        return new MapPoint(x + Math.cos(angle) * 90, y + Math.sin(angle) * 90);
    }
    static boolean update(Enemy enemy, double dt, MapPoint target, WardenCombatSystem.World world, List<ArtilleryShell> shells, boolean canSummon, java.util.function.Consumer<Enemy> summon) {
        if (enemy.type.equals("finalBoss")) return enemy.hp > 0 && FinalBossSystem.update(enemy, dt, target, world, shells);
        if (!enemy.type.equals("warlord") && !enemy.type.equals("titan") || enemy.hp <= 0) return false;
        enemy.specialCooldown = Math.max(0, enemy.specialCooldown
                - dt * BossRules.attackRate(enemy.type, enemy.hp, enemy.maxHp));
        if (enemy.summonRemaining > 0) {
            enemy.summonRemaining = Math.max(0, enemy.summonRemaining - dt);
            if (enemy.summonRemaining <= 1e-9) {
                enemy.summonRemaining = 0;
                summon.accept(enemy);
                enemy.specialCooldown = COOLDOWN;
            }
            return true;
        }
        if (enemy.bossPulseRemaining > 0) {
            enemy.bossPulseRemaining = Math.max(0,enemy.bossPulseRemaining-dt);
            if (enemy.bossPulseRemaining <= 1e-9) {
                enemy.bossPulseRemaining = 0;
                WardenCombatSystem.areaImpact(enemy,TITAN_RADIUS,enemy.damage*.8,world,new HashSet<>());
                world.pulse(enemy.x,enemy.y,TITAN_RADIUS);
                enemy.specialCooldown = COOLDOWN;
                enemy.attackCooldown = Math.max(.5,enemy.attackCooldown);
            }
            return true;
        }
        double range = enemy.type.equals("titan") ? TITAN_RADIUS + 24 : 560;
        if (enemy.specialCooldown > 0 || target == null || distance(enemy.x,enemy.y,target.x(),target.y()) > range
                || !world.clearLine(enemy.x,enemy.y,target.x(),target.y())) return false;
        if (enemy.type.equals("titan")) enemy.bossPulseRemaining = TITAN_WARNING;
        else if (enemy.nextSummon && canSummon) {
            enemy.summonRemaining = SUMMON_WARNING;
            enemy.nextSummon = false;
        } else {
            enemy.nextSummon = true;
            double dx = target.x()-enemy.x, dy = target.y()-enemy.y, length = Math.hypot(dx,dy);
            if (length < 1) { dx = enemy.facingX; dy = enemy.facingY; length = 1; }
            for (int offset : new int[]{-144,0,144}) {
                double x = target.x()-dy/length*offset;
                double y = target.y()+dx/length*offset;
                if (x < 18 || y < 18 || x > GameMap.WORLD_W-18 || y > GameMap.WORLD_H-18) continue;
                shells.add(new ArtilleryShell(enemy.x,enemy.y,x,y,enemy.damage*.75,enemy.id,WARLORD_WARNING));
            }
            enemy.specialCooldown = COOLDOWN;
        }
        return true;
    }
    private BossAbilitySystem() {}
}
