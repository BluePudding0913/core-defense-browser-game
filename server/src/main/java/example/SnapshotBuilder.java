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
        json.append(",\"roomOwnerId\":")
                .append(game.roomOwnerId == null ? "null"
                        : "\"" + escapeJson(game.roomOwnerId) + "\"")
                .append(",\"allReady\":").append(game.roomReadyForStart());
        json.append(",\"round\":").append(game.round).append(",\"maxRounds\":").append(MAX_ROUNDS);
        json.append(",\"prepTime\":").append(roundOne(game.prepTime));
        json.append(",\"nextPrepBonus\":").append(game.nextPrepBonusSeconds);
        json.append(",\"prepExtensionCost\":").append(game.prepExtensionCost());
        json.append(",\"queued\":").append(game.queuedEnemies + game.queuedBosses);
        json.append(",\"roundEvent\":\"").append(game.roundEvent).append('"');
        json.append(",\"blackoutActive\":").append(game.blackoutActive)
                .append(",\"blackoutBreakerTotal\":").append(game.blackoutBreakerTotal);
        appendStringArray(json, "trippedBreakers",
                game.trippedBreakers.stream().sorted().toList());
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
        appendRules(json, game);
        appendAreas(json, game);
        appendPlayers(json, game);
        appendEnemies(json, game.enemies);
        appendArtilleryShells(json, game);
        appendSlots(json, game);
        appendResources(json, game);
        appendFactories(json, game);
        appendDroppedResources(json, game.droppedResources);
        json.append('}');
        return json.toString();
    }

    private static void appendArtilleryShells(StringBuilder json, GameSession game) {
        json.append(",\"artilleryShells\":[");
        for (int i = 0; i < game.artilleryShells.size(); i++) {
            if (i > 0) json.append(',');
            ArtilleryShell shell = game.artilleryShells.get(i);
            json.append("{\"x\":").append(roundOne(shell.x))
                    .append(",\"y\":").append(roundOne(shell.y))
                    .append(",\"sourceX\":").append(roundOne(shell.sourceX))
                    .append(",\"sourceY\":").append(roundOne(shell.sourceY))
                    .append(",\"remaining\":").append(shell.remaining)
                    .append(",\"duration\":").append(GameConfig.ARTILLERY_FLIGHT_SECONDS)
                    .append(",\"radius\":").append(GameConfig.ARTILLERY_BLAST_RADIUS).append('}');
        }
        json.append(']');
    }

    private static void appendRules(StringBuilder json, GameSession game) {
        json.append(",\"rules\":{\"weaponLimit\":").append(WeaponInventory.MAX_WEAPONS).append(",\"weapons\":{");
        boolean first = true;
        for (var definition : WeaponCatalog.ALL) {
            if (!first) json.append(',');
            first = false;
            String key = definition.id();
            var stats = definition.stats();
            ShopUnit shop = GameMap.shopByItem(key);
            json.append('"').append(key).append("\":{\"capacity\":").append(GameSession.weaponAmmoCapacity(key))
                .append(",\"price\":").append(shop == null ? 0 : shop.cost()).append(",\"refillCost\":").append(GameSession.ammoRefillCost())
                .append(",\"damage\":").append(stats.damage()).append(",\"range\":").append(stats.range())
                .append(",\"cooldown\":").append(stats.cooldown()).append(",\"ammoPerShot\":").append(1)
                .append(",\"pellets\":").append(definition.pellets()).append(",\"maxTargets\":").append(definition.maxTargets())
                .append(",\"blastRadius\":").append(definition.blastRadius())
                .append(",\"owned\":\"").append(definition.ownedField())
                .append("\",\"ammo\":\"").append(definition.ammoField())
                .append("\",\"name\":\"").append(key).append("\"}");
        }
        json.append("},\"recipes\":{");
        first = true;
        for (var entry : GameConfig.BUILD_RECIPES.entrySet()) {
            if (!first) json.append(',');
            first = false;
            String key = entry.getKey();
            String name = switch (key) {
                case "block" -> "防壁";
                case "turret" -> "タレット";
                case "copperTurret" -> "銅タレット";
                case "silverTurret" -> "銀タレット";
                case "wire" -> "有刺鉄線";
                case "mine" -> "地雷";
                default -> "バリケード";
            };
            json.append('"').append(key).append("\":{\"name\":\"").append(name).append("\",\"description\":\"")
                .append(key.equals("copperTurret") ? "威力2倍の強化タレット" : key.equals("silverTurret") ? "高威力・長射程の高速タレット" : "拠点を守る防衛設備").append('"');
            for(String material : List.of("wood","ore","copper","silver")) json.append(",\"").append(material).append("\":").append(entry.getValue().getOrDefault(material,0));
            json.append('}');
        }
        ShopUnit ammo = GameMap.shopByItem("ammo");
        json.append("},\"shop\":{\"medkit\":").append(GameConfig.MEDKIT_PRICE).append(",\"ammo\":").append(ammo.cost())
            .append("},\"medkitHeal\":").append(GameConfig.MEDKIT_HEAL).append(",\"medkitCapacity\":").append(GameConfig.MEDKIT_CAPACITY).append(",\"unlockCost\":").append(game.unlockCost())
            .append(",\"areaUnlockCosts\":{");
        for (int i = 0; i < GameMap.AREAS.size(); i++) {
            if (i > 0) json.append(',');
            String areaId = GameMap.AREAS.get(i).id();
            json.append('"').append(areaId).append("\":").append(game.unlockCost(areaId));
        }
        json.append("},\"coreCosts\":{\"hp\":").append(game.coreUpgradeCost("hp"))
            .append(",\"shield\":").append(game.coreUpgradeCost("shield")).append(",\"defense\":").append(game.coreUpgradeCost("defense"))
            .append(",\"regen\":").append(game.coreUpgradeCost("regen")).append("}}");
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

    private static void appendPlayers(StringBuilder json, GameSession game) {
        List<Player> players = game.players;
        json.append(",\"players\":[");
        for (int i = 0; i < players.size(); i++) {
            Player player = players.get(i);
            if (i > 0) json.append(',');
            json.append("{\"id\":\"").append(player.id)
                    .append("\",\"name\":\"").append(escapeJson(player.name));
            json.append("\",\"human\":").append(player.human)
                    .append(",\"ready\":").append(player.roomReady)
                    .append(",\"ackInput\":").append(player.lastProcessedInput)
                    .append(",\"x\":").append(roundOne(player.x));
            json.append(",\"y\":").append(roundOne(player.y))
                    .append(",\"hp\":").append(roundOne(player.hp))
                    .append(",\"medbayHealing\":").append(game.isMedbayHealing(player))
                    .append(",\"facingX\":").append(player.facingX)
                    .append(",\"facingY\":").append(player.facingY);
            json.append(",\"down\":").append(player.down)
                    .append(",\"weapon\":\"").append(player.weapon);
            json.append("\",\"cooldown\":").append(roundOne(player.cooldown));
            json.append(",\"cooldownMax\":").append(roundOne(player.cooldownMax));
            json.append(",\"railgunCharge\":").append(roundOne(player.railgunCharge))
                    .append(",\"railgunRemaining\":").append(roundOne(player.railgunRemaining))
                    .append(",\"railgunDx\":").append(player.railgunDx)
                    .append(",\"railgunDy\":").append(player.railgunDy)
                    .append(",\"railgunRange\":").append(player.railgunRemaining > 0
                        ? GameMap.distanceToWall(player.x, player.y, player.railgunDx, player.railgunDy, GameSession.weaponStats("railgun").range()) : 0);
            json.append(",\"stamina\":").append(roundOne(player.stamina))
                    .append(",\"dashing\":").append(player.dashing);
            json.append(",\"job\":\"").append(player.job).append('"')
                    .append(",\"spyRemaining\":").append(roundOne(player.spyRemaining))
                    .append(",\"jobCooldown\":").append(roundOne(player.jobCooldown))
                    .append(",\"teleportCooldown\":").append(roundOne(player.teleportCooldown))
                    .append(",\"dashSpeed\":").append(JobRules.dashSpeed(player.job))
                    .append(",\"staminaDrain\":").append(JobRules.staminaDrain(player.job))
                    .append(",\"reviveSeconds\":").append(JobRules.reviveSeconds(player.job))
                    .append(",\"teleportPads\":[");
            for (int padIndex = 0; padIndex < player.teleportPads.size(); padIndex++) {
                if (padIndex > 0) json.append(',');
                MapPoint pad = player.teleportPads.get(padIndex);
                json.append("{\"x\":").append(pad.x()).append(",\"y\":").append(pad.y()).append('}');
            }
            json.append(']');
            // Keep the existing wire fields for browser/reconnect compatibility.
            json.append(",\"drone\":");
            if (player.drone == null) json.append("null");
            else json.append("{\"x\":").append(roundOne(player.drone.x))
                    .append(",\"y\":").append(roundOne(player.drone.y))
                    .append(",\"hp\":").append(roundOne(player.drone.hp))
                    .append(",\"maxHp\":").append(DroneRules.HP)
                    .append(",\"cooldown\":").append(roundOne(player.drone.cooldown))
                    .append(",\"cooldownMax\":").append(DroneRules.COOLDOWN)
                    .append(",\"active\":").append(player.drone.active).append('}');
            json.append(",\"droneRepairOre\":").append(DroneRules.REPAIR_ORE)
                    .append(",\"droneRepairCopper\":").append(DroneRules.REPAIR_COPPER);
            for (var definition : WeaponCatalog.ALL) {
                json.append(",\"").append(definition.ownedField()).append("\":").append(player.weapons.owns(definition.id()));
                json.append(",\"").append(definition.ammoField()).append("\":").append(player.weapons.ammo(definition.id()));
            }
            json.append(",\"wood\":").append(player.wood)
                    .append(",\"ore\":").append(player.ore)
                    .append(",\"copper\":").append(player.copper)
                    .append(",\"silver\":").append(player.silver)
                    .append(",\"medkits\":").append(player.medkits)
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
                    .append(",\"barricade\":").append(player.barricadeItems)
                    .append(",\"copperTurret\":").append(player.copperTurretItems)
                    .append(",\"silverTurret\":").append(player.silverTurretItems)
                    .append(",\"teleporter\":").append(player.buildItemCount("teleporter"));
            for (String item : List.of("woodFactory", "oreFactory", "copperFactory", "silverFactory")) {
                json.append(",\"").append(item).append("\":").append(player.buildItemCount(item));
            }
            json.append('}');
            json.append(",\"kills\":").append(player.kills);
            json.append(",\"action\":")
                    .append(player.actionTarget == null ? "null" : "\"" + player.actionTarget + "\"");
            json.append(",\"actionProgress\":").append(roundOne(player.actionProgress)).append('}');
        }
        json.append(']');
    }

    private static void appendFactories(StringBuilder json, GameSession game) {
        json.append(",\"factories\":[");
        for (int i = 0; i < game.factories.size(); i++) {
            MaterialFactory factory = game.factories.get(i);
            if (i > 0) json.append(',');
            json.append("{\"item\":\"").append(factory.shop.item())
                    .append("\",\"id\":\"").append(factory.id).append("\"")
                    .append(",\"x\":").append(factory.x).append(",\"y\":").append(factory.y)
                    .append(",\"interval\":").append(factory.interval).append('}');
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
                    .append(",\"hp\":").append(enemy.type.equals("explosionBoss") ? enemy.hp : roundOne(enemy.hp));
            json.append(",\"maxHp\":").append(roundOne(enemy.maxHp));
            if (enemy.type.equals("explosionBoss")) json.append(",\"fuse\":").append(enemy.fuse);
            if (enemy.type.equals("shield")) {
                json.append(",\"facingX\":").append(enemy.facingX)
                        .append(",\"facingY\":").append(enemy.facingY);
            }
            json.append('}');
        }
        json.append(']');
    }

    private static void appendDroppedResources(StringBuilder json,
            List<DroppedResource> drops) {
        json.append(",\"drops\":[");
        for (int i = 0; i < drops.size(); i++) {
            DroppedResource drop = drops.get(i);
            if (i > 0) json.append(',');
            json.append("{\"id\":").append(drop.id)
                    .append(",\"type\":\"").append(drop.type)
                    .append("\",\"x\":").append(roundOne(drop.x))
                    .append(",\"y\":").append(roundOne(drop.y))
                    .append(",\"amount\":").append(drop.amount)
                    .append(",\"pickupDelay\":").append(roundOne(drop.pickupDelay)).append('}');
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
