package example;

import static example.GameConfig.BUILD_RECIPES;
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
    private static final int WEAPON_AMMO_REFILL_COST = 120;

    final List<Player> players = new ArrayList<>();
    final List<Enemy> enemies = new ArrayList<>();
    final List<TrapSlot> trapSlots = GameMap.createTrapSlots();
    final List<ResourceNode> resourceNodes = GameMap.createResourceNodes();
    final List<DroppedResource> droppedResources = new ArrayList<>();
    final Set<String> unlockedAreas = new HashSet<>();
    final List<String> activeSpawnIds = new ArrayList<>();
    final Set<String> trippedBreakers = new HashSet<>();

    GamePhase phase = GamePhase.LOBBY;
    int round;
    double prepTime;
    int queuedEnemies;
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
            setNotice(assigned.name + (rejoining ? " 再参加" : " 参加"));
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
        setNotice(displayName + " 切断");
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
                        feedback(player, "ONLY ROOM OWNER CAN START");
                    } else if (!roomReadyForStart()) {
                        feedback(player, "WAITING FOR OK");
                    } else {
                        startMatch();
                    }
                }
            }
            case "ROOM_READY" -> setRoomReady(player, parts);
            case "MOVE" -> handleMove(player, parts);
            case "DASH" -> handleDash(player, parts);
            case "ATTACK" -> { if (parts.length >= 2) attack(player, Integer.parseInt(parts[1])); }
            case "FIRE" -> handleFire(player, parts);
            case "INTERACT" -> { if (parts.length >= 2) interact(player, parts[1]); }
            case "WEAPON" -> { if (parts.length >= 2) switchWeapon(player, parts[1]); }
            case "BUY" -> { if (parts.length >= 2) buy(player, parts[1]); }
            case "BUILD" -> { if (parts.length >= 3) build(player, parts[1], parts[2]); }
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
            case "PLACE_FRONT" -> placeInFacingTile(player);
            case "READY" -> { if (phase == GamePhase.PREPARING && !player.down
                    && player.id.equals(roomOwnerId)) prepTime = 0; }
            default -> { }
        }
    }

    void update(double dt) {
        updateReconnectReservations(dt);
        for (Player player : players) {
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
            setNotice("CORE DESTROYED");
            return;
        }
        if (players.stream().noneMatch(player -> !player.down)) {
            phase = GamePhase.LOST;
            setNotice("全員 DOWN");
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

    private void startMatch() {
        resetWorld(true);
        phase = GamePhase.PREPARING;
        prepTime = 12;
        setNotice("準備開始");
    }

    void setRoomOwner(Player player) {
        if (player != null) roomOwnerId = player.id;
    }

    boolean roomReadyForStart() {
        return players.stream().anyMatch(player -> player.human)
                && players.stream().filter(player -> player.human)
                        .allMatch(player -> player.roomReady);
    }

    private void setRoomReady(Player player, String[] parts) {
        if (phase != GamePhase.LOBBY && phase != GamePhase.WON && phase != GamePhase.LOST) return;
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
        roundEvent = round % 4 == 3 ? "blackout"
                : round >= 5 && round % 4 == 1 ? "door_failure"
                : round % 4 == 0 ? "boss_assault" : "none";
        failedSpawnId = roundEvent.equals("door_failure")
                ? activeSpawnIds.get(random.nextInt(activeSpawnIds.size())) : null;
        if (roundEvent.equals("blackout") && !blackoutActive) startBlackout();
        spawnTimer = 0;
        nextSpawnIndex = 0;
        coreShield = coreMaxShield;
        switch (roundEvent) {
            case "blackout" -> setNotice("停電：ブレーカーを復旧");
            case "door_failure" -> setNotice(GameMap.spawnById(failedSpawnId).name() + " 故障");
            case "boss_assault" -> setNotice("BOSS ×" + queuedBosses);
            default -> { }
        }
    }

    private void finishRound() {
        if (round >= MAX_ROUNDS) {
            phase = GamePhase.WON;
            setNotice("ALL HOSTILES ELIMINATED — CORE SECURED");
            return;
        }
        int reward = 180 + round * 30;
        players.forEach(player -> player.credits += reward);
        phase = GamePhase.PREPARING;
        prepTime = PREP_SECONDS + nextPrepBonusSeconds;
        nextPrepBonusSeconds = 0;
        activeLanes.clear();
        activeSpawnIds.clear();
        roundEvent = "none";
        failedSpawnId = null;
        setNotice("CLEAR +" + reward + "G");
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
        int interiorLimit = currentRound >= 14 ? 2 : 1;
        for (SpawnPoint spawn : interior.subList(0, Math.min(interiorLimit, interior.size()))) addRoundSpawn(spawn);
    }

    private boolean interiorSpawnEligible(SpawnPoint spawn, int currentRound) {
        String area = GameMap.spawnArea(spawn);
        if (area == null || !unlockedAreas.contains(area)) return false;
        int firstRound = switch (area) {
            case "entry-room" -> 8;
            case "transit-hall" -> 10;
            case "armory-wing" -> 12;
            case "forest" -> 14;
            case "relay-gallery" -> 16;
            case "mine" -> 18;
            case "security-hall", "command-room" -> 20;
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
                setNotice(target.name + " 復帰");
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
            if (node.type.equals("wood")) collector.wood++;
            else collector.ore++;
            node.available = false;
            node.respawnTimer = 7 + Math.floorMod(node.id.hashCode(), 5);
            events.broadcast("{\"type\":\"effect\",\"effect\":\"pickup\",\"resource\":\""
                    + node.type + "\",\"playerId\":\"" + collector.id + "\",\"x\":"
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
            if (drop.type.equals("wood")) collector.wood += drop.amount;
            else collector.ore += drop.amount;
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
        SpawnPoint spawn = nextRoundSpawn();
        if (queuedBosses > 0 && queuedEnemies <= queuedBosses * 2) {
            spawnEnemy("boss", spawn);
            queuedBosses--;
        } else if (queuedEnemies > 0) {
            spawnEnemy(selectEnemyType(spawn), spawn);
            queuedEnemies--;
        }
        double eventMultiplier = roundEvent.equals("door_failure")
                && spawn.id().equals(failedSpawnId) ? 0.58 : 1;
        spawnTimer = Math.max(0.28, (1.15 - round * 0.045) * eventMultiplier);
    }

    private String selectEnemyType(SpawnPoint spawn) {
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
        // Total gold per enemy stays unchanged despite doubled health.
        enemies.add(new Enemy(nextEnemyId++, type, spawn, hp * 2, speed * 0.5, damage, reward));
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
            } else if (defense.type.equals("turret") && defense.cooldown <= 0) {
                Enemy target = enemies.stream()
                        .filter(enemy -> enemy.hp > 0 && distance(slot.x, slot.y, enemy.x, enemy.y) <= 270)
                        .filter(enemy -> GameMap.hasClearLine(slot.x, slot.y, enemy.x, enemy.y))
                        .min(Comparator.comparingDouble(enemy -> distance(enemy.x, enemy.y, coreX, coreY)))
                        .orElse(null);
                if (target != null) {
                    damageEnemy(target, 17 + round * 0.5, null);
                    sendHitEffect("trap", "turret", slot.x, slot.y, target.x, target.y,
                            17 + round * 0.5, target.hp <= 0, 0, false);
                    defense.cooldown = 0.7;
                }
            } else if (defense.type.equals("mine")) {
                Enemy trigger = enemies.stream()
                        .filter(enemy -> enemy.hp > 0 && distance(slot.x, slot.y, enemy.x, enemy.y) < 58)
                        .findFirst().orElse(null);
                if (trigger != null) {
                    for (Enemy enemy : enemies) {
                        if (enemy.hp > 0 && distance(slot.x, slot.y, enemy.x, enemy.y) < 120) {
                            damageEnemy(enemy, 90, null);
                            sendHitEffect("trap", "mine", slot.x, slot.y, enemy.x, enemy.y,
                                    90, enemy.hp <= 0, 0, false);
                        }
                    }
                    slot.defense = null;
                }
            }
        }
        for (TrapSlot slot : trapSlots) {
            if (slot.defense != null && slot.defense.hp <= 0) {
                setNotice("防衛設備 破壊");
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
            if (enemy.type.equals("boss")) {
                enemy.specialCooldown = Math.max(0, enemy.specialCooldown - dt);
                if (enemy.specialCooldown <= 0
                        && distance(enemy.x, enemy.y, coreX, coreY) <= 260) {
                    useBossCorePulse(enemy);
                    enemy.specialCooldown = 6;
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
                bot.moveX = 0;
                bot.moveY = 0;
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
            case "boss" -> 460;
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
        score -= otherClaims * (enemy.type.equals("boss") ? 35 : 145);
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
            case "sniper" -> 450;
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
            bot.weapon = "bat";
        } else if (targetDistance > 390 && bot.ownsSniper && bot.sniperAmmo > 0) {
            bot.weapon = "sniper";
        } else if (targetDistance > 260 && bot.ownsRifle && bot.rifleAmmo > 0) {
            bot.weapon = "rifle";
        } else if (targetDistance > 155 && bot.ownsSmg && bot.smgAmmo > 0) {
            bot.weapon = "smg";
        } else if (targetDistance <= 190 && bot.ownsShotgun && bot.shotgunAmmo > 0) {
            bot.weapon = "shotgun";
        } else if (bot.ownsSmg && bot.smgAmmo > 0) {
            bot.weapon = "smg";
        } else if (bot.ownsRifle && bot.rifleAmmo > 0) {
            bot.weapon = "rifle";
        } else if (bot.ownsSniper && bot.sniperAmmo > 0) {
            bot.weapon = "sniper";
        } else {
            bot.weapon = "pistol";
        }
        bot.selectedBuild = null;
    }

    private static boolean hasBotRangedAmmo(Player bot) {
        return bot.ownsShotgun && bot.shotgunAmmo > 0
                || bot.ownsSmg && bot.smgAmmo > 0
                || bot.ownsRifle && bot.rifleAmmo > 0
                || bot.ownsSniper && bot.sniperAmmo > 0;
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
        if (bot.hp <= 55 && bot.credits >= 80 && isPointUnlocked(MED_X, MED_Y)) {
            return botUse(bot, MED_X, MED_Y, 65, () -> buy(bot, "heal"));
        }
        TrapSlot damaged = trapSlots.stream().filter(slot -> slot.defense != null
                && slot.defense.hp < slot.defense.maxHp * .65
                && (Set.of("turret", "wire", "mine").contains(slot.defense.type) ? bot.ore > 0 : bot.wood > 0)
                && isAssignedBot(bot, slot.x, slot.y))
                .min(Comparator.comparingDouble(slot -> distance(bot.x, bot.y, slot.x, slot.y))).orElse(null);
        if (damaged != null) return botUse(bot, damaged.x, damaged.y, 70, () -> repair(bot, damaged.id));
        List<String> preference = switch (bot.slot) {
            case 1 -> List.of("shotgun", "rifle", "smg", "sniper");
            case 2 -> List.of("smg", "shotgun", "sniper", "rifle");
            case 3 -> List.of("rifle", "shotgun", "smg", "sniper");
            default -> List.of("sniper", "smg", "shotgun", "rifle");
        };
        for (String item : preference) {
            ShopUnit shop = GameMap.shopByItem(item);
            boolean owned = botOwnsWeapon(bot, item);
            if (shop == null || !isPointUnlocked(shop.x(), shop.y())
                    || bot.credits < (owned ? WEAPON_AMMO_REFILL_COST : shop.cost())) continue;
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
            int cost = upgrade == null ? Integer.MAX_VALUE : switch (upgrade) {
                case "hp" -> 300 + (int) ((coreMaxHp - 1000) * .6);
                case "defense" -> 450 + coreDefenseLevel * 250;
                case "regen" -> 500 + coreRegenLevel * 300;
                default -> 350 + (int) (coreMaxShield * .8);
            };
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
        int unlockCost = 350 + unlockedAreas.size() * 100;
        if (bot.credits >= unlockCost && unlockedAreas.size() < 2 + round / 2) {
            UnlockArea area = GameMap.AREAS.stream().filter(unit -> !unlockedAreas.contains(unit.id())
                    && terminalAccessible(unit) && isAssignedBot(bot, unit.terminalX(), unit.terminalY()))
                    .min(Comparator.comparingDouble(unit -> distance(bot.x, bot.y, unit.terminalX(), unit.terminalY())))
                    .orElse(null);
            if (area != null) return botUse(bot, area.terminalX(), area.terminalY(), 65,
                    () -> unlockArea(bot, area.id()));
        }
        if (bot.botExtendedRound != round && prepTime < 6 && coreHp < coreMaxHp * .7
                && bot.credits >= 10 && unlockedAreas.contains("operations-room")
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
        for (int[] offset : new int[][]{{40,0},{-40,0},{0,40},{0,-40}}) {
            if (GameMap.canOccupy(area.terminalX() + offset[0], area.terminalY() + offset[1], 5, unlockedAreas)) return true;
        }
        return false;
    }

    private boolean isPointUnlocked(double x, double y) {
        return GameMap.AREAS.stream().filter(area -> x >= area.x()
                && x <= area.x() + area.width() && y >= area.y()
                && y <= area.y() + area.height())
                .allMatch(area -> unlockedAreas.contains(area.id()));
    }

    private static boolean botOwnsWeapon(Player bot, String item) {
        return switch (item) {
            case "shotgun" -> bot.ownsShotgun;
            case "smg" -> bot.ownsSmg;
            case "rifle" -> bot.ownsRifle;
            case "sniper" -> bot.ownsSniper;
            default -> true;
        };
    }

    private static void giveBotWeapon(Player bot, String item) {
        switch (item) {
            case "shotgun" -> { bot.ownsShotgun = true; bot.shotgunAmmo = 30; }
            case "smg" -> { bot.ownsSmg = true; bot.smgAmmo = 90; }
            case "rifle" -> { bot.ownsRifle = true; bot.rifleAmmo = 24; }
            case "sniper" -> { bot.ownsSniper = true; bot.sniperAmmo = 16; }
            default -> { return; }
        }
        bot.weapon = item;
        bot.selectedBuild = null;
    }

    private void attack(Player player, int enemyId) {
        Enemy target = enemies.stream().filter(enemy -> enemy.id == enemyId && enemy.hp > 0)
                .findFirst().orElse(null);
        if (target == null) return;
        attackAt(player, target.x, target.y);
    }

    private void attackAt(Player player, double aimX, double aimY) {
        if (!canMove() || player.down || player.movingCore || player.cooldown > 0) return;

        WeaponStats weapon = weaponStats(player.weapon);
        boolean empty = player.weapon.equals("shotgun") && player.shotgunAmmo <= 0
                || player.weapon.equals("smg") && player.smgAmmo <= 0
                || player.weapon.equals("rifle") && player.rifleAmmo <= 0
                || player.weapon.equals("sniper") && player.sniperAmmo <= 0;
        if (empty) {
            feedback(player, "NO AMMO");
            player.firing = false;
            return;
        }
        if (player.weapon.equals("shotgun")) player.shotgunAmmo--;
        if (player.weapon.equals("smg")) player.smgAmmo--;
        if (player.weapon.equals("rifle")) player.rifleAmmo--;
        if (player.weapon.equals("sniper")) player.sniperAmmo--;

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
        double shotDistance = GameMap.distanceToWall(player.x, player.y,
                directionX, directionY, weapon.range());
        double endX = player.x + directionX * shotDistance;
        double endY = player.y + directionY * shotDistance;

        List<Enemy> candidates = enemies.stream().filter(enemy -> enemy.hp > 0)
                .filter(enemy -> isInsideAttack(enemy, player, directionX, directionY,
                        weapon, shotDistance))
                .filter(enemy -> GameMap.hasClearLine(player.x, player.y, enemy.x, enemy.y))
                .sorted(Comparator.comparingDouble(enemy ->
                        distance(player.x, player.y, enemy.x, enemy.y))).toList();
        List<Enemy> targets = player.weapon.equals("shotgun")
                ? candidates : candidates.stream().limit(1).toList();
        if (targets.isEmpty()) {
            sendHitEffect(player.id, player.weapon, player.x, player.y, endX, endY,
                    0, false, 0, false);
            return;
        }
        for (Enemy hit : targets) {
            int creditsBeforeHit = player.credits;
            boolean headshot = isHeadshot(hit, player, directionX, directionY,
                    weapon, shotDistance);
            double damage = weapon.damage() * (headshot ? 1.5 : 1);
            damageEnemy(hit, damage, player);
            knockbackEnemy(player.x, player.y, hit, weapon.knockback());
            sendHitEffect(player.id, player.weapon, player.x, player.y, hit.x, hit.y,
                    damage, hit.hp <= 0, player.credits - creditsBeforeHit, headshot);
        }
    }

    private boolean isInsideAttack(Enemy enemy, Player player, double directionX,
            double directionY, WeaponStats weapon, double shotDistance) {
        double toEnemyX = enemy.x - player.x;
        double toEnemyY = enemy.y - player.y;
        double projection = toEnemyX * directionX + toEnemyY * directionY;
        if (projection < 0 || projection > shotDistance) return false;
        double perpendicular = Math.abs(toEnemyX * directionY - toEnemyY * directionX);
        double enemyRadius = enemyRadius(enemy);
        double spread = player.weapon.equals("shotgun") ? 16 + projection * 0.28 : weapon.width();
        return perpendicular <= spread + enemyRadius;
    }

    private boolean isHeadshot(Enemy enemy, Player player, double directionX,
            double directionY, WeaponStats weapon, double shotDistance) {
        if (player.weapon.equals("bat")) return false;
        double radius = enemyRadius(enemy);
        double headX = enemy.x;
        double headY = enemy.y - radius * 0.5;
        double toHeadX = headX - player.x;
        double toHeadY = headY - player.y;
        double projection = toHeadX * directionX + toHeadY * directionY;
        if (projection < 0 || projection > shotDistance) return false;
        double perpendicular = Math.abs(toHeadX * directionY - toHeadY * directionX);
        double headRadius = Math.max(4, radius * 0.28);
        double aimTolerance = player.weapon.equals("shotgun")
                ? Math.min(3, weapon.width() * 0.25)
                : weapon.width() * 0.25;
        return perpendicular <= headRadius + aimTolerance;
    }

    private static double enemyRadius(Enemy enemy) {
        return switch (enemy.type) {
            case "boss" -> 42;
            case "brute" -> 28;
            case "runner" -> 16;
            default -> 21;
        };
    }

    private static WeaponStats weaponStats(String weapon) {
        return switch (weapon) {
            case "bat" -> new WeaponStats(96, 20, 1.0, 115, 26);
            case "shotgun" -> new WeaponStats(220, 46, 1.45, 55, 18);
            case "smg" -> new WeaponStats(270, 12, 0.14, 0, 11);
            case "rifle" -> new WeaponStats(430, 58, 1.15, 0, 8);
            case "sniper" -> new WeaponStats(650, 125, 1.8, 0, 5);
            default -> new WeaponStats(285, 26, 0.38, 0, 10);
        };
    }

    private record WeaponStats(double range, double damage, double cooldown,
            double knockback, double width) { }

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
                || weapon.equals("sniper") && player.ownsSniper;
        if (owned) {
            releaseCarriedCore(player);
            player.weapon = weapon;
            player.selectedBuild = null;
            player.movingCore = false;
            player.firing = false;
            cancelAction(player);
        }
    }

    private void buy(Player player, String item) {
        if (!canUseFacilities() || player.down) return;
        if (item.equals("heal")) {
            if (!isPointUnlocked(MED_X, MED_Y) || !canInteract(player, MED_X, MED_Y, 95)) {
                feedback(player, "MOVE TO MED BAY");
                return;
            }
            if (player.hp >= 100) {
                feedback(player, "HP FULL");
                return;
            }
            if (spend(player, 80)) {
                player.hp = 100;
                feedback(player, "HEALED");
            } else {
                feedback(player, "NOT ENOUGH GOLD");
            }
            return;
        }
        ShopUnit shop = GameMap.shopByItem(item);
        if (shop == null || !isPointUnlocked(shop.x(), shop.y())
                || !canInteract(player, shop.x(), shop.y(), 70)) {
            feedback(player, "MOVE TO SHOP UNIT");
            return;
        }
        switch (item) {
            case "shotgun", "smg", "rifle", "sniper" ->
                    buyOrRefillWeapon(player, shop, item);
            case "ammo" -> {
                if (!player.ownsShotgun && !player.ownsSmg
                        && !player.ownsRifle && !player.ownsSniper) {
                    feedback(player, "NO AMMO WEAPON");
                    return;
                }
                if (spend(player, shop.cost())) {
                    player.shotgunAmmo += player.ownsShotgun ? 16 : 0;
                    player.smgAmmo += player.ownsSmg ? 45 : 0;
                    player.rifleAmmo += player.ownsRifle ? 12 : 0;
                    player.sniperAmmo += player.ownsSniper ? 8 : 0;
                    feedback(player, "AMMO REFILLED");
                } else {
                    feedback(player, "NOT ENOUGH GOLD");
                }
            }
            default -> { }
        }
    }

    private void buyOrRefillWeapon(Player player, ShopUnit shop, String item) {
        if (botOwnsWeapon(player, item)) {
            int capacity = weaponAmmoCapacity(item);
            if (weaponAmmo(player, item) >= capacity) {
                feedback(player, "AMMO FULL");
                return;
            }
            if (spend(player, WEAPON_AMMO_REFILL_COST)) {
                setWeaponAmmo(player, item, capacity);
                feedback(player, "AMMO FULL");
            } else {
                feedback(player, "NOT ENOUGH GOLD");
            }
            return;
        }
        if (spend(player, shop.cost())) {
            releaseCarriedCore(player);
            giveBotWeapon(player, item);
            feedback(player, "PURCHASED");
        } else {
            feedback(player, "NOT ENOUGH GOLD");
        }
    }

    private static int weaponAmmo(Player player, String item) {
        return switch (item) {
            case "shotgun" -> player.shotgunAmmo;
            case "smg" -> player.smgAmmo;
            case "rifle" -> player.rifleAmmo;
            case "sniper" -> player.sniperAmmo;
            default -> 0;
        };
    }

    private static int weaponAmmoCapacity(String item) {
        return switch (item) {
            case "shotgun" -> 30;
            case "smg" -> 90;
            case "rifle" -> 24;
            case "sniper" -> 16;
            default -> 0;
        };
    }

    private static void setWeaponAmmo(Player player, String item, int ammo) {
        switch (item) {
            case "shotgun" -> player.shotgunAmmo = ammo;
            case "smg" -> player.smgAmmo = ammo;
            case "rifle" -> player.rifleAmmo = ammo;
            case "sniper" -> player.sniperAmmo = ammo;
            default -> { }
        }
    }

    private void gather(Player player, String resource) {
        if (!canUseFacilities() || player.down) return;
        if (player.gatherCooldown > 0) {
            feedback(player, "RESOURCE NOT READY");
            return;
        }
        if (resource.equals("wood")) {
            if (!isPointUnlocked(WOODCUTTER_X, WOODCUTTER_Y) || !canInteract(player, WOODCUTTER_X, WOODCUTTER_Y, 110)) {
                feedback(player, "MOVE TO WOODCUTTER");
                return;
            }
            player.wood += 4;
            feedback(player, "WOOD +4");
        } else if (resource.equals("ore")) {
            if (!isPointUnlocked(QUARRY_X, QUARRY_Y) || !canInteract(player, QUARRY_X, QUARRY_Y, 110)) {
                feedback(player, "MOVE TO QUARRY");
                return;
            }
            player.ore += 3;
            feedback(player, "ORE +3");
        } else {
            return;
        }
        player.gatherCooldown = GATHER_COOLDOWN_SECONDS;
    }

    private void dropResource(Player player, String[] parts) {
        if (!canUseFacilities() || player.down) return;
        String type = parts[1];
        if (!type.equals("wood") && !type.equals("ore")) return;
        int available = type.equals("wood") ? player.wood : player.ore;
        int requested;
        try {
            requested = Integer.parseInt(parts[2]);
        } catch (NumberFormatException error) {
            return;
        }
        int amount = Math.min(available, Math.max(0, requested));
        if (amount <= 0) {
            feedback(player, "NOTHING TO DROP");
            return;
        }
        MapPoint origin = GameMap.snapToTile(player.x, player.y);
        MapPoint target = GameMap.snapToTile(origin.x() + player.facingX * GameMap.TILE_SIZE,
                origin.y() + player.facingY * GameMap.TILE_SIZE);
        double dropX = canOccupy(target.x(), target.y(), 5) ? target.x() : player.x;
        double dropY = canOccupy(target.x(), target.y(), 5) ? target.y() : player.y;
        if (type.equals("wood")) player.wood -= amount;
        else player.ore -= amount;
        droppedResources.add(new DroppedResource(nextDroppedResourceId++, type,
                dropX, dropY, amount, player.id));
        feedback(player, "DROPPED");
    }

    private void craft(Player player, String type) {
        if (!canUseFacilities() || player.down || !BUILD_RECIPES.containsKey(type)) return;
        boolean nearWorkbench = GameMap.WORKBENCH_UNITS.stream()
                .filter(workbench -> workbench.requiredArea() == null
                        || unlockedAreas.contains(workbench.requiredArea()))
                .anyMatch(workbench -> canInteract(player, workbench.x(), workbench.y(), 110));
        if (!nearWorkbench) {
            feedback(player, "MOVE TO WORKBENCH");
            return;
        }
        var recipe = BUILD_RECIPES.get(type);
        int woodCost = recipe.getOrDefault("wood", 0);
        int oreCost = recipe.getOrDefault("ore", 0);
        if (player.wood < woodCost || player.ore < oreCost) {
            feedback(player, "NOT ENOUGH MATERIALS");
            return;
        }
        player.wood -= woodCost;
        player.ore -= oreCost;
        player.addBuildItem(type, 1);
        player.selectedBuild = type;
        releaseCarriedCore(player);
        feedback(player, "CRAFTED");
    }

    private void equipBuild(Player player, String type) {
        if (type.equals("none")) {
            releaseCarriedCore(player);
            player.selectedBuild = null;
        } else if (BUILD_RECIPES.containsKey(type) && player.buildItemCount(type) > 0) {
            releaseCarriedCore(player);
            player.selectedBuild = type;
        }
    }

    private void equipCore(Player player) {
        if (!canUseFacilities() || player.down
                || !canInteract(player, coreX, coreY, 130)) {
            feedback(player, "MOVE TO CORE");
            return;
        }
        Player carrier = players.stream()
                .filter(other -> other != player && other.movingCore)
                .findFirst().orElse(null);
        if (carrier != null) {
            feedback(player, "CORE ALREADY CARRIED");
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
            feedback(player, "MOVE CLOSER");
            return;
        }
        if (!GameMap.canPlaceCore(point.x(), point.y(), unlockedAreas)
                || trapSlots.stream().anyMatch(slot -> slot.defense != null
                        && distance(point.x(), point.y(), slot.x, slot.y) < 45)
                || players.stream().anyMatch(other -> other != player && !other.down
                        && distance(point.x(), point.y(), other.x, other.y) < 24)
                || enemies.stream().anyMatch(enemy -> enemy.hp > 0
                        && distance(point.x(), point.y(), enemy.x, enemy.y) < 55)) {
            feedback(player, "CANNOT PLACE CORE HERE");
            return;
        }
        coreX = point.x();
        coreY = point.y();
        player.movingCore = false;
        setNotice("CORE 移設");
    }

    private void placeInFacingTile(Player player) {
        if (!canUseFacilities() || player.down) return;
        MapPoint origin = GameMap.snapToTile(player.x, player.y);
        double targetX = origin.x() + player.facingX * GameMap.TILE_SIZE;
        double targetY = origin.y() + player.facingY * GameMap.TILE_SIZE;
        if (player.movingCore) {
            placeCore(player, new String[] {"PLACE_CORE",
                    Double.toString(targetX), Double.toString(targetY)});
        } else if (player.selectedBuild != null) {
            placeDefense(player, new String[] {"PLACE",
                    Double.toString(targetX), Double.toString(targetY), player.selectedBuild});
        } else {
            feedback(player, "SELECT AN ITEM FIRST");
        }
    }

    private void build(Player player, String slotId, String type) {
        if (!canUseFacilities() || player.down || !BUILD_RECIPES.containsKey(type)) return;
        TrapSlot slot = slotById(slotId);
        if (slot == null || !canInteract(player, slot.x, slot.y, 100)) {
            feedback(player, "MOVE CLOSER");
            return;
        }
        if (slot.requiredArea != null && !unlockedAreas.contains(slot.requiredArea)) {
            feedback(player, "AREA LOCKED");
            return;
        }
        if (slot.defense != null) {
            feedback(player, "SLOT OCCUPIED");
            return;
        }
        if (player.buildItemCount(type) <= 0) {
            feedback(player, "CRAFT THIS ITEM FIRST");
            return;
        }
        if (!canPlaceDefenseAt(new MapPoint(slot.x, slot.y), slot)) return;
        player.addBuildItem(type, -1);
        slot.ownerId = player.id;
        slot.defense = new Defense(type);
        feedback(player, "PLACED");
    }

    private void placeDefense(Player player, String[] parts) {
        if (!canUseFacilities() || player.down || !BUILD_RECIPES.containsKey(parts[3])) return;
        double requestedX = Double.parseDouble(parts[1]);
        double requestedY = Double.parseDouble(parts[2]);
        if (!Double.isFinite(requestedX) || !Double.isFinite(requestedY)) return;
        MapPoint point = GameMap.snapToTile(requestedX, requestedY);
        if (distance(player.x, player.y, point.x(), point.y()) > 180) {
            feedback(player, "MOVE CLOSER");
            return;
        }
        if (!canPlaceDefenseAt(point, null)) {
            feedback(player, "CANNOT BUILD HERE");
            return;
        }
        String type = parts[3];
        if (!type.equals(player.selectedBuild) || player.buildItemCount(type) <= 0) {
            feedback(player, "HOLD A CRAFTED ITEM");
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
        placed.defense = new Defense(type);
        trapSlots.add(placed);
        feedback(player, "PLACED");
    }

    private boolean canPlaceDefenseAt(MapPoint point, TrapSlot ignored) {
        return GameMap.canPlaceDefense(point.x(), point.y(), unlockedAreas)
                && distance(point.x(), point.y(), coreX, coreY) >= 40
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
        player.addBuildItem(type, 1);
        player.selectedBuild = type;
        releaseCarriedCore(player);
        feedback(player, "RECOVERED");
    }

    private void repair(Player player, String slotId) {
        if (!canUseFacilities() || player.down) return;
        TrapSlot slot = slotById(slotId);
        if (slot == null || slot.defense == null
                || !canInteract(player, slot.x, slot.y, 100)) return;
        if (slot.defense.hp >= slot.defense.maxHp) {
            feedback(player, "DURABILITY FULL");
            return;
        }
        boolean metal = Set.of("turret", "wire", "mine").contains(slot.defense.type);
        if (metal && player.ore < 1 || !metal && player.wood < 1) {
            feedback(player, "NOT ENOUGH MATERIALS");
            return;
        }
        if (metal) player.ore--; else player.wood--;
        slot.defense.hp = slot.defense.maxHp;
        feedback(player, "REPAIRED");
    }

    private void upgradeCore(Player player, String type) {
        if (!canUseFacilities() || player.down
                || !canInteract(player, coreX, coreY, 130)) return;
        switch (type) {
            case "hp" -> {
                int cost = 300 + (int) ((coreMaxHp - 1000) * 0.6);
                if (spend(player, cost)) {
                    coreMaxHp += 250;
                    coreHp += 250;
                    feedback(player, "UPGRADED");
                } else {
                    feedback(player, "NOT ENOUGH GOLD");
                }
            }
            case "shield" -> {
                int cost = 350 + (int) (coreMaxShield * 0.8);
                if (spend(player, cost)) {
                    coreMaxShield += 180;
                    coreShield = coreMaxShield;
                    feedback(player, "UPGRADED");
                } else {
                    feedback(player, "NOT ENOUGH GOLD");
                }
            }
            case "defense" -> {
                int cost = 450 + coreDefenseLevel * 250;
                if (coreDefenseLevel >= 4) {
                    feedback(player, "MAX LEVEL");
                    return;
                }
                if (spend(player, cost)) {
                    coreDefenseLevel++;
                    feedback(player, "UPGRADED");
                } else {
                    feedback(player, "NOT ENOUGH GOLD");
                }
            }
            case "regen" -> {
                int cost = 500 + coreRegenLevel * 300;
                if (coreRegenLevel >= 4) {
                    feedback(player, "MAX LEVEL");
                    return;
                }
                if (spend(player, cost)) {
                    coreRegenLevel++;
                    feedback(player, "UPGRADED");
                } else {
                    feedback(player, "NOT ENOUGH GOLD");
                }
            }
            default -> { }
        }
    }

    private void extendPrepTime(Player player) {
        PrepConsole console = GameMap.PREP_CONSOLE;
        if (!canUseFacilities() || player.down
                || !unlockedAreas.contains(console.requiredArea())) return;
        if (!canInteract(player, console.x(), console.y(), 95)) {
            feedback(player, "MOVE TO TIME CONTROL");
            return;
        }
        if (!spend(player, console.cost())) {
            feedback(player, "NOT ENOUGH GOLD");
            return;
        }
        if (phase == GamePhase.PREPARING) {
            prepTime += console.seconds();
            feedback(player, "+1:00");
        } else {
            nextPrepBonusSeconds += console.seconds();
            feedback(player, "NEXT BREAK +1:00");
        }
    }

    private void startBlackout() {
        trippedBreakers.clear();
        List<BreakerTerminal> available = GameMap.BREAKER_TERMINALS.stream()
                .filter(breaker -> breaker.requiredArea() == null
                        || unlockedAreas.contains(breaker.requiredArea()))
                .toList();
        if (!available.isEmpty()) {
            trippedBreakers.add(available.get(random.nextInt(available.size())).id());
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
            feedback(player, "POWER ONLINE");
            return;
        }
        if (!canInteract(player, breaker.x(), breaker.y(), 95)) {
            feedback(player, "MOVE TO BREAKER");
            return;
        }
        if (!trippedBreakers.remove(breaker.id())) {
            feedback(player, "BREAKER ONLINE");
            return;
        }
        int remaining = trippedBreakers.size();
        if (remaining == 0) {
            blackoutActive = false;
            feedback(player, "POWER RESTORED");
            setNotice("電力復旧");
        }
    }

    private void unlockArea(Player player, String areaId) {
        if (!canUseFacilities() || player.down) return;
        UnlockArea area = GameMap.areaById(areaId);
        if (area == null || !terminalAccessible(area)) return;
        if (unlockedAreas.contains(areaId)) {
            feedback(player, "ALREADY OPEN");
            return;
        }
        if (!canInteract(player, area.terminalX(), area.terminalY(), 100)) {
            feedback(player, "MOVE TO TERMINAL");
            return;
        }
        int cost = 350 + unlockedAreas.size() * 100;
        if (spend(player, cost)) {
            unlockedAreas.add(areaId);
            // Opened areas only become spawn candidates when the next round starts.
            setNotice(area.name() + " OPEN");
        } else {
            feedback(player, "NOT ENOUGH GOLD");
        }
    }

    private boolean spend(Player player, int amount) {
        if (player.credits < amount) return false;
        player.credits -= amount;
        return true;
    }

    private void damagePlayer(Player player, double damage) {
        if (player.down) return;
        if (player.movingCore) damageCore(damage);
        player.hp = Math.max(0, player.hp - damage);
        if (player.hp <= 0) {
            player.down = true;
            cancelAction(player);
            player.moveX = 0;
            player.moveY = 0;
            player.dashHeld = false;
            player.dashing = false;
            player.firing = false;
            releaseCarriedCore(player);
            setNotice(player.name + " DOWN");
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
            player.weapon = "pistol";
            player.cooldown = 0;
            player.cooldownMax = 0;
            player.firing = false;
            player.aimX = player.x + 100;
            player.aimY = player.y;
            player.ownsShotgun = false;
            player.ownsSmg = false;
            player.ownsRifle = false;
            player.ownsSniper = false;
            player.shotgunAmmo = 0;
            player.smgAmmo = 0;
            player.rifleAmmo = 0;
            player.sniperAmmo = 0;
            player.wood = 0;
            player.ore = 0;
            player.gatherCooldown = 0;
            player.blockItems = 0;
            player.turretItems = 0;
            player.wireItems = 0;
            player.mineItems = 0;
            player.barricadeItems = 0;
            player.credits = 700;
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
        // A wall-mounted terminal occupies the final half tile; intervening walls/locked floors do not.
        double endAllowance = GameMap.canOccupy(x, y, 0, unlockedAreas) ? 0 : 21;
        for (double step = 0; step < separation - endAllowance; step += 4) {
            double factor = step / Math.max(1, separation);
            if (!GameMap.canOccupy(player.x + (x - player.x) * factor,
                    player.y + (y - player.y) * factor, 0, unlockedAreas)) return false;
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
