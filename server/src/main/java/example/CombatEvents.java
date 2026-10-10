package example;

/** Notifications emitted by combat; transport encoding belongs to the adapter. */
interface CombatEvents {
    void hit(String playerId, String weapon, double fromX, double fromY,
            double x, double y, double damage, boolean defeated, int credits, boolean headshot, Integer enemyId);
    void sound(Player player, String effect, String item);
    void explosion(double x, double y, double radius);
    default void alliedExplosion(double x, double y, double radius) { explosion(x, y, radius); }
    default void intercepted(double x, double y) {}
    void outOfAmmo(Player player);
}
