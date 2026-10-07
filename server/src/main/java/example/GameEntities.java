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

    final WeaponInventory weapons = new WeaponInventory();

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
    int credits;
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

    int buildItemCount(String type) {
        return switch (type) {
            case "block" -> blockItems;
            case "turret" -> turretItems;
            case "copperTurret" -> copperTurretItems;
            case "silverTurret" -> silverTurretItems;
            case "wire" -> wireItems;
            case "mine" -> mineItems;
            case "barricade" -> barricadeItems;
            default -> quarryItems.getOrDefault(type, 0);
        };
    }

    void addBuildItem(String type, int amount) {
        switch (type) {
            case "block" -> blockItems += amount;
            case "turret" -> turretItems += amount;
            case "copperTurret" -> copperTurretItems += amount;
            case "silverTurret" -> silverTurretItems += amount;
            case "wire" -> wireItems += amount;
            case "mine" -> mineItems += amount;
            case "barricade" -> barricadeItems += amount;
            default -> { if (type.endsWith("Factory")) quarryItems.merge(type, amount, Integer::sum); }
        }
    }
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
    boolean exploded;
    double fuse = -1;
    double slow = 1;
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
            case "hunter" -> "players";
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
        return type.equals("boss") || type.equals("warlord") || type.equals("titan") || type.equals("explosionBoss");
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
    final double sourceX, sourceY, x, y, damage;
    double remaining = GameConfig.ARTILLERY_FLIGHT_SECONDS;

    ArtilleryShell(double sourceX, double sourceY, double x, double y, double damage) {
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
        this.type = type;
        this.maxHp = switch (type) {
            case "block" -> 320;
            case "turret" -> 120;
            case "copperTurret" -> 220;
            case "silverTurret" -> 320;
            case "wire" -> 100;
            case "mine" -> 1;
            case "barricade" -> 1200;
            default -> 100;
        };
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

    TrapSlot(String id, String lane, double x, double y, String requiredArea) {
        this.id = id;
        this.lane = lane;
        this.x = x;
        this.y = y;
        this.requiredArea = requiredArea;
    }
}
