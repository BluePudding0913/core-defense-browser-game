package example;

/** Mutable entities owned exclusively by the single game-loop thread. */
final class Player {
    final String id;
    final int slot;
    String name;
    boolean human;
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
    boolean ownsShotgun;
    boolean ownsRifle;
    int shotgunAmmo;
    int rifleAmmo;
    String actionTarget;
    double actionProgress;
    int kills;

    Player(int slot) {
        this.slot = slot;
        this.id = "player-" + slot;
        this.name = "CPU " + slot;
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
    double slow = 1;
    boolean rewarded;
    double routeX;
    double routeY;
    boolean routing;

    Enemy(int id, String type, SpawnPoint spawn, double hp, double speed, double damage, int reward) {
        this.id = id;
        this.type = type;
        this.lane = spawn.lane();
        this.spawnId = spawn.id();
        this.x = spawn.x();
        this.y = spawn.y();
        this.hp = hp;
        this.maxHp = hp;
        this.speed = speed;
        this.damage = damage;
        this.reward = reward;
        this.routeX = spawn.routeX();
        this.routeY = spawn.routeY();
        this.routing = spawn.routeX() >= 0;
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
