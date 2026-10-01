package example;

import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

/** Authoritative single-room server for the cooperative CORE defense game. */
public final class WasdServer extends WebSocketServer {
    private static final int WORLD_W = 1800;
    private static final int WORLD_H = 1200;
    private static final int PLAYER_COUNT = 4;
    private static final int MAX_ROUNDS = 12;
    private static final double TICK_SECONDS = 0.05;
    private static final double SNAPSHOT_INTERVAL = 0.1;
    private static final double PREP_SECONDS = 20;
    private static final double CORE_X = 900;
    private static final double CORE_Y = 600;
    private static final double ARMORY_X = 790;
    private static final double ARMORY_Y = 660;
    private static final double MED_X = 1010;
    private static final double MED_Y = 660;

    private static final Map<String, Integer> BUILD_COSTS = Map.of(
            "turret", 250, "wire", 120, "mine", 100, "barricade", 160);

    private enum Phase { LOBBY, PREPARING, WAVE, WON, LOST }

    private record Wall(double x, double y, double width, double height) { }

    private record UnlockArea(String id, String name, double x, double y, double width, double height,
            double terminalX, double terminalY) { }

    private record SpawnPoint(String id, String name, double x, double y, String lane,
            double routeX, double routeY) { }

    private static final List<Wall> WALLS = List.of(
            new Wall(60, 80, 180, 420),
            new Wall(360, 80, 420, 420),
            new Wall(1020, 80, 420, 420),
            new Wall(1560, 80, 180, 420),
            new Wall(60, 700, 180, 420),
            new Wall(360, 700, 420, 420),
            new Wall(1020, 700, 420, 420),
            new Wall(1560, 700, 180, 420));

    private static final List<UnlockArea> AREAS = List.of(
            new UnlockArea("depot", "BIO LAB", 380, 320, 400, 180, 740, 535),
            new UnlockArea("relay", "SECURITY LAB", 1020, 320, 400, 180, 1060, 535),
            new UnlockArea("workshop", "FABRICATION LAB", 1020, 700, 400, 180, 1060, 665));

    private static final List<SpawnPoint> SPAWN_POINTS = List.of(
            new SpawnPoint("north-airlock", "NORTH AIRLOCK", 900, 28, "north", -1, -1),
            new SpawnPoint("reactor-duct", "REACTOR DUCT", 1500, 28, "east", 1500, 600),
            new SpawnPoint("east-loading", "LOADING BAY", 1772, 600, "east", -1, -1),
            new SpawnPoint("service-vent", "SERVICE VENT", 1500, 1172, "east", 1500, 600),
            new SpawnPoint("south-lock", "QUARANTINE", 900, 1172, "south", -1, -1),
            new SpawnPoint("waste-tunnel", "WASTE TUNNEL", 300, 1172, "west", 300, 600),
            new SpawnPoint("west-access", "WEST ACCESS", 28, 600, "west", -1, -1),
            new SpawnPoint("specimen-vent", "SPECIMEN VENT", 300, 28, "west", 300, 600));

    private static final class Player {
        final String id;
        final int slot;
        String name;
        WebSocket connection;
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

    private static final class Enemy {
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

    private static final class Defense {
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

    private static final class TrapSlot {
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

    private final Object gameLock = new Object();
    private final Map<WebSocket, Player> connectionPlayers = new ConcurrentHashMap<>();
    private final List<Player> players = new ArrayList<>();
    private final List<Enemy> enemies = new ArrayList<>();
    private final List<TrapSlot> trapSlots = new ArrayList<>();
    private final Set<String> unlockedAreas = new HashSet<>();
    private final List<String> activeLanes = new ArrayList<>();
    private final List<String> activeSpawnIds = new ArrayList<>();
    private final ScheduledExecutorService ticker = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread thread = new Thread(r, "core-defense-loop");
        thread.setDaemon(true);
        return thread;
    });
    private final Random random = new Random();

    private Phase phase = Phase.LOBBY;
    private int round;
    private double prepTime;
    private int queuedEnemies;
    private boolean bossPending;
    private double spawnTimer;
    private double snapshotTimer;
    private int nextEnemyId = 1;
    private int credits;
    private double coreHp;
    private double coreMaxHp;
    private double coreShield;
    private double coreMaxShield;
    private int coreDefenseLevel;
    private int coreRegenLevel;
    private String previousSpawnSignature = "";
    private int noticeVersion;
    private String notice = "プレイヤーを待っています";

    public WasdServer(int port) {
        super(new InetSocketAddress(port));
        for (int slot = 1; slot <= PLAYER_COUNT; slot++) players.add(new Player(slot));
        createTrapSlots();
        resetWorld(false);
    }

    private void createTrapSlots() {
        trapSlots.add(new TrapSlot("north-1", "north", 850, 420, null));
        trapSlots.add(new TrapSlot("north-2", "north", 950, 420, null));
        trapSlots.add(new TrapSlot("east-1", "east", 1080, 550, null));
        trapSlots.add(new TrapSlot("east-2", "east", 1080, 650, null));
        trapSlots.add(new TrapSlot("south-1", "south", 850, 780, null));
        trapSlots.add(new TrapSlot("south-2", "south", 950, 780, null));
        trapSlots.add(new TrapSlot("west-1", "west", 720, 550, null));
        trapSlots.add(new TrapSlot("west-2", "west", 720, 650, null));
        trapSlots.add(new TrapSlot("depot-1", "west", 560, 430, "depot"));
        trapSlots.add(new TrapSlot("depot-2", "west", 690, 430, "depot"));
        trapSlots.add(new TrapSlot("relay-1", "north", 1080, 430, "relay"));
        trapSlots.add(new TrapSlot("relay-2", "north", 1210, 430, "relay"));
        trapSlots.add(new TrapSlot("workshop-1", "south", 1080, 770, "workshop"));
        trapSlots.add(new TrapSlot("workshop-2", "south", 1210, 770, "workshop"));
    }

    @Override
    public void onOpen(WebSocket connection, ClientHandshake handshake) {
        Player assigned;
        synchronized (gameLock) {
            if (phase == Phase.WON || phase == Phase.LOST) resetWorld(true);
            assigned = players.stream().filter(p -> !p.human).findFirst().orElse(null);
            if (assigned != null) {
                assigned.human = true;
                assigned.connection = connection;
                assigned.name = "Player " + assigned.slot;
                connectionPlayers.put(connection, assigned);
                setNotice(assigned.name + " が防衛チームに参加しました");
            }
        }
        if (assigned == null) {
            connection.send("{\"type\":\"error\",\"message\":\"この試合は満員です\"}");
            connection.close(1000, "room full");
            return;
        }
        connection.send("{\"type\":\"welcome\",\"playerId\":\"" + assigned.id + "\"}");
        sendSnapshot();
        System.out.println(assigned.id + " connected from " + connection.getRemoteSocketAddress());
    }

    @Override
    public void onMessage(WebSocket connection, String message) {
        Player player = connectionPlayers.get(connection);
        if (player == null || message == null || message.length() > 160) return;
        synchronized (gameLock) {
            try {
                handleMessage(player, message.trim());
            } catch (RuntimeException ignored) {
                connection.send("{\"type\":\"error\",\"message\":\"入力を処理できません\"}");
            }
        }
    }

    private void handleMessage(Player player, String message) {
        String[] parts = message.split(":", 4);
        switch (parts[0]) {
            case "HELLO" -> updateName(player, parts);
            case "START" -> {
                if (phase == Phase.LOBBY || phase == Phase.WON || phase == Phase.LOST) startMatch();
            }
            case "MOVE" -> handleMove(player, parts);
            case "DASH" -> handleDash(player, parts);
            case "ATTACK" -> { if (parts.length >= 2) attack(player, Integer.parseInt(parts[1])); }
            case "INTERACT" -> { if (parts.length >= 2) interact(player, parts[1]); }
            case "WEAPON" -> { if (parts.length >= 2) switchWeapon(player, parts[1]); }
            case "BUY" -> { if (parts.length >= 2) buy(player, parts[1]); }
            case "BUILD" -> { if (parts.length >= 3) build(player, parts[1], parts[2]); }
            case "REPAIR" -> { if (parts.length >= 2) repair(player, parts[1]); }
            case "UPGRADE" -> { if (parts.length >= 2) upgradeCore(player, parts[1]); }
            case "UNLOCK" -> { if (parts.length >= 2) unlockArea(player, parts[1]); }
            case "READY" -> { if (phase == Phase.PREPARING) prepTime = 0; }
            default -> { }
        }
    }

    private void updateName(Player player, String[] parts) {
        if (parts.length < 2) return;
        String cleaned = parts[1].replaceAll("[^\\p{L}\\p{N} _-]", "").trim();
        if (!cleaned.isEmpty()) player.name = cleaned.substring(0, Math.min(16, cleaned.length()));
    }

    private void handleMove(Player player, String[] parts) {
        if (parts.length < 3 || !canMove(player)) return;
        player.moveX = clamp(Double.parseDouble(parts[1]), -1, 1);
        player.moveY = clamp(Double.parseDouble(parts[2]), -1, 1);
        double length = Math.hypot(player.moveX, player.moveY);
        if (length > 1) { player.moveX /= length; player.moveY /= length; }
        if (length > 0.12) cancelAction(player);
    }

    private void handleDash(Player player, String[] parts) {
        if (parts.length < 2 || !canMove(player) || player.down) return;
        player.dashHeld = parts[1].equals("1") || parts[1].equalsIgnoreCase("true");
        if (!player.dashHeld) player.dashing = false;
    }

    @Override
    public void onClose(WebSocket connection, int code, String reason, boolean remote) {
        synchronized (gameLock) {
            Player player = connectionPlayers.remove(connection);
            if (player != null) {
                player.human = false;
                player.connection = null;
                player.name = "CPU " + player.slot;
                player.moveX = 0;
                player.moveY = 0;
                player.dashHeld = false;
                player.dashing = false;
                cancelAction(player);
                setNotice("Player " + player.slot + " はCPUに交代しました");
            }
        }
    }

    @Override
    public void onError(WebSocket connection, Exception error) {
        System.err.println("WebSocket error: " + error.getMessage());
    }

    @Override
    public void onStart() {
        setConnectionLostTimeout(30);
        ticker.scheduleAtFixedRate(this::tickSafely, 0, 50, TimeUnit.MILLISECONDS);
        System.out.println("CORE Defense server: ws://localhost:" + getPort());
    }

    private void tickSafely() {
        try {
            synchronized (gameLock) {
                update(TICK_SECONDS);
                snapshotTimer -= TICK_SECONDS;
                if (snapshotTimer <= 0) {
                    snapshotTimer = SNAPSHOT_INTERVAL;
                    sendSnapshot();
                }
            }
        } catch (RuntimeException error) {
            error.printStackTrace();
        }
    }

    private void update(double dt) {
        for (Player player : players) player.cooldown = Math.max(0, player.cooldown - dt);
        if (phase == Phase.LOBBY || phase == Phase.WON || phase == Phase.LOST) return;

        updateBots();
        updatePlayers(dt);
        updateRevives(dt);

        if (phase == Phase.PREPARING) {
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
            phase = Phase.LOST;
            setNotice("CORE DESTROYED");
            return;
        }
        if (players.stream().noneMatch(player -> !player.down)) {
            phase = Phase.LOST;
            setNotice("防衛チームが全滅しました");
            return;
        }
        if (queuedEnemies == 0 && enemies.isEmpty()) finishRound();
    }

    private void startMatch() {
        resetWorld(true);
        phase = Phase.PREPARING;
        prepTime = 12;
        setNotice("CORE防衛準備：研究施設内の防衛線を整えてください");
    }

    private void beginRound() {
        round++;
        selectRoundSpawns(round);
        phase = Phase.WAVE;
        queuedEnemies = 8 + round * 4;
        bossPending = round == MAX_ROUNDS;
        spawnTimer = 0;
        coreShield = coreMaxShield;
        setNotice("ROUND " + round + "：施設内 " + activeSpawnIds.size() + " か所で侵入を検知 / "
                + queuedEnemies + (bossPending ? "+BOSS" : "") + " HOSTILES");
    }

    private void finishRound() {
        if (round >= MAX_ROUNDS) {
            phase = Phase.WON;
            setNotice("ALL HOSTILES ELIMINATED — CORE SECURED");
            return;
        }
        int reward = 180 + round * 30;
        credits += reward;
        phase = Phase.PREPARING;
        prepTime = PREP_SECONDS;
        activeLanes.clear();
        activeSpawnIds.clear();
        setNotice("ROUND " + round + " CLEAR：+" + reward + " CREDIT");
    }

    private void selectRoundSpawns(int currentRound) {
        int[] spawnCounts = {1, 1, 2, 1, 2, 3, 2, 3, 4, 3, 4, 5};
        int count = spawnCounts[Math.max(0, Math.min(spawnCounts.length - 1, currentRound - 1))];
        List<SpawnPoint> candidates = new ArrayList<>(SPAWN_POINTS);
        Collections.shuffle(candidates, random);
        String signature = candidates.subList(0, count).stream().map(SpawnPoint::id).sorted().reduce((a, b) -> a + "," + b).orElse("");
        if (signature.equals(previousSpawnSignature)) {
            Collections.rotate(candidates, 1);
            signature = candidates.subList(0, count).stream().map(SpawnPoint::id).sorted().reduce((a, b) -> a + "," + b).orElse("");
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
            player.dashing = !player.down && player.dashHeld && !player.dashExhausted && input > 0.12 && player.stamina > 0;
            if (player.dashing) {
                player.stamina = Math.max(0, player.stamina - 38 * dt);
                if (player.stamina <= 0) {
                    player.dashExhausted = true;
                    player.dashing = false;
                }
            } else {
                player.stamina = Math.min(100, player.stamina + 24 * dt);
            }
            double speed = player.down ? 45 : player.dashing ? 265 : 155;
            double nextX = clamp(player.x + player.moveX * speed * dt, 25, WORLD_W - 25);
            double nextY = clamp(player.y + player.moveY * speed * dt, 25, WORLD_H - 25);
            if (canOccupy(nextX, player.y, 21)) player.x = nextX;
            if (canOccupy(player.x, nextY, 21)) player.y = nextY;
        }
    }

    private void updateRevives(double dt) {
        for (Player player : players) {
            if (player.down || player.actionTarget == null || !player.actionTarget.startsWith("player-")) continue;
            Player target = playerById(player.actionTarget);
            boolean valid = target != null && target.down && distance(player.x, player.y, target.x, target.y) <= 78;
            if (!valid) { cancelAction(player); continue; }
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

    private void updateSpawning(double dt) {
        if (queuedEnemies <= 0 && !bossPending) return;
        spawnTimer -= dt;
        if (spawnTimer > 0) return;
        if (bossPending && queuedEnemies <= 1) {
            spawnEnemy("boss", randomSpawn());
            bossPending = false;
        } else if (queuedEnemies > 0) {
            spawnEnemy(selectEnemyType(), randomSpawn());
            queuedEnemies--;
        }
        spawnTimer = Math.max(0.35, 1.15 - round * 0.045);
    }

    private String selectEnemyType() {
        double roll = random.nextDouble();
        if (round >= 5 && roll < 0.18) return "brute";
        if (round >= 3 && roll < 0.43) return "runner";
        return "grunt";
    }

    private SpawnPoint randomSpawn() {
        if (activeSpawnIds.isEmpty()) return SPAWN_POINTS.get(0);
        String id = activeSpawnIds.get(random.nextInt(activeSpawnIds.size()));
        return SPAWN_POINTS.stream().filter(spawn -> spawn.id().equals(id)).findFirst().orElse(SPAWN_POINTS.get(0));
    }

    private void spawnEnemy(String type, SpawnPoint spawn) {
        double hp;
        double speed;
        double damage;
        int reward;
        switch (type) {
            case "runner" -> { hp = 28 + round * 3; speed = 96 + round * 1.6; damage = 8 + round; reward = 20; }
            case "brute" -> { hp = 120 + round * 10; speed = 38 + round; damage = 20 + round * 1.5; reward = 42; }
            case "boss" -> { hp = 1100 + round * 35; speed = 32; damage = 48; reward = 500; }
            default -> { hp = 45 + round * 5; speed = 58 + round * 1.5; damage = 10 + round; reward = 15; }
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
                    if (enemy.hp > 0 && distance(slot.x, slot.y, enemy.x, enemy.y) < 62) enemy.slow = Math.min(enemy.slow, 0.48);
                }
            } else if (defense.type.equals("turret") && defense.cooldown <= 0) {
                Enemy target = enemies.stream().filter(e -> e.hp > 0 && distance(slot.x, slot.y, e.x, e.y) <= 270)
                        .min(Comparator.comparingDouble(e -> distance(e.x, e.y, CORE_X, CORE_Y))).orElse(null);
                if (target != null) {
                    damageEnemy(target, 17 + round * 0.5, null);
                    sendHitEffect("trap", "turret", slot.x, slot.y, target.x, target.y, 17 + round * 0.5, target.hp <= 0);
                    defense.cooldown = 0.7;
                }
            } else if (defense.type.equals("mine")) {
                Enemy trigger = enemies.stream().filter(e -> e.hp > 0 && distance(slot.x, slot.y, e.x, e.y) < 58).findFirst().orElse(null);
                if (trigger != null) {
                    for (Enemy enemy : enemies) {
                        if (enemy.hp > 0 && distance(slot.x, slot.y, enemy.x, enemy.y) < 120) {
                            damageEnemy(enemy, 90, null);
                            sendHitEffect("trap", "mine", slot.x, slot.y, enemy.x, enemy.y, 90, enemy.hp <= 0);
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

            TrapSlot barricade = trapSlots.stream()
                    .filter(slot -> slot.defense != null && slot.defense.type.equals("barricade")
                            && distance(enemy.x, enemy.y, slot.x, slot.y) < 52)
                    .findFirst().orElse(null);
            if (barricade != null) {
                if (enemy.attackCooldown <= 0) {
                    barricade.defense.hp -= enemy.damage;
                    enemy.attackCooldown = 0.9;
                }
                continue;
            }

            for (TrapSlot slot : trapSlots) {
                if (slot.defense != null && !slot.defense.type.equals("mine")
                        && distance(enemy.x, enemy.y, slot.x, slot.y) < 34) {
                    slot.defense.hp -= 2.2 * dt;
                }
            }

            Player nearby = players.stream().filter(p -> !p.down && distance(enemy.x, enemy.y, p.x, p.y) < 78)
                    .min(Comparator.comparingDouble(p -> distance(enemy.x, enemy.y, p.x, p.y))).orElse(null);
            if (nearby == null && enemy.routing && distance(enemy.x, enemy.y, enemy.routeX, enemy.routeY) < 30) {
                enemy.routing = false;
            }
            double targetX = nearby != null ? nearby.x : enemy.routing ? enemy.routeX : CORE_X;
            double targetY = nearby != null ? nearby.y : enemy.routing ? enemy.routeY : CORE_Y;
            double dist = distance(enemy.x, enemy.y, targetX, targetY);

            if (nearby == null && !enemy.routing && distance(enemy.x, enemy.y, CORE_X, CORE_Y) <= 72) {
                if (enemy.attackCooldown <= 0) {
                    damageCore(enemy.damage);
                    enemy.attackCooldown = 0.9;
                }
            } else if (nearby != null && dist <= 36) {
                if (enemy.attackCooldown <= 0) {
                    damagePlayer(nearby, enemy.damage);
                    enemy.attackCooldown = 0.9;
                }
            } else {
                moveEnemyToward(enemy, targetX, targetY, enemy.speed * enemy.slow * dt);
            }
        }
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

    private void updateBots() {
        for (Player bot : players) {
            if (bot.human) continue;
            if (bot.down) { bot.moveX = 0; bot.moveY = 0; continue; }

            Player downed = players.stream().filter(p -> p.down && p != bot)
                    .min(Comparator.comparingDouble(p -> distance(bot.x, bot.y, p.x, p.y))).orElse(null);
            if (downed != null) {
                if (distance(bot.x, bot.y, downed.x, downed.y) < 70) interact(bot, downed.id);
                else moveBotToward(bot, downed.x, downed.y);
                continue;
            }
            if (bot.actionTarget != null) { bot.moveX = 0; bot.moveY = 0; continue; }

            if (phase == Phase.WAVE) {
                String lane = assignedLane(bot.slot, activeLanes);
                Enemy target = enemies.stream().filter(e -> e.hp > 0 && e.lane.equals(lane))
                        .min(Comparator.comparingDouble(e -> distance(e.x, e.y, CORE_X, CORE_Y))).orElse(null);
                if (target == null) {
                    target = enemies.stream().filter(e -> e.hp > 0)
                            .min(Comparator.comparingDouble(e -> distance(e.x, e.y, CORE_X, CORE_Y))).orElse(null);
                }
                if (target != null) {
                    double dist = distance(bot.x, bot.y, target.x, target.y);
                    if (dist <= 260 && bot.cooldown <= 0) attack(bot, target.id);
                    if (dist > 205) moveBotToward(bot, target.x, target.y);
                    else if (dist < 72) moveBotAway(bot, target.x, target.y);
                    else { bot.moveX = 0; bot.moveY = 0; }
                }
            } else {
                double[] guard = guardPoint(laneForSlot(bot.slot));
                if (distance(bot.x, bot.y, guard[0], guard[1]) > 35) moveBotToward(bot, guard[0], guard[1]);
                else { bot.moveX = 0; bot.moveY = 0; }
            }
        }
    }

    private static String laneForSlot(int slot) {
        return switch (slot) { case 1 -> "north"; case 2 -> "east"; case 3 -> "south"; default -> "west"; };
    }

    private static String assignedLane(int slot, List<String> lanes) {
        if (lanes.isEmpty()) return laneForSlot(slot);
        return lanes.get((slot - 1) % lanes.size());
    }

    private static double[] guardPoint(String lane) {
        return switch (lane) {
            case "north" -> new double[] {900, 445};
            case "east" -> new double[] {1055, 600};
            case "south" -> new double[] {900, 755};
            default -> new double[] {745, 600};
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
        if (phase != Phase.WAVE || player.down || player.cooldown > 0) return;
        Enemy target = enemies.stream().filter(e -> e.id == enemyId && e.hp > 0).findFirst().orElse(null);
        if (target == null) return;

        double range;
        double damage;
        double cooldown;
        double knockback;
        switch (player.weapon) {
            case "bat" -> { range = 96; damage = 20; cooldown = 1.0; knockback = 115; }
            case "shotgun" -> { range = 220; damage = 46; cooldown = 1.45; knockback = 75; }
            case "rifle" -> { range = 430; damage = 58; cooldown = 1.15; knockback = 32; }
            default -> { range = 285; damage = 26; cooldown = 0.38; knockback = 35; }
        }
        if (distance(player.x, player.y, target.x, target.y) > range) {
            feedback(player, "TOO FAR");
            return;
        }
        if (player.weapon.equals("shotgun") && player.shotgunAmmo <= 0) { feedback(player, "NO AMMO"); return; }
        if (player.weapon.equals("rifle") && player.rifleAmmo <= 0) { feedback(player, "NO AMMO"); return; }
        if (player.weapon.equals("shotgun")) player.shotgunAmmo--;
        if (player.weapon.equals("rifle")) player.rifleAmmo--;

        cancelAction(player);
        player.cooldown = cooldown;
        List<Enemy> targets = player.weapon.equals("shotgun")
                ? enemies.stream().filter(e -> e.hp > 0 && distance(target.x, target.y, e.x, e.y) <= 85
                        && distance(player.x, player.y, e.x, e.y) <= range + 40).toList()
                : List.of(target);
        for (Enemy hit : targets) {
            double hitX = hit.x;
            double hitY = hit.y;
            damageEnemy(hit, damage, player);
            knockbackEnemy(player.x, player.y, hit, knockback);
            sendHitEffect(player.id, player.weapon, player.x, player.y, hitX, hitY, damage, hit.hp <= 0);
        }
    }

    private void damageEnemy(Enemy enemy, double damage, Player player) {
        if (enemy.hp <= 0) return;
        enemy.hp -= damage;
        if (enemy.hp <= 0 && !enemy.rewarded) {
            enemy.rewarded = true;
            credits += enemy.reward;
            if (player != null) player.kills++;
        }
    }

    private void knockbackEnemy(double fromX, double fromY, Enemy enemy, double amount) {
        double dx = enemy.x - fromX;
        double dy = enemy.y - fromY;
        double length = Math.max(1, Math.hypot(dx, dy));
        double nextX = clamp(enemy.x + dx / length * amount, 18, WORLD_W - 18);
        double nextY = clamp(enemy.y + dy / length * amount, 18, WORLD_H - 18);
        if (canOccupy(nextX, enemy.y, 17)) enemy.x = nextX;
        if (canOccupy(enemy.x, nextY, 17)) enemy.y = nextY;
    }

    private void sendHitEffect(String playerId, String weapon, double fromX, double fromY,
            double x, double y, double damage, boolean defeated) {
        broadcast("{\"type\":\"effect\",\"effect\":\"hit\",\"playerId\":\"" + playerId
                + "\",\"weapon\":\"" + weapon + "\",\"fromX\":" + roundOne(fromX)
                + ",\"fromY\":" + roundOne(fromY) + ",\"x\":" + roundOne(x) + ",\"y\":" + roundOne(y)
                + ",\"damage\":" + roundOne(damage) + ",\"defeated\":" + defeated + "}");
    }

    private void interact(Player player, String targetId) {
        if (player.down || (phase != Phase.WAVE && phase != Phase.PREPARING)) return;
        if (!targetId.startsWith("player-")) return;
        Player target = playerById(targetId);
        if (target != null && target != player && target.down && distance(player.x, player.y, target.x, target.y) <= 78) {
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
                || weapon.equals("rifle") && player.ownsRifle;
        if (owned) { player.weapon = weapon; cancelAction(player); }
    }

    private void buy(Player player, String item) {
        if (!canUseFacilities() || player.down) return;
        if (item.equals("heal")) {
            if (distance(player.x, player.y, MED_X, MED_Y) > 95) { feedback(player, "MOVE TO MED BAY"); return; }
            if (player.hp >= 100) { feedback(player, "HP FULL"); return; }
            if (spend(80)) { player.hp = 100; setNotice(player.name + " が回復しました"); }
            else feedback(player, "NOT ENOUGH CREDIT");
            return;
        }
        if (distance(player.x, player.y, ARMORY_X, ARMORY_Y) > 105) { feedback(player, "MOVE TO ARMORY"); return; }
        switch (item) {
            case "shotgun" -> {
                if (player.ownsShotgun) { feedback(player, "ALREADY OWNED"); return; }
                if (spend(450)) { player.ownsShotgun = true; player.shotgunAmmo = 30; player.weapon = "shotgun"; setNotice(player.name + " がSHOTGUNを購入しました"); }
                else feedback(player, "NOT ENOUGH CREDIT");
            }
            case "rifle" -> {
                if (player.ownsRifle) { feedback(player, "ALREADY OWNED"); return; }
                if (spend(650)) { player.ownsRifle = true; player.rifleAmmo = 24; player.weapon = "rifle"; setNotice(player.name + " がRIFLEを購入しました"); }
                else feedback(player, "NOT ENOUGH CREDIT");
            }
            case "ammo" -> {
                if (!player.ownsShotgun && !player.ownsRifle) { feedback(player, "NO AMMO WEAPON"); return; }
                if (spend(100)) { player.shotgunAmmo += player.ownsShotgun ? 16 : 0; player.rifleAmmo += player.ownsRifle ? 12 : 0; setNotice(player.name + " が弾薬を補充しました"); }
                else feedback(player, "NOT ENOUGH CREDIT");
            }
            default -> { }
        }
    }

    private void build(Player player, String slotId, String type) {
        if (!canUseFacilities() || player.down || !BUILD_COSTS.containsKey(type)) return;
        TrapSlot slot = slotById(slotId);
        if (slot == null || distance(player.x, player.y, slot.x, slot.y) > 100) { feedback(player, "MOVE CLOSER"); return; }
        if (slot.requiredArea != null && !unlockedAreas.contains(slot.requiredArea)) { feedback(player, "AREA LOCKED"); return; }
        if (slot.defense != null) { feedback(player, "SLOT OCCUPIED"); return; }
        if (!spend(BUILD_COSTS.get(type))) { feedback(player, "NOT ENOUGH CREDIT"); return; }
        slot.defense = new Defense(type);
        setNotice(player.name + " が " + type.toUpperCase(Locale.ROOT) + " を設置しました");
    }

    private void repair(Player player, String slotId) {
        if (!canUseFacilities() || player.down) return;
        TrapSlot slot = slotById(slotId);
        if (slot == null || slot.defense == null || distance(player.x, player.y, slot.x, slot.y) > 100) return;
        if (slot.defense.hp >= slot.defense.maxHp) { feedback(player, "DURABILITY FULL"); return; }
        int cost = Math.max(25, (int) Math.ceil((slot.defense.maxHp - slot.defense.hp) * 0.45));
        if (spend(cost)) { slot.defense.hp = slot.defense.maxHp; setNotice(slot.id.toUpperCase(Locale.ROOT) + " を修理しました"); }
        else feedback(player, "NOT ENOUGH CREDIT");
    }

    private void upgradeCore(Player player, String type) {
        if (!canUseFacilities() || player.down || distance(player.x, player.y, CORE_X, CORE_Y) > 130) return;
        switch (type) {
            case "hp" -> {
                int cost = 300 + (int) ((coreMaxHp - 1000) * 0.6);
                if (spend(cost)) { coreMaxHp += 250; coreHp += 250; setNotice("CORE最大HPを強化しました"); }
                else feedback(player, "NOT ENOUGH CREDIT");
            }
            case "shield" -> {
                int cost = 350 + (int) (coreMaxShield * 0.8);
                if (spend(cost)) { coreMaxShield += 180; coreShield = coreMaxShield; setNotice("COREシールドを強化しました"); }
                else feedback(player, "NOT ENOUGH CREDIT");
            }
            case "defense" -> {
                int cost = 450 + coreDefenseLevel * 250;
                if (coreDefenseLevel >= 4) { feedback(player, "MAX LEVEL"); return; }
                if (spend(cost)) { coreDefenseLevel++; setNotice("CORE防御を強化しました"); }
                else feedback(player, "NOT ENOUGH CREDIT");
            }
            case "regen" -> {
                int cost = 500 + coreRegenLevel * 300;
                if (coreRegenLevel >= 4) { feedback(player, "MAX LEVEL"); return; }
                if (spend(cost)) { coreRegenLevel++; setNotice("CORE自動修復を強化しました"); }
                else feedback(player, "NOT ENOUGH CREDIT");
            }
            default -> { }
        }
    }

    private void unlockArea(Player player, String areaId) {
        if (!canUseFacilities() || player.down) return;
        UnlockArea area = areaById(areaId);
        if (area == null) return;
        if (unlockedAreas.contains(areaId)) { feedback(player, "ALREADY OPEN"); return; }
        if (distance(player.x, player.y, area.terminalX(), area.terminalY()) > 100) { feedback(player, "MOVE TO TERMINAL"); return; }
        int cost = 350 + unlockedAreas.size() * 100;
        if (spend(cost)) { unlockedAreas.add(areaId); setNotice(area.name() + " OPEN：防衛スロットを解放しました"); }
        else feedback(player, "NOT ENOUGH CREDIT");
    }

    private static UnlockArea areaById(String id) {
        return AREAS.stream().filter(area -> area.id().equals(id)).findFirst().orElse(null);
    }

    private boolean spend(int amount) {
        if (credits < amount) return false;
        credits -= amount;
        return true;
    }

    private void damagePlayer(Player player, double damage) {
        if (player.down) return;
        player.hp = Math.max(0, player.hp - damage);
        cancelAction(player);
        if (player.hp <= 0) {
            player.down = true;
            player.moveX = 0;
            player.moveY = 0;
            player.dashHeld = false;
            player.dashing = false;
            setNotice(player.name + " がダウンしました");
        }
    }

    private void resetWorld(boolean preserveHumans) {
        phase = Phase.LOBBY;
        round = 0;
        prepTime = 0;
        queuedEnemies = 0;
        bossPending = false;
        spawnTimer = 0;
        credits = 700;
        coreMaxHp = 1000;
        coreHp = coreMaxHp;
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
        for (TrapSlot slot : trapSlots) slot.defense = null;
        int index = 0;
        for (Player player : players) {
            player.x = 855 + (index % 2) * 90;
            player.y = 555 + (index / 2) * 90;
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
            player.ownsShotgun = false;
            player.ownsRifle = false;
            player.shotgunAmmo = 0;
            player.rifleAmmo = 0;
            player.kills = 0;
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

    private boolean canMove(Player player) {
        return phase == Phase.PREPARING || phase == Phase.WAVE;
    }

    private boolean canUseFacilities() {
        return phase == Phase.PREPARING || phase == Phase.WAVE;
    }

    private boolean canOccupy(double x, double y, double radius) {
        if (x - radius < 0 || y - radius < 0 || x + radius > WORLD_W || y + radius > WORLD_H) return false;
        for (Wall wall : WALLS) {
            if (x + radius > wall.x() && x - radius < wall.x() + wall.width()
                    && y + radius > wall.y() && y - radius < wall.y() + wall.height()
                    && !insideUnlockedArea(x, y, radius)) return false;
        }
        return true;
    }

    private boolean insideUnlockedArea(double x, double y, double radius) {
        for (UnlockArea area : AREAS) {
            if (unlockedAreas.contains(area.id()) && x >= area.x() - radius && x <= area.x() + area.width() + radius
                    && y >= area.y() - radius && y <= area.y() + area.height() + radius) return true;
        }
        return false;
    }

    private void cancelAction(Player player) {
        player.actionTarget = null;
        player.actionProgress = 0;
    }

    private void feedback(Player player, String message) {
        if (player.human && player.connection != null) {
            player.connection.send("{\"type\":\"feedback\",\"message\":\"" + escapeJson(message) + "\"}");
        }
    }

    private void setNotice(String text) {
        notice = text;
        noticeVersion++;
    }

    private void sendSnapshot() {
        if (!getConnections().isEmpty()) broadcast(buildSnapshot());
    }

    private String buildSnapshot() {
        StringBuilder json = new StringBuilder(8192);
        json.append("{\"type\":\"state\",\"phase\":\"").append(phase.name().toLowerCase(Locale.ROOT));
        json.append("\",\"round\":").append(round).append(",\"maxRounds\":").append(MAX_ROUNDS);
        json.append(",\"prepTime\":").append(roundOne(prepTime));
        json.append(",\"credits\":").append(credits);
        json.append(",\"queued\":").append(queuedEnemies + (bossPending ? 1 : 0));
        appendStringArray(json, "activeSpawns", activeSpawnIds);
        json.append(",\"noticeVersion\":").append(noticeVersion).append(",\"notice\":\"").append(escapeJson(notice)).append("\"");
        json.append(",\"core\":{\"x\":").append(CORE_X).append(",\"y\":").append(CORE_Y);
        json.append(",\"hp\":").append(roundOne(coreHp)).append(",\"maxHp\":").append(roundOne(coreMaxHp));
        json.append(",\"shield\":").append(roundOne(coreShield)).append(",\"maxShield\":").append(roundOne(coreMaxShield));
        json.append(",\"defense\":").append(coreDefenseLevel).append(",\"regen\":").append(coreRegenLevel).append('}');
        json.append(",\"areas\":{");
        json.append("\"depot\":").append(unlockedAreas.contains("depot"));
        json.append(",\"relay\":").append(unlockedAreas.contains("relay"));
        json.append(",\"workshop\":").append(unlockedAreas.contains("workshop")).append('}');
        json.append(",\"players\":[");
        for (int i = 0; i < players.size(); i++) {
            Player player = players.get(i);
            if (i > 0) json.append(',');
            json.append("{\"id\":\"").append(player.id).append("\",\"name\":\"").append(escapeJson(player.name));
            json.append("\",\"human\":").append(player.human).append(",\"x\":").append(roundOne(player.x));
            json.append(",\"y\":").append(roundOne(player.y)).append(",\"hp\":").append(roundOne(player.hp));
            json.append(",\"down\":").append(player.down).append(",\"weapon\":\"").append(player.weapon);
            json.append("\",\"cooldown\":").append(roundOne(player.cooldown));
            json.append(",\"stamina\":").append(roundOne(player.stamina)).append(",\"dashing\":").append(player.dashing);
            json.append(",\"ownsShotgun\":").append(player.ownsShotgun).append(",\"ownsRifle\":").append(player.ownsRifle);
            json.append(",\"shotgunAmmo\":").append(player.shotgunAmmo).append(",\"rifleAmmo\":").append(player.rifleAmmo);
            json.append(",\"kills\":").append(player.kills);
            json.append(",\"action\":").append(player.actionTarget == null ? "null" : "\"" + player.actionTarget + "\"");
            json.append(",\"actionProgress\":").append(roundOne(player.actionProgress)).append('}');
        }
        json.append("],\"enemies\":[");
        for (int i = 0; i < enemies.size(); i++) {
            Enemy enemy = enemies.get(i);
            if (i > 0) json.append(',');
            json.append("{\"id\":").append(enemy.id).append(",\"type\":\"").append(enemy.type);
            json.append("\",\"lane\":\"").append(enemy.lane).append("\",\"spawnId\":\"").append(enemy.spawnId);
            json.append("\",\"x\":").append(roundOne(enemy.x));
            json.append(",\"y\":").append(roundOne(enemy.y)).append(",\"hp\":").append(roundOne(enemy.hp));
            json.append(",\"maxHp\":").append(roundOne(enemy.maxHp)).append('}');
        }
        json.append("],\"slots\":[");
        for (int i = 0; i < trapSlots.size(); i++) {
            TrapSlot slot = trapSlots.get(i);
            if (i > 0) json.append(',');
            boolean locked = slot.requiredArea != null && !unlockedAreas.contains(slot.requiredArea);
            json.append("{\"id\":\"").append(slot.id).append("\",\"lane\":\"").append(slot.lane);
            json.append("\",\"x\":").append(slot.x).append(",\"y\":").append(slot.y).append(",\"locked\":").append(locked);
            json.append(",\"defense\":");
            if (slot.defense == null) json.append("null");
            else {
                json.append("{\"type\":\"").append(slot.defense.type).append("\",\"hp\":").append(roundOne(slot.defense.hp));
                json.append(",\"maxHp\":").append(roundOne(slot.defense.maxHp)).append('}');
            }
            json.append('}');
        }
        json.append("]}");
        return json.toString();
    }

    private static void appendStringArray(StringBuilder json, String name, List<String> values) {
        json.append(",\"").append(name).append("\":[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) json.append(',');
            json.append('\"').append(values.get(i)).append('\"');
        }
        json.append(']');
    }

    private static double roundOne(double value) { return Math.round(value * 10.0) / 10.0; }
    private static double clamp(double value, double min, double max) { return Math.max(min, Math.min(max, value)); }
    private static double distance(double ax, double ay, double bx, double by) { return Math.hypot(ax - bx, ay - by); }
    private static String escapeJson(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "");
    }

    public static void main(String[] args) {
        int port = args.length == 0 ? 8887 : Integer.parseInt(args[0]);
        new WasdServer(port).start();
    }
}
