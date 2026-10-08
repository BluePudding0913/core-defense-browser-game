package example;

import java.util.Comparator;
import java.util.List;
import java.util.function.BiPredicate;

/** Spy projectile and enemy distraction rules, independent of transport and UI. */
final class DecoyRules {
    static final double COOLDOWN = 12, DURATION = 8, HP = 45;
    static final double SPEED = 500, RANGE = 260, ATTRACT_RANGE = 340;

    static boolean canLaunch(Player player) {
        return player.job.equals("spy") && !player.down && !player.movingCore
                && player.selectedBuild == null && player.decoyCooldown <= 0
                && player.railgunCharge <= 0 && player.railgunRemaining <= 0;
    }

    static Decoy target(Enemy enemy, List<Decoy> decoys, BiPredicate<Double, Double> visible) {
        return decoys.stream().filter(d -> d.hp > 0 && d.remaining > 0
                && GameSupport.distance(enemy.x, enemy.y, d.x, d.y) <= ATTRACT_RANGE
                && visible.test(d.x, d.y))
                .min(Comparator.comparingDouble(d -> GameSupport.distance(enemy.x, enemy.y, d.x, d.y)))
                .orElse(null);
    }

    static void advance(Decoy decoy, double dt, BiPredicate<Double, Double> canOccupy) {
        decoy.remaining -= dt;
        double travel = Math.min(decoy.travelRemaining, SPEED * dt);
        MapPoint point = JobRules.advanceScoutDash(decoy.x, decoy.y, decoy.dx, decoy.dy, travel, canOccupy);
        double moved = GameSupport.distance(decoy.x, decoy.y, point.x(), point.y());
        decoy.x = point.x(); decoy.y = point.y();
        decoy.travelRemaining = moved < travel - 1e-6 ? 0 : decoy.travelRemaining - moved;
    }
}

final class Decoy {
    final String ownerId;
    final double dx, dy;
    double x, y, hp = DecoyRules.HP, remaining = DecoyRules.DURATION;
    double travelRemaining = DecoyRules.RANGE;
    Decoy(Player owner, MapPoint direction) {
        ownerId = owner.id; x = owner.x; y = owner.y;
        dx = direction.x(); dy = direction.y();
    }
}
