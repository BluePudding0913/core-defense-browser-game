package example;

import static example.GameConfig.MAX_ROUNDS;
import static example.GameSupport.escapeJson;
import static example.GameSupport.roundOne;

import java.util.List;
import java.util.Locale;

/** Serializes the current authoritative state sent to browser clients. */
final class SnapshotBuilder {
    private SnapshotBuilder() { }

    static String build(GameSession game) {
        int humans = (int) game.players.stream().filter(player -> player.human).count();
        return build(game, "lobby", humans, GameConfig.PLAYER_COUNT);
    }

    static String build(GameSession game, String roomId, int humans, int capacity) {
        StringBuilder json = new StringBuilder(8192);
        json.append("{\"type\":\"state\",\"phase\":\"")
                .append(game.phase.name().toLowerCase(Locale.ROOT));
        json.append("\",\"roomId\":\"").append(escapeJson(roomId)).append('"');
        json.append(",\"roomPlayers\":").append(humans)
                .append(",\"roomCapacity\":").append(capacity);
        json.append(",\"round\":").append(game.round).append(",\"maxRounds\":").append(MAX_ROUNDS);
        json.append(",\"prepTime\":").append(roundOne(game.prepTime));
        json.append(",\"queued\":").append(game.queuedEnemies + game.queuedBosses);
        json.append(",\"roundEvent\":\"").append(game.roundEvent).append('"');
        json.append(",\"failedSpawn\":")
                .append(game.failedSpawnId == null ? "null"
                        : "\"" + escapeJson(game.failedSpawnId) + "\"");
        appendStringArray(json, "activeSpawns", game.activeSpawnIds);
        json.append(",\"noticeVersion\":").append(game.noticeVersion)
                .append(",\"notice\":\"").append(escapeJson(game.notice)).append('"');
        json.append(",\"core\":{\"x\":").append(roundOne(game.coreX))
                .append(",\"y\":").append(roundOne(game.coreY));
        json.append(",\"hp\":").append(roundOne(game.coreHp))
                .append(",\"maxHp\":").append(roundOne(game.coreMaxHp));
        json.append(",\"shield\":").append(roundOne(game.coreShield))
                .append(",\"maxShield\":").append(roundOne(game.coreMaxShield));
        json.append(",\"defense\":").append(game.coreDefenseLevel)
                .append(",\"regen\":").append(game.coreRegenLevel).append('}');
        appendAreas(json, game);
        appendPlayers(json, game.players);
        appendEnemies(json, game.enemies);
        appendSlots(json, game);
        appendResources(json, game);
        json.append('}');
        return json.toString();
    }

    private static void appendAreas(StringBuilder json, GameSession game) {
        json.append(",\"areas\":{");
        for (int i = 0; i < GameMap.AREAS.size(); i++) {
            UnlockArea area = GameMap.AREAS.get(i);
            if (i > 0) json.append(',');
            json.append('"').append(escapeJson(area.id())).append("\":")
                    .append(game.unlockedAreas.contains(area.id()));
        }
        json.append('}');
    }

    private static void appendPlayers(StringBuilder json, List<Player> players) {
        json.append(",\"players\":[");
        for (int i = 0; i < players.size(); i++) {
            Player player = players.get(i);
            if (i > 0) json.append(',');
            json.append("{\"id\":\"").append(player.id)
                    .append("\",\"name\":\"").append(escapeJson(player.name));
            json.append("\",\"human\":").append(player.human)
                    .append(",\"ackInput\":").append(player.lastProcessedInput)
                    .append(",\"x\":").append(roundOne(player.x));
            json.append(",\"y\":").append(roundOne(player.y))
                    .append(",\"hp\":").append(roundOne(player.hp))
                    .append(",\"facingX\":").append(player.facingX)
                    .append(",\"facingY\":").append(player.facingY);
            json.append(",\"down\":").append(player.down)
                    .append(",\"weapon\":\"").append(player.weapon);
            json.append("\",\"cooldown\":").append(roundOne(player.cooldown));
            json.append(",\"cooldownMax\":").append(roundOne(player.cooldownMax));
            json.append(",\"stamina\":").append(roundOne(player.stamina))
                    .append(",\"dashing\":").append(player.dashing);
            json.append(",\"ownsShotgun\":").append(player.ownsShotgun)
                    .append(",\"ownsSmg\":").append(player.ownsSmg)
                    .append(",\"ownsRifle\":").append(player.ownsRifle)
                    .append(",\"ownsSniper\":").append(player.ownsSniper);
            json.append(",\"shotgunAmmo\":").append(player.shotgunAmmo)
                    .append(",\"smgAmmo\":").append(player.smgAmmo)
                    .append(",\"rifleAmmo\":").append(player.rifleAmmo)
                    .append(",\"sniperAmmo\":").append(player.sniperAmmo);
            json.append(",\"wood\":").append(player.wood)
                    .append(",\"ore\":").append(player.ore)
                    .append(",\"credits\":").append(player.credits)
                    .append(",\"gatherCooldown\":").append(roundOne(player.gatherCooldown));
            json.append(",\"selectedBuild\":")
                    .append(player.selectedBuild == null ? "null"
                            : "\"" + escapeJson(player.selectedBuild) + "\"");
            json.append(",\"movingCore\":").append(player.movingCore);
            json.append(",\"buildItems\":{\"block\":").append(player.blockItems)
                    .append(",\"turret\":").append(player.turretItems)
                    .append(",\"wire\":").append(player.wireItems)
                    .append(",\"mine\":").append(player.mineItems)
                    .append(",\"barricade\":").append(player.barricadeItems).append('}');
            json.append(",\"kills\":").append(player.kills);
            json.append(",\"action\":")
                    .append(player.actionTarget == null ? "null" : "\"" + player.actionTarget + "\"");
            json.append(",\"actionProgress\":").append(roundOne(player.actionProgress)).append('}');
        }
        json.append(']');
    }

    private static void appendResources(StringBuilder json, GameSession game) {
        json.append(",\"resources\":[");
        for (int i = 0; i < game.resourceNodes.size(); i++) {
            ResourceNode node = game.resourceNodes.get(i);
            if (i > 0) json.append(',');
            boolean unlocked = node.requiredArea == null
                    || game.unlockedAreas.contains(node.requiredArea);
            json.append("{\"id\":\"").append(escapeJson(node.id))
                    .append("\",\"type\":\"").append(node.type)
                    .append("\",\"x\":").append(roundOne(node.x))
                    .append(",\"y\":").append(roundOne(node.y))
                    .append(",\"available\":").append(node.available && unlocked).append('}');
        }
        json.append(']');
    }

    private static void appendEnemies(StringBuilder json, List<Enemy> enemies) {
        json.append(",\"enemies\":[");
        for (int i = 0; i < enemies.size(); i++) {
            Enemy enemy = enemies.get(i);
            if (i > 0) json.append(',');
            json.append("{\"id\":").append(enemy.id)
                    .append(",\"type\":\"").append(enemy.type);
            json.append("\",\"lane\":\"").append(enemy.lane)
                    .append("\",\"spawnId\":\"").append(enemy.spawnId);
            json.append("\",\"x\":").append(roundOne(enemy.x));
            json.append(",\"y\":").append(roundOne(enemy.y))
                    .append(",\"hp\":").append(roundOne(enemy.hp));
            json.append(",\"maxHp\":").append(roundOne(enemy.maxHp)).append('}');
        }
        json.append(']');
    }

    private static void appendSlots(StringBuilder json, GameSession game) {
        json.append(",\"slots\":[");
        for (int i = 0; i < game.trapSlots.size(); i++) {
            TrapSlot slot = game.trapSlots.get(i);
            if (i > 0) json.append(',');
            boolean locked = slot.requiredArea != null && !game.unlockedAreas.contains(slot.requiredArea);
            json.append("{\"id\":\"").append(slot.id)
                    .append("\",\"lane\":\"").append(slot.lane);
            json.append("\",\"x\":").append(slot.x)
                    .append(",\"y\":").append(slot.y).append(",\"locked\":").append(locked);
            json.append(",\"defense\":");
            if (slot.defense == null) {
                json.append("null");
            } else {
                json.append("{\"type\":\"").append(slot.defense.type)
                        .append("\",\"hp\":").append(roundOne(slot.defense.hp));
                json.append(",\"maxHp\":").append(roundOne(slot.defense.maxHp)).append('}');
            }
            json.append('}');
        }
        json.append(']');
    }

    private static void appendStringArray(StringBuilder json, String name, List<String> values) {
        json.append(",\"").append(name).append("\":[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) json.append(',');
            json.append('"').append(values.get(i)).append('"');
        }
        json.append(']');
    }
}
