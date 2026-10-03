package example;

import java.util.ArrayDeque;
import java.util.List;

/** Mutable entities owned exclusively by the single game-loop thread. */
final class Player {
    final String id;
    final int slot;
    String name;
    boolean human;
    String sessionId;
    double reconnectGrace;
    long lastProcessedInput;
    double x;
    double y;
    double moveX;
    double moveY;
    double hp;
    boolean down;
    boolean dashHeld;
    boolean dashing;
    boolean dashExhausted;
    double stamina;
    String weapon = "pistol";
    double cooldown;
    double cooldownMax;
    boolean firing;
    double aimX;
    double aimY;
    final ArrayDeque<MapPoint> queuedShots = new ArrayDeque<>();
    boolean ownsShotgun;
    boolean ownsRifle;
    int shotgunAmmo;
    int rifleAmmo;
    int wood;
    int ore;
    double gatherCooldown;
    int blockItems;
    int turretItems;
    int wireItems;
    int mineItems;
    int barricadeItems;
    int credits;
    String selectedBuild;
    boolean movingCore;
    String actionTarget;
    double actionProgress;
    int kills;
    int botTargetEnemyId = -1;
    int botObservedEnemyId = -1;
    double botRecognitionTimer;

    Player(int slot) {
        this.slot = slot;
        this.id = "player-" + slot;
        this.name = "CPU " + slot;
    }

    int buildItemCount(String type) {
        return switch (type) {
            case "block" -> blockItems;
            case "turret" -> turretItems;
            case "wire" -> wireItems;
            case "mine" -> mineItems;
            case "barricade" -> barricadeItems;
            default -> 0;
        };
    }

    void addBuildItem(String type, int amount) {
        switch (type) {
            case "block" -> blockItems += amount;
            case "turret" -> turretItems += amount;
            case "wire" -> wireItems += amount;
            case "mine" -> mineItems += amount;
            case "barricade" -> barricadeItems += amount;
            default -> { }
        }
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
    double slow = 1;
    double wanderX;
    double wanderY;
    double wanderTimer;
    double creditProgress;
    int paidCredits;
    final List<MapPoint> route;
    final String targetPriority;
    int routeIndex;

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
        this.targetPriority = spawn.targetPriority();
        this.specialCooldown = type.equals("boss") ? 4.5 : 0;
        this.wanderX = Math.floorMod(id * 47, 41) - 20;
        this.wanderY = Math.floorMod(id * 71, 41) - 20;
        this.wanderTimer = 0.55 + Math.floorMod(id, 7) * 0.11;
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
            case "wire" -> 100;
            case "mine" -> 1;
            case "barricade" -> 260;
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

    TrapSlot(String id, String lane, double x, double y, String requiredArea) {
        this.id = id;
        this.lane = lane;
        this.x = x;
        this.y = y;
        this.requiredArea = requiredArea;
    }
}
