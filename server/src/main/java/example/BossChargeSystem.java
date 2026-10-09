package example;
import java.util.List;
/** First boss: fixed heading after a visible windup, swept movement and one impact. */
final class BossChargeSystem {
    static final double WARNING = .7, DURATION = .65, SPEED = 440, COOLDOWN = 7;
    interface World {
        List<Player> players();
        List<TrapSlot> slots();
        boolean canOccupy(double x, double y);
        boolean visible(Enemy enemy, Player player);
        void hit(Player player, double damage);
        void hit(TrapSlot slot, double damage);
    }
    static boolean update(Enemy enemy, double dt, World world) {
        if (!enemy.type.equals("boss")) return false;
        enemy.chargeCooldown = Math.max(0, enemy.chargeCooldown - dt);
        if (enemy.chargeWarning > 0) {
            enemy.chargeWarning = Math.max(0, enemy.chargeWarning - dt);
            if (enemy.chargeWarning == 0) enemy.chargeRemaining = DURATION;
            return true;
        }
        if (enemy.chargeRemaining > 0) {
            double travel = SPEED * Math.min(dt, enemy.chargeRemaining);
            enemy.chargeRemaining = Math.max(0, enemy.chargeRemaining - dt);
            int steps = Math.max(1, (int)Math.ceil(travel / 6));
            for (int i = 0; i < steps; i++) {
                double x = enemy.x + enemy.chargeDx * travel / steps;
                double y = enemy.y + enemy.chargeDy * travel / steps;
                if (!world.canOccupy(x, y)) {
                    for (TrapSlot slot : world.slots()) if (slot.defense != null
                            && BuildingRules.blocksMovement(slot.defense.type)
                            && Math.hypot(x-slot.x, y-slot.y) <= 55) world.hit(slot, enemy.damage * 2);
                    enemy.chargeRemaining = 0; break;
                }
                enemy.x = x; enemy.y = y;
                Player impact = world.players().stream().filter(p -> !p.down
                        && !JobRules.concealedFrom(p, enemy) && Math.hypot(x-p.x, y-p.y) <= 54)
                        .findFirst().orElse(null);
                if (impact != null) {
                    if (!JobRules.avoidsContactDamage(impact, enemy)) world.hit(impact, enemy.damage * 1.5);
                    enemy.attackCooldown = .9;
                    enemy.chargeRemaining = 0; break;
                }
            }
            enemy.navigationTimer = enemy.pathTimer = 0;
            return true;
        }
        if (enemy.chargeCooldown > 0) return false;
        Player target = world.players().stream().filter(p -> !p.down && !JobRules.concealedFrom(p, enemy)
                && Math.hypot(p.x-enemy.x, p.y-enemy.y) >= 90
                && Math.hypot(p.x-enemy.x, p.y-enemy.y) <= 400 && world.visible(enemy, p))
                .min(java.util.Comparator.comparingDouble(p -> Math.hypot(p.x-enemy.x, p.y-enemy.y)))
                .orElse(null);
        if (target == null) return false;
        double length = Math.hypot(target.x-enemy.x, target.y-enemy.y);
        enemy.chargeDx = (target.x-enemy.x)/length;
        enemy.chargeDy = (target.y-enemy.y)/length;
        enemy.faceToward(target.x, target.y);
        enemy.chargeWarning = WARNING; enemy.chargeCooldown = COOLDOWN;
        return true;
    }
    private BossChargeSystem() { }
}
