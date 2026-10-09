package example;

import java.util.List;

/** Mutable entities owned exclusively by the single game-loop thread. */
final class Player {
    final String id;
    final int slot;
    String name;
    boolean human;
    String sessionId;
    boolean roomReady;
    double reconnectGrace;
    long lastProcessedInput;
    double x;
    double y;
    double moveX;
    double moveY;
    int facingX;
    int facingY = -1;
    double hp;
    double medbayDamageDelay;
    boolean down;
    boolean dashHeld;
    boolean dashing;
    boolean dashExhausted;
    double stamina;
    String job = JobRules.DEFAULT;
    double spyRemaining;
    final java.util.Set<Integer> spyCheckedEnemies = new java.util.HashSet<>();
    final java.util.Set<Integer> spyHostileEnemies = new java.util.HashSet<>();
    double scoutDashRemaining, scoutDashDx, scoutDashDy;
    double jobCooldown;
    double decoyCooldown;
    Drone drone;
    boolean missileControl;
    String breakerControl;
    double missileCooldown;
    double teleportCooldown;
    double tpInvulnerableRemaining;
    double reviveInvulnerableRemaining;
    final java.util.List<MapPoint> teleportPads = new java.util.ArrayList<>();
    final java.util.Map<MapPoint, Integer> teleportPairs = new java.util.HashMap<>();
    String weapon = "pistol";
    double cooldown;
    double cooldownMax;
    final java.util.Map<String, Double> weaponCooldowns = new java.util.HashMap<>();
    final java.util.Map<String, Double> weaponCooldownMaxima = new java.util.HashMap<>();

    void equipWeapon(String next) {
        if (weapon.equals(next)) return;
        stopRailgun();
        weaponCooldowns.put(weapon, cooldown);
        weaponCooldownMaxima.put(weapon, cooldownMax);
        weapon = next;
        cooldown = weaponCooldowns.getOrDefault(next, 0.0);
        cooldownMax = weaponCooldownMaxima.getOrDefault(next, 0.0);
        ensureDistinctWeapons();
    }

    double railgunCharge, railgunRemaining, railgunTick;
    double railgunDx = 1, railgunDy;

    void stopRailgun() {
        if (railgunRemaining > 0) {
            cooldown = WeaponCatalog.stats("railgun").cooldown();
            cooldownMax = cooldown;
        }
        railgunCharge = railgunRemaining = railgunTick = 0;
    }

    final WeaponInventory weapons = new WeaponInventory(() -> job);

    double healRemaining, healX, healY;
    String secondaryWeapon = "bat";
    double secondaryCooldown, secondaryCooldownMax;
    final java.util.Map<String, Double> secondaryWeaponCooldowns = new java.util.HashMap<>();
    final java.util.Map<String, Double> secondaryWeaponCooldownMaxima = new java.util.HashMap<>();
    double secondaryRailgunCharge, secondaryRailgunRemaining, secondaryRailgunTick;
    double secondaryRailgunDx = 1, secondaryRailgunDy;

    void stopSecondaryRailgun() {
        if (secondaryRailgunRemaining > 0) {
            secondaryCooldown = WeaponCatalog.stats("railgun").cooldown();
            secondaryCooldownMax = secondaryCooldown;
        }
        secondaryRailgunCharge = secondaryRailgunRemaining = secondaryRailgunTick = 0;
    }

    void equipSecondaryWeapon(String next) {
        if (job.equals("attacker") && weapon.equals(next)) return;
        if (secondaryWeapon.equals(next)) return;
        stopSecondaryRailgun();
        secondaryWeaponCooldowns.put(secondaryWeapon, secondaryCooldown);
        secondaryWeaponCooldownMaxima.put(secondaryWeapon, secondaryCooldownMax);
        secondaryWeapon = next;
        secondaryCooldown = secondaryWeaponCooldowns.getOrDefault(next, 0.0);
        secondaryCooldownMax = secondaryWeaponCooldownMaxima.getOrDefault(next, 0.0);
    }

    void ensureDistinctWeapons() {
        if (!job.equals("attacker") || !secondaryWeapon.equals(weapon) && weapons.owns(secondaryWeapon)) return;
        equipSecondaryWeapon(WeaponCatalog.ALL.stream().map(WeaponCatalog.Definition::id)
                .filter(id -> !id.equals(weapon) && weapons.owns(id)).findFirst().orElse("none"));
        secondaryFiring = false;
    }
    boolean secondaryFiring;
    double secondaryAimX, secondaryAimY;
    int hookTargetId = -1;
    boolean hookReeling, hookPressHandled, secondaryHookPressHandled;
    String gachaWeapon;
    boolean firing;
    double aimX;
    double aimY;
    int wood;
    int ore;
    int copper, silver, medkits, copperTurretItems, silverTurretItems;
    double gatherCooldown;
    int blockItems;
    int turretItems;
    int wireItems;
    int mineItems;
    int barricadeItems;
    int copperBarricadeItems, silverBarricadeItems;
    int credits;
    double goldRewardRemainder;
    boolean armorBottoms, armorTops;
    int overclockSilverItems;
    final java.util.Map<String, Integer> enchantments = new java.util.HashMap<>();
    final java.util.Map<String, Integer> quarryItems = new java.util.HashMap<>();
    String selectedBuild;
    boolean movingCore;
    String actionTarget;
    double actionProgress;
    int kills;
    int botTargetEnemyId = -1;
    int botObservedEnemyId = -1;
    double botRecognitionTimer;
    double botWanderX;
    double botWanderY;
    double botWanderTimer;
    double botSpendCooldown;
    boolean botSeekingMedbay;
    int botExtendedRound = -1;
    int botSharedRound = -1;
    List<MapPoint> botPath = List.of();
    int botPathIndex;
    double botPathTimer;
    double botPathTargetX = Double.NaN;
    double botPathTargetY = Double.NaN;

    Player(int slot) {
        this.slot = slot;
        this.id = "player-" + slot;
        this.name = "CPU " + slot;
    }

    final java.util.Map<String, java.util.ArrayDeque<Defense>> recoveredDefenses = new java.util.HashMap<>();
    void recoverDefense(Defense defense) {
        recoveredDefenses.computeIfAbsent(defense.type, key -> new java.util.ArrayDeque<>()).add(defense);
        addBuildItem(defense.type, 1);
    }
    Defense takeDefense(String type) {
        var stored = recoveredDefenses.get(type);
        return stored != null && !stored.isEmpty() ? stored.removeFirst() : new Defense(type);
    }


    Player gameplayCopy() { var copy = new Player(slot); copy.copyGameplayFrom(this); return copy; }

    void copyGameplayFrom(Player source) {
        x = source.x;
        y = source.y;
        moveX = source.moveX;
        moveY = source.moveY;
        facingX = source.facingX;
        facingY = source.facingY;
        hp = source.hp;
        medbayDamageDelay = source.medbayDamageDelay;
        down = source.down;
        dashHeld = source.dashHeld;
        dashing = source.dashing;
        dashExhausted = source.dashExhausted;
        stamina = source.stamina;
        job = source.job;
        spyRemaining = source.spyRemaining;
        spyCheckedEnemies.clear(); spyCheckedEnemies.addAll(source.spyCheckedEnemies);
        spyHostileEnemies.clear(); spyHostileEnemies.addAll(source.spyHostileEnemies);
        scoutDashRemaining = source.scoutDashRemaining;
        scoutDashDx = source.scoutDashDx;
        scoutDashDy = source.scoutDashDy;
        jobCooldown = source.jobCooldown;
        decoyCooldown = source.decoyCooldown;
        drone = BackupCopies.drone(source.drone);
        missileControl = source.missileControl;
        breakerControl = source.breakerControl;
        missileCooldown = source.missileCooldown;
        teleportCooldown = source.teleportCooldown;
        tpInvulnerableRemaining = source.tpInvulnerableRemaining;
        reviveInvulnerableRemaining = source.reviveInvulnerableRemaining;
        teleportPads.clear(); teleportPads.addAll(source.teleportPads);
        teleportPairs.clear(); teleportPairs.putAll(source.teleportPairs);
        weapon = source.weapon;
        cooldown = source.cooldown;
        cooldownMax = source.cooldownMax;
        weaponCooldowns.clear(); weaponCooldowns.putAll(source.weaponCooldowns);
        weaponCooldownMaxima.clear(); weaponCooldownMaxima.putAll(source.weaponCooldownMaxima);
        railgunCharge = source.railgunCharge;
        railgunRemaining = source.railgunRemaining;
        railgunTick = source.railgunTick;
        railgunDx = source.railgunDx;
        railgunDy = source.railgunDy;
        weapons.copyFrom(source.weapons);
        healRemaining = source.healRemaining;
        healX = source.healX;
        healY = source.healY;
        secondaryWeapon = source.secondaryWeapon;
        secondaryCooldown = source.secondaryCooldown;
        secondaryCooldownMax = source.secondaryCooldownMax;
        secondaryWeaponCooldowns.clear(); secondaryWeaponCooldowns.putAll(source.secondaryWeaponCooldowns);
        secondaryWeaponCooldownMaxima.clear(); secondaryWeaponCooldownMaxima.putAll(source.secondaryWeaponCooldownMaxima);
        secondaryRailgunCharge = source.secondaryRailgunCharge;
        secondaryRailgunRemaining = source.secondaryRailgunRemaining;
        secondaryRailgunTick = source.secondaryRailgunTick;
        secondaryRailgunDx = source.secondaryRailgunDx;
        secondaryRailgunDy = source.secondaryRailgunDy;
        secondaryFiring = source.secondaryFiring;
        secondaryAimX = source.secondaryAimX;
        secondaryAimY = source.secondaryAimY;
        hookTargetId = source.hookTargetId;
        hookReeling = source.hookReeling;
        hookPressHandled = source.hookPressHandled;
        secondaryHookPressHandled = source.secondaryHookPressHandled;
        gachaWeapon = source.gachaWeapon;
        firing = source.firing;
        aimX = source.aimX;
        aimY = source.aimY;
        wood = source.wood;
        ore = source.ore;
        copper = source.copper;
        silver = source.silver;
        medkits = source.medkits;
        copperTurretItems = source.copperTurretItems;
        silverTurretItems = source.silverTurretItems;
        gatherCooldown = source.gatherCooldown;
        blockItems = source.blockItems;
        turretItems = source.turretItems;
        wireItems = source.wireItems;
        mineItems = source.mineItems;
        barricadeItems = source.barricadeItems;
        copperBarricadeItems = source.copperBarricadeItems;
        silverBarricadeItems = source.silverBarricadeItems;
        credits = source.credits;
        goldRewardRemainder = source.goldRewardRemainder;
        armorBottoms = source.armorBottoms;
        armorTops = source.armorTops;
        overclockSilverItems = source.overclockSilverItems;
        enchantments.clear(); enchantments.putAll(source.enchantments);
        quarryItems.clear(); quarryItems.putAll(source.quarryItems);
        selectedBuild = source.selectedBuild;
        movingCore = source.movingCore;
        actionTarget = source.actionTarget;
        actionProgress = source.actionProgress;
        kills = source.kills;
        botTargetEnemyId = source.botTargetEnemyId;
        botObservedEnemyId = source.botObservedEnemyId;
        botRecognitionTimer = source.botRecognitionTimer;
        botWanderX = source.botWanderX;
        botWanderY = source.botWanderY;
        botWanderTimer = source.botWanderTimer;
        botSpendCooldown = source.botSpendCooldown;
        botSeekingMedbay = source.botSeekingMedbay;
        botExtendedRound = source.botExtendedRound;
        botSharedRound = source.botSharedRound;
        botPath = List.copyOf(source.botPath);
        botPathIndex = source.botPathIndex;
        botPathTimer = source.botPathTimer;
        botPathTargetX = source.botPathTargetX;
        botPathTargetY = source.botPathTargetY;
        recoveredDefenses.clear(); source.recoveredDefenses.forEach((type, values) -> {
            var copies = new java.util.ArrayDeque<Defense>(); values.forEach(value -> copies.add(BackupCopies.defense(value))); recoveredDefenses.put(type, copies);
        });
    }

    int buildItemCount(String type) {
        return switch (type) {
            case "teleporter" -> job.equals("tp") ? Math.max(0, 4 - teleportPads.size()) : 0;
            case "block" -> blockItems;
            case "turret" -> turretItems;
            case "copperTurret" -> copperTurretItems;
            case "silverTurret" -> silverTurretItems;
            case "overclockSilver" -> overclockSilverItems;
            case "wire" -> wireItems;
            case "mine" -> mineItems;
            case "barricade" -> barricadeItems;
            case "copperBarricade" -> copperBarricadeItems;
            case "silverBarricade" -> silverBarricadeItems;
            default -> quarryItems.getOrDefault(type, 0);
        };
    }

    void addBuildItem(String type, int amount) {
        switch (type) {
            case "block" -> blockItems += amount;
            case "turret" -> turretItems += amount;
            case "copperTurret" -> copperTurretItems += amount;
            case "silverTurret" -> silverTurretItems += amount;
            case "overclockSilver" -> overclockSilverItems += amount;
            case "wire" -> wireItems += amount;
            case "mine" -> mineItems += amount;
            case "barricade" -> barricadeItems += amount;
            case "copperBarricade" -> copperBarricadeItems += amount;
            case "silverBarricade" -> silverBarricadeItems += amount;
            default -> { if (type.endsWith("Factory")) quarryItems.merge(type, amount, Integer::sum); }
        }
    }
}

final class Drone {
    double x, y, hp = DroneRules.HP, cooldown;
    boolean active, controlled;
    String weapon = "pistol";
    final java.util.Set<Integer> attackers = new java.util.HashSet<>();
}

final class DroppedResource {
    static final double PICKUP_DELAY_SECONDS = 2.5;

    final int id;
    final String type;
    final double x;
    final double y;
    int amount;
    final String droppedBy;
    boolean ownerLeft;
    double pickupDelay = PICKUP_DELAY_SECONDS;

    DroppedResource(int id, String type, double x, double y, int amount, String droppedBy) {
        this.id = id;
        this.type = type;
        this.x = x;
        this.y = y;
        this.amount = amount;
        this.droppedBy = droppedBy;
    }
}

final class ResourceNode {
    final String id;
    final String type;
    final double x;
    final double y;
    final String requiredArea;
    boolean available = true;
    double respawnTimer;

    ResourceNode(String id, String type, double x, double y, String requiredArea) {
        this.id = id;
        this.type = type;
        this.x = x;
        this.y = y;
        this.requiredArea = requiredArea;
    }
}

final class Enemy {
    final int id;
    final String type;
    final String lane;
    final String spawnId;
    final double maxHp;
    final double speed;
    final double damage;
    final int reward;
    double x;
    double y;
    double hp;
    double attackCooldown;
    double specialCooldown;
    double chargeCooldown = 4, chargeWarning, chargeRemaining, chargeDx, chargeDy;
    final WardenRules.State warden;
    boolean exploded;
    boolean offspringSpawned;
    boolean hookPulled;
    double bagHp, releaseProgress;
    double fuse = -1;
    double slow = 1;
    double frozenRemaining;
    double facingX;
    double facingY = 1;
    double wanderX;
    double wanderY;
    double wanderTimer;
    double creditProgress;
    int paidCredits;
    final List<MapPoint> route;
    final String targetPriority;
    int routeIndex;
    List<MapPoint> path = List.of();
    int pathIndex;
    double pathTimer;
    MapPoint navigationTarget;
    int navigationGeneration = -1;
    double navigationTimer;
    Player visiblePlayer;
    double visiblePlayerX;
    double visiblePlayerY;
    double perceptionTimer;

    Enemy(int id, String type, SpawnPoint spawn, double hp, double speed, double damage, int reward) {
        this.id = id;
        this.type = type;
        this.bagHp = type.equals("carrier") ? SpecialEnemyRules.BAG_HP : 0;
        this.warden = type.equals("warden") ? new WardenRules.State() : null;
        this.lane = spawn.lane();
        this.spawnId = spawn.id();
        this.x = spawn.x();
        this.y = spawn.y();
        this.hp = hp;
        this.maxHp = hp;
        this.speed = speed * spawn.speedMultiplier();
        this.damage = damage;
        this.reward = reward;
        this.route = List.copyOf(spawn.route());
        for (MapPoint point : route) {
            if (Math.hypot(point.x() - x, point.y() - y) > 1) {
                faceToward(point.x(), point.y());
                break;
            }
        }
        this.targetPriority = switch (type) {
            case "hunter", "ghost", "blueAce", "carrier" -> "players";
            case "siege" -> "defenses";
            case "warlord", "titan" -> "core";
            default -> spawn.targetPriority();
        };
        this.specialCooldown = isBoss() ? 4.5 : 0;
        this.wanderX = Math.floorMod(id * 47, 41) - 20;
        this.wanderY = Math.floorMod(id * 71, 41) - 20;
        this.wanderTimer = 0.55 + Math.floorMod(id, 7) * 0.11;
    }

    boolean isBoss() {
        return type.equals("boss") || type.equals("warlord") || type.equals("titan") || type.equals("explosionBoss") || type.equals("warden");
    }

    void faceToward(double targetX, double targetY) {
        double dx = targetX - x, dy = targetY - y;
        double length = Math.hypot(dx, dy);
        if (length > .001) {
            facingX = dx / length;
            facingY = dy / length;
        }
    }

    double shieldedDamage(double damage, double sourceX, double sourceY) {
        if (!type.equals("shield")) return damage;
        double dx = sourceX - x, dy = sourceY - y;
        double length = Math.hypot(dx, dy);
        // A 120-degree frontal arc; melee and explosions bypass this method.
        return length > .001 && (dx * facingX + dy * facingY) / length >= .5 - 1e-9
                ? damage * .20 : damage;
    }
}

/** A fired acid shell survives its shooter and retains the original aim point. */
final class ArtilleryShell {
    final int enemyId;
    final double sourceX, sourceY, x, y, damage;
    double remaining = GameConfig.ARTILLERY_FLIGHT_SECONDS;

    ArtilleryShell(double sourceX, double sourceY, double x, double y, double damage) {
        this(sourceX, sourceY, x, y, damage, -1);
    }

    ArtilleryShell(double sourceX, double sourceY, double x, double y, double damage, int enemyId) {
        this.enemyId = enemyId;
        this.sourceX = sourceX;
        this.sourceY = sourceY;
        this.x = x;
        this.y = y;
        this.damage = damage;
    }
}

final class Defense {
    final String type;
    final double maxHp;
    double hp;
    double cooldown;

    Defense(String type) {
        this(type, switch (type) {
            case "block" -> 320;
            case "turret" -> 120;
            case "copperTurret" -> 220;
            case "silverTurret" -> 320;
            case "overclockSilver" -> 2400;
            case "wire" -> 100;
            case "mine" -> 1;
            case "barricade" -> 1200;
            case "copperBarricade" -> 2400;
            case "silverBarricade" -> 4800;
            default -> 100;
        });
    }

    Defense(String type, double maxHp) {
        this.type = type;
        this.maxHp = maxHp;
        this.hp = maxHp;
    }
}

final class TrapSlot {
    final String id;
    final String lane;
    final double x;
    final double y;
    final String requiredArea;
    Defense defense;
    String ownerId;
    double temporaryRemaining;

    TrapSlot(String id, String lane, double x, double y, String requiredArea) {
        this.id = id;
        this.lane = lane;
        this.x = x;
        this.y = y;
        this.requiredArea = requiredArea;
    }
}
