package example;

import java.util.List;
import static example.GameSupport.distance;

/** Warden windups, fixed-direction charges and impacts use the shared damage callbacks. */
final class WardenCombatSystem {
    interface World {
        List<Player> players();
        List<TrapSlot> defenses();
        List<Decoy> decoys();
        double coreX();
        double coreY();
        boolean canTravel(double x, double y, double toX, double toY);
        boolean clearLine(double x, double y, double toX, double toY);
        void damagePlayer(Player player, double damage);
        void damageDrone(Player player, double damage);
        void damageCore(double damage);
        void pulse(double x, double y, double radius);
    }

    static boolean update(Enemy enemy, double dt, MapPoint target, World world) {
        var state = enemy.warden;
        int phase = WardenRules.phase(enemy.hp, enemy.maxHp);
        enemy.specialCooldown = Math.max(0, enemy.specialCooldown - dt);
        if ((state.action == WardenRules.Action.CHARGE_WARNING || state.action == WardenRules.Action.CHARGING)
                && distance(enemy.x, enemy.y, state.chargeX, state.chargeY) > 1) {
            // A displaced boss must not bend its charge into an unannounced path.
            finish(enemy, phase);
            enemy.specialCooldown = 2;
            return true;
        }
        if (state.action == WardenRules.Action.CHARGE_WARNING || state.action == WardenRules.Action.PULSE_WARNING) {
            state.remaining = Math.max(0, state.remaining - dt);
            if (state.remaining <= 1e-9) {
                if (state.action == WardenRules.Action.PULSE_WARNING) {
                    impact(enemy, WardenRules.PULSE_RADIUS, enemy.damage * .65, world);
                    world.pulse(enemy.x, enemy.y, WardenRules.PULSE_RADIUS);
                    finish(enemy, phase);
                } else {
                    state.action = WardenRules.Action.CHARGING;
                    state.remaining = WardenRules.CHARGE_DISTANCE / WardenRules.CHARGE_SPEED;
                }
            }
            return true;
        }
        if (state.action == WardenRules.Action.CHARGING) {
            double amount = WardenRules.CHARGE_SPEED * Math.min(dt, state.remaining) * enemy.slow;
            while (amount > 1e-9) {
                double length = distance(enemy.x, enemy.y, state.targetX, state.targetY);
                if (length < .1) break;
                double step = Math.min(8, Math.min(amount, length));
                double x = enemy.x + (state.targetX - enemy.x) / length * step;
                double y = enemy.y + (state.targetY - enemy.y) / length * step;
                if (!world.canTravel(enemy.x, enemy.y, x, y)) {
                    impact(enemy, 52, enemy.damage * 1.1, world);
                    break;
                }
                enemy.x = x; enemy.y = y;
                state.chargeX = x; state.chargeY = y;
                impact(enemy, WardenRules.CHARGE_RADIUS, enemy.damage * 1.1, world);
                amount -= step;
            }
            state.remaining = Math.max(0, state.remaining - dt);
            if (amount > 1e-9 || state.remaining <= 1e-9) finish(enemy, phase);
            return true;
        }
        if (phase < 2 || enemy.specialCooldown > 0 || target == null) return false;
        if (phase == 3 && (state.nextPulse || distance(enemy.x, enemy.y, target.x(), target.y()) < 60)) {
            state.action = WardenRules.Action.PULSE_WARNING;
            state.remaining = WardenRules.PULSE_WARNING;
            state.nextPulse = false;
        } else {
            double length = distance(enemy.x, enemy.y, target.x(), target.y());
            if (length < 60 || length > 520 || !world.clearLine(enemy.x, enemy.y, target.x(), target.y())) return false;
            state.action = WardenRules.Action.CHARGE_WARNING;
            state.remaining = WardenRules.CHARGE_WARNING;
            state.chargeX = enemy.x; state.chargeY = enemy.y;
            state.targetX = enemy.x + (target.x() - enemy.x) / length * WardenRules.CHARGE_DISTANCE;
            state.targetY = enemy.y + (target.y() - enemy.y) / length * WardenRules.CHARGE_DISTANCE;
            enemy.faceToward(state.targetX, state.targetY);
            state.nextPulse = true;
        }
        state.struck.clear();
        return true;
    }

    private static void finish(Enemy enemy, int phase) {
        enemy.warden.action = WardenRules.Action.IDLE;
        enemy.warden.remaining = 0;
        enemy.specialCooldown = WardenRules.cooldown(phase);
        enemy.attackCooldown = Math.max(enemy.attackCooldown, .5);
    }

    private static void impact(Enemy enemy, double radius, double damage, World world) {
        areaImpact(enemy, radius, damage, world, enemy.warden.struck);
    }

    static void areaImpact(Enemy enemy, double radius, double damage, World world, java.util.Set<String> hits) {
        for (Player player : world.players()) {
            if (!player.down && inRange(enemy, player.x, player.y, radius, world) && hits.add(player.id))
                world.damagePlayer(player, damage);
            if (player.drone != null && player.drone.active
                    && inRange(enemy, player.drone.x, player.drone.y, radius, world) && hits.add("drone:" + player.id))
                world.damageDrone(player, damage);
        }
        for (TrapSlot slot : world.defenses()) {
            if (slot.defense != null && inRange(enemy, slot.x, slot.y, radius, world) && hits.add("defense:" + slot.id))
                slot.defense.hp -= damage;
        }
        for (Decoy decoy : world.decoys()) {
            if (inRange(enemy, decoy.x, decoy.y, radius, world) && hits.add("decoy:" + decoy.ownerId)) decoy.hp -= damage;
        }
        if (inRange(enemy, world.coreX(), world.coreY(), radius + 24, world) && hits.add("core")) world.damageCore(damage);
    }
    private static boolean inRange(Enemy enemy, double x, double y, double radius, World world) {
        return distance(enemy.x, enemy.y, x, y) <= radius && world.clearLine(enemy.x, enemy.y, x, y);
    }
}
