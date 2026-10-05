package example;

import static example.GameConfig.BUILD_RECIPES;
import example.GameConfig.WeaponStats;
import static example.GameConfig.GATHER_COOLDOWN_SECONDS;
import static example.GameConfig.MAX_ROUNDS;
import static example.GameConfig.PLAYER_COUNT;
import static example.GameConfig.PREP_SECONDS;
import static example.GameConfig.RECONNECT_GRACE_SECONDS;
import static example.GameMap.CORE_X;
import static example.GameMap.CORE_Y;
import static example.GameMap.MED_X;
import static example.GameMap.MED_Y;
import static example.GameMap.QUARRY_X;
import static example.GameMap.QUARRY_Y;
import static example.GameMap.WOODCUTTER_X;
import static example.GameMap.WOODCUTTER_Y;
import static example.GameMap.WORLD_H;
import static example.GameMap.WORLD_W;
import static example.GameSupport.clamp;
import static example.GameSupport.distance;
import static example.GameSupport.escapeJson;
import static example.GameSupport.roundOne;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;

enum GamePhase { LOBBY, PREPARING, WAVE, WON, LOST }

interface GameEventSink {
    void broadcast(String message);
    void send(Player player, String message);
}

/** Authoritative state and rules for one four-player match. */
final class GameSession {
    static int ammoRefillCost() {
        return 120;
    }

    int unlockCost() {
        return 350 + unlockedAreas.size() * 100;
    }

    int coreUpgradeCost(String type) {
        return switch (type) {
            case "hp" -> 300 + (int) ((coreMaxHp - 1000) * .6);
            case "shield" -> 350 + (int) (coreMaxShield * .8);
            case "defense" -> 450 + coreDefenseLevel * 250;
            case "regen" -> 500 + coreRegenLevel * 300;
            default -> Integer.MAX_VALUE;
        };
    }

    final List<Player> players = new ArrayList<>();
    final List<Enemy> enemies = new ArrayList<>();
    final List<TrapSlot> trapSlots = GameMap.createTrapSlots();
    final List<ResourceNode> resourceNodes = GameMap.createResourceNodes();
    final List<MaterialFactory> factories = new ArrayList<>();
    final List<DroppedResource> droppedResources = new ArrayList<>();
    final Set<String> unlockedAreas = new HashSet<>();
    final List<String> activeSpawnIds = new ArrayList<>();
    final Set<String> trippedBreakers = new HashSet<>();

    GamePhase phase = GamePhase.LOBBY;
    int round;
    double prepTime;
    int queuedEnemies;
    int queuedTinyEnemies;
    int queuedBosses;
    double coreHp;
    double coreMaxHp;
    double coreX;
    double coreY;
    double coreShield;
    double coreMaxShield;
    int coreDefenseLevel;
    int coreRegenLevel;
    int noticeVersion;
    String notice = "プレイヤーを待っています";
    String roundEvent = "none";
    String failedSpawnId;
    boolean blackoutActive;
    int blackoutBreakerTotal;
    int nextPrepBonusSeconds;
    String roomOwnerId;

    private final GameEventSink events;
    private final List<String> activeLanes = new ArrayList<>();
    private final Random random = new Random();
    private double spawnTimer;
    private int nextEnemyId = 1;
    private int nextDefenseId = 1;
    private int nextDroppedResourceId = 1;
    private int nextFactoryId = 1;
    private int nextSpawnIndex;

    GameSession(GameEventSink events) {
        this.events = events;
        for (int slot = 1; slot <= PLAYER_COUNT; slot++) players.add(new Player(slot));
        resetWorld(false);
    }

    Player connectPlayer() {
        return connectPlayer(null);
    }

    Player connectPlayer(String sessionId) {
        if (phase == GamePhase.WON || phase == GamePhase.LOST) resetWorld(true);
        String reconnectId = sessionId == null || sessionId.isBlank() ? null : sessionId;
        Player assigned = reconnectId == null ? null : players.stream()
                .filter(player -> reconnectId.equals(player.sessionId))
                .findFirst().orElse(null);
        boolean rejoining = assigned != null;
        if (assigned == null) {
            assigned = players.stream()
                    .filter(player -> !player.human
                            && (player.sessionId == null || player.reconnectGrace <= 0))
                    .findFirst().orElse(null);
        }
        if (assigned != null) {
            assigned.human = true;
            assigned.roomReady = false;
            assigned.reconnectGrace = 0;
            if (!rejoining) {
                assigned.sessionId = reconnectId;
                assigned.lastProcessedInput = 0;
                assigned.name = "Player " + assigned.slot;
            }
            setNotice(assigned.name + (rejoining ? "が再参加しました" : "が参加しました"));
        }
        return assigned;
    }

    void disconnectPlayer(Player player) {
        if (!player.human) return;
        String displayName = player.name;
        player.human = false;
        player.roomReady = false;
        player.reconnectGrace = player.sessionId == null ? 0 : RECONNECT_GRACE_SECONDS;
        if (player.sessionId == null) player.name = "CPU " + player.slot;
        player.moveX = 0;
        player.moveY = 0;
        player.dashHeld = false;
        player.dashing = false;
        player.firing = false;
        releaseCarriedCore(player);
        cancelAction(player);
        setNotice(displayName + "の接続が切れました");
    }

    void handleMessage(Player player, String message) {
        if (player == null || !players.contains(player) || message == null || message.length() > 160) return;
        if (message.startsWith("INPUT:")) {
            int commandStart = message.indexOf(':', 6);
            if (commandStart < 0) return;
            long sequence = Long.parseLong(message.substring(6, commandStart));
            if (sequence <= 0 || sequence <= player.lastProcessedInput) return;
            player.lastProcessedInput = sequence;
            handleCommand(player, message.substring(commandStart + 1));
            return;
        }
        handleCommand(player, message);
    }

    private void handleCommand(Player player, String message) {
        String[] parts = message.split(":", 4);
        switch (parts[0]) {
            case "HELLO" -> updateName(player, parts);
            case "START" -> {
                if (phase == GamePhase.LOBBY || phase == GamePhase.WON || phase == GamePhase.LOST) {
                    if (!player.id.equals(roomOwnerId)) {
                        feedback(player, "ルームのオーナーだけが開始できます");
                    } else if (!roomReadyForStart()) {
                        feedback(player, "全員の準備が完了するまでお待ちください");
                    } else {
                        startMatch(player, parts.length > 1 && parts[1].equals("DEBUG"));
                    }
                }
            }
            case "ROOM_READY" -> setRoomReady(player, parts);
            case "MOVE" -> handleMove(player, parts);
            case "DASH" -> handleDash(player, parts);
            case "ATTACK" -> attackAt(player, player.aimX, player.aimY);
            case "FIRE" -> handleFire(player, parts);
            case "INTERACT" -> { if (parts.length >= 2) interact(player, parts[1]); }
            case "WEAPON" -> { if (parts.length >= 2) switchWeapon(player, parts[1]); }
            case "BUY" -> { if (parts.length >= 2) buy(player, parts[1]); }
            case "BUILD" -> { if (parts.length >= 3) build(player, parts[1], parts[2]); }
            case "PICKUP_FACTORY" -> { if (parts.length >= 2) pickupFactory(player, parts[1]); }
            case "REMOVE" -> { if (parts.length >= 2) removeDefense(player, parts[1]); }
            case "REPAIR" -> { if (parts.length >= 2) repair(player, parts[1]); }
            case "UPGRADE" -> { if (parts.length >= 2) upgradeCore(player, parts[1]); }
            case "EXTEND_PREP" -> extendPrepTime(player);
            case "UNLOCK" -> { if (parts.length >= 2) unlockArea(player, parts[1]); }
            case "BREAKER" -> { if (parts.length >= 2) resetBreaker(player, parts[1]); }
            case "GATHER" -> { if (parts.length >= 2) gather(player, parts[1]); }
            case "DROP_RESOURCE" -> { if (parts.length >= 3) dropResource(player, parts); }
            case "CRAFT" -> { if (parts.length >= 2) craft(player, parts[1]); }
            case "EQUIP_BUILD" -> { if (parts.length >= 2) equipBuild(player, parts[1]); }
            case "EQUIP_CORE" -> equipCore(player);
            case "CARRY_NEAREST" -> carryNearest(player, parts.length > 1 ? parts[1] : null);
            case "USE" -> { if(parts.length > 1) useItem(player,parts[1]); }
            case "PLACE_FRONT" -> placeInFacingTile(player);
            case "READY" -> { if (phase == GamePhase.PREPARING && !player.down
                    && player.id.equals(roomOwnerId)) prepTime = 0; }
            default -> { }
        }
    }

    void update(double dt) {
        updateReconnectReservations(dt);
        for (Player player : players) {
            player.weaponCooldowns.replaceAll((weapon, remaining) -> Math.max(0, remaining - dt));
            player.cooldown = Math.max(0, player.cooldown - dt);
            player.gatherCooldown = Math.max(0, player.gatherCooldown - dt);
            if (player.firing && player.cooldown <= 0 && canMove()) {
                attackAt(player, player.aimX, player.aimY);
            }
        }
        if (phase == GamePhase.LOBBY || phase == GamePhase.WON || phase == GamePhase.LOST) return;

        updateBots(dt);
        updatePlayers(dt);
        updateRevives(dt);
        updateResources(dt);
        updateFactories(dt);

        if (phase == GamePhase.PREPARING) {
            prepTime = Math.max(0, prepTime - dt);
            if (prepTime <= 0) beginRound();
            return;
        }

        updateSpawning(dt);
        updateDefenses(dt);
        updateEnemies(dt);
        enemies.removeIf(enemy -> enemy.hp <= 0);

        if (coreRegenLevel > 0 && coreHp > 0 && coreHp < coreMaxHp) {
            coreHp = Math.min(coreMaxHp, coreHp + coreRegenLevel * 0.6 * dt);
        }
        if (coreHp <= 0) {
            phase = GamePhase.LOST;
            setNotice("コアが破壊されました");
            return;
        }
        if (players.stream().noneMatch(player -> !player.down)) {
            phase = GamePhase.LOST;
            setNotice("全員が倒れました");
            return;
        }
        if (queuedEnemies == 0 && queuedBosses == 0 && enemies.isEmpty()) finishRound();
    }

    private void updateReconnectReservations(double dt) {
        for (Player player : players) {
            if (player.human || player.sessionId == null) continue;
            player.reconnectGrace = Math.max(0, player.reconnectGrace - dt);
            if (player.reconnectGrace <= 0) {
                player.sessionId = null;
                player.name = "CPU " + player.slot;
            }
        }
    }

    private void updateName(Player player, String[] parts) {
        if (parts.length < 2) return;
        String cleaned = parts[1].replaceAll("[^\\p{L}\\p{N} _-]", "").trim();
        if (!cleaned.isEmpty()) player.name = cleaned.substring(0, Math.min(16, cleaned.length()));
    }

    private void handleMove(Player player, String[] parts) {
        if (parts.length < 3 || !canMove()) return;
        double x = Double.parseDouble(parts[1]);
        double y = Double.parseDouble(parts[2]);
        if (!Double.isFinite(x) || !Double.isFinite(y)) return;
        player.moveX = clamp(x, -1, 1);
        player.moveY = clamp(y, -1, 1);
        double length = Math.hypot(player.moveX, player.moveY);
        if (length > 1) {
            player.moveX /= length;
            player.moveY /= length;
        }
        if (length > 0.12) {
            updateFacing(player, player.moveX, player.moveY);
        }
    }

    private static void updateFacing(Player player, double x, double y) {
        int facingX = Math.abs(x) >= 0.38 ? (x > 0 ? 1 : -1) : 0;
        int facingY = Math.abs(y) >= 0.38 ? (y > 0 ? 1 : -1) : 0;
        if (facingX == 0 && facingY == 0) {
            if (Math.abs(x) >= Math.abs(y)) facingX = x >= 0 ? 1 : -1;
            else facingY = y >= 0 ? 1 : -1;
        }
        player.facingX = facingX;
        player.facingY = facingY;
    }

    private void handleDash(Player player, String[] parts) {
        if (parts.length < 2 || !canMove() || player.down) return;
        player.dashHeld = parts[1].equals("1") || parts[1].equalsIgnoreCase("true");
        if (!player.dashHeld) player.dashing = false;
    }

    private void handleFire(Player player, String[] parts) {
        if (parts.length < 4 || !canMove() || player.down) return;
        double x = Double.parseDouble(parts[1]);
        double y = Double.parseDouble(parts[2]);
        if (!Double.isFinite(x) || !Double.isFinite(y)) return;
        boolean active = parts[3].equals("1") || parts[3].equalsIgnoreCase("true");
        if (player.movingCore) {
            player.firing = false;
            return;
        }
        boolean beginsPress = active && !player.firing;
        player.aimX = clamp(x, 0, WORLD_W);
        player.aimY = clamp(y, 0, WORLD_H);
        player.firing = active;
        if (beginsPress && player.cooldown <= 0) {
            attackAt(player, player.aimX, player.aimY);
        }
    }

    private void startMatch(Player host, boolean debugMode) {
        resetWorld(true);
        if (debugMode) {
            host.credits = 100_000;
            GameConfig.WEAPONS.keySet().forEach(weapon -> giveBotWeapon(host, weapon));
            host.equipWeapon("pistol");
        }
        phase = GamePhase.PREPARING;
        prepTime = 12;
        setNotice("次のラウンドの準備を始めます");
    }

    void setRoomOwner(Player player) {
        if (player != null) roomOwnerId = player.id;
    }

    boolean roomReadyForStart() {
        return players.stream().anyMatch(player -> player.human)
                && players.stream().filter(player -> player.human)
                        .allMatch(player -> player.id.equals(roomOwnerId) || player.roomReady);
    }

    private void setRoomReady(Player player, String[] parts) {
        if (phase != GamePhase.LOBBY && phase != GamePhase.WON && phase != GamePhase.LOST) return;
        if (player.id.equals(roomOwnerId)) return;
        boolean ready = parts.length < 2 || parts[1].equals("1")
                || parts[1].equalsIgnoreCase("true");
        player.roomReady = ready;
    }

    private void beginRound() {
        round++;
        selectRoundSpawns(round);
        phase = GamePhase.WAVE;
        queuedEnemies = 6 + round * 3;
        queuedBosses = round % 4 == 0 ? round / 4 : 0;
        if (round >= 40) {
            // Double the R40 population, then add 20 percentage points per round.
            queuedEnemies = (queuedEnemies * (10 + round - 40) + 4) / 5;
            queuedBosses *= 2;
        }
        // Reserve one simultaneous swarm within the regular population on selected late rounds.
        queuedTinyEnemies = round >= 40 && (round - 40) % 3 == 0
                ? Math.min(queuedEnemies, 48 + (round - 40) * 4) : 0;
        roundEvent = round % 4 == 3 ? "blackout"
                : round >= 5 && round % 4 == 1 ? "door_failure"
                : round % 4 == 0 ? "boss_assault" : "none";
        failedSpawnId = roundEvent.equals("door_failure")
                ? activeSpawnIds.get(random.nextInt(activeSpawnIds.size())) : null;
        if (roundEvent.equals("blackout") && !blackoutActive) startBlackout();
        spawnTimer = round == 1 ? 8 : 0;
        nextSpawnIndex = 0;
        coreShield = coreMaxShield;
        switch (roundEvent) {
            case "blackout" -> setNotice("停電が発生しました。ブレーカーを復旧してください");
            case "door_failure" -> setNotice(GameMap.spawnById(failedSpawnId).name() + "が故障しました");
            case "boss_assault" -> setNotice("ボスが" + queuedBosses + "体出現します");
            default -> { }
        }
    }

    private void finishRound() {
        for (Player player : players) {
            if (player.down) {
                player.down = false;
                player.hp = 45;
                player.moveX = player.moveY = 0;
            }
            cancelAction(player);
        }
        if (round >= MAX_ROUNDS) {
            phase = GamePhase.WON;
            setNotice("すべての敵を倒しました。防衛成功です");
            return;
        }
        int reward = 18 + round * 3;
        players.forEach(player -> player.credits += reward);
        phase = GamePhase.PREPARING;
        prepTime = PREP_SECONDS + nextPrepBonusSeconds;
        nextPrepBonusSeconds = 0;
        activeLanes.clear();
        activeSpawnIds.clear();
        roundEvent = "none";
        failedSpawnId = null;
        setNotice("ラウンドクリア");
    }

    private void selectRoundSpawns(int currentRound) {
        List<SpawnPoint> outside = new ArrayList<>(GameMap.SPAWN_POINTS.stream()
                .filter(spawn -> GameMap.spawnArea(spawn) == null).toList());
        Collections.shuffle(outside, random);
        // Pick distant entrances first so even the opening wave covers multiple sides.
        for (int index = 1; index < outside.size(); index++) {
            final List<SpawnPoint> selected = List.copyOf(outside.subList(0, index));
            SpawnPoint farthest = outside.subList(index, outside.size()).stream()
                    .max(Comparator.comparingDouble(candidate -> selected.stream()
                            .mapToDouble(chosen -> distance(candidate.x(), candidate.y(), chosen.x(), chosen.y()))
                            .min().orElse(0))).orElseThrow();
            Collections.swap(outside, index, outside.indexOf(farthest));
        }
        int count = Math.min(outside.size(), 3 + (currentRound - 1) / 2);
        activeSpawnIds.clear();
        activeLanes.clear();
        for (SpawnPoint spawn : outside.subList(0, count)) addRoundSpawn(spawn);
        List<SpawnPoint> interior = new ArrayList<>(GameMap.SPAWN_POINTS.stream()
                .filter(spawn -> interiorSpawnEligible(spawn, currentRound)).toList());
        Collections.shuffle(interior, random);
        int interiorLimit = currentRound < 8 ? 0 : currentRound < 12 ? 3 : interior.size();
        for (SpawnPoint spawn : interior.subList(0, Math.min(interiorLimit, interior.size()))) addRoundSpawn(spawn);
    }

    private boolean interiorSpawnEligible(SpawnPoint spawn, int currentRound) {
        String area = GameMap.spawnArea(spawn);
        if (area == null || !unlockedAreas.contains(area)) return false;
        int firstRound = switch (area) {
            case "entry-room" -> 8;
            case "transit-hall" -> 10;
            case "armory-wing", "shotgun-room", "smg-room", "ricochet-room" -> 10;
            case "rifle-room", "sniper-room", "revolver-room", "lmg-room" -> 12;
            case "forest" -> 14;
            case "relay-gallery" -> 16;
            case "mine" -> 18;
            case "security-hall", "command-room", "rocket-room" -> 20;
            default -> Integer.MAX_VALUE; // Supply pockets and TIME CONTROL stay safe from spawning.
        };
        return currentRound >= firstRound;
    }

    private void addRoundSpawn(SpawnPoint spawn) {
        if (!activeSpawnIds.contains(spawn.id())) activeSpawnIds.add(spawn.id());
        if (!activeLanes.contains(spawn.lane())) activeLanes.add(spawn.lane());
    }

    private void updatePlayers(double dt) {
        for (Player player : players) {
            double input = Math.hypot(player.moveX, player.moveY);
            if (player.dashExhausted && player.stamina >= 28) player.dashExhausted = false;
            player.dashing = !player.down && !player.movingCore
                    && player.dashHeld && !player.dashExhausted
                    && input > 0.12 && player.stamina > 0;
            if (player.dashing) {
                player.stamina = Math.max(0, player.stamina - 38 * dt);
                if (player.stamina <= 0) {
                    player.dashExhausted = true;
                    player.dashing = false;
                }
            } else {
                player.stamina = Math.min(100, player.stamina + 24 * dt);
            }
            double speed = player.down ? 45 : player.movingCore ? 82 : player.dashing ? 265 : 155;
            double nextX = clamp(player.x + player.moveX * speed * dt, 7, WORLD_W - 7);
            double nextY = clamp(player.y + player.moveY * speed * dt, 7, WORLD_H - 7);
            if (canOccupy(nextX, player.y, 5)) player.x = nextX;
            if (canOccupy(player.x, nextY, 5)) player.y = nextY;
            if (player.movingCore) {
                coreX = player.x;
                coreY = player.y;
            }
        }
    }

    private void updateRevives(double dt) {
        for (Player player : players) {
            Player target = player.down ? null : players.stream()
                    .filter(other -> other != player && other.down
                            && distance(player.x, player.y, other.x, other.y) <= 78
                            && GameMap.hasClearLine(player.x, player.y, other.x, other.y))
                    .min(Comparator.comparingDouble(other -> distance(player.x, player.y, other.x, other.y)))
                    .orElse(null);
            if (target == null) { cancelAction(player); continue; }
            if (!target.id.equals(player.actionTarget)) {
                player.actionTarget = target.id;
                player.actionProgress = 0;
            }
            player.actionProgress += dt;
            if (player.actionProgress >= 4) {
                target.down = false;
                target.hp = 45;
                target.moveX = 0;
                target.moveY = 0;
                cancelAction(player);
                setNotice(target.name + "が復帰しました");
            }
        }
    }

    private void updateFactories(double dt) {
        for (MaterialFactory factory : factories) {
            int produced = factory.produce(dt);
            for (int i = 0; i < produced; i++) {
                List<MapPoint> emptyTiles = new ArrayList<>();
                for (int row = -4; row <= 4; row++) {
                    for (int column = -4; column <= 4; column++) {
                        MapPoint point = new MapPoint(factory.x + column * GameMap.TILE_SIZE,
                                factory.y + row * GameMap.TILE_SIZE);
                        if (canPlaceDefenseAt(point, null) && droppedResources.stream().noneMatch(drop ->
                                distance(point.x(), point.y(), drop.x, drop.y) < 36)) emptyTiles.add(point);
                    }
                }
                // A blocked cycle is discarded; no stock or deferred production accumulates.
                if (emptyTiles.isEmpty()) break;
                MapPoint point = emptyTiles.get(random.nextInt(emptyTiles.size()));
                DroppedResource drop = new DroppedResource(nextDroppedResourceId++, factory.resource,
                        point.x(), point.y(), 1, null);
                drop.pickupDelay = 0;
                drop.ownerLeft = true;
                droppedResources.add(drop);
            }
        }
    }

    private void updateResources(double dt) {
        for (ResourceNode node : resourceNodes) {
            if (node.requiredArea != null && !unlockedAreas.contains(node.requiredArea)) continue;
            if (!node.available) {
                node.respawnTimer = Math.max(0, node.respawnTimer - dt);
                if (node.respawnTimer <= 0) node.available = true;
                continue;
            }
            Player collector = players.stream()
                    .filter(player -> !player.down && distance(player.x, player.y, node.x, node.y) <= 24)
                    .findFirst().orElse(null);
            if (collector == null) continue;
            int amount = 1;
            addResource(collector, node.type, amount);
            node.available = false;
            // Preserve material supply while each pickup awards a single piece.
            double supplyRate = switch (node.type) {
                case "ore" -> 3;
                case "copper" -> 2;
                default -> 1;
            };
            node.respawnTimer = (7 + Math.floorMod(node.id.hashCode(), 5)) / supplyRate;
            events.broadcast("{\"type\":\"effect\",\"effect\":\"pickup\",\"resource\":\""
                    + node.type + "\",\"amount\":" + amount + ",\"playerId\":\"" + collector.id + "\",\"x\":"
                    + roundOne(node.x) + ",\"y\":" + roundOne(node.y) + "}");
        }
        for (DroppedResource drop : droppedResources) {
            Player owner = playerById(drop.droppedBy);
            if (owner == null || distance(owner.x, owner.y, drop.x, drop.y) > 40) drop.ownerLeft = true;
            drop.pickupDelay = Math.max(0, drop.pickupDelay - dt);
            if (drop.pickupDelay > 0) continue;
            Player collector = players.stream()
                    .filter(player -> !player.down
                            && (!player.id.equals(drop.droppedBy) || drop.ownerLeft)
                            && GameMap.hasClearLine(player.x, player.y, drop.x, drop.y)
                            && distance(player.x, player.y, drop.x, drop.y) <= 30)
                    .findFirst().orElse(null);
            if (collector == null) continue;
            addResource(collector,drop.type,drop.amount);
            drop.pickupDelay = -1;
            events.broadcast("{\"type\":\"effect\",\"effect\":\"pickup\",\"resource\":\""
                    + drop.type + "\",\"playerId\":\"" + collector.id + "\",\"x\":"
                    + roundOne(drop.x) + ",\"y\":" + roundOne(drop.y) + "}");
        }
        droppedResources.removeIf(drop -> drop.pickupDelay < 0);
    }

    private void updateSpawning(double dt) {
        if (queuedEnemies <= 0 && queuedBosses <= 0) return;
        spawnTimer -= dt;
        if (spawnTimer > 0) return;
        while (queuedTinyEnemies > 0 && queuedEnemies > 0) {
            spawnEnemy("tiny", nextRoundSpawn());
            queuedTinyEnemies--;
            queuedEnemies--;
        }
        int batchSize = round >= 40 ? 2 + (round - 40) / 3 : 1;
        for (int i = 0; i < batchSize && (queuedEnemies > 0 || queuedBosses > 0); i++) {
            // Each member uses the next entrance so a burst pressures multiple sides.
            SpawnPoint spawn = nextRoundSpawn();
            if (queuedBosses > 0 && queuedEnemies <= queuedBosses * 2) {
                spawnEnemy(round >= 40 ? "titan" : round >= 24 ? "warlord" : "boss", spawn);
                queuedBosses--;
            } else if (queuedEnemies > 0) {
                spawnEnemy(selectEnemyType(spawn), spawn);
                queuedEnemies--;
            }
            double eventMultiplier = roundEvent.equals("door_failure")
                    && spawn.id().equals(failedSpawnId) ? 0.58 : 1;
            spawnTimer = Math.max(0.28, (1.15 - round * 0.045) * eventMultiplier);
        }
    }

    private String selectEnemyType(SpawnPoint spawn) {
        // Reserve a growing share for elites, retaining each entrance's original mix.
        double eliteRoll = random.nextDouble();
        double eliteChance = 0;
        if (round >= 34 && eliteRoll < (eliteChance += 0.12)) return "champion";
        if (round >= 26 && eliteRoll < (eliteChance += 0.14)) return "siege";
        if (round >= 18 && eliteRoll < (eliteChance += 0.16)) return "hunter";
        if (round >= 10 && eliteRoll < (eliteChance += 0.18)) return "armored";
        double bruteChance = round >= 5 ? 0.18 : 0;
        double runnerChance = round >= 3 ? 0.25 : 0;
        if (spawn.enemyBias().equals("runner")) {
            bruteChance = round >= 5 ? 0.10 : 0;
            runnerChance = round >= 3 ? 0.52 : 0;
        } else if (spawn.enemyBias().equals("brute")) {
            bruteChance = round >= 5 ? 0.38 : 0;
            runnerChance = round >= 3 ? 0.16 : 0;
        }
        double roll = random.nextDouble();
        if (roll < bruteChance) return "brute";
        if (roll < bruteChance + runnerChance) return "runner";
        return "grunt";
    }

    private SpawnPoint nextRoundSpawn() {
        if (activeSpawnIds.isEmpty()) return GameMap.SPAWN_POINTS.get(0);
        if (failedSpawnId != null && random.nextDouble() < 0.58) {
            return GameMap.spawnById(failedSpawnId);
        }
        String id = activeSpawnIds.get(nextSpawnIndex % activeSpawnIds.size());
        nextSpawnIndex++;
        return GameMap.spawnById(id);
    }

    private void spawnEnemy(String type, SpawnPoint spawn) {
        double hp;
        double speed;
        double damage;
        int reward;
        switch (type) {
            case "tiny" -> {
                hp = 20 + round * 2;
                speed = 110 + round * 2;
                damage = 8 + round;
                reward = 35;
            }
            case "runner" -> {
                hp = 35 + round * 4;
                speed = 140 + round * 3.5; // After the global 0.5 scale, clearly faster than grunts.
                damage = 8 + round;
                reward = 18;
            }
            case "brute" -> {
                hp = 150 + round * 13;
                speed = 38 + round;
                damage = 20 + round * 1.5;
                reward = 40;
            }
            case "boss" -> {
                hp = 1375 + round * 44;
                speed = 32;
                damage = 48;
                reward = 475;
            }
            case "armored" -> {
                hp = 260 + round * 18;
                speed = 42 + round;
                damage = 24 + round * 1.5;
                reward = 65;
            }
            case "hunter" -> {
                hp = 90 + round * 8;
                speed = 170 + round * 3;
                damage = 16 + round * 1.2;
                reward = 55;
            }
            case "siege" -> {
                hp = 380 + round * 22;
                speed = 34 + round * 0.6;
                damage = 38 + round * 2;
                reward = 95;
            }
            case "champion" -> {
                hp = 300 + round * 20;
                speed = 105 + round * 1.5;
                damage = 28 + round * 1.6;
                reward = 110;
            }
            case "warlord" -> {
                hp = 1900 + round * 55;
                speed = 42;
                damage = 68;
                reward = 650;
            }
            case "titan" -> {
                hp = 2600 + round * 70;
                speed = 36;
                damage = 90;
                reward = 850;
            }
            default -> {
                hp = 56 + round * 6.25;
                speed = 58 + round * 1.5;
                damage = 10 + round;
                reward = 14;
            }
        }
        if (GameMap.spawnArea(spawn) != null) {
            List<MapPoint> route = findPath(spawn.x(), spawn.y(), coreX, coreY, 17, false);
            spawn = new SpawnPoint(spawn.id(), spawn.name(), spawn.x(), spawn.y(), spawn.lane(),
                    spawn.enemyBias(), spawn.speedMultiplier(), spawn.targetPriority(), route);
        }
        // Damage-based gold is 2.5 times the previous reward (rounded to whole gold).
        enemies.add(new Enemy(nextEnemyId++, type, spawn, hp * 2, speed * 0.5, damage, (int) Math.round(reward * 2.5)));
    }

    private void updateDefenses(double dt) {
        for (Enemy enemy : enemies) enemy.slow = 1;
        for (TrapSlot slot : trapSlots) {
            Defense defense = slot.defense;
            if (defense == null) continue;
            defense.cooldown = Math.max(0, defense.cooldown - dt);
            if (defense.type.equals("wire")) {
                for (Enemy enemy : enemies) {
                    if (enemy.hp > 0 && distance(slot.x, slot.y, enemy.x, enemy.y) < 62) {
                        enemy.slow = Math.min(enemy.slow, 0.48);
                    }
                }
            } else if (Set.of("turret","copperTurret","silverTurret").contains(defense.type) && defense.cooldown <= 0) {
                Enemy target = enemies.stream()
                        .filter(enemy -> enemy.hp > 0 && distance(slot.x, slot.y, enemy.x, enemy.y) <= (defense.type.equals("silverTurret") ? 380 : 300))
                        .filter(enemy -> GameMap.hasClearLine(slot.x, slot.y, enemy.x, enemy.y))
                        .min(Comparator.comparingDouble(enemy -> distance(enemy.x, enemy.y, coreX, coreY)))
                        .orElse(null);
                if (target != null) {
                    double tinyHitChance = switch (defense.type) {
                        case "silverTurret" -> .4;
                        case "copperTurret" -> .3;
                        default -> .2;
                    };
                    boolean hit = !target.type.equals("tiny") || random.nextDouble() < tinyHitChance;
                    double turretDamage = (17+round*.5)*(defense.type.equals("silverTurret") ? 3.5 : defense.type.equals("copperTurret") ? 2 : 1);
                    if (hit) damageEnemy(target,turretDamage,null);
                    double missAngle = Math.atan2(target.y - slot.y, target.x - slot.x) + Math.PI / 2;
                    sendHitEffect("trap", "turret", slot.x, slot.y,
                            target.x + (hit ? 0 : Math.cos(missAngle) * 16),
                            target.y + (hit ? 0 : Math.sin(missAngle) * 16),
                            hit ? turretDamage : 0, target.hp <= 0, 0, false);
                    defense.cooldown = defense.type.equals("silverTurret") ? .45 : .7;
                }
            } else if (defense.type.equals("mine")) {
                Enemy trigger = enemies.stream()
                        .filter(enemy -> enemy.hp > 0 && distance(slot.x, slot.y, enemy.x, enemy.y) < 58)
                        .findFirst().orElse(null);
                if (trigger != null) {
                    for (Enemy enemy : enemies) {
                        if (enemy.hp > 0 && distance(slot.x, slot.y, enemy.x, enemy.y) < 120) {
                            damageEnemy(enemy, 450, null);
                            sendHitEffect("trap", "mine", slot.x, slot.y, enemy.x, enemy.y,
                                    450, enemy.hp <= 0, 0, false);
                        }
                    }
                    slot.defense = null;
                }
            }
        }
        for (TrapSlot slot : trapSlots) {
            if (slot.defense != null && slot.defense.hp <= 0) {
                setNotice("防衛設備が破壊されました");
                slot.defense = null;
            }
        }
    }

    private void updateEnemies(double dt) {
        for (Enemy enemy : enemies) {
            if (enemy.hp <= 0) continue;
            enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
            enemy.pathTimer -= dt;
            updateEnemyWander(enemy, dt);

            TrapSlot barricade = trapSlots.stream()
                    .filter(slot -> slot.defense != null
                            && (slot.defense.type.equals("barricade") || slot.defense.type.equals("block"))
                            && distance(enemy.x, enemy.y, slot.x, slot.y) < 52)
                    .min(Comparator.comparingDouble(slot -> distance(enemy.x, enemy.y, slot.x, slot.y)))
                    .orElse(null);
            if (barricade != null) {
                attackDefense(enemy, barricade);
                continue;
            }

            advanceEnemyRoute(enemy);
            if (enemy.isBoss()) {
                enemy.specialCooldown = Math.max(0, enemy.specialCooldown - dt);
                if (enemy.specialCooldown <= 0
                        && distance(enemy.x, enemy.y, coreX, coreY) <= 260) {
                    useBossCorePulse(enemy);
                    enemy.specialCooldown = enemy.type.equals("titan") ? 4 : enemy.type.equals("warlord") ? 5 : 6;
                }
            }
            double defenseRange = switch (enemy.targetPriority) {
                case "defenses" -> 190;
                case "players" -> 75;
                default -> 50;
            };
            double playerRange = switch (enemy.targetPriority) {
                case "players" -> 190;
                case "defenses" -> 75;
                default -> 55;
            };
            TrapSlot defenseTarget = nearestDefense(enemy, defenseRange);
            Player playerTarget = nearestPlayer(enemy, playerRange);
            boolean preferDefense = enemy.targetPriority.equals("defenses");
            if (preferDefense && defenseTarget != null || playerTarget == null) {
                playerTarget = null;
            } else if (playerTarget != null) {
                defenseTarget = null;
            }

            if (defenseTarget != null) {
                double targetDistance = distance(enemy.x, enemy.y, defenseTarget.x, defenseTarget.y);
                if (targetDistance <= 38) attackDefense(enemy, defenseTarget);
                else moveEnemyToward(enemy, defenseTarget.x, defenseTarget.y, enemy.speed * enemy.slow * dt);
                continue;
            }
            if (playerTarget != null) {
                double targetDistance = distance(enemy.x, enemy.y, playerTarget.x, playerTarget.y);
                if (targetDistance <= 36) {
                    if (enemy.attackCooldown <= 0) {
                        damagePlayer(playerTarget, enemy.damage);
                        enemy.attackCooldown = 0.9;
                    }
                } else {
                    moveEnemyToward(enemy, playerTarget.x, playerTarget.y, enemy.speed * enemy.slow * dt);
                }
                continue;
            }

            boolean canSeeCore = distance(enemy.x, enemy.y, coreX, coreY) <= 520
                    && GameMap.hasClearLine(enemy.x, enemy.y, coreX, coreY);
            MapPoint routeTarget = !canSeeCore && enemy.routeIndex < enemy.route.size()
                    ? enemy.route.get(enemy.routeIndex) : null;
            double targetX = routeTarget == null ? coreX : routeTarget.x();
            double targetY = routeTarget == null ? coreY : routeTarget.y();
            double targetDistance = distance(enemy.x, enemy.y, targetX, targetY);

            if (routeTarget == null && distance(enemy.x, enemy.y, coreX, coreY) <= 72) {
                if (enemy.attackCooldown <= 0) {
                    damageCore(enemy.damage);
                    enemy.attackCooldown = 0.9;
                }
            } else {
                moveEnemyToward(enemy, targetX + enemy.wanderX, targetY + enemy.wanderY,
                        enemy.speed * enemy.slow * dt);
            }
        }
    }

    private void updateEnemyWander(Enemy enemy, double dt) {
        enemy.wanderTimer -= dt;
        if (enemy.wanderTimer > 0) return;
        enemy.wanderX = random.nextDouble(-20, 20);
        enemy.wanderY = random.nextDouble(-20, 20);
        enemy.wanderTimer = random.nextDouble(0.65, 1.35);
    }

    private void advanceEnemyRoute(Enemy enemy) {
        while (enemy.routeIndex < enemy.route.size()) {
            MapPoint current = enemy.route.get(enemy.routeIndex);
            double currentDistance = distance(enemy.x, enemy.y, current.x(), current.y());
            if (currentDistance <= 30) {
                enemy.routeIndex++;
                continue;
            }
            if (enemy.routeIndex + 1 < enemy.route.size()) {
                MapPoint next = enemy.route.get(enemy.routeIndex + 1);
                if (distance(enemy.x, enemy.y, next.x(), next.y()) + 18 < currentDistance) {
                    enemy.routeIndex++;
                    continue;
                }
            }
            break;
        }
    }

    private TrapSlot nearestDefense(Enemy enemy, double range) {
        return trapSlots.stream()
                .filter(slot -> slot.defense != null && !slot.defense.type.equals("mine")
                        && distance(enemy.x, enemy.y, slot.x, slot.y) <= range)
                .min(Comparator.comparingDouble(slot -> distance(enemy.x, enemy.y, slot.x, slot.y)))
                .orElse(null);
    }

    private Player nearestPlayer(Enemy enemy, double range) {
        return players.stream()
                .filter(player -> !player.down
                        && distance(enemy.x, enemy.y, player.x, player.y) <= range)
                .min(Comparator.comparingDouble(player -> distance(enemy.x, enemy.y, player.x, player.y)))
                .orElse(null);
    }

    private void attackDefense(Enemy enemy, TrapSlot slot) {
        if (enemy.attackCooldown <= 0 && slot.defense != null) {
            slot.defense.hp -= enemy.damage;
            enemy.attackCooldown = 0.9;
        }
    }

    private void useBossCorePulse(Enemy enemy) {
        damageCore(enemy.damage * 0.55);
        for (Player player : players) {
            if (!player.down && distance(player.x, player.y, coreX, coreY) <= 175) {
                damagePlayer(player, 12 + round * 0.6);
            }
        }
        events.broadcast("{\"type\":\"effect\",\"effect\":\"core-pulse\",\"x\":"
                + roundOne(coreX) + ",\"y\":" + roundOne(coreY) + "}");
    }

    private void moveEnemyToward(Enemy enemy, double targetX, double targetY, double amount) {
        if (!GameMap.hasClearLine(enemy.x, enemy.y, targetX, targetY)) {
            if (enemy.pathTimer <= 0) {
                enemy.path = findPath(enemy.x, enemy.y, targetX, targetY, 17, false);
                enemy.pathIndex = 0;
                enemy.pathTimer = 1;
            }
            while (enemy.pathIndex < enemy.path.size()
                    && distance(enemy.x, enemy.y, enemy.path.get(enemy.pathIndex).x(), enemy.path.get(enemy.pathIndex).y()) < 8) enemy.pathIndex++;
            if (enemy.pathIndex < enemy.path.size()) {
                targetX = enemy.path.get(enemy.pathIndex).x();
                targetY = enemy.path.get(enemy.pathIndex).y();
            }
        }
        double dx = targetX - enemy.x;
        double dy = targetY - enemy.y;
        double length = Math.max(1, Math.hypot(dx, dy));
        double nextX = clamp(enemy.x + dx / length * amount, 18, WORLD_W - 18);
        double nextY = clamp(enemy.y + dy / length * amount, 18, WORLD_H - 18);
        if (canOccupy(nextX, enemy.y, 17)) enemy.x = nextX;
        if (canOccupy(enemy.x, nextY, 17)) enemy.y = nextY;
    }

    private void damageCore(double rawDamage) {
        double damage = rawDamage * Math.max(0.55, 1 - coreDefenseLevel * 0.1);
        if (coreShield > 0) {
            double absorbed = Math.min(coreShield, damage);
            coreShield -= absorbed;
            damage -= absorbed;
        }
        coreHp = Math.max(0, coreHp - damage);
    }

    private void updateBots(double dt) {
        for (Player bot : players) {
            if (bot.human) continue;
            updateBotWander(bot, dt);
            bot.dashHeld = false;
            bot.botSpendCooldown = Math.max(0, bot.botSpendCooldown - dt);
            if (bot.down) {
                updateDownedBot(bot);
                continue;
            }

            Player downed = bestBotRescueTarget(bot);
            if (downed != null && shouldBotRescue(bot, downed)) {
                if (distance(bot.x, bot.y, downed.x, downed.y) < 65
                        && GameMap.hasClearLine(bot.x, bot.y, downed.x, downed.y)) {
                    bot.moveX = 0;
                    bot.moveY = 0;
                } else moveBotToward(bot, downed.x, downed.y);
                Enemy threat = bestBotCombatTarget(bot);
                if (threat != null) {
                    selectBotWeapon(bot, distance(bot.x, bot.y, threat.x, threat.y));
                    attack(bot, threat.id);
                }
                continue;
            }
            if (bot.movingCore) { updateBotCoreTransport(bot); continue; }
            boolean immediateDanger = enemies.stream().anyMatch(enemy -> enemy.hp > 0
                    && (distance(bot.x, bot.y, enemy.x, enemy.y) < 240
                    || distance(coreX, coreY, enemy.x, enemy.y) < 240));
            boolean personalDanger = enemies.stream().anyMatch(enemy -> enemy.hp>0 && distance(bot.x,bot.y,enemy.x,enemy.y)<240);
            if (!personalDanger && bot.credits >= unlockCost() && bot.hp > 55 && tryBotUnlock(bot)) continue;
            if (!immediateDanger && updateBotTasks(bot)) continue;

            if (phase == GamePhase.WAVE) {
                Enemy target = enemies.stream()
                        .filter(enemy -> enemy.id == bot.botTargetEnemyId && enemy.hp > 0
                                && distance(bot.x, bot.y, enemy.x, enemy.y) <= 760)
                        .findFirst().orElse(null);
                Enemy candidate = bestBotCombatTarget(bot);
                boolean shouldChangeTarget = target == null || candidate != null
                        && candidate.id != target.id
                        && botThreatScore(bot, candidate) > botThreatScore(bot, target) + 160;
                if (shouldChangeTarget && candidate != null) {
                    if (recognizeBotTarget(bot, candidate, dt)) target = candidate;
                } else if (target != null) {
                    bot.botObservedEnemyId = target.id;
                    bot.botRecognitionTimer = 0;
                } else {
                    clearBotTarget(bot);
                }
                if (target != null) {
                    engageBotTarget(bot, target);
                } else {
                    double[] guard = guardPoint(assignedLane(bot.slot, activeLanes), bot.slot);
                    if (distance(bot.x, bot.y, guard[0], guard[1]) > 35) {
                        moveBotToward(bot, guard[0], guard[1]);
                    } else {
                        steerBot(bot, 0, 0);
                    }
                }
            } else {
                bot.botTargetEnemyId = -1;
                bot.botObservedEnemyId = -1;
                bot.botRecognitionTimer = 0;
                double[] guard = guardPoint(laneForSlot(bot.slot), bot.slot);
                if (distance(bot.x, bot.y, guard[0], guard[1]) > 35) {
                    moveBotToward(bot, guard[0], guard[1]);
                } else {
                    steerBot(bot, 0, 0);
                }
            }
        }
    }

    private void updateDownedBot(Player bot) {
        bot.moveX = bot.moveY = 0;
        List<Player> survivors = players.stream().filter(player -> !player.down)
                .sorted(Comparator.comparingDouble(player -> distance(bot.x, bot.y, player.x, player.y)))
                .toList();
        for (Player survivor : survivors) {
            if (distance(bot.x, bot.y, survivor.x, survivor.y) <= 65
                    && GameMap.hasClearLine(bot.x, bot.y, survivor.x, survivor.y)) return;
            MapPoint waypoint = nextBotWaypoint(bot, survivor.x, survivor.y);
            if (waypoint == null) continue;
            double dx = waypoint.x() - bot.x;
            double dy = waypoint.y() - bot.y;
            double length = Math.max(1, Math.hypot(dx, dy));
            // Crawling must not be pushed away from rescuers by normal bot steering.
            bot.moveX = dx / length;
            bot.moveY = dy / length;
            updateFacing(bot, bot.moveX, bot.moveY);
            return;
        }
    }

    private Player bestBotRescueTarget(Player bot) {
        Player downed = players.stream().filter(player -> player.down && player != bot)
                .min(Comparator.comparingDouble(player ->
                        distance(bot.x, bot.y, player.x, player.y))).orElse(null);
        if (downed == null) return null;
        Player assignedRescuer = players.stream()
                .filter(player -> !player.human && !player.down)
                .min(Comparator.comparingDouble((Player player) ->
                        distance(player.x, player.y, downed.x, downed.y))
                        .thenComparingInt(player -> player.slot)).orElse(null);
        return assignedRescuer == bot ? downed : null;
    }

    private boolean shouldBotRescue(Player bot, Player downed) {
        if (distance(bot.x, bot.y, downed.x, downed.y) > 720) return false;
        if (phase != GamePhase.WAVE) return true;
        boolean rescueAreaSafe = enemies.stream().filter(enemy -> enemy.hp > 0)
                .noneMatch(enemy -> distance(enemy.x, enemy.y, downed.x, downed.y) < 145);
        boolean coreCritical = enemies.stream().filter(enemy -> enemy.hp > 0)
                .anyMatch(enemy -> distance(enemy.x, enemy.y, coreX, coreY) < 125);
        return !coreCritical && (rescueAreaSafe || bot.hp >= 60);
    }

    private Enemy bestBotCombatTarget(Player bot) {
        return enemies.stream().filter(enemy -> enemy.hp > 0
                        && distance(bot.x, bot.y, enemy.x, enemy.y) <= 720)
                .max(Comparator.comparingDouble(enemy -> botThreatScore(bot, enemy)))
                .orElse(null);
    }

    private double botThreatScore(Player bot, Enemy enemy) {
        double score = 1_050 - Math.min(1_050, distance(enemy.x, enemy.y, coreX, coreY));
        score += enemy.routeIndex * 85;
        score += switch (enemy.type) {
            case "boss", "warlord", "titan" -> 460;
            case "champion" -> 260;
            case "siege" -> 240;
            case "armored" -> 200;
            case "hunter" -> 190;
            case "brute" -> 180;
            case "runner" -> 125;
            default -> 70;
        };
        if (enemy.lane.equals(assignedLane(bot.slot, activeLanes))) score += 90;
        if (GameMap.hasClearLine(bot.x, bot.y, enemy.x, enemy.y)) score += 75;
        score += (1 - enemy.hp / enemy.maxHp) * 55;
        score -= distance(bot.x, bot.y, enemy.x, enemy.y) * 0.34;
        long otherClaims = players.stream().filter(player -> player != bot && !player.human
                && player.botTargetEnemyId == enemy.id).count();
        score -= otherClaims * (enemy.isBoss() ? 35 : 145);
        return score;
    }

    private boolean recognizeBotTarget(Player bot, Enemy candidate, double dt) {
        if (bot.botObservedEnemyId != candidate.id) {
            bot.botObservedEnemyId = candidate.id;
            bot.botRecognitionTimer = 0.18 + bot.slot * 0.04;
        }
        bot.botRecognitionTimer = Math.max(0, bot.botRecognitionTimer - dt);
        if (bot.botRecognitionTimer > 0) return false;
        bot.botTargetEnemyId = candidate.id;
        return true;
    }

    private static void clearBotTarget(Player bot) {
        bot.botTargetEnemyId = -1;
        bot.botObservedEnemyId = -1;
        bot.botRecognitionTimer = 0;
    }

    private void engageBotTarget(Player bot, Enemy target) {
        double targetDistance = distance(bot.x, bot.y, target.x, target.y);
        selectBotWeapon(bot, targetDistance);
        WeaponStats weapon = weaponStats(bot.weapon);
        double effectiveRange = weapon.range() - 8;
        boolean clearShot = GameMap.hasClearLine(bot.x, bot.y, target.x, target.y);
        if (clearShot && targetDistance <= effectiveRange && bot.cooldown <= 0) {
            attack(bot, target.id);
        }

        double preferredRange = switch (bot.weapon) {
            case "bat" -> 54;
            case "shotgun" -> 135;
            case "smg" -> 210;
            case "rifle" -> 315;
            case "sniper" -> 700;
            case "rocket" -> 500;
            case "revolver" -> 360;
            case "lmg" -> 290;
            default -> 215;
        };
        if (!clearShot || targetDistance > effectiveRange * 0.92) {
            moveBotToward(bot, target.x, target.y);
        } else if (targetDistance < Math.min(90, preferredRange * 0.52)) {
            moveBotToSaferPosition(bot, target);
        } else if (Math.abs(targetDistance - preferredRange) > 45) {
            if (targetDistance > preferredRange) moveBotToward(bot, target.x, target.y);
            else moveBotToSaferPosition(bot, target);
        } else {
            moveBotAround(bot, target.x, target.y);
        }
    }

    private static void selectBotWeapon(Player bot, double targetDistance) {
        if (targetDistance <= 72 && (!hasBotRangedAmmo(bot) || bot.hp > 70)) {
            bot.equipWeapon("bat");
        } else if (bot.ownsRevolver && bot.revolverAmmo > 0 && targetDistance <= 500) {
            bot.equipWeapon("revolver");
        } else if (bot.ownsRocket && bot.rocketAmmo > 0 && targetDistance > 160 && targetDistance <= weaponStats("rocket").range()) {
            bot.equipWeapon("rocket");
        } else if (targetDistance > 390 && bot.ownsSniper && bot.sniperAmmo > 0) {
            bot.equipWeapon("sniper");
        } else if (targetDistance > 260 && bot.ownsRifle && bot.rifleAmmo > 0) {
            bot.equipWeapon("rifle");
        } else if (bot.ownsLmg && bot.lmgAmmo > 0 && targetDistance <= 360) {
            bot.equipWeapon("lmg");
        } else if (bot.ownsRicochet && bot.ricochetAmmo > 0 && targetDistance <= 300) {
            bot.equipWeapon("ricochet");
        } else if (targetDistance > 155 && bot.ownsSmg && bot.smgAmmo > 0) {
            bot.equipWeapon("smg");
        } else if (targetDistance <= 190 && bot.ownsShotgun && bot.shotgunAmmo > 0) {
            bot.equipWeapon("shotgun");
        } else if (bot.ownsSmg && bot.smgAmmo > 0) {
            bot.equipWeapon("smg");
        } else if (bot.ownsRifle && bot.rifleAmmo > 0) {
            bot.equipWeapon("rifle");
        } else if (bot.ownsSniper && bot.sniperAmmo > 0) {
            bot.equipWeapon("sniper");
        } else {
            bot.equipWeapon("pistol");
        }
        bot.selectedBuild = null;
    }

    private static boolean hasBotRangedAmmo(Player bot) {
        return bot.ownsShotgun && bot.shotgunAmmo > 0
                || bot.ownsSmg && bot.smgAmmo > 0
                || bot.ownsRifle && bot.rifleAmmo > 0
                || bot.ownsSniper && bot.sniperAmmo > 0
                || bot.ownsRevolver && bot.revolverAmmo > 0
                || bot.ownsRocket && bot.rocketAmmo > 0
                || bot.ownsLmg && bot.lmgAmmo > 0
                || bot.ownsRicochet && bot.ricochetAmmo > 0;
    }

    private void moveBotToSaferPosition(Player bot, Enemy enemy) {
        double bestX = bot.x;
        double bestY = bot.y;
        double bestScore = Double.NEGATIVE_INFINITY;
        for (int index = 0; index < 12; index++) {
            double angle = Math.PI * 2 * index / 12.0 + bot.slot * 0.31;
            double candidateX = bot.x + Math.cos(angle) * 86;
            double candidateY = bot.y + Math.sin(angle) * 86;
            if (!canOccupy(candidateX, candidateY, 5)) continue;
            double enemyDistance = distance(candidateX, candidateY, enemy.x, enemy.y);
            double teamSpacing = players.stream().filter(player -> player != bot && !player.down)
                    .mapToDouble(player -> distance(candidateX, candidateY, player.x, player.y))
                    .min().orElse(120);
            double score = enemyDistance + Math.min(100, teamSpacing) * 0.45
                    + (GameMap.hasClearLine(candidateX, candidateY, enemy.x, enemy.y) ? 45 : -35);
            if (score > bestScore) {
                bestScore = score;
                bestX = candidateX;
                bestY = candidateY;
            }
        }
        if (bestScore > Double.NEGATIVE_INFINITY) moveBotToward(bot, bestX, bestY);
        else moveBotAway(bot, enemy.x, enemy.y);
    }

    private static String laneForSlot(int slot) {
        return switch (slot) {
            case 1 -> "north";
            case 2 -> "east";
            case 3 -> "south";
            default -> "west";
        };
    }

    private static String assignedLane(int slot, List<String> lanes) {
        if (lanes.isEmpty()) return laneForSlot(slot);
        return lanes.get((slot - 1) % lanes.size());
    }

    private double[] guardPoint(String lane, int slot) {
        double spacing = (slot - 2.5) * 24;
        return switch (lane) {
            case "north" -> new double[] {coreX + spacing, coreY - 100};
            case "east" -> new double[] {coreX + 100, coreY + spacing};
            case "south" -> new double[] {coreX - spacing, coreY + 100};
            default -> new double[] {coreX - 100, coreY - spacing};
        };
    }

    private void moveBotToward(Player bot, double x, double y) {
        bot.dashHeld = distance(bot.x, bot.y, x, y) > 180 && bot.stamina > 30;
        MapPoint waypoint = nextBotWaypoint(bot, x, y);
        if (waypoint == null) {
            steerBot(bot, 0, 0);
            return;
        }
        double dx = waypoint.x() - bot.x;
        double dy = waypoint.y() - bot.y;
        double length = Math.max(1, Math.hypot(dx, dy));
        steerBot(bot, dx / length, dy / length);
    }

    private MapPoint nextBotWaypoint(Player bot, double targetX, double targetY) {
        boolean targetChanged = !Double.isFinite(bot.botPathTargetX)
                || distance(bot.botPathTargetX, bot.botPathTargetY, targetX, targetY) > 55;
        if (targetChanged || bot.botPathTimer <= 0) {
            bot.botPath = findBotPath(bot, targetX, targetY);
            bot.botPathIndex = 0;
            bot.botPathTimer = 0.65 + bot.slot * 0.06;
            bot.botPathTargetX = targetX;
            bot.botPathTargetY = targetY;
        }
        while (bot.botPathIndex < bot.botPath.size()) {
            MapPoint waypoint = bot.botPath.get(bot.botPathIndex);
            if (distance(bot.x, bot.y, waypoint.x(), waypoint.y()) >= 13) return waypoint;
            bot.botPathIndex++;
        }
        if (distance(bot.x, bot.y, targetX, targetY) <= GameMap.TILE_SIZE * 1.5
                && canOccupy(targetX, targetY, 5)) {
            return new MapPoint(targetX, targetY);
        }
        return null;
    }

    private List<MapPoint> findBotPath(Player bot, double targetX, double targetY) {
        return findPath(bot.x, bot.y, targetX, targetY, 5, true);
    }

    private List<MapPoint> findPath(double fromX, double fromY, double targetX, double targetY,
            double radius, boolean avoidDefenses) {
        int columns = WORLD_W / GameMap.TILE_SIZE;
        int rows = WORLD_H / GameMap.TILE_SIZE;
        int startColumn = (int) clamp(Math.floor(fromX / GameMap.TILE_SIZE), 0, columns - 1);
        int startRow = (int) clamp(Math.floor(fromY / GameMap.TILE_SIZE), 0, rows - 1);
        int start = startRow * columns + startColumn;
        int[] parent = new int[columns * rows];
        java.util.Arrays.fill(parent, -1);
        parent[start] = start;
        ArrayDeque<Integer> queue = new ArrayDeque<>();
        queue.add(start);
        int best = start;
        double bestDistance = distance((startColumn + 0.5) * GameMap.TILE_SIZE,
                (startRow + 0.5) * GameMap.TILE_SIZE, targetX, targetY);
        int[][] directions = {{0, -1}, {1, 0}, {0, 1}, {-1, 0}};

        while (!queue.isEmpty()) {
            int current = queue.removeFirst();
            int column = current % columns;
            int row = current / columns;
            for (int[] direction : directions) {
                int nextColumn = column + direction[0];
                int nextRow = row + direction[1];
                if (nextColumn < 0 || nextColumn >= columns || nextRow < 0 || nextRow >= rows) {
                    continue;
                }
                int next = nextRow * columns + nextColumn;
                if (parent[next] >= 0) continue;
                double x = (nextColumn + 0.5) * GameMap.TILE_SIZE;
                double y = (nextRow + 0.5) * GameMap.TILE_SIZE;
                if (!(avoidDefenses ? canOccupy(x, y, radius)
                        : GameMap.canOccupy(x, y, radius, unlockedAreas))) continue;
                parent[next] = current;
                queue.addLast(next);
                double targetDistance = distance(x, y, targetX, targetY);
                if (targetDistance < bestDistance) {
                    bestDistance = targetDistance;
                    best = next;
                }
            }
        }
        if (best == start) return List.of();
        List<MapPoint> path = new ArrayList<>();
        for (int current = best; current != start; current = parent[current]) {
            int column = current % columns;
            int row = current / columns;
            path.add(new MapPoint((column + 0.5) * GameMap.TILE_SIZE,
                    (row + 0.5) * GameMap.TILE_SIZE));
        }
        Collections.reverse(path);
        return List.copyOf(path);
    }

    private void moveBotAway(Player bot, double x, double y) {
        double dx = bot.x - x;
        double dy = bot.y - y;
        double length = Math.max(1, Math.hypot(dx, dy));
        steerBot(bot, dx / length, dy / length);
    }

    private void moveBotAround(Player bot, double x, double y) {
        double dx = bot.x - x;
        double dy = bot.y - y;
        double length = Math.max(1, Math.hypot(dx, dy));
        double orbitDirection = bot.slot % 2 == 0 ? 1 : -1;
        double radial = length > 165 ? -0.4 : length < 105 ? 0.55 : 0;
        steerBot(bot, dx / length * radial - dy / length * 0.45 * orbitDirection,
                dy / length * radial + dx / length * 0.45 * orbitDirection);
    }

    private void steerBot(Player bot, double desiredX, double desiredY) {
        double steeringX = desiredX + bot.botWanderX * 0.18;
        double steeringY = desiredY + bot.botWanderY * 0.18;
        for (Player other : players) {
            if (other == bot || other.down) continue;
            double dx = bot.x - other.x;
            double dy = bot.y - other.y;
            double separation = Math.hypot(dx, dy);
            if (separation < 1 || separation >= 85) continue;
            double force = (85 - separation) / 85.0 * 1.15;
            steeringX += dx / separation * force;
            steeringY += dy / separation * force;
        }
        double length = Math.hypot(steeringX, steeringY);
        if (length > 1) {
            steeringX /= length;
            steeringY /= length;
        }
        bot.moveX = steeringX;
        bot.moveY = steeringY;
        if (length > 0.12) updateFacing(bot, steeringX, steeringY);
    }

    private void updateBotWander(Player bot, double dt) {
        bot.botPathTimer = Math.max(0, bot.botPathTimer - dt);
        bot.botWanderTimer -= dt;
        if (bot.botWanderTimer > 0) return;
        double angle = random.nextDouble() * Math.PI * 2;
        bot.botWanderX = Math.cos(angle);
        bot.botWanderY = Math.sin(angle);
        bot.botWanderTimer = 0.75 + random.nextDouble() * 1.35;
    }

    // Utility priorities: rescue > immediate defense > recovery/maintenance > preparation.
    // Every action goes through the same validated methods as human commands.
    private boolean tryBotUnlock(Player bot) {
        if (bot.botSpendCooldown > 0 || bot.credits < unlockCost()) return false;
        UnlockArea area = GameMap.AREAS.stream()
                .filter(unit -> !unlockedAreas.contains(unit.id()) && terminalAccessible(unit))
                .min(Comparator.comparingDouble(unit -> distance(bot.x, bot.y, unit.terminalX(), unit.terminalY())))
                .orElse(null);
        return area != null && botUse(bot, area.terminalX(), area.terminalY(), 65,
                () -> unlockArea(bot, area.id()));
    }

    private boolean updateBotTasks(Player bot) {
        if (bot.botSpendCooldown > 0) return false;
        if (blackoutActive) {
            BreakerTerminal breaker = GameMap.BREAKER_TERMINALS.stream()
                    .filter(unit -> trippedBreakers.contains(unit.id()))
                    .filter(unit -> isAssignedBot(bot, unit.x(), unit.y()))
                    .findFirst().orElse(null);
            if (breaker != null) return botUse(bot, breaker.x(), breaker.y(), 70,
                    () -> resetBreaker(bot, breaker.id()));
        }
        if (bot.hp <= 55 && bot.credits >= GameConfig.HEAL_PRICE && isPointUnlocked(MED_X, MED_Y)) {
            return botUse(bot, MED_X, MED_Y, 65, () -> buy(bot, "heal"));
        }
        if (tryBotUnlock(bot)) return true;
        TrapSlot damaged = trapSlots.stream().filter(slot -> slot.defense != null
                && slot.defense.hp < slot.defense.maxHp * .65
                && (Set.of("turret", "copperTurret", "silverTurret", "wire", "mine").contains(slot.defense.type) ? bot.ore > 0 : bot.wood > 0)
                && isAssignedBot(bot, slot.x, slot.y))
                .min(Comparator.comparingDouble(slot -> distance(bot.x, bot.y, slot.x, slot.y))).orElse(null);
        if (damaged != null) return botUse(bot, damaged.x, damaged.y, 70, () -> repair(bot, damaged.id));
        List<String> preference = switch (bot.slot) {
            case 1 -> List.of("ricochet", "shotgun", "revolver", "rifle", "smg", "lmg", "sniper");
            case 2 -> List.of("ricochet", "smg", "lmg", "shotgun", "revolver", "sniper", "rifle");
            case 3 -> List.of("ricochet", "revolver", "rifle", "shotgun", "smg", "lmg", "sniper");
            default -> List.of("ricochet", "sniper", "rocket", "lmg", "smg", "shotgun", "revolver", "rifle");
        };
        for (String item : preference) {
            ShopUnit shop = GameMap.shopByItem(item);
            boolean owned = botOwnsWeapon(bot, item);
            if (shop == null || !isPointUnlocked(shop.x(), shop.y())
                    || bot.credits < (owned ? ammoRefillCost() : shop.cost())) continue;
            if (owned ? weaponAmmo(bot, item) > weaponAmmoCapacity(item) / 4 : hasBotRangedAmmo(bot)) continue;
            return botUse(bot, shop.x(), shop.y(), 55, () -> buy(bot, item));
        }
        if (phase != GamePhase.PREPARING) return false;
        // One nearest CPU handles shared objectives; personal equipment stays independent.
        if (isAssignedBot(bot, coreX, coreY)) {
            String upgrade = coreHp < coreMaxHp * .65 ? "hp"
                    : coreDefenseLevel < Math.min(4, round / 4) ? "defense"
                    : coreRegenLevel < Math.min(4, round / 5) ? "regen"
                    : coreMaxShield < round * 40 ? "shield" : null;
            int cost = coreUpgradeCost(upgrade == null ? "" : upgrade);
            if (bot.credits >= cost) return botUse(bot, coreX, coreY, 90, () -> upgradeCore(bot, upgrade));
            if (round >= 2 && distance(coreX, coreY, CORE_X, CORE_Y) < 80
                    && unlockedAreas.contains("entry-room")) {
                return botUse(bot, coreX, coreY, 80, () -> equipCore(bot));
            }
        }
        TrapSlot obsolete = trapSlots.stream().filter(slot -> slot.defense != null
                && bot.id.equals(slot.ownerId) && distance(slot.x, slot.y, coreX, coreY) > 550)
                .findFirst().orElse(null);
        if (obsolete != null) return botUse(bot, obsolete.x, obsolete.y, 70, () -> removeDefense(bot, obsolete.id));
        if (bot.botExtendedRound != round && prepTime < 6 && coreHp < coreMaxHp * .7
                && bot.credits >= prepExtensionCost() && unlockedAreas.contains("operations-room")
                && isAssignedBot(bot, GameMap.PREP_CONSOLE.x(), GameMap.PREP_CONSOLE.y())) {
            return botUse(bot, GameMap.PREP_CONSOLE.x(), GameMap.PREP_CONSOLE.y(), 70, () -> {
                extendPrepTime(bot); bot.botExtendedRound = round;
            });
        }
        // Supply a nearby teammate without repeatedly dropping and collecting the same stack.
        Player teammate = players.stream().filter(other -> other != bot && !other.down
                && distance(bot.x, bot.y, other.x, other.y) < 65 && other.wood < 2).findFirst().orElse(null);
        if (teammate != null && bot.wood >= 16 && bot.botSharedRound != round) {
            dropResource(bot, new String[]{"DROP_RESOURCE", "wood", "4"});
            bot.botSharedRound = round;
            bot.botSpendCooldown = 3;
            return true;
        }
        String buildType = List.of("block", "turret", "wire", "mine", "barricade").get((round + bot.slot) % 5);
        long defenses = trapSlots.stream().filter(slot -> slot.defense != null).count();
        if (defenses >= 4 + round) return false;
        String heldType = bot.buildItemCount(buildType) > 0 ? buildType
                : BUILD_RECIPES.keySet().stream().sorted().filter(type -> bot.buildItemCount(type) > 0).findFirst().orElse(null);
        if (heldType != null) {
            String type = heldType;
            MapPoint site = botBuildSite(bot);
            if (site != null) return botUse(bot, site.x(), site.y(), 90, () -> {
                equipBuild(bot, type);
                placeDefense(bot, new String[]{"PLACE", Double.toString(site.x()), Double.toString(site.y()), type});
            });
            return false; // No legal site: guard instead of accumulating more unplaceable equipment.
        }
        var recipe = BUILD_RECIPES.get(buildType);
        if (bot.wood >= recipe.getOrDefault("wood", 0) && bot.ore >= recipe.getOrDefault("ore", 0)) {
            WorkbenchUnit bench = GameMap.WORKBENCH_UNITS.stream()
                    .filter(unit -> unit.requiredArea() == null || unlockedAreas.contains(unit.requiredArea()))
                    .min(Comparator.comparingDouble(unit -> distance(bot.x, bot.y, unit.x(), unit.y()))).orElse(null);
            if (bench != null) return botUse(bot, bench.x(), bench.y(), 75, () -> craft(bot, buildType));
        }
        String resource = bot.wood < recipe.getOrDefault("wood", 0) ? "wood" : "ore";
        ResourceNode node = resourceNodes.stream().filter(unit -> unit.available && unit.type.equals(resource)
                && (unit.requiredArea == null || unlockedAreas.contains(unit.requiredArea)))
                .min(Comparator.comparingDouble(unit -> distance(bot.x, bot.y, unit.x, unit.y))).orElse(null);
        if (node != null) { moveBotToward(bot, node.x, node.y); return true; }
        double x = resource.equals("wood") ? WOODCUTTER_X : QUARRY_X;
        double y = resource.equals("wood") ? WOODCUTTER_Y : QUARRY_Y;
        if (isPointUnlocked(x, y)) return botUse(bot, x, y, 75, () -> gather(bot, resource));
        return false;
    }

    private boolean isAssignedBot(Player bot, double x, double y) {
        return players.stream().filter(other -> !other.human && !other.down)
                .min(Comparator.comparingDouble((Player other) -> distance(other.x, other.y, x, y))
                        .thenComparingInt(other -> other.slot)).orElse(null) == bot;
    }

    private boolean botUse(Player bot, double x, double y, double range, Runnable action) {
        if (!canInteract(bot, x, y, range)) { moveBotToward(bot, x, y); }
        else {
            bot.moveX = 0; bot.moveY = 0;
            action.run(); bot.botSpendCooldown = 1;
        }
        return true;
    }

    private MapPoint botBuildSite(Player bot) {
        for (int ring = 3; ring <= 6; ring++) {
            for (int offset = 0; offset < 8; offset++) {
                double angle = (offset + bot.slot * 2) * Math.PI / 4;
                MapPoint point = GameMap.snapToTile(coreX + Math.cos(angle) * ring * 40,
                        coreY + Math.sin(angle) * ring * 40);
                if (!canPlaceDefenseAt(point, null)) continue;
                // Keep narrow passages open.
                if (!canOccupy(point.x() - 40, point.y(), 5) || !canOccupy(point.x() + 40, point.y(), 5)
                        || !canOccupy(point.x(), point.y() - 40, 5) || !canOccupy(point.x(), point.y() + 40, 5)) continue;
                return point;
            }
        }
        return null;
    }

    private void updateBotCoreTransport(Player bot) {
        double x = 1020, y = 1540;
        if (phase != GamePhase.PREPARING || !canOccupy(x, y, 17)) { releaseCarriedCore(bot); return; }
        if (distance(bot.x, bot.y, x, y) > 65) moveBotToward(bot, x, y);
        else {
            placeCore(bot, new String[]{"CORE", "1020", "1540"});
            if (bot.movingCore) releaseCarriedCore(bot);
            bot.moveX = 0; bot.moveY = 0;
        }
    }

    private boolean terminalAccessible(UnlockArea area) {
        int size = GameMap.TILE_SIZE;
        for (int[] offset : new int[][]{{0,0},{1,0},{-1,0},{0,1},{0,-1}}) {
            if (GameMap.canOccupy(area.terminalX() + offset[0] * size,
                    area.terminalY() + offset[1] * size, 5, unlockedAreas)) return true;
        }
        return false;
    }

    private boolean isPointUnlocked(double x, double y) {
        return GameMap.AREAS.stream().filter(area -> area.contains(x, y))
                .allMatch(area -> unlockedAreas.contains(area.id()));
    }

    private static boolean botOwnsWeapon(Player bot, String item) {
        return switch (item) {
            case "shotgun" -> bot.ownsShotgun;
            case "smg" -> bot.ownsSmg;
            case "rifle" -> bot.ownsRifle;
            case "sniper" -> bot.ownsSniper;
            case "revolver" -> bot.ownsRevolver;
            case "rocket" -> bot.ownsRocket;
            case "lmg" -> bot.ownsLmg;
            case "ricochet" -> bot.ownsRicochet;
            default -> true;
        };
    }

    private static void giveBotWeapon(Player bot, String item) {
        switch (item) {
            case "shotgun" -> bot.ownsShotgun = true;
            case "smg" -> bot.ownsSmg = true;
            case "rifle" -> bot.ownsRifle = true;
            case "sniper" -> bot.ownsSniper = true;
            case "revolver" -> bot.ownsRevolver = true;
            case "rocket" -> bot.ownsRocket = true;
            case "lmg" -> bot.ownsLmg = true;
            case "ricochet" -> bot.ownsRicochet = true;
            default -> { return; }
        }
        setWeaponAmmo(bot, item, weaponAmmoCapacity(item));
        bot.equipWeapon(item);
        bot.selectedBuild = null;
    }

    private void attack(Player player, int enemyId) {
        if (player.human) return;
        Enemy target = enemies.stream().filter(enemy -> enemy.id == enemyId && enemy.hp > 0).findFirst().orElse(null);
        if (target != null) attackAt(player, target.x, target.y);
    }

    private void attackAt(Player player, double aimX, double aimY) {
        if (!canMove() || player.down || player.movingCore || player.cooldown > 0) return;

        WeaponStats weapon = weaponStats(player.weapon);
        boolean empty = player.weapon.equals("shotgun") && player.shotgunAmmo <= 0
                || player.weapon.equals("smg") && player.smgAmmo <= 0
                || player.weapon.equals("rifle") && player.rifleAmmo <= 0
                || player.weapon.equals("sniper") && player.sniperAmmo <= 0
                || player.weapon.equals("revolver") && player.revolverAmmo <= 0
                || player.weapon.equals("rocket") && player.rocketAmmo <= 0
                || player.weapon.equals("lmg") && player.lmgAmmo <= 0
                || player.weapon.equals("ricochet") && player.ricochetAmmo <= 0;
        if (empty) {
            feedback(player, "弾薬がありません");
            player.firing = false;
            return;
        }
        if (player.weapon.equals("shotgun")) player.shotgunAmmo--;
        if (player.weapon.equals("smg")) player.smgAmmo--;
        if (player.weapon.equals("rifle")) player.rifleAmmo--;
        if (player.weapon.equals("sniper")) player.sniperAmmo--;
        if (player.weapon.equals("revolver")) player.revolverAmmo--;
        if (player.weapon.equals("rocket")) player.rocketAmmo--;
        if (player.weapon.equals("lmg")) player.lmgAmmo--;
        if (player.weapon.equals("ricochet")) player.ricochetAmmo--;

        sendSoundEffect(player,"shot",player.weapon);
        player.cooldown = weapon.cooldown();
        player.cooldownMax = weapon.cooldown();
        double dx = aimX - player.x;
        double dy = aimY - player.y;
        double length = Math.hypot(dx, dy);
        if (length < 0.001) {
            dx = 1;
            dy = 0;
            length = 1;
        }
        double directionX = dx / length;
        double directionY = dy / length;
        if (player.weapon.equals("rocket")) {
            fireRocket(player, weapon, directionX, directionY, Math.min(length, weapon.range()));
            return;
        }
        if (player.weapon.equals("ricochet")) {
            fireRicochet(player, weapon, directionX, directionY);
            return;
        }
        boolean shotgun = player.weapon.equals("shotgun");
        int rays = shotgun ? GameConfig.SHOTGUN_PELLETS : 1;
        double angle = Math.atan2(directionY, directionX);
        for (int pellet = 0; pellet < rays; pellet++) {
            double spreadAngle = shotgun ? (pellet - (rays - 1) / 2.0) * .14 : 0;
            fireRay(player, weapon, Math.cos(angle + spreadAngle), Math.sin(angle + spreadAngle));
        }
    }

    private void fireRocket(Player player, WeaponStats weapon, double dx, double dy, double range) {
        double impactDistance = GameMap.distanceToWall(player.x, player.y, dx, dy, range);
        // Stop at the first enemy body; unlike bullets, the rocket detonates instead of piercing.
        for (Enemy enemy : enemies) {
            if (enemy.hp <= 0) continue;
            double ex = enemy.x - player.x, ey = enemy.y - player.y;
            double projection = ex * dx + ey * dy;
            double perpendicular = Math.abs(ex * dy - ey * dx);
            double radius = enemyRadius(enemy) + weapon.width();
            if (projection < 0 || perpendicular > radius) continue;
            double entry = Math.max(0, projection - Math.sqrt(radius * radius - perpendicular * perpendicular));
            if (entry < impactDistance) impactDistance = entry;
        }
        double x = player.x + dx * impactDistance, y = player.y + dy * impactDistance;
        sendHitEffect(player.id, "rocket", player.x, player.y, x, y, 0, false, 0, false);
        events.broadcast("{\"type\":\"effect\",\"effect\":\"explosion\",\"x\":" + roundOne(x)
                + ",\"y\":" + roundOne(y) + ",\"radius\":" + GameConfig.ROCKET_BLAST_RADIUS + "}");
        for (Enemy enemy : enemies) {
            double blastDistance = distance(x, y, enemy.x, enemy.y);
            if (enemy.hp <= 0 || blastDistance > GameConfig.ROCKET_BLAST_RADIUS
                    || !GameMap.hasClearLine(x, y, enemy.x, enemy.y)) continue;
            // Full damage at the center, half damage at the edge; no headshot multiplier.
            double damage = weapon.damage() * (1 - .5 * blastDistance / GameConfig.ROCKET_BLAST_RADIUS);
            int creditsBefore = player.credits;
            damageEnemy(enemy, damage, player);
            knockbackEnemy(x, y, enemy, weapon.knockback());
            sendHitEffect(player.id, "rocket", x, y, enemy.x, enemy.y, damage,
                    enemy.hp <= 0, player.credits - creditsBefore, false);
        }
    }

    private void fireRicochet(Player player, WeaponStats weapon, double dx, double dy) {
        double x = player.x, y = player.y, remaining = weapon.range();
        for (int bounce = 0; bounce <= 2 && remaining > .01; bounce++) {
            GameMap.WallImpact wall = GameMap.rayWall(x, y, dx, dy, remaining);
            double length = Math.max(0, wall.distance() - .001);
            if (fireSegment(player, weapon, x, y, dx, dy, length)) return;
            remaining -= wall.distance();
            if (!wall.flipX() && !wall.flipY()) return;
            x += dx * length; y += dy * length;
            if (wall.flipX()) dx = -dx;
            if (wall.flipY()) dy = -dy;
            x += dx * .002; y += dy * .002;
            remaining -= .002;
        }
    }

    private void fireRay(Player player, WeaponStats weapon, double directionX, double directionY) {
        double shotDistance = GameMap.distanceToWall(player.x, player.y,
                directionX, directionY, weapon.range());
        fireSegment(player, weapon, player.x, player.y, directionX, directionY, shotDistance);
    }

    private boolean fireSegment(Player player, WeaponStats weapon, double originX, double originY,
            double directionX, double directionY, double shotDistance) {
        double endX = originX + directionX * shotDistance;
        double endY = originY + directionY * shotDistance;
        List<Enemy> candidates = enemies.stream().filter(enemy -> enemy.hp > 0)
                .filter(enemy -> isInsideAttack(enemy, originX, originY, directionX, directionY, weapon, shotDistance))
                .filter(enemy -> GameMap.hasClearLine(originX, originY, enemy.x, enemy.y))
                .sorted(Comparator.comparingDouble(enemy ->
                        (enemy.x - originX) * directionX + (enemy.y - originY) * directionY)).toList();
        boolean piercing = player.weapon.equals("sniper") || player.weapon.equals("revolver");
        List<Enemy> targets = piercing ? candidates : candidates.stream().limit(1).toList();
        if (!piercing && !targets.isEmpty() && !player.weapon.equals("bat")) {
            Enemy first = targets.get(0);
            double projection = (first.x - originX) * directionX + (first.y - originY) * directionY;
            double perpendicular = Math.abs((first.x - originX) * directionY - (first.y - originY) * directionX);
            double radius = enemyRadius(first) + weapon.width();
            double entry = Math.max(0, projection - Math.sqrt(Math.max(0, radius * radius - perpendicular * perpendicular)));
            endX = originX + directionX * entry; endY = originY + directionY * entry;
        }
        // A trajectory event is separate from impact and reward events.
        sendHitEffect(player.id, player.weapon, originX, originY, endX, endY, 0, false, 0, false);
        for (Enemy hit : targets) {
            int creditsBeforeHit = player.credits;
            boolean headshot = isHeadshot(hit, player, originX, originY, directionX, directionY, weapon, shotDistance);
            double damage = weapon.damage() * (headshot ? 2 : 1);
            damageEnemy(hit, damage, player);
            if (headshot) player.credits += 3;
            knockbackEnemy(originX, originY, hit, weapon.knockback());
            sendHitEffect(player.id, player.weapon, player.x, player.y, hit.x, hit.y,
                    damage, hit.hp <= 0, player.credits - creditsBeforeHit, headshot);
        }
        return !targets.isEmpty();
    }

    private boolean isInsideAttack(Enemy enemy, double originX, double originY, double directionX,
            double directionY, WeaponStats weapon, double shotDistance) {
        double toEnemyX = enemy.x - originX;
        double toEnemyY = enemy.y - originY;
        double projection = toEnemyX * directionX + toEnemyY * directionY;
        if (projection < 0 || projection > shotDistance) return false;
        double perpendicular = Math.abs(toEnemyX * directionY - toEnemyY * directionX);
        double enemyRadius = enemyRadius(enemy);
        double spread = weapon.width();
        return perpendicular <= spread + enemyRadius;
    }

    private boolean isHeadshot(Enemy enemy, Player player, double originX, double originY, double directionX,
            double directionY, WeaponStats weapon, double shotDistance) {
        if (player.weapon.equals("bat")) return false;
        double radius = enemyRadius(enemy);
        double headX = enemy.x;
        double headY = enemy.y - radius * 0.5;
        double toHeadX = headX - originX;
        double toHeadY = headY - originY;
        double projection = toHeadX * directionX + toHeadY * directionY;
        if (projection < 0 || projection > shotDistance) return false;
        double perpendicular = Math.abs(toHeadX * directionY - toHeadY * directionX);
        double headRadius = Math.min(radius * 0.5, Math.max(4, radius * 0.28));
        double aimTolerance = player.weapon.equals("shotgun")
                ? Math.min(3, weapon.width() * 0.25)
                : weapon.width() * 0.25;
        return perpendicular <= headRadius + aimTolerance;
    }

    private static double enemyRadius(Enemy enemy) {
        return switch (enemy.type) {
            case "tiny" -> 3;
            case "boss" -> 42;
            case "warlord" -> 44;
            case "titan" -> 48;
            case "armored" -> 30;
            case "siege" -> 32;
            case "champion" -> 26;
            case "hunter" -> 18;
            case "brute" -> 28;
            case "runner" -> 16;
            default -> 21;
        };
    }

    static WeaponStats weaponStats(String weapon) {
        return GameConfig.WEAPONS.getOrDefault(weapon, GameConfig.WEAPONS.get("pistol"));
    }

    private void damageEnemy(Enemy enemy, double damage, Player player) {
        if (enemy.hp <= 0) return;
        double dealt = Math.min(enemy.hp, damage);
        enemy.hp -= dealt;
        if (player != null && dealt > 0) {
            enemy.creditProgress += enemy.reward * dealt / enemy.maxHp;
            int earnedCredits = Math.min(enemy.reward,
                    (int) Math.floor(enemy.creditProgress + 1e-9));
            int payout = earnedCredits - enemy.paidCredits;
            if (payout > 0) {
                player.credits += payout;
                enemy.paidCredits += payout;
            }
            if (enemy.hp <= 0) player.kills++;
        }
    }

    private void knockbackEnemy(double fromX, double fromY, Enemy enemy, double amount) {
        if (amount <= 0) return;
        double dx = enemy.x - fromX;
        double dy = enemy.y - fromY;
        double length = Math.max(1, Math.hypot(dx, dy));
        double nextX = clamp(enemy.x + dx / length * amount, 18, WORLD_W - 18);
        double nextY = clamp(enemy.y + dy / length * amount, 18, WORLD_H - 18);
        if (canOccupy(nextX, enemy.y, 17)) enemy.x = nextX;
        if (canOccupy(enemy.x, nextY, 17)) enemy.y = nextY;
    }

    private void sendHitEffect(String playerId, String weapon, double fromX, double fromY,
            double x, double y, double damage, boolean defeated, int credits,
            boolean headshot) {
        events.broadcast("{\"type\":\"effect\",\"effect\":\"hit\",\"playerId\":\"" + playerId
                + "\",\"weapon\":\"" + weapon + "\",\"fromX\":" + roundOne(fromX)
                + ",\"fromY\":" + roundOne(fromY) + ",\"x\":" + roundOne(x)
                + ",\"y\":" + roundOne(y) + ",\"damage\":" + roundOne(damage)
                + ",\"defeated\":" + defeated + ",\"credits\":" + credits
                + ",\"headshot\":" + headshot + "}");
    }

    private void interact(Player player, String targetId) {
        if (player.down || !canUseFacilities() || !targetId.startsWith("player-")) return;
        Player target = playerById(targetId);
        if (target != null && target != player && target.down
                && distance(player.x, player.y, target.x, target.y) <= 78) {
            if (!targetId.equals(player.actionTarget)) {
                player.actionTarget = targetId;
                player.actionProgress = 0;
                player.moveX = 0;
                player.moveY = 0;
            }
        }
    }

    private void switchWeapon(Player player, String weapon) {
        boolean owned = weapon.equals("pistol") || weapon.equals("bat")
                || weapon.equals("shotgun") && player.ownsShotgun
                || weapon.equals("smg") && player.ownsSmg
                || weapon.equals("rifle") && player.ownsRifle
                || weapon.equals("sniper") && player.ownsSniper
                || weapon.equals("revolver") && player.ownsRevolver
                || weapon.equals("rocket") && player.ownsRocket
                || weapon.equals("lmg") && player.ownsLmg
                || weapon.equals("ricochet") && player.ownsRicochet;
        if (owned) {
            releaseCarriedCore(player);
            player.equipWeapon(weapon);
            player.selectedBuild = null;
            player.movingCore = false;
            player.firing = false;
        }
    }

    private void buy(Player player, String item) {
        if (!canUseFacilities() || player.down) return;
        if(item.equals("medkit")) {
            if(!isPointUnlocked(MED_X,MED_Y)||!canInteract(player,MED_X,MED_Y,95)) return;
            if(player.medkits >= GameConfig.MEDKIT_CAPACITY) { feedback(player,"回復キットは5個まで持てます"); return; }
            if(spend(player,GameConfig.MEDKIT_PRICE)) { player.medkits++; feedback(player,"回復キットを購入しました"); }
            else feedback(player,"お金が足りません");
            return;
        }
        if (item.equals("heal")) {
            if (!isPointUnlocked(MED_X, MED_Y) || !canInteract(player, MED_X, MED_Y, 95)) {
                feedback(player, "医療施設に近づいてください");
                return;
            }
            if (player.hp >= 100) {
                feedback(player, "HPは満タンです");
                return;
            }
            if (spend(player, GameConfig.HEAL_PRICE)) {
                player.hp = 100;
                sendSoundEffect(player,"item-use","heal");
                feedback(player, "HPを回復しました");
            } else {
                feedback(player, "お金が足りません");
            }
            return;
        }
        ShopUnit shop = GameMap.shopByItem(item);
        if (shop == null || !isPointUnlocked(shop.x(), shop.y())
                || !canInteract(player, shop.x(), shop.y(), 70)) {
            feedback(player, "ショップに近づいてください");
            return;
        }
        if (item.endsWith("Factory")) {
            if (!spend(player, shop.cost())) { feedback(player, "お金が足りません"); return; }
            player.addBuildItem(item, 1);
            player.selectedBuild = item;
            releaseCarriedCore(player);
            feedback(player, shop.label() + "を購入しました。Rで設置できます");
            return;
        }
        switch (item) {
            case "shotgun", "smg", "rifle", "sniper", "revolver", "lmg", "ricochet", "rocket" ->
                    buyOrRefillWeapon(player, shop, item);
            case "ammo" -> {
                if (!player.ownsShotgun && !player.ownsSmg
                        && !player.ownsRifle && !player.ownsSniper && !player.ownsRevolver && !player.ownsLmg && !player.ownsRicochet && !player.ownsRocket) {
                    feedback(player, "弾薬を使う武器を持っていません");
                    return;
                }
                List<String> owned = List.of("shotgun", "smg", "rifle", "sniper", "revolver", "lmg", "ricochet", "rocket")
                        .stream().filter(weapon -> botOwnsWeapon(player, weapon)).toList();
                if (owned.stream().allMatch(weapon -> weaponAmmo(player, weapon) >= weaponAmmoCapacity(weapon))) {
                    return;
                }
                if (spend(player, shop.cost())) {
                    owned.forEach(weapon -> setWeaponAmmo(player, weapon, weaponAmmoCapacity(weapon)));
                    feedback(player, "弾薬を補充しました");
                    events.send(player, "{\"type\":\"ammo-refilled\"}");
                } else {
                    feedback(player, "お金が足りません");
                }
            }
            default -> { }
        }
    }

    private void buyOrRefillWeapon(Player player, ShopUnit shop, String item) {
        if (botOwnsWeapon(player, item)) {
            int capacity = weaponAmmoCapacity(item);
            if (weaponAmmo(player, item) >= capacity) {
                return;
            }
            if (spend(player, ammoRefillCost())) {
                setWeaponAmmo(player, item, capacity);
                feedback(player, "弾薬を補充しました");
                events.send(player, "{\"type\":\"ammo-refilled\"}");
            } else {
                feedback(player, "お金が足りません");
            }
            return;
        }
        if (spend(player, shop.cost())) {
            releaseCarriedCore(player);
            giveBotWeapon(player, item);
            feedback(player, "購入しました");
        } else {
            feedback(player, "お金が足りません");
        }
    }

    static int weaponAmmo(Player player, String item) {
        return switch (item) {
            case "shotgun" -> player.shotgunAmmo;
            case "smg" -> player.smgAmmo;
            case "rifle" -> player.rifleAmmo;
            case "sniper" -> player.sniperAmmo;
            case "revolver" -> player.revolverAmmo;
            case "rocket" -> player.rocketAmmo;
            case "lmg" -> player.lmgAmmo;
            case "ricochet" -> player.ricochetAmmo;
            default -> 0;
        };
    }

    static int weaponAmmoCapacity(String item) {
        return GameConfig.AMMO_CAPACITIES.getOrDefault(item, 0);
    }

    private static void setWeaponAmmo(Player player, String item, int ammo) {
        ammo = Math.max(0, Math.min(ammo, weaponAmmoCapacity(item)));
        switch (item) {
            case "shotgun" -> player.shotgunAmmo = ammo;
            case "smg" -> player.smgAmmo = ammo;
            case "rifle" -> player.rifleAmmo = ammo;
            case "sniper" -> player.sniperAmmo = ammo;
            case "revolver" -> player.revolverAmmo = ammo;
            case "rocket" -> player.rocketAmmo = ammo;
            case "lmg" -> player.lmgAmmo = ammo;
            case "ricochet" -> player.ricochetAmmo = ammo;
            default -> { }
        }
    }

    private void gather(Player player, String resource) {
        if (!canUseFacilities() || player.down) return;
        if (player.gatherCooldown > 0) {
            feedback(player, "まだ採取できません");
            return;
        }
        if (resource.equals("wood")) {
            if (!isPointUnlocked(WOODCUTTER_X, WOODCUTTER_Y) || !canInteract(player, WOODCUTTER_X, WOODCUTTER_Y, 110)) {
                feedback(player, "伐採所に近づいてください");
                return;
            }
            player.wood += 4;
            feedback(player, "木材を4個入手しました");
        } else if (resource.equals("ore")) {
            if (!isPointUnlocked(QUARRY_X, QUARRY_Y) || !canInteract(player, QUARRY_X, QUARRY_Y, 110)) {
                feedback(player, "採石場に近づいてください");
                return;
            }
            player.ore++;
            feedback(player, "鉄を1個入手しました");
        } else {
            return;
        }
        player.gatherCooldown = resource.equals("ore") ? GATHER_COOLDOWN_SECONDS / 3 : GATHER_COOLDOWN_SECONDS;
    }

    private void dropResource(Player player, String[] parts) {
        if (!canUseFacilities() || player.down) return;
        String type = parts[1];
        if(!Set.of("wood","ore","copper","silver").contains(type)) return;
        int available = resourceCount(player,type);
        int requested;
        try {
            requested = Integer.parseInt(parts[2]);
        } catch (NumberFormatException error) {
            return;
        }
        int amount = Math.min(available, Math.max(0, requested));
        if (amount <= 0) {
            feedback(player, "渡せる素材がありません");
            return;
        }
        MapPoint origin = GameMap.snapToTile(player.x, player.y);
        MapPoint target = GameMap.snapToTile(origin.x() + player.facingX * GameMap.TILE_SIZE,
                origin.y() + player.facingY * GameMap.TILE_SIZE);
        double dropX = canOccupy(target.x(), target.y(), 5) ? target.x() : player.x;
        double dropY = canOccupy(target.x(), target.y(), 5) ? target.y() : player.y;
        addResource(player,type,-amount);
        droppedResources.add(new DroppedResource(nextDroppedResourceId++, type,
                dropX, dropY, amount, player.id));
        feedback(player, "素材を置きました");
    }

    private void craft(Player player, String type) {
        if (!canUseFacilities() || player.down || !BUILD_RECIPES.containsKey(type)) return;
        boolean nearWorkbench = GameMap.WORKBENCH_UNITS.stream()
                .filter(workbench -> workbench.requiredArea() == null
                        || unlockedAreas.contains(workbench.requiredArea()))
                .anyMatch(workbench -> canInteract(player, workbench.x(), workbench.y(), 110));
        if (!nearWorkbench) {
            feedback(player, "作業台に近づいてください");
            return;
        }
        var recipe = BUILD_RECIPES.get(type);
        int woodCost = recipe.getOrDefault("wood", 0);
        int oreCost = recipe.getOrDefault("ore", 0);
        if(recipe.entrySet().stream().anyMatch(entry -> resourceCount(player,entry.getKey()) < entry.getValue())) {
            feedback(player, "素材が足りません");
            return;
        }
        recipe.forEach((resource,cost) -> addResource(player,resource,-cost));
        player.addBuildItem(type, 1);
        player.selectedBuild = type;
        releaseCarriedCore(player);
        feedback(player, "製作しました");
    }

    private void equipBuild(Player player, String type) {
        if (type.equals("none")) {
            releaseCarriedCore(player);
            player.selectedBuild = null;
        } else if ((BUILD_RECIPES.containsKey(type) || type.endsWith("Factory")) && player.buildItemCount(type) > 0) {
            releaseCarriedCore(player);
            player.selectedBuild = type;
        }
    }

    private static int resourceCount(Player player, String type) {
        return switch (type) {
            case "wood" -> player.wood;
            case "ore" -> player.ore;
            case "copper" -> player.copper;
            case "silver" -> player.silver;
            default -> 0;
        };
    }

    private static void addResource(Player player, String type, int amount) {
        switch (type) {
            case "wood" -> player.wood += amount;
            case "ore" -> player.ore += amount;
            case "copper" -> player.copper += amount;
            case "silver" -> player.silver += amount;
            default -> { }
        }
    }

    private void carryNearest(Player player, String target) {
        if (!canUseFacilities() || player.down || player.movingCore || player.selectedBuild != null) return;
        MaterialFactory quarry = factories.stream().filter(unit -> (target == null || unit.id.equals(target))
                && canInteract(player, unit.x, unit.y, 70))
                .min(Comparator.comparingDouble(unit -> distance(player.x, player.y, unit.x, unit.y)))
                .orElse(null);
        if (quarry != null && target != null) { pickupFactory(player, quarry.id); return; }
        TrapSlot slot = trapSlots.stream()
                .filter(unit -> unit.defense != null && canInteract(player, unit.x, unit.y, 100))
                .filter(unit -> target == null || unit.id.equals(target))
                .min(Comparator.comparingDouble(unit -> distance(player.x, player.y, unit.x, unit.y)))
                .orElse(null);
        boolean nearCore = (target == null || target.equals("core"))
                && canInteract(player, coreX, coreY, 100);
        if (quarry != null && (slot == null || distance(player.x, player.y, quarry.x, quarry.y)
                <= distance(player.x, player.y, slot.x, slot.y))
                && (!nearCore || distance(player.x, player.y, quarry.x, quarry.y)
                <= distance(player.x, player.y, coreX, coreY))) {
            pickupFactory(player, quarry.id);
        } else if (nearCore && (slot == null || distance(player.x, player.y, coreX, coreY)
                <= distance(player.x, player.y, slot.x, slot.y))) {
            equipCore(player);
        } else if (slot != null) {
            removeDefense(player, slot.id);
        }
    }

    private void useItem(Player player, String item) {
        if (!canUseFacilities() || player.down || !item.equals("medkit")
                || player.medkits <= 0 || player.hp >= 100) return;
        player.medkits--;
        player.hp = Math.min(100, player.hp + GameConfig.MEDKIT_HEAL);
        sendSoundEffect(player, "item-use", item);
        feedback(player, "回復キットを使いました");
    }

    private void sendSoundEffect(Player player, String effect, String item) {
        events.broadcast("{\"type\":\"effect\",\"effect\":\"" + effect
                + "\",\"playerId\":\"" + player.id + "\",\"weapon\":\"" + player.weapon
                + "\",\"item\":\"" + item + "\"}");
    }

    private void equipCore(Player player) {
        if (!canUseFacilities() || player.down
                || !canInteract(player, coreX, coreY, 130)) {
            feedback(player, "コアに近づいてください");
            return;
        }
        Player carrier = players.stream()
                .filter(other -> other != player && other.movingCore)
                .findFirst().orElse(null);
        if (carrier != null) {
            feedback(player, "コアはほかのプレイヤーが運んでいます");
            return;
        }
        player.movingCore = true;
        player.dashHeld = false;
        player.dashing = false;
        player.selectedBuild = null;
        player.firing = false;
        coreX = player.x;
        coreY = player.y;
    }

    private void placeCore(Player player, String[] parts) {
        if (!canUseFacilities() || player.down || !player.movingCore) return;
        double requestedX = Double.parseDouble(parts[1]);
        double requestedY = Double.parseDouble(parts[2]);
        if (!Double.isFinite(requestedX) || !Double.isFinite(requestedY)) return;
        MapPoint point = GameMap.snapToTile(requestedX, requestedY);
        if (distance(player.x, player.y, point.x(), point.y()) > 180) {
            feedback(player, "もう少し近づいてください");
            return;
        }
        if (!GameMap.canPlaceCore(point.x(), point.y(), unlockedAreas)
                || factories.stream().anyMatch(unit -> distance(point.x(), point.y(), unit.x, unit.y) < 45)
                || trapSlots.stream().anyMatch(slot -> slot.defense != null
                        && distance(point.x(), point.y(), slot.x, slot.y) < 45)
                || players.stream().anyMatch(other -> other != player && !other.down
                        && distance(point.x(), point.y(), other.x, other.y) < 24)
                || enemies.stream().anyMatch(enemy -> enemy.hp > 0
                        && distance(point.x(), point.y(), enemy.x, enemy.y) < 55)) {
            feedback(player, "ここにはコアを置けません");
            return;
        }
        coreX = point.x();
        coreY = point.y();
        player.movingCore = false;
        setNotice("コアを移設しました");
    }

    private void placeInFacingTile(Player player) {
        if (!canUseFacilities() || player.down) return;
        MapPoint origin = GameMap.snapToTile(player.x, player.y);
        double targetX = origin.x() + player.facingX * GameMap.TILE_SIZE;
        double targetY = origin.y() + player.facingY * GameMap.TILE_SIZE;
        if (!player.movingCore && Math.abs(targetX - player.x) < 23
                && Math.abs(targetY - player.y) < 23) {
            targetX += player.facingX * GameMap.TILE_SIZE;
            targetY += player.facingY * GameMap.TILE_SIZE;
        }
        if (player.movingCore) {
            placeCore(player, new String[] {"PLACE_CORE",
                    Double.toString(targetX), Double.toString(targetY)});
        } else if (player.selectedBuild != null && player.selectedBuild.endsWith("Factory")) {
            placeFactory(player, GameMap.snapToTile(targetX, targetY));
        } else if (player.selectedBuild != null) {
            placeDefense(player, new String[] {"PLACE",
                    Double.toString(targetX), Double.toString(targetY), player.selectedBuild});
        } else {
            feedback(player, "先に設置するアイテムを選んでください");
        }
    }

    private void placeFactory(Player player, MapPoint point) {
        String item = player.selectedBuild;
        ShopUnit shop = GameMap.shopByItem(item);
        if (shop == null || !item.endsWith("Factory") || player.buildItemCount(item) <= 0) return;
        if (!canPlaceDefenseAt(point, null)) {
            feedback(player, "ここには設置できません");
            return;
        }
        factories.add(new MaterialFactory("quarry-" + nextFactoryId++, shop, point));
        player.addBuildItem(item, -1);
        if (player.buildItemCount(item) == 0) player.selectedBuild = null;
        feedback(player, "製造装置を設置しました");
    }

    private void pickupFactory(Player player, String id) {
        if (!canUseFacilities() || player.down) return;
        MaterialFactory factory = factories.stream().filter(unit -> unit.id.equals(id)
                && canInteract(player, unit.x, unit.y, 70)).findFirst().orElse(null);
        if (factory == null) return;
        factories.remove(factory);
        String item = factory.shop.item();
        player.addBuildItem(item, 1);
        player.selectedBuild = item;
        releaseCarriedCore(player);
        feedback(player, "製造装置を回収しました");
    }

    private void build(Player player, String slotId, String type) {
        if (!canUseFacilities() || player.down || !BUILD_RECIPES.containsKey(type)) return;
        TrapSlot slot = slotById(slotId);
        if (slot == null || !canInteract(player, slot.x, slot.y, 100)) {
            feedback(player, "もう少し近づいてください");
            return;
        }
        if (slot.requiredArea != null && !unlockedAreas.contains(slot.requiredArea)) {
            feedback(player, "このエリアはまだ開放されていません");
            return;
        }
        if (slot.defense != null) {
            feedback(player, "すでに設備が置かれています");
            return;
        }
        if (player.buildItemCount(type) <= 0) {
            feedback(player, "先にこの設備を製作してください");
            return;
        }
        if (!canPlaceDefenseAt(new MapPoint(slot.x, slot.y), slot)) return;
        player.addBuildItem(type, -1);
        slot.ownerId = player.id;
        slot.defense = player.takeDefense(type);
        sendSoundEffect(player,"item-use","build");
        feedback(player, "設置しました");
    }

    private void placeDefense(Player player, String[] parts) {
        if (!canUseFacilities() || player.down || !BUILD_RECIPES.containsKey(parts[3])) return;
        double requestedX = Double.parseDouble(parts[1]);
        double requestedY = Double.parseDouble(parts[2]);
        if (!Double.isFinite(requestedX) || !Double.isFinite(requestedY)) return;
        MapPoint point = GameMap.snapToTile(requestedX, requestedY);
        if (distance(player.x, player.y, point.x(), point.y()) > 180) {
            feedback(player, "もう少し近づいてください");
            return;
        }
        if (!canPlaceDefenseAt(point, null)) {
            feedback(player, "ここには設置できません");
            return;
        }
        String type = parts[3];
        if (!type.equals(player.selectedBuild) || player.buildItemCount(type) <= 0) {
            feedback(player, "設置する設備を手に持ってください");
            return;
        }
        player.addBuildItem(type, -1);
        if (player.buildItemCount(type) <= 0) player.selectedBuild = null;
        String lane = GameMap.SPAWN_POINTS.stream()
                .min(Comparator.comparingDouble(spawn ->
                        distance(point.x(), point.y(), spawn.x(), spawn.y())))
                .map(SpawnPoint::lane).orElse("free");
        TrapSlot placed = new TrapSlot("placed-" + nextDefenseId++, lane,
                point.x(), point.y(), null);
        placed.ownerId = player.id;
        placed.defense = player.takeDefense(type);
        trapSlots.add(placed);
        sendSoundEffect(player,"item-use","build");
        feedback(player, "設置しました");
    }

    private boolean canPlaceDefenseAt(MapPoint point, TrapSlot ignored) {
        return GameMap.canPlaceDefense(point.x(), point.y(), unlockedAreas)
                && distance(point.x(), point.y(), coreX, coreY) >= 40
                && factories.stream().noneMatch(unit -> distance(point.x(), point.y(), unit.x, unit.y) < 36)
                && trapSlots.stream().noneMatch(slot -> slot != ignored && slot.defense != null
                        && distance(point.x(), point.y(), slot.x, slot.y) < 36)
                && players.stream().noneMatch(other -> Math.abs(point.x() - other.x) < 23
                        && Math.abs(point.y() - other.y) < 23)
                && enemies.stream().noneMatch(enemy -> enemy.hp > 0
                        && distance(point.x(), point.y(), enemy.x, enemy.y) < 48);
    }

    private void removeDefense(Player player, String slotId) {
        if (!canUseFacilities() || player.down) return;
        TrapSlot slot = slotById(slotId);
        if (slot == null || slot.defense == null
                || !canInteract(player, slot.x, slot.y, 100)) return;
        String type = slot.defense.type;
        trapSlots.remove(slot);
        player.recoverDefense(slot.defense);
        player.selectedBuild = type;
        releaseCarriedCore(player);
        feedback(player, "設備を回収しました");
    }

    private void repair(Player player, String slotId) {
        if (!canUseFacilities() || player.down) return;
        TrapSlot slot = slotById(slotId);
        if (slot == null || slot.defense == null
                || !canInteract(player, slot.x, slot.y, 100)) return;
        if (slot.defense.hp >= slot.defense.maxHp) {
            feedback(player, "設備の耐久値は満タンです");
            return;
        }
        boolean metal = Set.of("turret", "copperTurret", "silverTurret", "wire", "mine").contains(slot.defense.type);
        if (metal && player.ore < 1 || !metal && player.wood < 1) {
            feedback(player, "素材が足りません");
            return;
        }
        if (metal) player.ore--; else player.wood--;
        slot.defense.hp = slot.defense.maxHp;
        feedback(player, "設備を修理しました");
    }

    private void upgradeCore(Player player, String type) {
        if (!canUseFacilities() || player.down
                || !canInteract(player, coreX, coreY, 130)) return;
        switch (type) {
            case "hp" -> {
                int cost = coreUpgradeCost("hp");
                if (spend(player, cost)) {
                    coreMaxHp += 250;
                    coreHp += 250;
                    feedback(player, "コアを強化しました");
                } else {
                    feedback(player, "お金が足りません");
                }
            }
            case "shield" -> {
                int cost = coreUpgradeCost("shield");
                if (spend(player, cost)) {
                    coreMaxShield += 180;
                    coreShield = coreMaxShield;
                    feedback(player, "コアを強化しました");
                } else {
                    feedback(player, "お金が足りません");
                }
            }
            case "defense" -> {
                int cost = coreUpgradeCost("defense");
                if (coreDefenseLevel >= 4) {
                    feedback(player, "すでに最大レベルです");
                    return;
                }
                if (spend(player, cost)) {
                    coreDefenseLevel++;
                    feedback(player, "コアを強化しました");
                } else {
                    feedback(player, "お金が足りません");
                }
            }
            case "regen" -> {
                int cost = coreUpgradeCost("regen");
                if (coreRegenLevel >= 4) {
                    feedback(player, "すでに最大レベルです");
                    return;
                }
                if (spend(player, cost)) {
                    coreRegenLevel++;
                    feedback(player, "コアを強化しました");
                } else {
                    feedback(player, "お金が足りません");
                }
            }
            default -> { }
        }
    }

    int prepExtensionCost() {
        return GameMap.PREP_CONSOLE.cost() + Math.max(0, round - 10) * 100;
    }

    private void extendPrepTime(Player player) {
        PrepConsole console = GameMap.PREP_CONSOLE;
        if (!canUseFacilities() || player.down
                || !unlockedAreas.contains(console.requiredArea())) return;
        if (!canInteract(player, console.x(), console.y(), 95)) {
            feedback(player, "準備時間の操作端末に近づいてください");
            return;
        }
        if (!spend(player, prepExtensionCost())) {
            feedback(player, "お金が足りません");
            return;
        }
        if (phase == GamePhase.PREPARING) {
            prepTime += console.seconds();
            feedback(player, "準備時間を1分延長しました");
        } else {
            nextPrepBonusSeconds += console.seconds();
            feedback(player, "次の準備時間を1分延長しました");
        }
    }

    private void startBlackout() {
        trippedBreakers.clear();
        List<BreakerTerminal> available = new ArrayList<>(GameMap.BREAKER_TERMINALS.stream()
                .filter(breaker -> breaker.requiredArea() == null
                        || unlockedAreas.contains(breaker.requiredArea()))
                .toList());
        int breakerCount = round >= 20 ? 1 + random.nextInt(2) : 1;
        for (int i = 0; i < breakerCount && !available.isEmpty(); i++) {
            trippedBreakers.add(available.remove(random.nextInt(available.size())).id());
        }
        blackoutBreakerTotal = trippedBreakers.size();
        blackoutActive = blackoutBreakerTotal > 0;
    }

    private void clearBlackout() {
        blackoutActive = false;
        blackoutBreakerTotal = 0;
        trippedBreakers.clear();
    }

    private void resetBreaker(Player player, String breakerId) {
        if (!canUseFacilities() || player.down) return;
        BreakerTerminal breaker = GameMap.breakerById(breakerId);
        if (breaker == null
                || breaker.requiredArea() != null
                && !unlockedAreas.contains(breaker.requiredArea())) return;
        if (!blackoutActive) {
            feedback(player, "電力は正常です");
            return;
        }
        if (!canInteract(player, breaker.x(), breaker.y(), 95)) {
            feedback(player, "ブレーカーに近づいてください");
            return;
        }
        if (!trippedBreakers.remove(breaker.id())) {
            feedback(player, "このブレーカーは正常です");
            return;
        }
        int remaining = trippedBreakers.size();
        if (remaining == 0) {
            blackoutActive = false;
            feedback(player, "電力を復旧しました");
            setNotice("電力が復旧しました");
        }
    }

    private void unlockArea(Player player, String areaId) {
        if (!canUseFacilities() || player.down) return;
        UnlockArea area = GameMap.areaById(areaId);
        if (area == null || !terminalAccessible(area)) return;
        if (unlockedAreas.contains(areaId)) {
            feedback(player, "このエリアは開放済みです");
            return;
        }
        if (!canInteract(player, area.terminalX(), area.terminalY(), 100)) {
            feedback(player, "開放端末に近づいてください");
            return;
        }
        int cost = unlockCost();
        if (spend(player, cost)) {
            unlockedAreas.add(areaId);
            // Opened areas only become spawn candidates when the next round starts.
            setNotice(area.name() + "を開放しました");
        } else {
            feedback(player, "お金が足りません");
        }
    }

    private boolean spend(Player player, int amount) {
        if (player.credits < amount) return false;
        player.credits -= amount;
        return true;
    }

    private void damagePlayer(Player player, double damage) {
        if (player.down || damage <= 0) return;
        events.broadcast("{\"type\":\"effect\",\"effect\":\"player-hit\",\"playerId\":\"" + player.id + "\"}");
        if (player.movingCore) damageCore(damage);
        player.hp = Math.max(0, player.hp - damage);
        if (player.hp <= 0) {
            player.down = true;
            events.broadcast("{\"type\":\"effect\",\"effect\":\"player-down\",\"playerId\":\"" + player.id
                    + "\",\"x\":" + player.x + ",\"y\":" + player.y + "}");
            cancelAction(player);
            player.moveX = 0;
            player.moveY = 0;
            player.dashHeld = false;
            player.dashing = false;
            player.firing = false;
            releaseCarriedCore(player);
            setNotice(player.name + "が倒れました");
        }
    }

    private void releaseCarriedCore(Player player) {
        if (!player.movingCore) return;
        coreX = player.x;
        coreY = player.y;
        player.movingCore = false;
    }

    private void resetWorld(boolean preserveHumans) {
        phase = GamePhase.LOBBY;
        round = 0;
        prepTime = 0;
        queuedEnemies = 0;
        queuedTinyEnemies = 0;
        queuedBosses = 0;
        roundEvent = "none";
        failedSpawnId = null;
        clearBlackout();
        nextPrepBonusSeconds = 0;
        spawnTimer = 0;
        coreMaxHp = 1000;
        coreHp = coreMaxHp;
        coreX = CORE_X;
        coreY = CORE_Y;
        coreMaxShield = 0;
        coreShield = 0;
        coreDefenseLevel = 0;
        coreRegenLevel = 0;
        enemies.clear();
        droppedResources.clear();
        activeLanes.clear();
        activeSpawnIds.clear();
        nextSpawnIndex = 0;
        unlockedAreas.clear();
        nextEnemyId = 1;
        nextDefenseId = 1;
        nextDroppedResourceId = 1;
        trapSlots.clear();
        trapSlots.addAll(GameMap.createTrapSlots());
        factories.clear();
        nextFactoryId = 1;
        resourceNodes.clear();
        resourceNodes.addAll(GameMap.createResourceNodes());
        int index = 0;
        for (Player player : players) {
            player.x = coreX - 28 + (index % 2) * 56;
            player.y = coreY - 28 + (index / 2) * 56;
            player.moveX = 0;
            player.moveY = 0;
            player.facingX = 0;
            player.facingY = -1;
            player.hp = 100;
            player.roomReady = false;
            player.down = false;
            player.dashHeld = false;
            player.dashing = false;
            player.dashExhausted = false;
            player.stamina = 100;
            player.equipWeapon("pistol");
            player.weaponCooldowns.clear();
            player.weaponCooldownMaxima.clear();
            player.cooldown = 0;
            player.cooldownMax = 0;
            player.firing = false;
            player.aimX = player.x + 100;
            player.aimY = player.y;
            player.ownsShotgun = false;
            player.ownsSmg = false;
            player.ownsRifle = false;
            player.ownsSniper = false;
            player.ownsRevolver = false;
            player.ownsRocket = false;
            player.ownsLmg = false;
            player.ownsRicochet = false;
            player.shotgunAmmo = 0;
            player.smgAmmo = 0;
            player.rifleAmmo = 0;
            player.sniperAmmo = 0;
            player.revolverAmmo = 0;
            player.rocketAmmo = 0;
            player.lmgAmmo = 0;
            player.ricochetAmmo = 0;
            player.wood = 0;
            player.ore = 0;
            player.recoveredDefenses.clear();
            player.quarryItems.clear();
            player.copper=0; player.silver=0; player.medkits=0; player.copperTurretItems=0; player.silverTurretItems=0;
            player.gatherCooldown = 0;
            player.blockItems = 0;
            player.turretItems = 0;
            player.wireItems = 0;
            player.mineItems = 0;
            player.barricadeItems = 0;
            player.credits = 0;
            player.selectedBuild = null;
            player.movingCore = false;
            player.kills = 0;
            player.botTargetEnemyId = -1;
            player.botObservedEnemyId = -1;
            player.botRecognitionTimer = 0;
            player.botWanderX = 0;
            player.botWanderY = 0;
            player.botWanderTimer = 0;
            player.botSpendCooldown = 1.25 + player.slot * 0.35;
            player.botExtendedRound = -1;
            player.botSharedRound = -1;
            player.botPath = List.of();
            player.botPathIndex = 0;
            player.botPathTimer = 0;
            player.botPathTargetX = Double.NaN;
            player.botPathTargetY = Double.NaN;
            cancelAction(player);
            if (!preserveHumans && !player.human) player.name = "CPU " + player.slot;
            index++;
        }
    }

    private Player playerById(String id) {
        return players.stream().filter(player -> player.id.equals(id)).findFirst().orElse(null);
    }

    private TrapSlot slotById(String id) {
        return trapSlots.stream().filter(slot -> slot.id.equals(id)).findFirst().orElse(null);
    }

    private boolean canMove() {
        return phase == GamePhase.PREPARING || phase == GamePhase.WAVE;
    }

    private boolean canUseFacilities() {
        return phase == GamePhase.PREPARING || phase == GamePhase.WAVE;
    }

    private boolean canInteract(Player player, double x, double y, double range) {
        double separation = distance(player.x, player.y, x, y);
        if (separation > range) return false;
        // Allow only the terminal's own tile, including diagonal approaches.
        boolean mounted = !GameMap.canOccupy(x, y, 0, unlockedAreas);
        for (double step = 0; step < separation; step += 4) {
            double factor = step / Math.max(1, separation);
            double sampleX = player.x + (x - player.x) * factor;
            double sampleY = player.y + (y - player.y) * factor;
            if (mounted && Math.floor(sampleX / GameMap.TILE_SIZE) == Math.floor(x / GameMap.TILE_SIZE)
                    && Math.floor(sampleY / GameMap.TILE_SIZE) == Math.floor(y / GameMap.TILE_SIZE)) continue;
            if (!GameMap.canOccupy(sampleX, sampleY, 0, unlockedAreas)) return false;
        }
        return true;
    }

    private boolean canOccupy(double x, double y, double radius) {
        if (!GameMap.canOccupy(x, y, radius, unlockedAreas)) return false;
        return trapSlots.stream().noneMatch(slot -> slot.defense != null
                && (slot.defense.type.equals("block") || slot.defense.type.equals("barricade"))
                && distance(x, y, slot.x, slot.y) < radius + 18);
    }

    private void cancelAction(Player player) {
        player.actionTarget = null;
        player.actionProgress = 0;
    }

    private void feedback(Player player, String message) {
        if (player.human) {
            events.send(player, "{\"type\":\"feedback\",\"message\":\""
                    + escapeJson(message) + "\"}");
        }
    }

    private void setNotice(String text) {
        notice = text;
        noticeVersion++;
        events.broadcast("{\"type\":\"log\",\"version\":" + noticeVersion
                + ",\"message\":\"" + escapeJson(text) + "\"}");
    }
}
