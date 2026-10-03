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
import static example.GameMap.WORKBENCH_X;
import static example.GameMap.WORKBENCH_Y;
import static example.GameMap.WORLD_H;
import static example.GameMap.WORLD_W;
import static example.GameSupport.clamp;
import static example.GameSupport.distance;
import static example.GameSupport.escapeJson;
import static example.GameSupport.roundOne;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Random;
import java.util.Set;

enum GamePhase { LOBBY, PREPARING, WAVE, WON, LOST }

interface GameEventSink {
    void broadcast(String message);
    void send(Player player, String message);
}

/** Authoritative state and rules for one four-player match. */
final class GameSession {
    final List<Player> players = new ArrayList<>();
    final List<Enemy> enemies = new ArrayList<>();
    final List<TrapSlot> trapSlots = GameMap.createTrapSlots();
    final List<ResourceNode> resourceNodes = GameMap.createResourceNodes();
    final Set<String> unlockedAreas = new HashSet<>();
    final List<String> activeSpawnIds = new ArrayList<>();

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

    private final GameEventSink events;
    private final List<String> activeLanes = new ArrayList<>();
    private final Random random = new Random();
    private double spawnTimer;
    private int nextEnemyId = 1;
    private int nextDefenseId = 1;
    private String previousSpawnSignature = "";

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
            assigned.reconnectGrace = 0;
            if (!rejoining) {
                assigned.sessionId = reconnectId;
                assigned.lastProcessedInput = 0;
                assigned.name = "Player " + assigned.slot;
            }
            setNotice(assigned.name + (rejoining ? " が再参加しました" : " が防衛チームに参加しました"));
        }
        return assigned;
    }

    void disconnectPlayer(Player player) {
        if (!player.human) return;
        String displayName = player.name;
        player.human = false;
        player.reconnectGrace = player.sessionId == null ? 0 : RECONNECT_GRACE_SECONDS;
        if (player.sessionId == null) player.name = "CPU " + player.slot;
        player.moveX = 0;
        player.moveY = 0;
        player.dashHeld = false;
        player.dashing = false;
        player.firing = false;
        player.queuedShots.clear();
        releaseCarriedCore(player);
        cancelAction(player);
        setNotice(displayName + " が切断され、CPUが一時交代しました");
    }

    void handleMessage(Player player, String message) {
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
                    startMatch();
                }
            }
            case "MOVE" -> handleMove(player, parts);
            case "DASH" -> handleDash(player, parts);
            case "ATTACK" -> { if (parts.length >= 2) attack(player, Integer.parseInt(parts[1])); }
            case "FIRE" -> handleFire(player, parts);
            case "INTERACT" -> { if (parts.length >= 2) interact(player, parts[1]); }
            case "WEAPON" -> { if (parts.length >= 2) switchWeapon(player, parts[1]); }
            case "BUY" -> { if (parts.length >= 2) buy(player, parts[1]); }
            case "BUILD" -> { if (parts.length >= 3) build(player, parts[1], parts[2]); }
            case "PLACE" -> { if (parts.length >= 4) placeDefense(player, parts); }
            case "REMOVE" -> { if (parts.length >= 2) removeDefense(player, parts[1]); }
            case "REPAIR" -> { if (parts.length >= 2) repair(player, parts[1]); }
            case "UPGRADE" -> { if (parts.length >= 2) upgradeCore(player, parts[1]); }
            case "UNLOCK" -> { if (parts.length >= 2) unlockArea(player, parts[1]); }
            case "GATHER" -> { if (parts.length >= 2) gather(player, parts[1]); }
            case "CRAFT" -> { if (parts.length >= 2) craft(player, parts[1]); }
            case "EQUIP_BUILD" -> { if (parts.length >= 2) equipBuild(player, parts[1]); }
            case "EQUIP_CORE" -> equipCore(player);
            case "PLACE_CORE" -> { if (parts.length >= 3) placeCore(player, parts); }
            case "READY" -> { if (phase == GamePhase.PREPARING) prepTime = 0; }
            default -> { }
        }
    }

    void update(double dt) {
        updateReconnectReservations(dt);
        for (Player player : players) {
            player.cooldown = Math.max(0, player.cooldown - dt);
            player.gatherCooldown = Math.max(0, player.gatherCooldown - dt);
            if ((player.firing || !player.queuedShots.isEmpty())
                    && player.cooldown <= 0 && canMove()) {
                MapPoint queuedAim = player.queuedShots.pollFirst();
                attackAt(player, queuedAim == null ? player.aimX : queuedAim.x(),
                        queuedAim == null ? player.aimY : queuedAim.y());
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
            setNotice("防衛チームが全滅しました");
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
        player.moveX = clamp(Double.parseDouble(parts[1]), -1, 1);
        player.moveY = clamp(Double.parseDouble(parts[2]), -1, 1);
        double length = Math.hypot(player.moveX, player.moveY);
        if (length > 1) {
            player.moveX /= length;
            player.moveY /= length;
        }
        if (length > 0.12) cancelAction(player);
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
        boolean beginsPress = active && !player.firing;
        player.aimX = x;
        player.aimY = y;
        player.firing = active;
        if (beginsPress && player.cooldown <= 0) {
            attackAt(player, x, y);
        } else if (beginsPress && player.queuedShots.size() < 8) {
            player.queuedShots.addLast(new MapPoint(x, y));
        }
    }

    private void startMatch() {
        resetWorld(true);
        phase = GamePhase.PREPARING;
        prepTime = 12;
        setNotice("CORE防衛準備：研究施設内の防衛線を整えてください");
    }

    private void beginRound() {
        round++;
        selectRoundSpawns(round);
        phase = GamePhase.WAVE;
        queuedEnemies = 8 + round * 4;
        queuedBosses = switch (round) {
            case 4 -> 1;
            case 8 -> 2;
            case 12 -> 3;
            default -> 0;
        };
        roundEvent = switch (round) {
            case 3, 7, 11 -> "blackout";
            case 5, 9 -> "door_failure";
            case 4, 8, 12 -> "boss_assault";
            default -> "none";
        };
        failedSpawnId = roundEvent.equals("door_failure")
                ? activeSpawnIds.get(random.nextInt(activeSpawnIds.size())) : null;
        spawnTimer = 0;
        coreShield = coreMaxShield;
        String eventText = switch (roundEvent) {
            case "blackout" -> " / 停電発生";
            case "door_failure" -> " / " + GameMap.spawnById(failedSpawnId).name() + " 扉故障";
            case "boss_assault" -> " / BOSS×" + queuedBosses;
            default -> "";
        };
        setNotice("ROUND " + round + "：施設内 " + activeSpawnIds.size() + " か所で侵入を検知 / "
                + queuedEnemies + (queuedBosses > 0 ? "+" + queuedBosses + " BOSS" : "")
                + " HOSTILES" + eventText);
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
        prepTime = PREP_SECONDS;
        activeLanes.clear();
        activeSpawnIds.clear();
        roundEvent = "none";
        failedSpawnId = null;
        setNotice("ROUND " + round + " CLEAR：全員 +" + reward + " CREDIT");
    }

    private void selectRoundSpawns(int currentRound) {
        int[] spawnCounts = {1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7};
        int availableCount = Math.min(GameMap.SPAWN_POINTS.size(), 2 + (currentRound - 1) / 2);
        int count = Math.min(availableCount,
                spawnCounts[Math.max(0, Math.min(spawnCounts.length - 1, currentRound - 1))]);
        List<SpawnPoint> candidates = new ArrayList<>(GameMap.SPAWN_POINTS.subList(0, availableCount));
        Collections.shuffle(candidates, random);
        String signature = candidates.subList(0, count).stream().map(SpawnPoint::id).sorted()
                .reduce((a, b) -> a + "," + b).orElse("");
        if (signature.equals(previousSpawnSignature)) {
            Collections.rotate(candidates, 1);
            signature = candidates.subList(0, count).stream().map(SpawnPoint::id).sorted()
                    .reduce((a, b) -> a + "," + b).orElse("");
        }
        previousSpawnSignature = signature;
        activeSpawnIds.clear();
        activeLanes.clear();
        for (SpawnPoint spawn : candidates.subList(0, count)) {
            activeSpawnIds.add(spawn.id());
            if (!activeLanes.contains(spawn.lane())) activeLanes.add(spawn.lane());
        }
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
            if (player.down || player.actionTarget == null || !player.actionTarget.startsWith("player-")) continue;
            Player target = playerById(player.actionTarget);
            boolean valid = target != null && target.down
                    && distance(player.x, player.y, target.x, target.y) <= 78;
            if (!valid) {
                cancelAction(player);
                continue;
            }
            player.actionProgress += dt;
            if (player.actionProgress >= 4) {
                target.down = false;
                target.hp = 45;
                target.moveX = 0;
                target.moveY = 0;
                cancelAction(player);
                setNotice(player.name + " が " + target.name + " を蘇生しました");
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
    }

    private void updateSpawning(double dt) {
        if (queuedEnemies <= 0 && queuedBosses <= 0) return;
        spawnTimer -= dt;
        if (spawnTimer > 0) return;
        SpawnPoint spawn = randomSpawn();
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

    private SpawnPoint randomSpawn() {
        if (activeSpawnIds.isEmpty()) return GameMap.SPAWN_POINTS.get(0);
        if (failedSpawnId != null && random.nextDouble() < 0.58) {
            return GameMap.spawnById(failedSpawnId);
        }
        String id = activeSpawnIds.get(random.nextInt(activeSpawnIds.size()));
        return GameMap.spawnById(id);
    }

    private void spawnEnemy(String type, SpawnPoint spawn) {
        double hp;
        double speed;
        double damage;
        int reward;
        switch (type) {
            case "runner" -> {
                hp = 28 + round * 3;
                speed = 96 + round * 1.6;
                damage = 8 + round;
                reward = 20;
            }
            case "brute" -> {
                hp = 120 + round * 10;
                speed = 38 + round;
                damage = 20 + round * 1.5;
                reward = 42;
            }
            case "boss" -> {
                hp = 1100 + round * 35;
                speed = 32;
                damage = 48;
                reward = 500;
            }
            default -> {
                hp = 45 + round * 5;
                speed = 58 + round * 1.5;
                damage = 10 + round;
                reward = 15;
            }
        }
        enemies.add(new Enemy(nextEnemyId++, type, spawn, hp, speed, damage, reward));
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
                        .min(Comparator.comparingDouble(enemy -> distance(enemy.x, enemy.y, coreX, coreY)))
                        .orElse(null);
                if (target != null) {
                    damageEnemy(target, 17 + round * 0.5, null);
                    sendHitEffect("trap", "turret", slot.x, slot.y, target.x, target.y,
                            17 + round * 0.5, target.hp <= 0, 0);
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
                                    90, enemy.hp <= 0, 0);
                        }
                    }
                    slot.defense = null;
                }
            }
        }
        for (TrapSlot slot : trapSlots) {
            if (slot.defense != null && slot.defense.hp <= 0) {
                setNotice(slot.id.toUpperCase(Locale.ROOT) + " の防衛設備が破壊されました");
                slot.defense = null;
            }
        }
    }

    private void updateEnemies(double dt) {
        for (Enemy enemy : enemies) {
            if (enemy.hp <= 0) continue;
            enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
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
        setNotice("BOSSのCOREパルス攻撃を検知しました");
    }

    private void moveEnemyToward(Enemy enemy, double targetX, double targetY, double amount) {
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
            if (bot.down) {
                bot.moveX = 0;
                bot.moveY = 0;
                continue;
            }

            Player downed = players.stream().filter(player -> player.down && player != bot)
                    .min(Comparator.comparingDouble(player -> distance(bot.x, bot.y, player.x, player.y)))
                    .orElse(null);
            if (downed != null) {
                if (distance(bot.x, bot.y, downed.x, downed.y) < 70) interact(bot, downed.id);
                else moveBotToward(bot, downed.x, downed.y);
                continue;
            }
            if (bot.actionTarget != null) {
                bot.moveX = 0;
                bot.moveY = 0;
                continue;
            }

            if (phase == GamePhase.WAVE) {
                String lane = assignedLane(bot.slot, activeLanes);
                Enemy target = enemies.stream()
                        .filter(enemy -> enemy.id == bot.botTargetEnemyId && enemy.hp > 0
                                && distance(bot.x, bot.y, enemy.x, enemy.y) <= 620)
                        .findFirst().orElse(null);
                if (target == null) {
                    bot.botTargetEnemyId = -1;
                    Enemy candidate = enemies.stream()
                            .filter(enemy -> enemy.hp > 0 && enemy.lane.equals(lane)
                                    && distance(bot.x, bot.y, enemy.x, enemy.y) <= 360)
                            .min(Comparator.comparingDouble(enemy -> distance(bot.x, bot.y, enemy.x, enemy.y)))
                            .orElseGet(() -> enemies.stream()
                                    .filter(enemy -> enemy.hp > 0
                                            && distance(bot.x, bot.y, enemy.x, enemy.y) <= 300)
                                    .min(Comparator.comparingDouble(enemy ->
                                            distance(bot.x, bot.y, enemy.x, enemy.y)))
                                    .orElse(null));
                    if (candidate != null) {
                        if (bot.botObservedEnemyId != candidate.id) {
                            bot.botObservedEnemyId = candidate.id;
                            bot.botRecognitionTimer = 0.9 + bot.slot * 0.15;
                        }
                        bot.botRecognitionTimer = Math.max(0, bot.botRecognitionTimer - dt);
                        if (bot.botRecognitionTimer <= 0) {
                            bot.botTargetEnemyId = candidate.id;
                            target = candidate;
                        }
                    } else {
                        bot.botObservedEnemyId = -1;
                        bot.botRecognitionTimer = 0;
                    }
                }
                if (target != null) {
                    double targetDistance = distance(bot.x, bot.y, target.x, target.y);
                    if (targetDistance <= 260 && bot.cooldown <= 0) attack(bot, target.id);
                    if (targetDistance > 205) moveBotToward(bot, target.x, target.y);
                    else if (targetDistance < 72) moveBotAway(bot, target.x, target.y);
                    else {
                        bot.moveX = 0;
                        bot.moveY = 0;
                    }
                } else {
                    double[] guard = guardPoint(laneForSlot(bot.slot));
                    if (distance(bot.x, bot.y, guard[0], guard[1]) > 35) {
                        moveBotToward(bot, guard[0], guard[1]);
                    } else {
                        bot.moveX = 0;
                        bot.moveY = 0;
                    }
                }
            } else {
                bot.botTargetEnemyId = -1;
                bot.botObservedEnemyId = -1;
                bot.botRecognitionTimer = 0;
                double[] guard = guardPoint(laneForSlot(bot.slot));
                if (distance(bot.x, bot.y, guard[0], guard[1]) > 35) {
                    moveBotToward(bot, guard[0], guard[1]);
                } else {
                    bot.moveX = 0;
                    bot.moveY = 0;
                }
            }
        }
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

    private double[] guardPoint(String lane) {
        return switch (lane) {
            case "north" -> new double[] {coreX, coreY - 100};
            case "east" -> new double[] {coreX + 100, coreY};
            case "south" -> new double[] {coreX, coreY + 100};
            default -> new double[] {coreX - 100, coreY};
        };
    }

    private void moveBotToward(Player bot, double x, double y) {
        double dx = x - bot.x;
        double dy = y - bot.y;
        double length = Math.max(1, Math.hypot(dx, dy));
        bot.moveX = dx / length;
        bot.moveY = dy / length;
    }

    private void moveBotAway(Player bot, double x, double y) {
        double dx = bot.x - x;
        double dy = bot.y - y;
        double length = Math.max(1, Math.hypot(dx, dy));
        bot.moveX = dx / length;
        bot.moveY = dy / length;
    }

    private void attack(Player player, int enemyId) {
        Enemy target = enemies.stream().filter(enemy -> enemy.id == enemyId && enemy.hp > 0)
                .findFirst().orElse(null);
        if (target == null) return;
        attackAt(player, target.x, target.y);
    }

    private void attackAt(Player player, double aimX, double aimY) {
        if (!canMove() || player.down || player.cooldown > 0) return;

        WeaponStats weapon = weaponStats(player.weapon);
        boolean empty = player.weapon.equals("shotgun") && player.shotgunAmmo <= 0
                || player.weapon.equals("smg") && player.smgAmmo <= 0
                || player.weapon.equals("rifle") && player.rifleAmmo <= 0
                || player.weapon.equals("sniper") && player.sniperAmmo <= 0;
        if (empty) {
            feedback(player, "NO AMMO");
            player.firing = false;
            player.queuedShots.clear();
            return;
        }
        if (player.weapon.equals("shotgun")) player.shotgunAmmo--;
        if (player.weapon.equals("smg")) player.smgAmmo--;
        if (player.weapon.equals("rifle")) player.rifleAmmo--;
        if (player.weapon.equals("sniper")) player.sniperAmmo--;

        cancelAction(player);
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
                    0, false, 0);
            return;
        }
        for (Enemy hit : targets) {
            int creditsBeforeHit = player.credits;
            damageEnemy(hit, weapon.damage(), player);
            knockbackEnemy(player.x, player.y, hit, weapon.knockback());
            sendHitEffect(player.id, player.weapon, player.x, player.y, hit.x, hit.y,
                    weapon.damage(), hit.hp <= 0, player.credits - creditsBeforeHit);
        }
    }

    private boolean isInsideAttack(Enemy enemy, Player player, double directionX,
            double directionY, WeaponStats weapon, double shotDistance) {
        double toEnemyX = enemy.x - player.x;
        double toEnemyY = enemy.y - player.y;
        double projection = toEnemyX * directionX + toEnemyY * directionY;
        if (projection < 0 || projection > shotDistance) return false;
        double perpendicular = Math.abs(toEnemyX * directionY - toEnemyY * directionX);
        double enemyRadius = switch (enemy.type) {
            case "boss" -> 42;
            case "brute" -> 28;
            case "runner" -> 16;
            default -> 21;
        };
        double spread = player.weapon.equals("shotgun") ? 16 + projection * 0.28 : weapon.width();
        return perpendicular <= spread + enemyRadius;
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
            double x, double y, double damage, boolean defeated, int credits) {
        events.broadcast("{\"type\":\"effect\",\"effect\":\"hit\",\"playerId\":\"" + playerId
                + "\",\"weapon\":\"" + weapon + "\",\"fromX\":" + roundOne(fromX)
                + ",\"fromY\":" + roundOne(fromY) + ",\"x\":" + roundOne(x)
                + ",\"y\":" + roundOne(y) + ",\"damage\":" + roundOne(damage)
                + ",\"defeated\":" + defeated + ",\"credits\":" + credits + "}");
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
            player.queuedShots.clear();
            cancelAction(player);
        }
    }

    private void buy(Player player, String item) {
        if (!canUseFacilities() || player.down) return;
        if (item.equals("heal")) {
            if (distance(player.x, player.y, MED_X, MED_Y) > 95) {
                feedback(player, "MOVE TO MED BAY");
                return;
            }
            if (player.hp >= 100) {
                feedback(player, "HP FULL");
                return;
            }
            if (spend(player, 80)) {
                player.hp = 100;
                setNotice(player.name + " が回復しました");
            } else {
                feedback(player, "NOT ENOUGH CREDIT");
            }
            return;
        }
        ShopUnit shop = GameMap.shopByItem(item);
        if (shop == null || distance(player.x, player.y, shop.x(), shop.y()) > 70) {
            feedback(player, "MOVE TO SHOP UNIT");
            return;
        }
        switch (item) {
            case "shotgun" -> {
                if (player.ownsShotgun) {
                    feedback(player, "ALREADY OWNED");
                    return;
                }
                if (spend(player, shop.cost())) {
                    player.ownsShotgun = true;
                    player.shotgunAmmo = 30;
                    releaseCarriedCore(player);
                    player.weapon = "shotgun";
                    setNotice(player.name + " がSHOTGUNを購入しました");
                } else {
                    feedback(player, "NOT ENOUGH CREDIT");
                }
            }
            case "smg" -> {
                if (player.ownsSmg) {
                    feedback(player, "ALREADY OWNED");
                    return;
                }
                if (spend(player, shop.cost())) {
                    player.ownsSmg = true;
                    player.smgAmmo = 90;
                    releaseCarriedCore(player);
                    player.weapon = "smg";
                    setNotice(player.name + " がSMGを購入しました");
                } else {
                    feedback(player, "NOT ENOUGH CREDIT");
                }
            }
            case "rifle" -> {
                if (player.ownsRifle) {
                    feedback(player, "ALREADY OWNED");
                    return;
                }
                if (spend(player, shop.cost())) {
                    player.ownsRifle = true;
                    player.rifleAmmo = 24;
                    releaseCarriedCore(player);
                    player.weapon = "rifle";
                    setNotice(player.name + " がRIFLEを購入しました");
                } else {
                    feedback(player, "NOT ENOUGH CREDIT");
                }
            }
            case "sniper" -> {
                if (player.ownsSniper) {
                    feedback(player, "ALREADY OWNED");
                    return;
                }
                if (spend(player, shop.cost())) {
                    player.ownsSniper = true;
                    player.sniperAmmo = 16;
                    releaseCarriedCore(player);
                    player.weapon = "sniper";
                    setNotice(player.name + " がSNIPERを購入しました");
                } else {
                    feedback(player, "NOT ENOUGH CREDIT");
                }
            }
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
                    setNotice(player.name + " が弾薬を補充しました");
                } else {
                    feedback(player, "NOT ENOUGH CREDIT");
                }
            }
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
            if (distance(player.x, player.y, WOODCUTTER_X, WOODCUTTER_Y) > 110) {
                feedback(player, "MOVE TO WOODCUTTER");
                return;
            }
            player.wood += 4;
            setNotice(player.name + " が木材を4個回収しました");
        } else if (resource.equals("ore")) {
            if (distance(player.x, player.y, QUARRY_X, QUARRY_Y) > 110) {
                feedback(player, "MOVE TO QUARRY");
                return;
            }
            player.ore += 3;
            setNotice(player.name + " が鉱石を3個回収しました");
        } else {
            return;
        }
        player.gatherCooldown = GATHER_COOLDOWN_SECONDS;
    }

    private void craft(Player player, String type) {
        if (!canUseFacilities() || player.down || !BUILD_RECIPES.containsKey(type)) return;
        if (distance(player.x, player.y, WORKBENCH_X, WORKBENCH_Y) > 110) {
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
        setNotice(player.name + " が " + type.toUpperCase(Locale.ROOT) + " をクラフトしました");
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
                || distance(player.x, player.y, coreX, coreY) > 130) {
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
        player.queuedShots.clear();
        coreX = player.x;
        coreY = player.y;
        setNotice(player.name + " がCOREを運搬しています");
    }

    private void placeCore(Player player, String[] parts) {
        if (!canUseFacilities() || player.down || !player.movingCore) return;
        double requestedX = Double.parseDouble(parts[1]);
        double requestedY = Double.parseDouble(parts[2]);
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
        setNotice(player.name + " がCOREを新しい防衛地点へ移設しました");
    }

    private void build(Player player, String slotId, String type) {
        if (!canUseFacilities() || player.down || !BUILD_RECIPES.containsKey(type)) return;
        TrapSlot slot = slotById(slotId);
        if (slot == null || distance(player.x, player.y, slot.x, slot.y) > 100) {
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
        player.addBuildItem(type, -1);
        slot.defense = new Defense(type);
        setNotice(player.name + " が " + type.toUpperCase(Locale.ROOT) + " を設置しました");
    }

    private void placeDefense(Player player, String[] parts) {
        if (!canUseFacilities() || player.down || !BUILD_RECIPES.containsKey(parts[3])) return;
        double requestedX = Double.parseDouble(parts[1]);
        double requestedY = Double.parseDouble(parts[2]);
        MapPoint point = GameMap.snapToTile(requestedX, requestedY);
        if (distance(player.x, player.y, point.x(), point.y()) > 180) {
            feedback(player, "MOVE CLOSER");
            return;
        }
        if (!GameMap.canPlaceDefense(point.x(), point.y(), unlockedAreas)
                || distance(point.x(), point.y(), coreX, coreY) < 90
                || trapSlots.stream().anyMatch(slot -> distance(point.x(), point.y(), slot.x, slot.y) < 36)
                || players.stream().anyMatch(other -> distance(point.x(), point.y(), other.x, other.y)
                        < (other == player ? 30 : 48))
                || enemies.stream().anyMatch(enemy -> enemy.hp > 0
                        && distance(point.x(), point.y(), enemy.x, enemy.y) < 48)) {
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
        placed.defense = new Defense(type);
        trapSlots.add(placed);
        setNotice(player.name + " が " + type.toUpperCase(Locale.ROOT) + " を配置しました");
    }

    private void removeDefense(Player player, String slotId) {
        if (!canUseFacilities() || player.down) return;
        TrapSlot slot = slotById(slotId);
        if (slot == null || slot.defense == null
                || distance(player.x, player.y, slot.x, slot.y) > 100) return;
        String type = slot.defense.type;
        trapSlots.remove(slot);
        player.addBuildItem(type, 1);
        player.selectedBuild = type;
        releaseCarriedCore(player);
        setNotice(player.name + " が " + type.toUpperCase(Locale.ROOT)
                + " を回収しました");
    }

    private void repair(Player player, String slotId) {
        if (!canUseFacilities() || player.down) return;
        TrapSlot slot = slotById(slotId);
        if (slot == null || slot.defense == null
                || distance(player.x, player.y, slot.x, slot.y) > 100) return;
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
        setNotice(slot.id.toUpperCase(Locale.ROOT) + " を修理しました");
    }

    private void upgradeCore(Player player, String type) {
        if (!canUseFacilities() || player.down
                || distance(player.x, player.y, coreX, coreY) > 130) return;
        switch (type) {
            case "hp" -> {
                int cost = 300 + (int) ((coreMaxHp - 1000) * 0.6);
                if (spend(player, cost)) {
                    coreMaxHp += 250;
                    coreHp += 250;
                    setNotice("CORE最大HPを強化しました");
                } else {
                    feedback(player, "NOT ENOUGH CREDIT");
                }
            }
            case "shield" -> {
                int cost = 350 + (int) (coreMaxShield * 0.8);
                if (spend(player, cost)) {
                    coreMaxShield += 180;
                    coreShield = coreMaxShield;
                    setNotice("COREシールドを強化しました");
                } else {
                    feedback(player, "NOT ENOUGH CREDIT");
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
                    setNotice("CORE防御を強化しました");
                } else {
                    feedback(player, "NOT ENOUGH CREDIT");
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
                    setNotice("CORE自動修復を強化しました");
                } else {
                    feedback(player, "NOT ENOUGH CREDIT");
                }
            }
            default -> { }
        }
    }

    private void unlockArea(Player player, String areaId) {
        if (!canUseFacilities() || player.down) return;
        UnlockArea area = GameMap.areaById(areaId);
        if (area == null) return;
        if (unlockedAreas.contains(areaId)) {
            feedback(player, "ALREADY OPEN");
            return;
        }
        if (distance(player.x, player.y, area.terminalX(), area.terminalY()) > 100) {
            feedback(player, "MOVE TO TERMINAL");
            return;
        }
        int cost = 350 + unlockedAreas.size() * 100;
        if (spend(player, cost)) {
            unlockedAreas.add(areaId);
            setNotice(area.name() + " OPEN：防衛スロットを解放しました");
        } else {
            feedback(player, "NOT ENOUGH CREDIT");
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
        cancelAction(player);
        if (player.hp <= 0) {
            player.down = true;
            player.moveX = 0;
            player.moveY = 0;
            player.dashHeld = false;
            player.dashing = false;
            player.firing = false;
            player.queuedShots.clear();
            releaseCarriedCore(player);
            setNotice(player.name + " がダウンしました");
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
        activeLanes.clear();
        activeSpawnIds.clear();
        previousSpawnSignature = "";
        unlockedAreas.clear();
        nextEnemyId = 1;
        nextDefenseId = 1;
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
            player.hp = 100;
            player.down = false;
            player.dashHeld = false;
            player.dashing = false;
            player.dashExhausted = false;
            player.stamina = 100;
            player.weapon = "pistol";
            player.cooldown = 0;
            player.cooldownMax = 0;
            player.firing = false;
            player.queuedShots.clear();
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
