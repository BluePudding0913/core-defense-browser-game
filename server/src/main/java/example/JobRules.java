package example;

/** Shared job rules for humans and CPU players. No UI or transport dependencies. */
final class JobRules {
    static final String DEFAULT = "healer";
    static final double TP_INVULNERABLE_DURATION = 5, TP_INVULNERABLE_COOLDOWN = 20;
    static final double REVIVE_INVULNERABLE_DURATION = 1.5;
    static boolean invulnerable(Player player) {
        return !player.down && (player.reviveInvulnerableRemaining > 0 || attackBlocked(player));
    }
    static boolean attackBlocked(Player player) {
        return player.job.equals("tp") && !player.down && player.tpInvulnerableRemaining > 0;
    }
    static final double TANK_AURA_RADIUS = 160;
    static final double TANK_DAMAGE_FACTOR = .75;
    static final double TANK_WALL_COOLDOWN = 20;
    static final double TANK_WALL_DURATION = 20;
    static final double TANK_WALL_HP = 10_000;
    static final double SPY_DURATION = 8;
    static final double SPY_COOLDOWN = 15;
    static void updateDisguise(Player player, double dt) {
        double active = Math.min(player.spyRemaining, dt);
        if (player.spyRemaining > 0) {
            player.spyRemaining = Math.max(0, player.spyRemaining - dt);
            if (player.spyRemaining <= 1e-9) {
                player.spyRemaining = 0;
                player.jobCooldown = Math.max(0, SPY_COOLDOWN - (dt - active));
            }
        } else if (player.job.equals("spy")) player.jobCooldown = Math.max(0, player.jobCooldown - dt);
    }
    static final double SPY_ATTACK_CONCEAL_CHANCE = .8;
    static final double SCOUT_DASH_DURATION = .2;
    static final double SCOUT_DASH_SPEED = 800;
    static final double SCOUT_DASH_STAMINA = 20;
    static final double SCOUT_DASH_STEP = 4;

    static final double HEAL_DURATION = 10, HEAL_COOLDOWN = 30, HEAL_PER_SECOND = 6;
    static final double HEAL_HALF_SIZE = GameMap.TILE_SIZE * 1.5;
    static boolean insideHealingArea(double x, double y, double centerX, double centerY) {
        return Math.abs(x - centerX) < HEAL_HALF_SIZE && Math.abs(y - centerY) < HEAL_HALF_SIZE;
    }

    private JobRules() { }

    static boolean valid(String job) {
        return java.util.Set.of("spy", "tp", "healer", "scout", "drone", "hacker", "tank", "attacker", "builder").contains(job);
    }

    static double damageMultiplier(String job) { return job.equals("attacker") ? 1.5 : 1; }
    static int buildingCost(String job, int cost) { return job.equals("builder") ? (cost + 1) / 2 : cost; }
    static java.util.Map<String, Integer> recipe(String job, java.util.Map<String, Integer> base) {
        if (!job.equals("builder")) return base;
        return base.entrySet().stream().collect(java.util.stream.Collectors.toMap(java.util.Map.Entry::getKey,
                entry -> buildingCost(job, entry.getValue())));
    }
    static int teleportPair(Player owner, int index) {
        return owner.teleportPairs.getOrDefault(owner.teleportPads.get(index), index / 2);
    }
    static MapPoint teleportPartner(Player owner, int index) {
        int pair = teleportPair(owner, index);
        for (int i = 0; i < owner.teleportPads.size(); i++)
            if (i != index && teleportPair(owner, i) == pair) return owner.teleportPads.get(i);
        return null;
    }

    static double maxHp(String job) { return job.equals("tank") ? 200 : 100; }
    static int ammoCapacityMultiplier(String job) { return job.equals("attacker") ? 2 : 1; }
    static WeaponCatalog.WeaponStats weaponStats(String job, String weapon) {
        var stats = WeaponCatalog.stats(weapon);
        if (!job.equals("spy") || !weapon.equals("pistol")) return stats;
        return new WeaponCatalog.WeaponStats(stats.range(), stats.damage() * 3, stats.cooldown(),
                stats.knockback(), stats.width());
    }

    /** Two adjacent tiles across the facing direction, with either side as a placement option. */
    static java.util.List<java.util.List<MapPoint>> tankWallPlacements(double x, double y,
            double facingX, double facingY) {
        MapPoint origin = GameMap.snapToTile(x, y);
        boolean horizontal = Math.abs(facingX) >= Math.abs(facingY);
        double dx = horizontal ? (facingX < 0 ? -1 : 1) : 0;
        double dy = horizontal ? 0 : (facingY < 0 ? -1 : 1);
        double tile = GameMap.TILE_SIZE;
        MapPoint front = new MapPoint(origin.x() + dx * tile, origin.y() + dy * tile);
        return java.util.List.of(
                java.util.List.of(front, new MapPoint(front.x() - dy * tile, front.y() + dx * tile)),
                java.util.List.of(front, new MapPoint(front.x() + dy * tile, front.y() - dx * tile)));
    }
    static int targetPriority(Player player) { return player.job.equals("tank") ? 0 : 1; }
    static boolean preferTarget(Player candidate, Player current, double distance, double currentDistance) {
        return current == null || targetPriority(candidate) < targetPriority(current)
                || targetPriority(candidate) == targetPriority(current) && distance < currentDistance;
    }
    static boolean protectedByTank(Player target, java.util.List<Player> players,
            java.util.function.BiPredicate<Player, Player> clearLine) {
        return players.stream().anyMatch(tank -> tank.job.equals("tank") && !tank.down
                && GameSupport.distance(target.x, target.y, tank.x, tank.y) <= TANK_AURA_RADIUS
                && clearLine.test(target, tank));
    }

    static double dashSpeed(String job) { return job.equals("scout") ? 305 : 265; }
    static double staminaDrain(String job) { return job.equals("scout") ? 23.75 : 38; }
    static double staminaRecovery(String job) { return job.equals("scout") ? 60 : 24; }
    static double downSpeed(String job) { return job.equals("scout") ? 60 : 45; }
    static double staminaMax(String job) { return job.equals("scout") ? 300 : 100; }
    static Player reviveTarget(Player rescuer, java.util.List<Player> allies,
            java.util.function.Predicate<Player> visible) {
        if (rescuer.down || DroneRules.controlling(rescuer)) return null;
        return allies.stream()
                .filter(other -> other != rescuer && other.down
                        && Math.hypot(rescuer.x - other.x, rescuer.y - other.y) <= 78
                        && visible.test(other))
                .min(java.util.Comparator.<Player>comparingInt(other -> other.id.equals(rescuer.actionTarget) ? 0 : 1)
                        .thenComparingDouble(other -> Math.hypot(rescuer.x - other.x, rescuer.y - other.y)))
                .orElse(null);
    }

    static double reviveSeconds(String job) { return job.equals("healer") ? 2 : 4; }
    static boolean canScoutDash(String job, boolean down, boolean carrying, boolean placing,
            boolean railgunBusy, double stamina) {
        return job.equals("scout") && !down && !carrying && !placing && !railgunBusy
                && stamina >= SCOUT_DASH_STAMINA;
    }

    static MapPoint scoutDashDirection(double x, double y, double targetX, double targetY) {
        double dx = targetX - x, dy = targetY - y;
        double length = Math.hypot(dx, dy);
        if (!Double.isFinite(length) || length < 1) return null;
        return new MapPoint(dx / length, dy / length);
    }

    static MapPoint advanceScoutDash(double x, double y, double dx, double dy, double travel,
            java.util.function.BiPredicate<Double, Double> canOccupy) {
        int steps = (int) Math.ceil(travel / SCOUT_DASH_STEP);
        for (int i = 0; i < steps; i++) {
            double step = Math.min(SCOUT_DASH_STEP, travel - i * SCOUT_DASH_STEP);
            double nextX = x + dx * step, nextY = y + dy * step;
            if (!canOccupy.test(nextX, nextY)) break;
            x = nextX; y = nextY;
        }
        return new MapPoint(x, y);
    }
    static boolean disguised(Player player) {
        return player.job.equals("spy") && !player.down && player.spyRemaining > 0;
    }

    static boolean concealedFrom(Player player, Enemy enemy) {
        return disguised(player) && !player.spyHostileEnemies.contains(enemy.id);
    }

    static void recordSpyAttack(Player player, Enemy enemy, java.util.function.DoubleSupplier random) {
        if (!disguised(player) || enemy.hp <= 0 || !player.spyCheckedEnemies.add(enemy.id)) return;
        if (random.getAsDouble() >= SPY_ATTACK_CONCEAL_CHANCE) {
            player.spyHostileEnemies.add(enemy.id);
            enemy.perceptionTimer = 0;
        }
    }

    static boolean avoidsContactDamage(Player player, Enemy enemy) {
        return concealedFrom(player, enemy)
                || (player.job.equals("scout") && !player.down && player.scoutDashRemaining > 0);
    }

    static boolean avoidsContactDamage(Player player) {
        return disguised(player) || (player.job.equals("scout") && !player.down && player.scoutDashRemaining > 0);
    }

    static boolean canHitDisguisedAlly(Player shooter, Player target) {
        return shooter != target && disguised(target);
    }

    static boolean canRecoverTeleport(String job, boolean owned, double range, boolean clearLine) {
        return job.equals("tp") && owned && range <= 45 && clearLine;
    }

    static boolean canTeleportTo(MapPoint point, boolean terrainAllowed, Player actor,
            java.util.List<Player> players, java.util.List<Enemy> enemies, double coreX, double coreY) {
        return terrainAllowed && GameSupport.distance(point.x(), point.y(), coreX, coreY) >= 24
                && players.stream().noneMatch(other -> other != actor
                    && GameSupport.distance(other.x, other.y, point.x(), point.y()) < 12)
                && enemies.stream().noneMatch(enemy -> enemy.hp > 0
                    && GameSupport.distance(enemy.x, enemy.y, point.x(), point.y()) < 24);
    }
}
