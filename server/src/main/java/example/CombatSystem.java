package example;

import static example.GameMap.WORLD_W;
import static example.GameMap.WORLD_H;
import static example.GameSupport.clamp;
import static example.GameSupport.distance;
import example.WeaponCatalog.WeaponStats;
import java.util.Comparator;
import java.util.List;

/** Weapon execution and shared enemy damage; emits domain events without JSON. */
final class CombatSystem {
    interface World {
        boolean canAttack();
        List<Enemy> enemies();
        List<Player> players();
        void damagePlayer(Player player, double damage);
        boolean canOccupy(double x, double y, double radius);
        void onEnemyDefeated(Enemy enemy);
    }
    private final World world;
    private final CombatEvents events;
    CombatSystem(World world, CombatEvents events) {
        this.world = world;
        this.events = events;
    }

    void attackAt(Player player, double aimX, double aimY) {
        if (DroneRules.controlling(player)) {
            attackDrone(player, aimX, aimY);
            return;
        }
        if (!world.canAttack() || player.down || player.movingCore || player.selectedBuild != null || player.cooldown > 0
                || DroneRules.mounted(player, player.weapon)) return;

        if (player.weapon.equals("railgun")) {
            if (!player.firing || player.selectedBuild != null) return;
            if (!player.weapons.owns("railgun") || player.weapons.ammo("railgun") <= 0 && player.railgunRemaining <= 0) {
                player.firing = false;
                return;
            }
            if (player.railgunCharge <= 0 && player.railgunRemaining <= 0) {
                player.railgunCharge = 1e-9;
                events.sound(player, "shot", "railgun-charge");
            }
            return;
        }
        WeaponStats weapon = WeaponCatalog.stats(player.weapon);
        if (!player.weapons.consume(player.weapon)) {
            events.outOfAmmo(player);
            player.firing = false;
            return;
        }

        events.sound(player,"shot",player.weapon);
        player.cooldown = weapon.cooldown();
        player.cooldownMax = weapon.cooldown();
        double dx = aimX - player.x;
        double dy = aimY - player.y;
        double length = Math.hypot(dx, dy);
        if (length < 0.001) {
            dx = 1;
            dy = 0;
            length = 1;
        }
        double directionX = dx / length;
        double directionY = dy / length;
        if (WeaponCatalog.find(player.weapon).mode() == WeaponCatalog.AttackMode.ROCKET) {
            fireRocket(player, weapon, directionX, directionY, Math.min(length, weapon.range()));
            return;
        }
        if (WeaponCatalog.find(player.weapon).mode() == WeaponCatalog.AttackMode.RICOCHET) {
            fireRicochet(player, weapon, directionX, directionY);
            return;
        }
        if (player.weapon.equals("bat")) {
            double effectDistance = GameMap.distanceToWall(player.x, player.y, directionX, directionY,
                    Math.min(Math.hypot(aimX - player.x, aimY - player.y), weapon.range()));
            events.hit(player.id, "bat", player.x, player.y,
                    player.x + directionX * effectDistance, player.y + directionY * effectDistance,
                    0, false, 0, false, null);
        }
        boolean shotgun = WeaponCatalog.find(player.weapon).mode() == WeaponCatalog.AttackMode.SPREAD;
        int rays = WeaponCatalog.find(player.weapon).pellets();
        double angle = Math.atan2(directionY, directionX);
        for (int pellet = 0; pellet < rays; pellet++) {
            double spreadAngle = shotgun ? (pellet - (rays - 1) / 2.0) * .14 : 0;
            fireRay(player, weapon, Math.cos(angle + spreadAngle), Math.sin(angle + spreadAngle));
        }
    }

    private record DroneShot(Player owner, String weapon, double x, double y, Drone drone) { }
    private DroneShot droneShot;
    private String shotWeapon(Player p) { return droneShot != null && droneShot.owner == p ? droneShot.weapon : p.weapon; }
    private double shotX(Player p) { return droneShot != null && droneShot.owner == p ? droneShot.x : p.x; }
    private double shotY(Player p) { return droneShot != null && droneShot.owner == p ? droneShot.y : p.y; }

    private void attackDrone(Player player, double aimX, double aimY) {
        Drone drone = player.drone;
        if (!world.canAttack() || player.down || drone.hp <= 0 || drone.cooldown > 0
                || !DroneRules.mountable(drone.weapon) || !player.weapons.owns(drone.weapon)) return;
        double dx = aimX - drone.x, dy = aimY - drone.y;
        double length = Math.hypot(dx, dy);
        if (length < .001) return;
        if (!player.weapons.consume(drone.weapon)) {
            events.outOfAmmo(player); player.firing = false; return;
        }
        var definition = WeaponCatalog.find(drone.weapon);
        var stats = definition.stats();
        drone.cooldown = stats.cooldown();
        // Freeze origin and weapon for the entire burst, even if a bomber destroys the drone.
        droneShot = new DroneShot(player, drone.weapon, drone.x, drone.y, drone);
        try {
            events.sound(player, "shot", drone.weapon);
            double directionX = dx / length, directionY = dy / length;
            if (definition.mode() == WeaponCatalog.AttackMode.RICOCHET) {
                fireRicochet(player, stats, directionX, directionY);
            } else {
                double angle = Math.atan2(directionY, directionX);
                for (int pellet = 0; pellet < definition.pellets(); pellet++) {
                    double spread = definition.mode() == WeaponCatalog.AttackMode.SPREAD
                            ? (pellet - (definition.pellets() - 1) / 2.0) * .14 : 0;
                    fireRay(player, stats, Math.cos(angle + spread), Math.sin(angle + spread));
                }
            }
        } finally { droneShot = null; }
    }

    void updateRailgun(Player player, double dt) {
        if (DroneRules.controlling(player) || DroneRules.mounted(player, player.weapon) || !player.weapon.equals("railgun") || !player.firing || player.down
                || player.movingCore || player.selectedBuild != null || !world.canAttack()) {
            player.stopRailgun();
            return;
        }
        double remainingDt = dt;
        if (player.railgunCharge > 0) {
            double step = Math.min(remainingDt, GameConfig.RAILGUN_CHARGE - player.railgunCharge);
            player.railgunCharge += step;
            remainingDt -= step;
            if (player.railgunCharge + 1e-9 < GameConfig.RAILGUN_CHARGE) return;
            player.railgunCharge = 0;
            if (player.weapons.ammo("railgun") <= 0) return;
            player.weapons.consume("railgun");
            double dx = player.aimX - player.x, dy = player.aimY - player.y;
            double length = Math.hypot(dx, dy);
            player.railgunDx = length < .001 ? 1 : dx / length;
            player.railgunDy = length < .001 ? 0 : dy / length;
            player.railgunRemaining = GameConfig.RAILGUN_DURATION;
            player.railgunTick = 0;
            events.sound(player, "shot", "railgun");
        }
        if (player.railgunRemaining <= 0) return;
        double elapsed = Math.min(remainingDt, player.railgunRemaining);
        player.railgunRemaining = Math.max(0, player.railgunRemaining - elapsed);
        player.railgunTick += elapsed;
        WeaponStats stats = WeaponCatalog.stats("railgun");
        while (player.railgunTick + 1e-9 >= GameConfig.RAILGUN_TICK) {
            player.railgunTick -= GameConfig.RAILGUN_TICK;
            double range = GameMap.distanceToWall(player.x, player.y, player.railgunDx, player.railgunDy, stats.range());
            for (Player target : friendlyRayTargets(player, player.x, player.y,
                    player.railgunDx, player.railgunDy, stats, range)) {
                world.damagePlayer(target, stats.damage() * GameConfig.RAILGUN_TICK);
            }
            // Copy: damage can spawn world.enemies(), so newly spawned world.enemies() enter on the next tick.
            for (Enemy enemy : List.copyOf(world.enemies())) {
                if (enemy.hp <= 0 || !isInsideAttack(enemy, player.x, player.y, player.railgunDx, player.railgunDy, stats, range)
                        || !GameMap.hasClearLine(player.x, player.y, enemy.x, enemy.y)) continue;
                int before = player.credits;
                double dealt = damageEnemy(enemy, stats.damage() * GameConfig.RAILGUN_TICK, player);
                events.hit(player.id, "railgun", player.x, player.y, enemy.x, enemy.y,
                        dealt, enemy.hp <= 0, player.credits - before, false, enemy.id);
            }
        }
        if (player.railgunRemaining < 1e-9) {
            player.railgunRemaining = 0;
            player.railgunTick = 0;
            player.cooldown = stats.cooldown();
            player.cooldownMax = player.cooldown;
        }
    }

    void fireRocket(Player player, WeaponStats weapon, double dx, double dy, double range) {
        double impactDistance = GameMap.distanceToWall(player.x, player.y, dx, dy, range);
        // Stop at the first enemy body; unlike bullets, the rocket detonates instead of piercing.
        for (Enemy enemy : world.enemies()) {
            if (enemy.hp <= 0) continue;
            double ex = enemy.x - player.x, ey = enemy.y - player.y;
            double projection = ex * dx + ey * dy;
            double perpendicular = Math.abs(ex * dy - ey * dx);
            double radius = enemyRadius(enemy) + weapon.width();
            if (projection < 0 || perpendicular > radius) continue;
            double entry = Math.max(0, projection - Math.sqrt(radius * radius - perpendicular * perpendicular));
            if (entry < impactDistance) impactDistance = entry;
        }
        for (Player target : world.players()) {
            if (!JobRules.canHitDisguisedAlly(player, target)) continue;
            double projection = (target.x - player.x) * dx + (target.y - player.y) * dy;
            double perpendicular = Math.abs((target.x - player.x) * dy - (target.y - player.y) * dx);
            double radius = 12 + weapon.width();
            if (projection < 0 || perpendicular > radius) continue;
            double entry = Math.max(0, projection - Math.sqrt(radius * radius - perpendicular * perpendicular));
            impactDistance = Math.min(impactDistance, entry);
        }
        double x = player.x + dx * impactDistance, y = player.y + dy * impactDistance;
        events.hit(player.id, "rocket", player.x, player.y, x, y, 0, false, 0, false, null);
        events.explosion(x, y, GameConfig.ROCKET_BLAST_RADIUS);
        for (Player target : world.players()) {
            double blastDistance = distance(x, y, target.x, target.y);
            if (JobRules.canHitDisguisedAlly(player, target) && blastDistance <= GameConfig.ROCKET_BLAST_RADIUS
                    && GameMap.hasClearLine(x, y, target.x, target.y)) {
                world.damagePlayer(target, weapon.damage() * (1 - .5 * blastDistance / GameConfig.ROCKET_BLAST_RADIUS));
            }
        }
        for (Enemy enemy : world.enemies()) {
            double blastDistance = distance(x, y, enemy.x, enemy.y);
            if (enemy.hp <= 0 || blastDistance > GameConfig.ROCKET_BLAST_RADIUS
                    || !GameMap.hasClearLine(x, y, enemy.x, enemy.y)) continue;
            // Full damage at the center, half damage at the edge; no headshot multiplier.
            double damage = weapon.damage() * (1 - .5 * blastDistance / GameConfig.ROCKET_BLAST_RADIUS);
            int creditsBefore = player.credits;
            double dealt = damageEnemy(enemy, damage, player);
            knockbackEnemy(x, y, enemy, weapon.knockback());
            events.hit(player.id, "rocket", x, y, enemy.x, enemy.y, dealt,
                    enemy.hp <= 0, player.credits - creditsBefore, false, enemy.id);
        }
    }

    private void fireRicochet(Player player, WeaponStats weapon, double dx, double dy) {
        // All reflected segments share one distance budget, including the wall clearance.
        double x = shotX(player), y = shotY(player), remaining = weapon.range();
        for (int bounce = 0; bounce <= 2 && remaining > .01; bounce++) {
            GameMap.WallImpact wall = GameMap.rayWall(x, y, dx, dy, remaining);
            double length = Math.max(0, wall.distance() - .001);
            if (fireSegment(player, weapon, x, y, dx, dy, length)) return;
            remaining -= wall.distance();
            if (!wall.flipX() && !wall.flipY()) return;
            x += dx * length; y += dy * length;
            if (wall.flipX()) dx = -dx;
            if (wall.flipY()) dy = -dy;
            x += dx * .002; y += dy * .002;
            remaining -= .002;
        }
    }

    void fireRay(Player player, WeaponStats weapon, double directionX, double directionY) {
        double shotDistance = GameMap.distanceToWall(shotX(player), shotY(player),
                directionX, directionY, weapon.range());
        fireSegment(player, weapon, shotX(player), shotY(player), directionX, directionY, shotDistance);
    }

    boolean fireSegment(Player player, WeaponStats weapon, double originX, double originY,
            double directionX, double directionY, double shotDistance) {
        double endX = originX + directionX * shotDistance;
        double endY = originY + directionY * shotDistance;
        List<Enemy> candidates = world.enemies().stream().filter(enemy -> enemy.hp > 0)
                .filter(enemy -> isInsideAttack(enemy, originX, originY, directionX, directionY, weapon, shotDistance))
                .filter(enemy -> GameMap.hasClearLine(originX, originY, enemy.x, enemy.y))
                .sorted(Comparator.comparingDouble(enemy ->
                        (enemy.x - originX) * directionX + (enemy.y - originY) * directionY)).toList();
        boolean piercing = WeaponCatalog.find(shotWeapon(player)).piercing();
        List<Enemy> targets = piercing ? candidates : candidates.stream().limit(1).toList();
        List<Player> allies = WeaponCatalog.find(shotWeapon(player)).mode() == WeaponCatalog.AttackMode.MELEE
                ? List.of() : friendlyRayTargets(player, originX, originY, directionX, directionY, weapon, shotDistance);
        double firstEnemy = targets.isEmpty() ? Double.POSITIVE_INFINITY
                : (targets.get(0).x - originX) * directionX + (targets.get(0).y - originY) * directionY;
        if (!piercing) allies = allies.stream().filter(target ->
                (target.x - originX) * directionX + (target.y - originY) * directionY < firstEnemy).limit(1).toList();
        if (!piercing && !allies.isEmpty()) {
            targets = List.of();
            Player first = allies.get(0);
            double projection = (first.x - originX) * directionX + (first.y - originY) * directionY;
            double perpendicular = Math.abs((first.x - originX) * directionY - (first.y - originY) * directionX);
            double radius = 12 + weapon.width();
            double entry = Math.max(0, projection - Math.sqrt(Math.max(0, radius * radius - perpendicular * perpendicular)));
            endX = originX + directionX * entry; endY = originY + directionY * entry;
        }
        if (!piercing && !targets.isEmpty() && WeaponCatalog.find(shotWeapon(player)).mode() != WeaponCatalog.AttackMode.MELEE) {
            Enemy first = targets.get(0);
            double projection = (first.x - originX) * directionX + (first.y - originY) * directionY;
            double perpendicular = Math.abs((first.x - originX) * directionY - (first.y - originY) * directionX);
            double radius = enemyRadius(first) + weapon.width();
            double entry = Math.max(0, projection - Math.sqrt(Math.max(0, radius * radius - perpendicular * perpendicular)));
            endX = originX + directionX * entry; endY = originY + directionY * entry;
        }
        // A trajectory event is separate from impact and reward events.
        if (!shotWeapon(player).equals("bat")) {
            events.hit(player.id, shotWeapon(player), originX, originY, endX, endY, 0, false, 0, false, null);
        }
        for (Enemy hit : targets) {
            int creditsBeforeHit = player.credits;
            boolean headshot = isHeadshot(hit, player, originX, originY, directionX, directionY, weapon, shotDistance);
            double damage = weapon.damage() * (headshot ? 2 : 1);
            if (WeaponCatalog.find(shotWeapon(player)).mode() != WeaponCatalog.AttackMode.MELEE) damage = hit.shieldedDamage(damage, originX, originY);
            double dealt = damageEnemy(hit, damage, player);
            if (headshot) awardCredits(player, 3);
            knockbackEnemy(originX, originY, hit, weapon.knockback());
            events.hit(player.id, shotWeapon(player), shotX(player), shotY(player), hit.x, hit.y,
                    dealt, hit.hp <= 0, player.credits - creditsBeforeHit, headshot, hit.id);
        }
        for (Player target : allies) world.damagePlayer(target, weapon.damage());
        return !targets.isEmpty() || !allies.isEmpty();
    }

    private List<Player> friendlyRayTargets(Player shooter, double originX, double originY,
            double dx, double dy, WeaponStats weapon, double range) {
        return world.players().stream().filter(target -> JobRules.canHitDisguisedAlly(shooter, target))
                .filter(target -> isInsideAttack(target.x, target.y, 12, originX, originY, dx, dy, weapon, range))
                .filter(target -> GameMap.hasClearLine(originX, originY, target.x, target.y))
                .sorted(Comparator.comparingDouble(target -> (target.x - originX) * dx + (target.y - originY) * dy)).toList();
    }

    static boolean isInsideAttack(Enemy enemy, double originX, double originY, double directionX,
            double directionY, WeaponStats weapon, double shotDistance) {
        return isInsideAttack(enemy.x, enemy.y, enemyRadius(enemy), originX, originY,
                directionX, directionY, weapon, shotDistance);
    }

    private static boolean isInsideAttack(double x, double y, double radius, double originX, double originY,
            double directionX, double directionY, WeaponStats weapon, double shotDistance) {
        double toEnemyX = x - originX;
        double toEnemyY = y - originY;
        double projection = toEnemyX * directionX + toEnemyY * directionY;
        if (projection < 0 || projection > shotDistance) return false;
        double perpendicular = Math.abs(toEnemyX * directionY - toEnemyY * directionX);
        return perpendicular <= weapon.width() + radius;
    }

    private boolean isHeadshot(Enemy enemy, Player player, double originX, double originY, double directionX,
            double directionY, WeaponStats weapon, double shotDistance) {
        if (WeaponCatalog.find(shotWeapon(player)).mode() == WeaponCatalog.AttackMode.MELEE || enemy.type.equals("explosionBoss")) return false;
        double radius = enemyRadius(enemy);
        double headX = enemy.x;
        double headY = enemy.y - radius * 0.5;
        double toHeadX = headX - originX;
        double toHeadY = headY - originY;
        double projection = toHeadX * directionX + toHeadY * directionY;
        if (projection < 0 || projection > shotDistance) return false;
        double perpendicular = Math.abs(toHeadX * directionY - toHeadY * directionX);
        double headRadius = Math.min(radius * 0.5, Math.max(4, radius * 0.28));
        double aimTolerance = WeaponCatalog.find(shotWeapon(player)).mode() == WeaponCatalog.AttackMode.SPREAD
                ? Math.min(3, weapon.width() * 0.25)
                : weapon.width() * 0.25;
        return perpendicular <= headRadius + aimTolerance;
    }

    private static double enemyRadius(Enemy enemy) {
        return switch (enemy.type) {
            case "explosionBoss" -> 42;
            case "bomber" -> 20;
            case "tiny" -> 3;
            case "boss" -> 42;
            case "warlord" -> 44;
            case "titan" -> 48;
            case "armored" -> 30;
            case "shield" -> 24;
            case "artillery" -> 22;
            case "siege" -> 32;
            case "champion" -> 26;
            case "hunter" -> 18;
            case "brute" -> 28;
            case "runner" -> 16;
            default -> 21;
        };
    }

    double damageEnemy(Enemy enemy, double damage, Player player) {
        if (enemy.hp <= 0) return 0;
        if (enemy.type.equals("explosionBoss")) damage *= .001;
        if (droneShot != null && droneShot.owner == player && damage > 0) droneShot.drone.attackers.add(enemy.id);
        double dealt = Math.min(enemy.hp, damage);
        enemy.hp -= dealt;
        if (player != null && dealt > 0) {
            enemy.creditProgress += enemy.reward * dealt / enemy.maxHp;
            int earnedCredits = Math.min(enemy.reward,
                    (int) Math.floor(enemy.creditProgress + 1e-9));
            int payout = earnedCredits - enemy.paidCredits;
            if (payout > 0) {
                awardCredits(player, payout);
                enemy.paidCredits += payout;
            }
            if (enemy.hp <= 0) player.kills++;
        }
        if (enemy.hp <= 0) world.onEnemyDefeated(enemy);
        // Report the mitigated hit strength, retaining ordinary overkill feedback.
        return damage;
    }

    private void awardCredits(Player player, int amount) {
        if (droneShot != null && droneShot.owner == player) {
            // Carry half-gold between payouts so small hits and odd bonuses still earn half overall.
            int total = amount + player.droneRewardRemainder;
            player.credits += total / 2;
            player.droneRewardRemainder = total % 2;
        } else player.credits += amount;
    }

    private void knockbackEnemy(double fromX, double fromY, Enemy enemy, double amount) {
        if (amount <= 0) return;
        double dx = enemy.x - fromX;
        double dy = enemy.y - fromY;
        double length = Math.max(1, Math.hypot(dx, dy));
        double nextX = clamp(enemy.x + dx / length * amount, 18, WORLD_W - 18);
        double nextY = clamp(enemy.y + dy / length * amount, 18, WORLD_H - 18);
        if (world.canOccupy(nextX, enemy.y, 17)) enemy.x = nextX;
        if (world.canOccupy(enemy.x, nextY, 17)) enemy.y = nextY;
    }

}
