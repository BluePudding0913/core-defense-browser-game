package example;

import static example.GameMap.WORLD_W;
import static example.GameMap.WORLD_H;
import static example.GameSupport.clamp;
import static example.GameSupport.distance;
import example.WeaponCatalog.WeaponStats;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

/** Weapon execution and shared enemy damage; emits domain events without JSON. */
final class CombatSystem {
    interface World extends HookSystem.World {
        boolean canAttack();
        Set<String> unlockedAreas();
        List<Enemy> enemies();
        List<PoisonGasRules.Cloud> poisonClouds();
        default List<EnemyProjectileSystem.Shot> enemyProjectiles() { return List.of(); }
        List<Player> players();
        void damagePlayer(Player player, double damage);
        boolean canOccupy(double x, double y, double radius);
        void onEnemyDefeated(Enemy enemy);
        default double damageMultiplier(Player player, String weapon) {
            return UpgradeRules.weaponMultiplier(player.enchantments.getOrDefault(weapon, 0)) * JobRules.damageMultiplier(player.job);
        }
    }
    private final World world;
    private final CombatEvents events;
    private final java.util.function.DoubleSupplier random;
    CombatSystem(World world, CombatEvents events) {
        this(world, events, Math::random);
    }
    CombatSystem(World world, CombatEvents events, java.util.function.DoubleSupplier random) {
        this(world, events, random, new java.util.ArrayList<>());
    }
    CombatSystem(World world, CombatEvents events, java.util.function.DoubleSupplier random, List<RocketFlight> rockets) {
        this.rockets = rockets;
        this.world = world;
        this.events = events;
        this.random = random;
    }

    void attackAt(Player player, double aimX, double aimY) {
        if (JobRules.attackBlocked(player)) return;
        if (DroneRules.controlling(player)) {
            attackDrone(player, aimX, aimY);
            return;
        }
        if (!world.canAttack() || player.missileControl || player.down || player.movingCore || player.selectedBuild != null || player.cooldown > 0
                || DroneRules.mounted(player, player.weapon)) return;

        if (player.weapon.equals("hook")) {
            if (!player.weapons.owns("hook") || player.hookPressHandled) return;
            player.hookPressHandled = true;
            HookSystem.click(player, aimX, aimY, world);
            player.cooldown = player.cooldownMax = .2;
            return;
        }
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
        WeaponStats weapon = JobRules.weaponStats(player.job, player.weapon);
        MapPoint aim = assistedAim(player, player.weapon, player.x, player.y, aimX, aimY);
        aimX = aim.x(); aimY = aim.y();
        if (!player.weapons.consume(player.weapon)) {
            events.outOfAmmo(player);
            player.firing = false;
            return;
        }
        if (player.weapons.consumeSilverAmmo(player.weapon)) weapon = SilverAmmoRules.boost(weapon);

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
        if (WeaponCatalog.find(player.weapon).mode() == WeaponCatalog.AttackMode.FLAME) {
            fireFlame(player, weapon, directionX, directionY);
            return;
        }
        if (WeaponCatalog.find(player.weapon).mode() == WeaponCatalog.AttackMode.GAS) {
            firePoisonGas(player, weapon, directionX, directionY, Math.min(length, weapon.range()));
            return;
        }
        if (WeaponCatalog.find(player.weapon).mode() == WeaponCatalog.AttackMode.PUSH) {
            fireRepulsor(player, weapon, directionX, directionY);
            return;
        }
        if (player.weapon.equals("plasmaBlade")) {
            firePlasmaBlade(player, weapon, directionX, directionY); return;
        }
        if (player.weapon.equals("bat")) {
            double effectDistance = GameMap.distanceToWall(player.x, player.y, directionX, directionY,
                    Math.min(Math.hypot(aimX - player.x, aimY - player.y), weapon.range()), world.unlockedAreas());
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

    private MapPoint assistedAim(Player player, String weapon, double x, double y, double aimX, double aimY) {
        Enemy target = AutoAimRules.target(player.enchantments.getOrDefault(weapon, 0), x, y,
                aimX, aimY, WeaponCatalog.stats(weapon).range(), world.enemies(),
                enemy -> GameMap.hasClearLine(x, y, enemy.x, enemy.y, world.unlockedAreas()));
        return target == null ? new MapPoint(aimX, aimY) : new MapPoint(target.x, target.y);
    }

    private void aimRailgun(Player player) {
        MapPoint aim = assistedAim(player, "railgun", player.x, player.y, player.aimX, player.aimY);
        double dx = aim.x() - player.x, dy = aim.y() - player.y;
        double length = Math.hypot(dx, dy);
        player.railgunDx = length < .001 ? 1 : dx / length;
        player.railgunDy = length < .001 ? 0 : dy / length;
        player.railgunPitch = player.aimPitch;
    }


    private void damageShot(Player player, String weapon, EnemyProjectileSystem.Shot shot, double damage) {
        if (EnemyProjectileSystem.damage(shot, damage * world.damageMultiplier(player, weapon))
                && world.enemyProjectiles().remove(shot)) events.intercepted(shot.x, shot.y);
    }

    private void interceptShots(Player player, String weapon, double x, double y,
            java.util.function.Predicate<EnemyProjectileSystem.Shot> hit, double damage) {
        for (var shot : List.copyOf(world.enemyProjectiles())) {
            if (hit.test(shot) && GameMap.hasClearLine(x, y, shot.x, shot.y, world.unlockedAreas()))
                damageShot(player, weapon, shot, damage);
        }
    }

    private void interceptBlast(Player player, String weapon, double x, double y, double radius, double damage) {
        for (var shot : List.copyOf(world.enemyProjectiles())) {
            double separation = distance(x, y, shot.x, shot.y);
            if (separation <= radius && GameMap.hasClearLine(x, y, shot.x, shot.y, world.unlockedAreas()))
                damageShot(player, weapon, shot, damage * (1 - .5 * separation / radius));
        }
    }

    private void firePlasmaBlade(Player player, WeaponStats weapon, double dx, double dy) {
        interceptShots(player, shotWeapon(player), player.x, player.y, shot -> RepulsorRules.contains(player.x, player.y, dx, dy,
                weapon.range(), shot.x, shot.y, EnemyProjectileSystem.SHOT_RADIUS), weapon.damage());
        events.hit(player.id, "plasmaBlade", player.x, player.y,
                player.x + dx * weapon.range(), player.y + dy * weapon.range(), 0, false, 0, false, null);
        for (Enemy enemy : List.copyOf(world.enemies())) {
            if (enemy.hp <= 0 || !RepulsorRules.contains(player.x, player.y, dx, dy, weapon.range(), enemy.x, enemy.y, enemyRadius(enemy))
                    || !GameMap.hasClearLine(player.x, player.y, enemy.x, enemy.y, world.unlockedAreas())) continue;
            int credits = player.credits;
            double damage = damageEnemy(enemy, weapon.damage(), player);
            knockbackEnemy(player.x, player.y, enemy, weapon.knockback());
            events.hit(player.id, "plasmaBlade", player.x, player.y, enemy.x, enemy.y, damage, enemy.hp <= 0,
                    player.credits - credits, false, enemy.id);
        }
    }

    private void fireRepulsor(Player player, WeaponStats weapon, double dx, double dy) {
        double range = GameMap.distanceToWall(player.x, player.y, dx, dy, weapon.range(), world.unlockedAreas());
        events.hit(player.id, "repulsor", player.x, player.y, player.x + dx * range, player.y + dy * range,
                0, false, 0, false, null);
        for (Enemy enemy : world.enemies()) {
            if (enemy.hp > 0 && RepulsorRules.contains(player.x, player.y, dx, dy, weapon.range(), enemy.x, enemy.y, enemyRadius(enemy))
                    && GameMap.hasClearLine(player.x, player.y, enemy.x, enemy.y, world.unlockedAreas()))
                knockbackEnemy(player.x, player.y, enemy, weapon.knockback());
        }
    }

    private void firePoisonGas(Player player, WeaponStats weapon, double dx, double dy, double range) {
        double travel = Math.max(0, GameMap.distanceToWall(player.x, player.y, dx, dy, range, world.unlockedAreas()) - .01);
        var cloud = new PoisonGasRules.Cloud(player.id, player.x + dx * travel, player.y + dy * travel, weapon.damage());
        if (world.poisonClouds().size() >= PoisonGasRules.MAX_CLOUDS) world.poisonClouds().remove(0);
        world.poisonClouds().add(cloud);
        events.hit(player.id, "poisonGas", player.x, player.y, cloud.x, cloud.y, 0, false, 0, false, null);
        poisonTick(cloud, player);
    }

    void updatePoisonGas(double dt) {
        for (var cloud : List.copyOf(world.poisonClouds())) {
            Player owner = world.players().stream().filter(p -> p.id.equals(cloud.ownerId)).findFirst().orElse(null);
            if (owner == null) { cloud.remaining = 0; continue; }
            int ticks = PoisonGasRules.advance(cloud, dt);
            for (int tick = 0; tick < ticks; tick++) poisonTick(cloud, owner);
        }
        world.poisonClouds().removeIf(cloud -> cloud.remaining <= 1e-9);
    }

    private void poisonTick(PoisonGasRules.Cloud cloud, Player owner) {
        for (Enemy enemy : List.copyOf(world.enemies())) {
            if (enemy.hp <= 0) continue;
            if (SpecialEnemyRules.carriesHunters(enemy)) {
                MapPoint bag = SpecialEnemyRules.bag(enemy);
                if (PoisonGasRules.contains(cloud, bag.x(), bag.y(), SpecialEnemyRules.BAG_RADIUS)
                        && GameMap.hasClearLine(cloud.x, cloud.y, bag.x(), bag.y(), world.unlockedAreas()))
                    damageBag(enemy, cloud.damage, owner, "poisonGas", cloud.x, cloud.y);
            }
            if (!PoisonGasRules.contains(cloud, enemy.x, enemy.y, enemyRadius(enemy))
                    || !GameMap.hasClearLine(cloud.x, cloud.y, enemy.x, enemy.y, world.unlockedAreas())) continue;
            int credits = owner.credits;
            double dealt = damageEnemy(enemy, cloud.damage, owner, "poisonGas");
            events.hit(owner.id, "poisonGas", cloud.x, cloud.y, enemy.x, enemy.y, dealt,
                    enemy.hp <= 0, owner.credits - credits, false, enemy.id);
        }
        for (Player target : world.players()) {
            if (JobRules.canHitDisguisedAlly(owner, target) && PoisonGasRules.contains(cloud, target.x, target.y, 12)
                    && GameMap.hasClearLine(cloud.x, cloud.y, target.x, target.y, world.unlockedAreas()))
                world.damagePlayer(target, cloud.damage);
        }
    }

    void updateHooks(double dt) { HookSystem.update(dt, world.canAttack(), world); }

    void attackSecondary(Player player, double aimX, double aimY) {
        if (!player.job.equals("attacker") || player.weapon.equals(player.secondaryWeapon) || !player.weapons.owns(player.secondaryWeapon)) return;
        withSecondaryHand(player, () -> attackAt(player, aimX, aimY));
    }

    void updateSecondaryRailgun(Player player, double dt) {
        if (!player.job.equals("attacker") || player.weapon.equals(player.secondaryWeapon) || !player.weapons.owns(player.secondaryWeapon)) {
            player.secondaryFiring = false;
            player.stopSecondaryRailgun();
            return;
        }
        withSecondaryHand(player, () -> updateRailgun(player, dt));
    }

    // Run both hands through the same weapon rules; only hand state is swapped.
    private record HandState(String weapon, double cooldown, double cooldownMax, boolean firing, boolean hookPressHandled,
            double aimX, double aimY, Double pitch, double charge, double remaining, double tick, double dx, double dy, Double beamPitch) {
        static HandState primary(Player p) {
            return new HandState(p.weapon, p.cooldown, p.cooldownMax, p.firing, p.hookPressHandled, p.aimX, p.aimY, p.aimPitch,
                    p.railgunCharge, p.railgunRemaining, p.railgunTick, p.railgunDx, p.railgunDy, p.railgunPitch);
        }
        static HandState secondary(Player p) {
            return new HandState(p.secondaryWeapon, p.secondaryCooldown, p.secondaryCooldownMax,
                    p.secondaryFiring, p.secondaryHookPressHandled, p.secondaryAimX, p.secondaryAimY, p.secondaryAimPitch, p.secondaryRailgunCharge,
                    p.secondaryRailgunRemaining, p.secondaryRailgunTick, p.secondaryRailgunDx, p.secondaryRailgunDy, p.secondaryRailgunPitch);
        }
        void applyPrimary(Player p) {
            p.weapon = weapon; p.cooldown = cooldown; p.cooldownMax = cooldownMax; p.firing = firing; p.hookPressHandled = hookPressHandled;
            p.aimX = aimX; p.aimY = aimY; p.aimPitch = pitch; p.railgunCharge = charge; p.railgunRemaining = remaining;
            p.railgunTick = tick; p.railgunDx = dx; p.railgunDy = dy; p.railgunPitch = beamPitch;
        }
        void applySecondary(Player p) {
            p.secondaryWeapon = weapon; p.secondaryCooldown = cooldown; p.secondaryCooldownMax = cooldownMax;
            p.secondaryFiring = firing; p.secondaryHookPressHandled = hookPressHandled; p.secondaryAimX = aimX; p.secondaryAimY = aimY; p.secondaryAimPitch = pitch;
            p.secondaryRailgunCharge = charge; p.secondaryRailgunRemaining = remaining;
            p.secondaryRailgunTick = tick; p.secondaryRailgunDx = dx; p.secondaryRailgunDy = dy; p.secondaryRailgunPitch = beamPitch;
        }
    }

    private void withSecondaryHand(Player p, Runnable action) {
        HandState primary = HandState.primary(p);
        HandState.secondary(p).applyPrimary(p);
        try { action.run(); }
        finally {
            HandState.primary(p).applySecondary(p);
            primary.applyPrimary(p);
            if (p.down) p.firing = p.secondaryFiring = false;
        }
    }

    void droneExplosion(Player player, Drone drone) {
        events.alliedExplosion(drone.x, drone.y, DroneRules.SELF_DESTRUCT_RADIUS);
        interceptBlast(player, "droneExplosion", drone.x, drone.y, DroneRules.SELF_DESTRUCT_RADIUS, DroneRules.SELF_DESTRUCT_DAMAGE);
        droneShot = new DroneShot(player, "droneExplosion", drone.x, drone.y, drone);
        try {
            for (Enemy enemy : List.copyOf(world.enemies())) {
                double separation = distance(drone.x, drone.y, enemy.x, enemy.y);
                if (enemy.hp <= 0 || separation > DroneRules.SELF_DESTRUCT_RADIUS
                        || !GameMap.hasClearLine(drone.x, drone.y, enemy.x, enemy.y, world.unlockedAreas())) continue;
                double damage = DroneRules.SELF_DESTRUCT_DAMAGE * (1 - .5 * separation / DroneRules.SELF_DESTRUCT_RADIUS);
                int before = player.credits;
                double dealt = damageEnemy(enemy, damage, player, "droneExplosion");
                events.hit(player.id, "droneExplosion", drone.x, drone.y, enemy.x, enemy.y, dealt,
                        enemy.hp <= 0, player.credits - before, false, enemy.id);
            }
        } finally { droneShot = null; }
    }

    void missileImpact(Player player, double x, double y) {
        events.alliedExplosion(x, y, MissileRules.radius());
        interceptBlast(player, "missile", x, y, MissileRules.radius(), MissileRules.damage());
        for (Enemy enemy : List.copyOf(world.enemies())) {
            double separation = distance(x, y, enemy.x, enemy.y);
            if (enemy.hp <= 0 || separation > MissileRules.radius()
                    || !GameMap.hasClearLine(x, y, enemy.x, enemy.y, world.unlockedAreas())) continue;
            int credits = player.credits;
            double dealt = damageEnemy(enemy, MissileRules.damage() * (1 - .5 * separation / MissileRules.radius()), player, "missile");
            events.hit(player.id, "rocket", x, y, enemy.x, enemy.y, dealt, enemy.hp <= 0, player.credits - credits, false, enemy.id);
        }
    }

    private void fireFlame(Player player, WeaponStats weapon, double dx, double dy) {
        double x = shotX(player), y = shotY(player);
        String weaponId = shotWeapon(player);
        double range = GameMap.distanceToWall(x, y, dx, dy, weapon.range(), world.unlockedAreas());
        interceptShots(player, weaponId, x, y, shot -> FlameRules.contains(shot.x, shot.y, EnemyProjectileSystem.SHOT_RADIUS, x, y, dx, dy, range), weapon.damage());
        events.hit(player.id, weaponId, x, y, x + dx * range, y + dy * range, 0, false, 0, false, null);
        for (Enemy enemy : List.copyOf(world.enemies())) {
            if (SpecialEnemyRules.carriesHunters(enemy)) {
                MapPoint bag = SpecialEnemyRules.bag(enemy);
                if (FlameRules.contains(bag.x(), bag.y(), SpecialEnemyRules.BAG_RADIUS, x, y, dx, dy, range)
                        && GameMap.hasClearLine(x, y, bag.x(), bag.y(), world.unlockedAreas()))
                    damageBag(enemy, weapon.damage(), player, weaponId, x, y);
            }
            if (enemy.hp <= 0 || !FlameRules.contains(enemy.x, enemy.y, enemyRadius(enemy), x, y, dx, dy, range)
                    || !GameMap.hasClearLine(x, y, enemy.x, enemy.y, world.unlockedAreas())) continue;
            int credits = player.credits;
            double dealt = damageEnemy(enemy, enemy.shieldedDamage(weapon.damage(), x, y), player);
            events.hit(player.id, weaponId, x, y, enemy.x, enemy.y, dealt, enemy.hp <= 0, player.credits - credits, false, enemy.id);
        }
        for (Player target : world.players()) {
            if (JobRules.canHitDisguisedAlly(player, target)
                    && FlameRules.contains(target.x, target.y, 12, x, y, dx, dy, range)
                    && GameMap.hasClearLine(x, y, target.x, target.y, world.unlockedAreas()))
                world.damagePlayer(target, weapon.damage());
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
        MapPoint aim = assistedAim(player, drone.weapon, drone.x, drone.y, aimX, aimY);
        double dx = aim.x() - drone.x, dy = aim.y() - drone.y;
        double length = Math.hypot(dx, dy);
        if (length < .001) return;
        if (!player.weapons.consume(drone.weapon)) {
            events.outOfAmmo(player); player.firing = false; return;
        }
        var definition = WeaponCatalog.find(drone.weapon);
        var stats = definition.stats();
        if (player.weapons.consumeSilverAmmo(drone.weapon)) stats = SilverAmmoRules.boost(stats);
        drone.cooldown = stats.cooldown();
        // Freeze origin and weapon for the entire burst, even if a bomber destroys the drone.
        droneShot = new DroneShot(player, drone.weapon, drone.x, drone.y, drone);
        try {
            events.sound(player, "shot", drone.weapon);
            double directionX = dx / length, directionY = dy / length;
            if (definition.mode() == WeaponCatalog.AttackMode.RICOCHET) {
                fireRicochet(player, stats, directionX, directionY);
            } else if (definition.mode() == WeaponCatalog.AttackMode.FLAME) {
                fireFlame(player, stats, directionX, directionY);
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
        if (JobRules.attackBlocked(player)) { player.stopRailgun(); return; }
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
            aimRailgun(player);
            player.railgunRemaining = GameConfig.RAILGUN_DURATION;
            player.railgunTick = 0;
            events.sound(player, "shot", "railgun");
        }
        if (player.railgunRemaining <= 0) return;
        if (UpgradeRules.autoAim(player.enchantments.getOrDefault("railgun", 0))) aimRailgun(player);
        double elapsed = Math.min(remainingDt, player.railgunRemaining);
        player.railgunRemaining = Math.max(0, player.railgunRemaining - elapsed);
        player.railgunTick += elapsed;
        WeaponStats stats = WeaponCatalog.stats("railgun");
        while (player.railgunTick + 1e-9 >= GameConfig.RAILGUN_TICK) {
            player.railgunTick -= GameConfig.RAILGUN_TICK;
            double range = GameMap.distanceToWall(player.x, player.y, player.railgunDx, player.railgunDy, stats.range(), world.unlockedAreas());
            FpsHitRules.Ray beamRay = player.railgunPitch == null ? null
                    : new FpsHitRules.Ray(player.x, player.y, 26 + player.jumpHeight, player.railgunDx, player.railgunDy, Math.tan(player.railgunPitch), range);
            for (Player target : friendlyRayTargets(player, player.x, player.y,
                    player.railgunDx, player.railgunDy, stats, range)) {
                if (beamRay == null || FpsHitRules.ally(beamRay, target.x, target.y, target.down, stats.width(), target.jumpHeight) != null)
                    world.damagePlayer(target, stats.damage() * GameConfig.RAILGUN_TICK);
            }
            interceptShots(player, "railgun", player.x, player.y, shot -> (beamRay == null || FpsHitRules.projectile(beamRay, shot.x, shot.y, stats.width()) != null) && Double.isFinite(EnemyProjectileSystem.rayEntry(shot,
                    player.x, player.y, player.railgunDx, player.railgunDy, range, stats.width())), stats.damage() * GameConfig.RAILGUN_TICK);
            // Copy: damage can spawn world.enemies(), so newly spawned world.enemies() enter on the next tick.
            for (Enemy enemy : List.copyOf(world.enemies())) {
                if (enemy.hp <= 0 || !isInsideAttack(enemy, player.x, player.y, player.railgunDx, player.railgunDy, stats, range)
                        || !GameMap.hasClearLine(player.x, player.y, enemy.x, enemy.y, world.unlockedAreas())) continue;
                FpsHitRules.Hit beamHit = beamRay == null ? null : fpsEnemy(beamRay, enemy, stats.width());
                if (beamRay != null && beamHit == null) continue;
                if ((beamRay == null || beamHit.height() <= 30) && SpecialEnemyRules.hitsBag(enemy, player.x, player.y, player.railgunDx, player.railgunDy, range, stats.width())) {
                    damageBag(enemy, stats.damage() * GameConfig.RAILGUN_TICK, player, "railgun", player.x, player.y);
                    continue;
                }
                int before = player.credits;
                double dealt = damageEnemy(enemy, stats.damage() * GameConfig.RAILGUN_TICK, player);
                rayHit(player, player.x, player.y, beamRay == null ? enemy.x : player.x + player.railgunDx * beamHit.distance(),
                        beamRay == null ? enemy.y : player.y + player.railgunDy * beamHit.distance(),
                        dealt, enemy.hp <= 0, player.credits - before, false, enemy.id, beamRay);
            }
        }
        if (player.railgunRemaining < 1e-9) {
            player.railgunRemaining = 0;
            player.railgunTick = 0;
            player.cooldown = stats.cooldown();
            player.cooldownMax = player.cooldown;
        }
    }

    static final class RocketFlight {
        final int id; final Player owner; final WeaponStats weapon; final double dx, dy;
        double x, y, remaining;
        RocketFlight(int id, Player owner, WeaponStats weapon, double dx, double dy, double range) {
            this.id=id; this.owner=owner; this.weapon=weapon; this.dx=dx; this.dy=dy;
            x=owner.x; y=owner.y; remaining=range;
        }
    }
    final List<RocketFlight> rockets;
    private int nextRocketId;
    static final double ROCKET_SPEED = 480;
    void fireRocket(Player player, WeaponStats weapon, double dx, double dy, double range) {
        rockets.add(new RocketFlight(nextRocketId++, player, weapon, dx, dy, range));
    }
    void updateRockets(double dt) {
        var iterator=rockets.iterator();
        while (iterator.hasNext()) {
            RocketFlight flight=iterator.next();
            Player player=flight.owner; double dx=flight.dx, dy=flight.dy;
            double budget=Math.min(flight.remaining, ROCKET_SPEED*dt);
            while (budget > 1e-9) {
                double range=Math.min(12, budget);
                double impactDistance = GameMap.distanceToWall(flight.x, flight.y, dx, dy, range, world.unlockedAreas());
                for (var shot : world.enemyProjectiles()) {
                    impactDistance = Math.min(impactDistance, EnemyProjectileSystem.rayEntry(shot,
                            flight.x, flight.y, dx, dy, range, flight.weapon.width()));
                }
                // Stop at the first enemy body; unlike bullets, the rocket detonates instead of piercing.
                for (Enemy enemy : world.enemies()) {
                    if (enemy.hp <= 0) continue;
                    double ex = enemy.x - flight.x, ey = enemy.y - flight.y;
                    double projection = ex * dx + ey * dy;
                    double perpendicular = Math.abs(ex * dy - ey * dx);
                    double radius = enemyRadius(enemy) + flight.weapon.width();
                    if (projection < 0 || perpendicular > radius) continue;
                    double entry = Math.max(0, projection - Math.sqrt(radius * radius - perpendicular * perpendicular));
                    if (entry < impactDistance) impactDistance = entry;
                }
                for (Player target : world.players()) {
                    if (!JobRules.canHitDisguisedAlly(player, target)) continue;
                    double projection = (target.x - flight.x) * dx + (target.y - flight.y) * dy;
                    double perpendicular = Math.abs((target.x - flight.x) * dy - (target.y - flight.y) * dx);
                    double radius = 12 + flight.weapon.width();
                    if (projection < 0 || perpendicular > radius) continue;
                    double entry = Math.max(0, projection - Math.sqrt(radius * radius - perpendicular * perpendicular));
                    impactDistance = Math.min(impactDistance, entry);
                }

                flight.x += dx*impactDistance; flight.y += dy*impactDistance;
                flight.remaining -= impactDistance; budget -= impactDistance;
                if (impactDistance < range - 1e-7 || flight.remaining <= 1e-7) {
                    rocketImpact(player, flight.weapon, flight.x, flight.y); iterator.remove(); break;
                }
            }
        }
    }
    private void rocketImpact(Player player, WeaponStats weapon, double x, double y) {
        events.alliedExplosion(x, y, GameConfig.ROCKET_BLAST_RADIUS);
        interceptBlast(player, "rocket", x, y, GameConfig.ROCKET_BLAST_RADIUS, weapon.damage());
        for (Player target : world.players()) {
            double blastDistance = distance(x, y, target.x, target.y);
            if (JobRules.canHitDisguisedAlly(player, target) && blastDistance <= GameConfig.ROCKET_BLAST_RADIUS
                    && GameMap.hasClearLine(x, y, target.x, target.y, world.unlockedAreas())) {
                world.damagePlayer(target, weapon.damage() * (1 - .5 * blastDistance / GameConfig.ROCKET_BLAST_RADIUS));
            }
        }
        for (Enemy enemy : world.enemies()) {
            if (SpecialEnemyRules.carriesHunters(enemy)) {
                MapPoint bag = SpecialEnemyRules.bag(enemy);
                double separation = distance(x, y, bag.x(), bag.y());
                if (separation <= GameConfig.ROCKET_BLAST_RADIUS + SpecialEnemyRules.BAG_RADIUS
                        && GameMap.hasClearLine(x, y, bag.x(), bag.y(), world.unlockedAreas()))
                    damageBag(enemy, weapon.damage() * Math.max(.5, 1 - .5 * separation / GameConfig.ROCKET_BLAST_RADIUS), player, "rocket", x, y);
            }
            double blastDistance = distance(x, y, enemy.x, enemy.y);
            if (enemy.hp <= 0 || blastDistance > GameConfig.ROCKET_BLAST_RADIUS
                    || !GameMap.hasClearLine(x, y, enemy.x, enemy.y, world.unlockedAreas())) continue;
            // Full damage at the center, half damage at the edge; no headshot multiplier.
            double damage = weapon.damage() * (1 - .5 * blastDistance / GameConfig.ROCKET_BLAST_RADIUS);
            int creditsBefore = player.credits;
            double dealt = damageEnemy(enemy, damage, player, "rocket");
            knockbackEnemy(x, y, enemy, weapon.knockback());
            events.hit(player.id, "rocket", x, y, enemy.x, enemy.y, dealt,
                    enemy.hp <= 0, player.credits - creditsBefore, false, enemy.id);
        }
    }


    private void fireRicochet(Player player, WeaponStats weapon, double dx, double dy) {
        // All reflected segments share one distance budget, including the wall clearance.
        double x = shotX(player), y = shotY(player), remaining = weapon.range();
        for (int bounce = 0; bounce <= 2 && remaining > .01; bounce++) {
            GameMap.WallImpact wall = GameMap.rayWall(x, y, dx, dy, remaining, world.unlockedAreas());
            double length = Math.max(0, wall.distance() - .001);
            if (fireSegment(player, weapon, x, y, dx, dy, length, shotHeight(player)
                    + (player.aimPitch == null ? 0 : Math.tan(player.aimPitch) * (weapon.range() - remaining)))) return;
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
                directionX, directionY, weapon.range(), world.unlockedAreas());
        fireSegment(player, weapon, shotX(player), shotY(player), directionX, directionY, shotDistance);
    }

    boolean fireSegment(Player player, WeaponStats weapon, double originX, double originY,
            double directionX, double directionY, double shotDistance) {
        return fireSegment(player, weapon, originX, originY, directionX, directionY, shotDistance, shotHeight(player));
    }

    private double shotHeight(Player player) { return droneShot != null && droneShot.owner == player ? 23 : 26 + player.jumpHeight; }

    private FpsHitRules.Ray fpsRay(Player player, double x, double y, double dx, double dy, double range, double height) {
        return player.aimPitch == null || WeaponCatalog.find(shotWeapon(player)).mode() == WeaponCatalog.AttackMode.MELEE ? null
                : new FpsHitRules.Ray(x, y, height, dx, dy, Math.tan(player.aimPitch), range);
    }

    private FpsHitRules.Hit fpsEnemy(FpsHitRules.Ray ray, Enemy enemy, double width) {
        return FpsHitRules.enemy(ray, enemy.x, enemy.y, enemyRadius(enemy), enemy.facingX, enemy.facingY, width);
    }

    private void rayHit(Player player, double fromX, double fromY, double x, double y, double damage,
            boolean defeated, int credits, boolean headshot, Integer enemyId, FpsHitRules.Ray ray) {
        if (ray == null) events.hit(player.id, shotWeapon(player), fromX, fromY, x, y, damage, defeated, credits, headshot, enemyId);
        else events.hitAtHeight(player.id, shotWeapon(player), fromX, fromY, x, y, damage, defeated, credits, headshot, enemyId,
                ray.height(), ray.heightAt(Math.hypot(x-fromX, y-fromY)));
    }

    private boolean fireSegment(Player player, WeaponStats weapon, double originX, double originY,
            double directionX, double directionY, double shotDistance, double originHeight) {
        FpsHitRules.Ray fpsRay = fpsRay(player, originX, originY, directionX, directionY, shotDistance, originHeight);
        java.util.Map<Enemy, FpsHitRules.Hit> fpsHits = new java.util.HashMap<>();
        double endX = originX + directionX * shotDistance;
        double endY = originY + directionY * shotDistance;
        List<Enemy> candidates = world.enemies().stream().filter(enemy -> enemy.hp > 0)
                .filter(enemy -> isInsideAttack(enemy, originX, originY, directionX, directionY, weapon, shotDistance))
                .filter(enemy -> {
                    if (fpsRay == null) return true;
                    FpsHitRules.Hit hit = fpsEnemy(fpsRay, enemy, weapon.width());
                    if (hit == null) return false;
                    fpsHits.put(enemy, hit);return true;
                })
                .filter(enemy -> GameMap.hasClearLine(originX, originY, enemy.x, enemy.y, world.unlockedAreas()))
                .sorted(Comparator.comparingDouble(enemy ->
                        fpsRay == null ? (enemy.x - originX) * directionX + (enemy.y - originY) * directionY : fpsHits.get(enemy).distance())).toList();
        boolean piercing = WeaponCatalog.find(shotWeapon(player)).piercing();
        List<Enemy> targets = piercing ? candidates : candidates.stream().limit(1).toList();
        List<Player> allies = WeaponCatalog.find(shotWeapon(player)).mode() == WeaponCatalog.AttackMode.MELEE
                ? List.of() : friendlyRayTargets(player, originX, originY, directionX, directionY, weapon, shotDistance);
        if (fpsRay != null) allies = allies.stream()
                .filter(target -> FpsHitRules.ally(fpsRay, target.x, target.y, target.down, weapon.width(), target.jumpHeight) != null)
                .sorted(Comparator.comparingDouble(target -> FpsHitRules.ally(fpsRay, target.x, target.y, target.down, weapon.width(), target.jumpHeight).distance())).toList();
        double firstEnemy = targets.isEmpty() ? Double.POSITIVE_INFINITY
                : fpsRay != null ? fpsHits.get(targets.get(0)).distance()
                : (targets.get(0).x - originX) * directionX + (targets.get(0).y - originY) * directionY;
        if (!piercing) allies = allies.stream().filter(target ->
                (fpsRay == null ? (target.x - originX) * directionX + (target.y - originY) * directionY
                        : FpsHitRules.ally(fpsRay, target.x, target.y, target.down, weapon.width(), target.jumpHeight).distance()) < firstEnemy).limit(1).toList();
        if (!piercing && !allies.isEmpty()) {
            targets = List.of();
            Player first = allies.get(0);
            double projection = (first.x - originX) * directionX + (first.y - originY) * directionY;
            double perpendicular = Math.abs((first.x - originX) * directionY - (first.y - originY) * directionX);
            double radius = 12 + weapon.width();
            double entry = Math.max(0, projection - Math.sqrt(Math.max(0, radius * radius - perpendicular * perpendicular)));
            if (fpsRay != null) entry = FpsHitRules.ally(fpsRay, first.x, first.y, first.down, weapon.width(), first.jumpHeight).distance();
            endX = originX + directionX * entry; endY = originY + directionY * entry;
        }
        if (!piercing && !targets.isEmpty() && WeaponCatalog.find(shotWeapon(player)).mode() != WeaponCatalog.AttackMode.MELEE) {
            Enemy first = targets.get(0);
            double projection = (first.x - originX) * directionX + (first.y - originY) * directionY;
            double perpendicular = Math.abs((first.x - originX) * directionY - (first.y - originY) * directionX);
            double radius = enemyRadius(first) + weapon.width();
            double entry = Math.max(0, projection - Math.sqrt(Math.max(0, radius * radius - perpendicular * perpendicular)));
            if (fpsRay != null) entry = fpsHits.get(first).distance();
            endX = originX + directionX * entry; endY = originY + directionY * entry;
        }
        boolean intercepted = false;
        double firstBody = Math.hypot(endX - originX, endY - originY);
        if (!piercing && !targets.isEmpty() && WeaponCatalog.find(shotWeapon(player)).mode() == WeaponCatalog.AttackMode.MELEE) {
            Enemy first = targets.get(0);
            double projection = (first.x - originX) * directionX + (first.y - originY) * directionY;
            double perpendicular = Math.abs((first.x - originX) * directionY - (first.y - originY) * directionX);
            double radius = enemyRadius(first) + weapon.width();
            firstBody = Math.max(0, projection - Math.sqrt(Math.max(0, radius * radius - perpendicular * perpendicular)));
        }
        var missiles = world.enemyProjectiles().stream()
                .filter(shot -> fpsRay == null || FpsHitRules.projectile(fpsRay, shot.x, shot.y, weapon.width()) != null)
                .filter(shot -> Double.isFinite(EnemyProjectileSystem.rayEntry(shot, originX, originY,
                        directionX, directionY, shotDistance, weapon.width())))
                .filter(shot -> GameMap.hasClearLine(originX, originY, shot.x, shot.y, world.unlockedAreas()))
                .sorted(Comparator.comparingDouble(shot -> fpsRay == null ? EnemyProjectileSystem.rayEntry(shot, originX, originY,
                        directionX, directionY, shotDistance, weapon.width())
                        : FpsHitRules.projectile(fpsRay, shot.x, shot.y, weapon.width()).distance())).toList();
        for (var shot : missiles) {
            double entry = fpsRay == null ? EnemyProjectileSystem.rayEntry(shot, originX, originY,
                    directionX, directionY, shotDistance, weapon.width())
                    : FpsHitRules.projectile(fpsRay, shot.x, shot.y, weapon.width()).distance();
            if (!piercing && entry >= firstBody) break;
            damageShot(player, shotWeapon(player), shot, WeaponDamageRules.atDistance(shotWeapon(player), weapon.damage(),
                    distance(originX, originY, shot.x, shot.y)));
            intercepted = true;
            if (!piercing) {
                targets = List.of(); allies = List.of();
                endX = originX + directionX * entry; endY = originY + directionY * entry;
                break;
            }
        }
        // A trajectory event is separate from impact and reward events.
        if (!shotWeapon(player).equals("bat")) {
            rayHit(player, originX, originY, endX, endY, 0, false, 0, false, null, fpsRay);
        }
        for (Enemy hit : targets) {
            double impactX = fpsRay == null ? hit.x : originX + directionX * fpsHits.get(hit).distance();
            double impactY = fpsRay == null ? hit.y : originY + directionY * fpsHits.get(hit).distance();
            if (shotWeapon(player).equals("freezeGun")) {
                hit.frozenRemaining = Math.max(hit.frozenRemaining, 3);
                rayHit(player, originX, originY, impactX, impactY, 0, false, 0, false, hit.id, fpsRay);
                continue;
            }
            if ((fpsRay == null || fpsHits.get(hit).height() <= 30)
                    && SpecialEnemyRules.hitsBag(hit, originX, originY, directionX, directionY, shotDistance, weapon.width())) {
                damageBag(hit, WeaponDamageRules.atDistance(shotWeapon(player), weapon.damage(),
                        distance(originX, originY, hit.x, hit.y)), player, shotWeapon(player), originX, originY);
                continue;
            }
            int creditsBeforeHit = player.credits;
            boolean headshot = fpsRay == null ? isHeadshot(hit, player, originX, originY, directionX, directionY, weapon, shotDistance)
                    : !shotWeapon(player).equals("laserCannon") && fpsHits.get(hit).headshot();
            double damage = WeaponDamageRules.atDistance(shotWeapon(player), weapon.damage(),
                    distance(originX, originY, hit.x, hit.y)) * (headshot ? 2 : 1);
            if (WeaponCatalog.find(shotWeapon(player)).mode() != WeaponCatalog.AttackMode.MELEE) damage = hit.shieldedDamage(damage, originX, originY);
            double dealt = damageEnemy(hit, damage, player);
            if (headshot && !hit.type.equals("explosionBoss")) awardCredits(player, 3, shotWeapon(player));
            knockbackEnemy(originX, originY, hit, weapon.knockback());
            rayHit(player, originX, originY, impactX, impactY,
                    dealt, hit.hp <= 0, player.credits - creditsBeforeHit, headshot, hit.id, fpsRay);
        }
        for (Player target : allies) world.damagePlayer(target, WeaponDamageRules.atDistance(shotWeapon(player),
                weapon.damage(), distance(originX, originY, target.x, target.y)));
        return intercepted || !targets.isEmpty() || !allies.isEmpty();
    }

    private void damageBag(Enemy enemy, double amount, Player player, String weapon, double x, double y) {
        if (enemy.hp <= 0 || !SpecialEnemyRules.carriesHunters(enemy)) return;
        double dealt = Math.min(enemy.bagHp, amount * world.damageMultiplier(player, weapon));
        enemy.bagHp -= dealt;
        MapPoint bag = SpecialEnemyRules.bag(enemy);
        events.hit(player.id, weapon, x, y, bag.x(), bag.y(), dealt, false, 0, false, enemy.id);
    }

    private List<Player> friendlyRayTargets(Player shooter, double originX, double originY,
            double dx, double dy, WeaponStats weapon, double range) {
        return world.players().stream().filter(target -> JobRules.canHitDisguisedAlly(shooter, target))
                .filter(target -> isInsideAttack(target.x, target.y, 12, originX, originY, dx, dy, weapon, range))
                .filter(target -> GameMap.hasClearLine(originX, originY, target.x, target.y, world.unlockedAreas()))
                .sorted(Comparator.comparingDouble(target -> (target.x - originX) * dx + (target.y - originY) * dy)).toList();
    }

    static boolean isInsideAttack(Enemy enemy, double originX, double originY, double directionX,
            double directionY, WeaponStats weapon, double shotDistance) {
        return SpecialEnemyRules.hitsBag(enemy, originX, originY, directionX, directionY, shotDistance, weapon.width())
                || isInsideAttack(enemy.x, enemy.y, enemyRadius(enemy), originX, originY,
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
        if (shotWeapon(player).equals("laserCannon") || WeaponCatalog.find(shotWeapon(player)).mode() == WeaponCatalog.AttackMode.MELEE) return false;
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

    static double enemyRadius(Enemy enemy) {
        return switch (enemy.type) {
            case "explosionBoss" -> 42;
            case "bomber" -> 20;
            case "tiny" -> 3;
            case "blueAce" -> 9;
            case "boss" -> 42;
            case "warlord" -> 44;
            case "warden" -> 44;
            case "titan" -> 48;
            case "armored" -> 30;
            case "shield" -> 24;
            case "artillery" -> 22;
            case "siege" -> 32;
            case "champion" -> 26;
            case "hunter", "ghost" -> 18;
            case "brute" -> 28;
            case "runner" -> 16;
            default -> 21;
        };
    }

    double damageEnemy(Enemy enemy, double damage, Player player) {
        return damageEnemy(enemy, damage, player, player == null ? null : shotWeapon(player));
    }

    private double damageEnemy(Enemy enemy, double damage, Player player, String weapon) {
        if (enemy.hp <= 0) return 0;
        if (player != null) damage *= world.damageMultiplier(player, weapon);
        if (droneShot != null && droneShot.owner == player && damage > 0) droneShot.drone.attackers.add(enemy.id);
        double dealt = Math.min(enemy.hp, damage);
        enemy.hp -= dealt;
        if (player != null && dealt > 0) {
            JobRules.recordSpyAttack(player, enemy, random);
            enemy.creditProgress += enemy.reward * dealt / enemy.maxHp;
            int earnedCredits = enemy.type.equals("explosionBoss") ? 0 : Math.min(enemy.reward,
                    (int) Math.floor(enemy.creditProgress + 1e-9));
            int payout = earnedCredits - enemy.paidCredits;
            if (payout > 0) {
                awardCredits(player, payout, weapon);
                enemy.paidCredits += payout;
            }
            if (enemy.hp <= 0) player.kills++;
        }
        if (enemy.hp <= 0) world.onEnemyDefeated(enemy);
        // Report the mitigated hit strength, retaining ordinary overkill feedback.
        return damage;
    }

    private void awardCredits(Player player, int amount, String weapon) {
        var payout = GoldRewardRules.payout(amount, weapon,
                droneShot != null && droneShot.owner == player, player.goldRewardRemainder, player.job);
        player.credits += payout.credits();
        player.goldRewardRemainder = payout.remainder();
    }

    private void knockbackEnemy(double fromX, double fromY, Enemy enemy, double amount) {
        if (amount <= 0 || enemy.summonRemaining > 0 || enemy.bossPulseRemaining > 0 || WardenRules.resistsKnockback(enemy.warden)) return;
        double dx = enemy.x - fromX;
        double dy = enemy.y - fromY;
        double length = Math.max(1, Math.hypot(dx, dy));
        double nextX = clamp(enemy.x + dx / length * amount, 18, WORLD_W - 18);
        double nextY = clamp(enemy.y + dy / length * amount, 18, WORLD_H - 18);
        if (world.canOccupy(nextX, enemy.y, 17)) enemy.x = nextX;
        if (world.canOccupy(enemy.x, nextY, 17)) enemy.y = nextY;
    }

}
