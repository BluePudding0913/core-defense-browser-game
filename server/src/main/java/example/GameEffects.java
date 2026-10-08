package example;

import static example.GameSupport.escapeJson;
import static example.GameSupport.roundOne;

/** Converts gameplay notifications into the existing browser protocol. */
final class GameEffects implements CombatEvents {
    private final GameEventSink sink;

    GameEffects(GameEventSink sink) { this.sink = sink; }

    void purchased(Player player, String item, boolean closeMenu) {
        if (player.human) sink.send(player, "{\"type\":\"purchase-complete\",\"item\":\""
                + escapeJson(item) + "\",\"closeMenu\":" + closeMenu + "}");
    }

    public void hit(String playerId, String weapon, double fromX, double fromY,
            double x, double y, double damage, boolean defeated, int credits, boolean headshot, Integer enemyId) {
        sink.broadcast("{\"type\":\"effect\",\"effect\":\"hit\",\"playerId\":\"" + escapeJson(playerId)
                + "\",\"weapon\":\"" + escapeJson(weapon) + "\",\"fromX\":" + roundOne(fromX)
                + ",\"fromY\":" + roundOne(fromY) + ",\"x\":" + roundOne(x)
                + ",\"y\":" + roundOne(y) + ",\"damage\":" + (Math.round(damage * 1000) / 1000.0)
                + ",\"defeated\":" + defeated + ",\"credits\":" + credits
                + ",\"headshot\":" + headshot + ",\"enemyId\":" + enemyId + "}");
    }

    public void sound(Player player, String effect, String item) {
        sink.broadcast("{\"type\":\"effect\",\"effect\":\"" + escapeJson(effect)
                + "\",\"playerId\":\"" + escapeJson(player.id) + "\",\"weapon\":\"" + escapeJson(effect.equals("shot") && (DroneRules.controlling(player) || WeaponCatalog.find(item) != null) ? item : player.weapon)
                + "\",\"item\":\"" + escapeJson(item) + "\"}");
    }

    public void explosion(double x, double y, double radius) {
        sink.broadcast("{\"type\":\"effect\",\"effect\":\"explosion\",\"x\":" + roundOne(x)
                + ",\"y\":" + roundOne(y) + ",\"radius\":" + radius + "}");
    }

    void droneSelfDestruct(Player player, Drone drone) {
        sink.broadcast("{\"type\":\"effect\",\"effect\":\"drone-self-destruct\",\"playerId\":\""
                + escapeJson(player.id) + "\",\"x\":" + roundOne(drone.x) + ",\"y\":" + roundOne(drone.y)
                + ",\"piloted\":" + drone.controlled + "}");
    }

    void missileImpact(double x, double y) {
        sink.broadcast("{\"type\":\"effect\",\"effect\":\"missile-impact\",\"x\":" + roundOne(x)
                + ",\"y\":" + roundOne(y) + "}");
    }

    public void feedback(Player player, String message) {
        if (player.human) sink.send(player, "{\"type\":\"feedback\",\"message\":\""
                + escapeJson(message) + "\"}");
    }

    public void outOfAmmo(Player player) { feedback(player, "弾薬がありません"); }
}
