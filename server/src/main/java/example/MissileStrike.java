package example;

final class MissileStrike {
    final Player owner;
    final double x, y;
    double remaining = MissileRules.DELAY;
    MissileStrike(Player owner, double x, double y) { this.owner = owner; this.x = x; this.y = y; }
}
