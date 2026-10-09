package example;

import static example.GameConfig.BUILD_RECIPES;
import example.WeaponCatalog.WeaponStats;
import static example.GameConfig.GATHER_COOLDOWN_SECONDS;
import static example.GameConfig.MAX_ROUNDS;
import static example.GameConfig.PLAYER_COUNT;
import static example.GameConfig.RECONNECT_GRACE_SECONDS;
import static example.GameMap.CORE_X;
import static example.GameMap.CORE_Y;
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
    private static final double BOT_REACTION_SECONDS = 1.5;
    final List<PoisonGasRules.Cloud> poisonClouds = new ArrayList<>();
    int roundEnemyTotal;
    double elapsedSeconds;
    double victoryMoveRemaining;
    double teamBuffRemaining;
    private boolean explosionBossSpawned;
    private boolean wardenSpawned;
    private boolean debugMode;

    static int ammoRefillCost() {
        return 120;
    }

    static int ammoRefillCost(String weapon) {
        return switch (weapon) {
            case "flamethrower" -> 2_000;
            case "rocket" -> 2_500;
            case "railgun" -> 3_000;
            case "laserCannon" -> 2_000;
            case "poisonGas", "freezeGun" -> 1_000;
            default -> ammoRefillCost();
        };
    }

    int unlockCost() {
        return GameConfig.AREA_UNLOCK_COSTS.get("entry-room");
    }

    int unlockCost(String areaId) {
        Integer cost = GameConfig.AREA_UNLOCK_COSTS.get(areaId);
        if (cost == null) throw new IllegalArgumentException("Missing terminal price: " + areaId);
        return cost;
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
    final List<MissileStrike> missiles = new ArrayList<>();
    final List<EnemyProjectileSystem.Shot> enemyProjectiles = new ArrayList<>();
    final List<CombatSystem.RocketFlight> rockets = new ArrayList<>();
    int nextProjectileId;
    double rewindRemaining;
    final List<Decoy> decoys = new ArrayList<>();
    final List<ArtilleryShell> artilleryShells = new ArrayList<>();
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
    int queuedBlueEnemies;
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
    private final GameEffects gameEffects;
    final CombatSystem combat;
    private final WardenCombatSystem.World wardenWorld;
    private final List<String> activeLanes = new ArrayList<>();
    private Random random = new Random();
    PreparationBackup backup;
    boolean backupUsed;
    int rewindVersion;
    static final int BACKUP_COST = 100_000;
    static final double BACKUP_RESTORE_DURATION = 6;
    private final EnemyTravel laterFeatureTravel = new EnemyTravel();
    private final EnemyNavigation enemyNavigation = new EnemyNavigation();
    private double spawnTimer;
    private int nextEnemyId = 1;
    private int nextDefenseId = 1;
    private int nextDroppedResourceId = 1;
    private int nextFactoryId = 1;
    private int nextSpawnIndex;

    GameSession(GameEventSink events) {
        this.events = events;
        this.gameEffects = new GameEffects(events);
        this.wardenWorld = new WardenCombatSystem.World() {
            public List<Player> players() { return players; }
            public List<TrapSlot> defenses() { return trapSlots; }
            public List<Decoy> decoys() { return decoys; }
            public double coreX() { return coreX; }
            public double coreY() { return coreY; }
            public boolean canTravel(double x, double y, double toX, double toY) {
                return canEnemyTravel(x, y, toX, toY) && canOccupy(toX, toY, 17);
            }
            public boolean clearLine(double x, double y, double toX, double toY) {
                return GameMap.hasClearLine(x, y, toX, toY, unlockedAreas);
            }
            public void damagePlayer(Player player, double damage) { GameSession.this.damagePlayer(player, damage); }
            public void damageDrone(Player player, double damage) { GameSession.this.damageDrone(player, damage); }
            public void damageCore(double damage) { GameSession.this.damageCore(damage); }
            public void pulse(double x, double y, double radius) { gameEffects.explosion(x, y, radius); }
        };
        this.combat = new CombatSystem(new CombatSystem.World() {
            public boolean canAttack() { return canMove(); }
            public Set<String> unlockedAreas() { return unlockedAreas; }
            public List<Enemy> enemies() { return enemies; }
            public List<PoisonGasRules.Cloud> poisonClouds() { return poisonClouds; }
            public List<Player> players() { return players; }
            public void damagePlayer(Player player, double damage) { GameSession.this.damagePlayer(player, damage); }
            public boolean canOccupy(double x, double y, double radius) { return GameSession.this.canOccupy(x, y, radius); }
            public void onEnemyDefeated(Enemy enemy) {
                if (enemy.type.equals("bomber")) explodeBomber(enemy);
            }
            public double damageMultiplier(Player player, String weapon) {
                double personal = UpgradeRules.weaponMultiplier(player.enchantments.getOrDefault(weapon, 0));
                double x = DroneRules.controlling(player) ? player.drone.x : player.x;
                double y = DroneRules.controlling(player) ? player.drone.y : player.y;
                return personal * JobRules.damageMultiplier(player.job) * (teamBuffAt(x, y) ? UpgradeRules.TEAM_DAMAGE : 1);
            }
        }, gameEffects, () -> random.nextDouble(), rockets);
        for (int slot = 1; slot <= PLAYER_COUNT; slot++) players.add(new Player(slot));
        resetWorld();
    }

    Player connectPlayer() {
        return connectPlayer(null);
    }

    Player connectPlayer(String sessionId) {
        String reconnectId = sessionId == null || sessionId.isBlank() ? null : sessionId;
        Player assigned = reconnectId == null ? null : players.stream()
                .filter(player -> reconnectId.equals(player.sessionId))
                .findFirst().orElse(null);
        boolean rejoining = assigned != null;
        if (!rejoining && rewindRemaining <= 0 && (phase == GamePhase.WON || phase == GamePhase.LOST)) resetWorld();
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
                assigned.drone = null;
                assigned.job = JobRules.DEFAULT;
                assigned.hp = Math.min(assigned.hp, JobRules.maxHp(assigned.job));
                assigned.decoyCooldown = 0;
                assigned.tpInvulnerableRemaining = 0;
                String assignedId = assigned.id;
                decoys.removeIf(decoy -> decoy.ownerId.equals(assignedId));
                assigned.stamina = Math.min(assigned.stamina, JobRules.staminaMax(assigned.job));
                assigned.spyRemaining = assigned.jobCooldown = assigned.scoutDashRemaining = 0;
                assigned.teleportPads.clear(); assigned.teleportPairs.clear();
                assigned.sessionId = reconnectId;
                assigned.lastProcessedInput = 0;
                assigned.name = "Player " + assigned.slot;
            }
            refreshCpuNames();
            setNotice(assigned.name + (rejoining ? "が再参加しました" : "が参加しました"));
        }
        return assigned;
    }

    void disconnectPlayer(Player player) {
        disconnectPlayer(player, true);
    }

    void disconnectPlayer(Player player, boolean allowReconnect) {
        if (!player.human) return;
        String displayName = player.name;
        player.human = false;
        releaseDroneControl(player);
        player.missileControl = false;
        player.breakerControl = null;
        player.roomReady = false;
        if (!allowReconnect) player.sessionId = null;
        player.reconnectGrace = player.sessionId == null ? 0 : RECONNECT_GRACE_SECONDS;
        refreshCpuNames();
        player.moveX = 0;
        player.moveY = 0;
        player.dashHeld = false;
        player.dashing = false;
        player.scoutDashRemaining = 0;
        player.firing = player.secondaryFiring = false;
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
        if (canMove() && DroneRules.controlling(player)
                && !Set.of("MOVE", "FIRE", "ATTACK", "JOB_ABILITY", "DRONE_RECOVER", "DRONE_SELF_DESTRUCT", "BREAKER", "HELLO").contains(parts[0])) return;
        if (player.missileControl && !Set.of("MISSILE", "MAP_REPAIR", "COMPUTER", "HELLO", "HACKER_BACKUP").contains(parts[0])) return;
        switch (parts[0]) {
            case "HACKER_BACKUP" -> saveBackup(player);
            case "HELLO" -> updateName(player, parts);
            case "START" -> {
                if (rewindRemaining <= 0 && (phase == GamePhase.LOBBY || phase == GamePhase.WON || phase == GamePhase.LOST)) {
                    if (!player.id.equals(roomOwnerId)) {
                        gameEffects.feedback(player, "ルームのオーナーだけが開始できます");
                    } else if (!roomReadyForStart()) {
                        gameEffects.feedback(player, "全員の準備が完了するまでお待ちください");
                    } else {
                        startMatch(player, parts.length > 1 && parts[1].equals("DEBUG"));
                    }
                }
            }
            case "COMPUTER" -> {
                if (player.missileControl) { player.missileControl = false; player.breakerControl = null; }
                else if (player.job.equals("hacker") && canOperate(player, GameMap.MISSILE_COMPUTER)) {
                    player.missileControl = true;
                    player.breakerControl = null;
                    player.moveX = player.moveY = 0;
                    player.firing = player.dashHeld = player.dashing = false;
                    player.stopRailgun(); cancelAction(player);
                }
            }
            case "MISSILE" -> { if (parts.length >= 3) launchMissile(player, Double.parseDouble(parts[1]), Double.parseDouble(parts[2])); }
            case "JOB" -> { if (parts.length >= 2) selectJob(player, parts[1]); }
            case "JOB_ABILITY" -> { if (!player.job.equals("tank")) useJobAbility(player); }
            case "TANK_WALL" -> {
                if (!player.job.equals("tank")) break;
                if (parts.length >= 3) {
                    MapPoint direction = JobRules.scoutDashDirection(player.x, player.y,
                            Double.parseDouble(parts[1]), Double.parseDouble(parts[2]));
                    if (direction != null) useJobAbility(player, direction);
                } else useJobAbility(player);
            }
            case "DECOY" -> { if (parts.length >= 3) launchDecoy(player, Double.parseDouble(parts[1]), Double.parseDouble(parts[2])); }
            case "DRONE_RECOVER" -> recoverDrone(player);
            case "DRONE_SELF_DESTRUCT" -> selfDestructDrone(player);
            case "DRONE_MOUNT" -> { if (parts.length > 1) mountDrone(player, parts[1]); }
            case "DRONE_LAUNCH" -> {
                if (parts.length > 1 && canMove() && !player.down && !player.movingCore
                        && player.job.equals("drone") && (player.drone == null || !player.drone.active)
                        && (parts[1].equals("none") || DroneRules.mountable(parts[1]) && player.weapons.owns(parts[1]))) {
                    mountDrone(player, parts[1]);
                    launchDrone(player);
                }
            }
            case "SCOUT_DASH" -> { if (parts.length >= 3) useScoutDash(player,
                    Double.parseDouble(parts[1]), Double.parseDouble(parts[2])); }
            case "TELEPORT" -> useTeleport(player);
            case "PICKUP_TELEPORT" -> {
                if (parts.length >= 3) pickupTeleport(player, new MapPoint(
                        Double.parseDouble(parts[1]), Double.parseDouble(parts[2])));
            }
            case "ROOM_READY" -> setRoomReady(player, parts);
            case "MOVE" -> handleMove(player, parts);
            case "DASH" -> handleDash(player, parts);
            case "ATTACK" -> combat.attackAt(player, player.aimX, player.aimY);
            case "FIRE" -> handleFire(player, parts);
            case "SECONDARY_FIRE" -> handleSecondaryFire(player, parts);
            case "INTERACT" -> { if (parts.length >= 2) interact(player, parts[1]); }
            case "WEAPON" -> { if (parts.length >= 2) switchWeapon(player, parts[1]); }
            case "SECONDARY_WEAPON" -> { if (parts.length >= 2) switchSecondaryWeapon(player, parts[1]); }
            case "BUY" -> { if (parts.length >= 2) buy(player, parts[1], parts.length >= 3 ? parts[2] : null); }
            case "BUILD" -> { if (parts.length >= 3) build(player, parts[1], parts[2]); }
            case "PICKUP_FACTORY" -> { if (parts.length >= 2) pickupFactory(player, parts[1]); }
            case "REMOVE" -> { if (parts.length >= 2) removeDefense(player, parts[1]); }
            case "REPAIR" -> { if (parts.length >= 2) repair(player, parts[1]); }
            case "UPGRADE" -> { if (parts.length >= 2) upgradeCore(player, parts[1]); }
            case "EXTEND_PREP" -> extendPrepTime(player);
            case "UNLOCK" -> { if (parts.length >= 2) unlockArea(player, parts[1]); }
            case "BREAKER" -> { if (parts.length >= 2) resetBreaker(player, parts[1]); }
            case "BREAKER_MAP" -> { if (parts.length >= 2) openBreakerMap(player, parts[1]); }
            case "MAP_REPAIR" -> { if (parts.length >= 2) repairBreakerFromMap(player, parts[1]); }
            case "GATHER" -> { if (parts.length >= 2) gather(player, parts[1]); }
            case "DROP_RESOURCE" -> { if (parts.length >= 3) dropResource(player, parts); }
            case "DROP_ITEM" -> { if (parts.length >= 3 && parts[1].equals("medkit")) dropInventory(player, parts); }
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

    private void saveBackup(Player player) {
        if (!player.job.equals("hacker") || player.down || phase != GamePhase.PREPARING || backupUsed
                || !canOperate(player, GameMap.BACKUP_TERMINAL)
                || !enemies.isEmpty() || !artilleryShells.isEmpty() || !combat.rockets.isEmpty() || !enemyProjectiles.isEmpty()) return;
        if (!spend(player, BACKUP_COST)) { gameEffects.feedback(player, "お金が足りません"); return; }
        var savedPlayers = players.stream().map(Player::gameplayCopy).toList();
        backup = new PreparationBackup(new PreparationBackup.World(
                roundEnemyTotal, round, queuedEnemies, queuedTinyEnemies, queuedBlueEnemies,
                queuedBosses, coreDefenseLevel, coreRegenLevel, blackoutBreakerTotal, nextPrepBonusSeconds,
                nextEnemyId, nextDefenseId, nextDroppedResourceId, nextFactoryId, nextSpawnIndex,
                elapsedSeconds, victoryMoveRemaining, teamBuffRemaining, prepTime, coreHp,
                coreMaxHp, coreX, coreY, coreShield, coreMaxShield,
                spawnTimer, explosionBossSpawned, wardenSpawned, debugMode, blackoutActive,
                roundEvent, failedSpawnId),
            savedPlayers, BackupCopies.slots(trapSlots), BackupCopies.resources(resourceNodes),
            BackupCopies.factories(factories), BackupCopies.drops(droppedResources), BackupCopies.clouds(poisonClouds),
            BackupCopies.decoys(decoys, savedPlayers), BackupCopies.missiles(missiles, savedPlayers),
            Set.copyOf(unlockedAreas), Set.copyOf(trippedBreakers), List.copyOf(activeSpawnIds), List.copyOf(activeLanes),
            BackupCopies.random(random), player.id);
        setNotice("バックアップを保存しました");
        gameEffects.purchased(player, "backup", true);
    }

    private void restoreBackup() {
        if (phase != GamePhase.LOST || backup == null || backupUsed) return;
        var saved = backup;
        var world = saved.world();
        roundEnemyTotal = world.roundEnemyTotal();
        round = world.round();
        queuedEnemies = world.queuedEnemies();
        queuedTinyEnemies = world.queuedTinyEnemies();
        queuedBlueEnemies = world.queuedBlueEnemies();
        queuedBosses = world.queuedBosses();
        coreDefenseLevel = world.coreDefenseLevel();
        coreRegenLevel = world.coreRegenLevel();
        blackoutBreakerTotal = world.blackoutBreakerTotal();
        nextPrepBonusSeconds = world.nextPrepBonusSeconds();
        nextEnemyId = world.nextEnemyId();
        nextDefenseId = world.nextDefenseId();
        nextDroppedResourceId = world.nextDroppedResourceId();
        nextFactoryId = world.nextFactoryId();
        nextSpawnIndex = world.nextSpawnIndex();
        elapsedSeconds = world.elapsedSeconds();
        victoryMoveRemaining = world.victoryMoveRemaining();
        teamBuffRemaining = world.teamBuffRemaining();
        prepTime = world.prepTime();
        coreHp = world.coreHp();
        coreMaxHp = world.coreMaxHp();
        coreX = world.coreX();
        coreY = world.coreY();
        coreShield = world.coreShield();
        coreMaxShield = world.coreMaxShield();
        spawnTimer = world.spawnTimer();
        explosionBossSpawned = world.explosionBossSpawned();
        wardenSpawned = world.wardenSpawned();
        debugMode = world.debugMode();
        blackoutActive = world.blackoutActive();
        roundEvent = world.roundEvent();
        failedSpawnId = world.failedSpawnId();
        for (int i = 0; i < players.size(); i++) {
            Player live = players.get(i); live.copyGameplayFrom(saved.players().get(i));
            live.moveX = live.moveY = 0; live.dashHeld = live.dashing = live.firing = live.secondaryFiring = false;
            live.stopRailgun(); live.stopSecondaryRailgun(); live.missileControl = false; live.breakerControl = null;
            releaseDroneControl(live); cancelAction(live); HookSystem.clear(live);
        }
        enemies.clear(); artilleryShells.clear(); enemyProjectiles.clear(); combat.rockets.clear();
        trapSlots.clear(); trapSlots.addAll(BackupCopies.slots(saved.slots()));
        resourceNodes.clear(); resourceNodes.addAll(BackupCopies.resources(saved.resources()));
        factories.clear(); factories.addAll(BackupCopies.factories(saved.factories()));
        droppedResources.clear(); droppedResources.addAll(BackupCopies.drops(saved.drops()));
        poisonClouds.clear(); poisonClouds.addAll(BackupCopies.clouds(saved.clouds()));
        decoys.clear(); decoys.addAll(BackupCopies.decoys(saved.decoys(), players));
        missiles.clear(); missiles.addAll(BackupCopies.missiles(saved.missiles(), players));
        unlockedAreas.clear(); unlockedAreas.addAll(saved.unlocked());
        trippedBreakers.clear(); trippedBreakers.addAll(saved.tripped());
        activeSpawnIds.clear(); activeSpawnIds.addAll(saved.spawns());
        activeLanes.clear(); activeLanes.addAll(saved.lanes());
        random = BackupCopies.random(saved.random());
        phase = GamePhase.PREPARING; backupUsed = true; backup = null; rewindVersion++; rewindRemaining = 0;
        setNotice("バックアップから復元しました");
    }

    void update(double dt) {
        updateReconnectReservations(dt);
        if (phase == GamePhase.LOST && rewindRemaining > 0) {
            rewindRemaining = Math.max(0, rewindRemaining - dt);
            if (rewindRemaining <= 1e-9) restoreBackup();
            return;
        }
        if (canUseFacilities()) teamBuffRemaining = Math.max(0, teamBuffRemaining - dt);
        for (Player player : players) {
            if (!canMove()) recallDrone(player);
            if (player.drone != null) player.drone.cooldown = Math.max(0, player.drone.cooldown - dt);
            player.missileCooldown = Math.max(0, player.missileCooldown - dt);
            if (!player.job.equals("hacker") || (player.breakerControl == null
                    ? !canOperate(player, GameMap.MISSILE_COMPUTER)
                    : !canOperateBreaker(player, GameMap.breakerById(player.breakerControl)))) {
                player.missileControl = false; player.breakerControl = null;
            }
            JobRules.updateDisguise(player, dt);
            player.tpInvulnerableRemaining = Math.max(0, player.tpInvulnerableRemaining - dt);
            player.reviveInvulnerableRemaining = Math.max(0, player.reviveInvulnerableRemaining - dt);
            if (player.reviveInvulnerableRemaining < 1e-9) player.reviveInvulnerableRemaining = 0;
            player.decoyCooldown = Math.max(0, player.decoyCooldown - dt);
            if (!player.job.equals("spy")) player.jobCooldown = Math.max(0, player.jobCooldown - dt);
            player.teleportCooldown = Math.max(0, player.teleportCooldown - dt);
            player.weaponCooldowns.replaceAll((weapon, remaining) -> Math.max(0, remaining - dt));
            player.cooldown = Math.max(0, player.cooldown - dt);
            player.secondaryWeaponCooldowns.replaceAll((weapon, remaining) -> Math.max(0, remaining - dt));
            player.secondaryCooldown = Math.max(0, player.secondaryCooldown - dt);
            if (player.human && player.secondaryFiring && canMove()) combat.attackSecondary(player, player.secondaryAimX, player.secondaryAimY);
            player.gatherCooldown = Math.max(0, player.gatherCooldown - dt);
            if (!player.secondaryFiring || player.down || player.movingCore || player.selectedBuild != null || !canMove()) {
                player.stopSecondaryRailgun();
            }
            if (!player.firing || player.down || player.movingCore || player.selectedBuild != null || !canMove()) {
                player.stopRailgun();
            }
            if (player.human && player.firing && (player.cooldown <= 0 || DroneRules.controlling(player)) && canMove()) {
                combat.attackAt(player, player.aimX, player.aimY);
            }
        }
        if (phase == GamePhase.WON) {
            double movementTime = Math.min(dt, victoryMoveRemaining);
            if (movementTime > 0) updatePlayers(movementTime);
            victoryMoveRemaining = Math.max(0, victoryMoveRemaining - dt);
            return;
        }
        if (phase == GamePhase.LOBBY || phase == GamePhase.LOST) return;
        elapsedSeconds += dt;

        updateBots(dt);
        updatePlayers(dt);
        players.forEach(player -> { combat.updateRailgun(player, dt); combat.updateSecondaryRailgun(player, dt); });
        combat.updatePoisonGas(dt);
        updateMissiles(dt);
        combat.updateRockets(dt);
        EnemyProjectileSystem.update(enemyProjectiles, dt, new EnemyProjectileSystem.World() {
            public List<Player> players() { return players; }
            public List<TrapSlot> slots() { return trapSlots; }
            public Set<String> unlocked() { return unlockedAreas; }
            public void damage(Player player, double damage) { damagePlayer(player, damage); }
        });
        updateJobEquipment(dt);
        combat.updateHooks(dt);
        updateMedbay(dt);
        updateHealingAreas(dt);
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
            if (backup != null && !backupUsed) rewindRemaining = BACKUP_RESTORE_DURATION;
            setNotice("コアが破壊されました");
            return;
        }
        if (players.stream().noneMatch(player -> !player.down) && !hasHealingRescue()) {
            phase = GamePhase.LOST;
            if (backup != null && !backupUsed) rewindRemaining = BACKUP_RESTORE_DURATION;
            setNotice("全員がダウンしました");
            return;
        }
        if (queuedEnemies == 0 && queuedBosses == 0 && enemies.isEmpty() && artilleryShells.isEmpty() && enemyProjectiles.isEmpty() && combat.rockets.isEmpty()) finishRound();
    }

    private void updateReconnectReservations(double dt) {
        boolean expired = false;
        for (Player player : players) {
            if (player.human || player.sessionId == null) continue;
            player.reconnectGrace = Math.max(0, player.reconnectGrace - dt);
            if (player.reconnectGrace <= 0) {
                player.sessionId = null;
                expired = true;
            }
        }
        if (expired) refreshCpuNames();
    }

    private void refreshCpuNames() {
        int cpuNumber = 1;
        for (Player player : players) {
            if (!player.human && player.sessionId == null) player.name = "CPU " + cpuNumber++;
        }
    }

    private void updateName(Player player, String[] parts) {
        if (parts.length < 2) return;
        String cleaned = parts[1].replaceAll("[^\\p{L}\\p{N} _-]", "").trim();
        if (!cleaned.isEmpty()) player.name = cleaned.substring(0, Math.min(16, cleaned.length()));
    }

    private void handleMove(Player player, String[] parts) {
        if (parts.length < 3 || !(canMove() || phase == GamePhase.WON && victoryMoveRemaining > 0)) return;
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
        if (length > 0.12 && !DroneRules.controlling(player)) {
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

    private void selectJob(Player player, String job) {
        if (!player.human || !JobRules.valid(job)
                || !(phase == GamePhase.LOBBY || phase == GamePhase.WON || phase == GamePhase.LOST || canOperate(player, GameMap.JOB_STATION))) return;
        if (player.job.equals(job)) return;
        player.firing = player.dashing = player.dashHeld = player.missileControl = false;
        player.breakerControl = null;
        player.stopRailgun(); cancelAction(player);
        double previousMaxHp = JobRules.maxHp(player.job);
        player.secondaryFiring = false; player.stopSecondaryRailgun();
        player.secondaryWeapon = "bat";
        player.secondaryWeaponCooldowns.clear(); player.secondaryWeaponCooldownMaxima.clear();
        player.secondaryCooldown = player.secondaryCooldownMax = player.healRemaining = 0;
        player.job = job;
        player.tpInvulnerableRemaining = 0;
        player.weapons.clampAmmoToCapacity();
        player.ensureDistinctWeapons();
        player.hp = player.down ? 0 : Math.min(JobRules.maxHp(job), player.hp * JobRules.maxHp(job) / previousMaxHp);
        player.decoyCooldown = 0;
        decoys.removeIf(decoy -> decoy.ownerId.equals(player.id));
        player.stamina = Math.min(player.stamina, JobRules.staminaMax(job));
        recallDrone(player);
        player.roomReady = false;
        player.spyRemaining = player.jobCooldown = player.scoutDashRemaining = 0;
        player.teleportPads.clear(); player.teleportPairs.clear();
    }

    private boolean canOperate(Player player, WorkbenchUnit unit) {
        return unit != null && canUseFacilities() && !player.down && !player.movingCore && player.selectedBuild == null
                && unlockedAreas.contains(unit.requiredArea()) && canInteract(player, unit.x(), unit.y(), 70);
    }

    private void launchMissile(Player player, double x, double y) {
        if (!player.missileControl || player.breakerControl != null || !player.job.equals("hacker") || player.missileCooldown > 0
                || !canOperate(player, GameMap.MISSILE_COMPUTER) || !MissileRules.validTarget(x, y, unlockedAreas)) return;
        missiles.add(new MissileStrike(player, x, y));
        player.missileCooldown = MissileRules.cooldown();
        gameEffects.sound(player, "missile-launch", "missile-launch");
    }

    private boolean canOperateBreaker(Player player, BreakerTerminal breaker) {
        return breaker != null && canUseFacilities() && !player.down && !player.movingCore && player.selectedBuild == null
                && (breaker.requiredArea() == null || unlockedAreas.contains(breaker.requiredArea()))
                && canInteract(player, breaker.x(), breaker.y(), 95);
    }

    private void openBreakerMap(Player player, String id) {
        if (!player.job.equals("hacker") || !canOperateBreaker(player, GameMap.breakerById(id))) return;
        player.missileControl = true; player.breakerControl = id;
        player.moveX = player.moveY = 0;
        player.firing = player.secondaryFiring = player.dashHeld = player.dashing = false;
        player.stopRailgun(); cancelAction(player);
    }

    private void updateMissiles(double dt) {
        for (MissileStrike strike : List.copyOf(missiles)) {
            strike.remaining -= dt;
            if (strike.remaining > 1e-9) continue;
            combat.missileImpact(strike.owner, strike.x, strike.y);
            gameEffects.missileImpact(strike.x, strike.y);
            missiles.remove(strike);
        }
    }

    private void useJobAbility(Player player) {
        useJobAbility(player, null);
    }

    private void useJobAbility(Player player, MapPoint wallDirection) {
        if (!canMove() || player.down || player.movingCore) return;
        if (player.job.equals("tp")) {
            if (player.jobCooldown > 0) return;
            player.firing = player.secondaryFiring = false;
            player.hookPressHandled = false;
            HookSystem.clear(player);
            player.stopRailgun(); player.stopSecondaryRailgun();
            player.tpInvulnerableRemaining = JobRules.TP_INVULNERABLE_DURATION;
            player.jobCooldown = JobRules.TP_INVULNERABLE_COOLDOWN;
            gameEffects.sound(player, "item-use", "build");
            return;
        }
        if (player.job.equals("tank")) {
            if (player.selectedBuild != null || player.jobCooldown > 0) return;
            List<MapPoint> points = JobRules.tankWallPlacements(player.x, player.y,
                    wallDirection == null ? player.facingX : wallDirection.x(),
                    wallDirection == null ? player.facingY : wallDirection.y())
                    .stream().filter(candidate -> candidate.stream().allMatch(point -> canPlaceDefenseAt(point, null)))
                    .findFirst().orElse(null);
            if (points == null) {
                gameEffects.feedback(player, "ここには設置できません");
                return;
            }
            for (MapPoint point : points) {
                TrapSlot wall = new TrapSlot("tank-wall-" + nextDefenseId++, "free", point.x(), point.y(), null);
                wall.ownerId = player.id;
                wall.defense = new Defense("barricade", JobRules.TANK_WALL_HP);
                wall.temporaryRemaining = JobRules.TANK_WALL_DURATION;
                trapSlots.add(wall);
            }
            player.jobCooldown = JobRules.TANK_WALL_COOLDOWN;
            gameEffects.sound(player, "item-use", "build");
            return;
        }
        if (player.job.equals("drone")) {
            if (player.drone == null || !player.drone.active) return;
            if (DroneRules.canRecover(distance(player.x, player.y, player.drone.x, player.drone.y),
                    GameMap.hasClearLine(player.x, player.y, player.drone.x, player.drone.y))) {
                recallDrone(player);
                return;
            }
            boolean next = !player.drone.controlled;
            releaseDroneControl(player);
            player.drone.controlled = next;
            if (next) player.selectedBuild = null;
            cancelAction(player);
            return;
        }
        if (player.job.equals("healer") && player.selectedBuild == null && player.jobCooldown <= 0) {
            MapPoint center = GameMap.snapToTile(player.x, player.y);
            player.healX = center.x(); player.healY = center.y();
            player.healRemaining = JobRules.HEAL_DURATION;
            player.jobCooldown = JobRules.HEAL_COOLDOWN;
            gameEffects.sound(player, "item-use", "heal");
        }
        if (player.job.equals("spy")) {
            if (player.selectedBuild != null) return;
            if (player.jobCooldown > 0 || player.spyRemaining > 0) return;
            player.spyCheckedEnemies.clear(); player.spyHostileEnemies.clear();
            player.spyRemaining = JobRules.SPY_DURATION;
            player.jobCooldown = 0;
        }
    }

    private void launchDecoy(Player player, double x, double y) {
        if (!canMove() || !DecoyRules.canLaunch(player)) return;
        MapPoint direction = JobRules.scoutDashDirection(player.x, player.y, x, y);
        if (direction == null) return;
        decoys.removeIf(decoy -> decoy.ownerId.equals(player.id));
        decoys.add(new Decoy(player, direction));
        player.decoyCooldown = DecoyRules.COOLDOWN;
        gameEffects.sound(player, "item-use", "build");
    }

    private void updateJobEquipment(double dt) {
        for (Decoy decoy : decoys) {
            DecoyRules.advance(decoy, dt, (x, y) -> canOccupy(x, y, 8));
        }
        decoys.removeIf(decoy -> decoy.remaining <= 0 || decoy.hp <= 0);
        trapSlots.removeIf(slot -> {
            if (slot.temporaryRemaining <= 0) return false;
            slot.temporaryRemaining -= dt;
            return slot.temporaryRemaining <= 0 || slot.defense == null || slot.defense.hp <= 0;
        });
    }

    private void useScoutDash(Player player, double targetX, double targetY) {
        if (!canMove() || !JobRules.canScoutDash(player.job, player.down, player.movingCore,
                player.selectedBuild != null, player.railgunRemaining > 0 || player.railgunCharge > 0 || player.secondaryRailgunRemaining > 0 || player.secondaryRailgunCharge > 0,
                player.stamina)) return;
        MapPoint direction = JobRules.scoutDashDirection(player.x, player.y, targetX, targetY);
        if (direction == null) return;
        player.scoutDashDx = direction.x(); player.scoutDashDy = direction.y();
        player.scoutDashRemaining = JobRules.SCOUT_DASH_DURATION;
        player.stamina -= JobRules.SCOUT_DASH_STAMINA;
        player.dashing = false;
        updateFacing(player, direction.x(), direction.y());
        cancelAction(player);
    }

    private void placeTeleport(Player player, MapPoint point) {
        if (!player.job.equals("tp") || player.buildItemCount("teleporter") <= 0) return;
        if (!canPlaceDefenseAt(point, null)) {
            gameEffects.feedback(player, "ここには設置できません");
            return;
        }
        int pair = 0;
        long firstPair = java.util.stream.IntStream.range(0, player.teleportPads.size())
                .filter(i -> JobRules.teleportPair(player, i) == 0).count();
        if (firstPair >= 2) pair = 1;
        player.teleportPairs.put(point, pair);
        player.teleportPads.add(point);
        if (player.buildItemCount("teleporter") == 0 && "teleporter".equals(player.selectedBuild)) player.selectedBuild = null;
        gameEffects.sound(player, "item-use", "build");
    }

    private void launchDrone(Player player) {
        if (!player.job.equals("drone") || player.down || player.movingCore || !canMove()
                || player.drone != null && player.drone.active) return;
        if (player.drone == null) player.drone = new Drone();
        Drone drone = player.drone;
        if (drone.hp <= 0) {
            if (!DroneRules.canRepair(player.ore, player.copper)) {
                gameEffects.feedback(player, "修復: 鉱石" + DroneRules.REPAIR_ORE + " / 銅" + DroneRules.REPAIR_COPPER);
                return;
            }
            player.ore -= DroneRules.REPAIR_ORE; player.copper -= DroneRules.REPAIR_COPPER;
            drone.hp = DroneRules.HP;
        }
        if (!player.weapons.owns(drone.weapon)) {
            drone.weapon = "";
        }
        drone.x = player.x; drone.y = player.y;
        drone.active = drone.controlled = true;
        if (DroneRules.mounted(player, player.weapon)) {
            String available = WeaponCatalog.ALL.stream().map(WeaponCatalog.Definition::id)
                    .filter(id -> !id.equals("bat") && player.weapons.owns(id) && !DroneRules.mounted(player, id))
                    .findFirst().orElse("bat");
            player.equipWeapon(available);
        }
        drone.attackers.clear();
        player.selectedBuild = null;
        player.firing = player.dashHeld = player.dashing = false;
        player.stopRailgun(); cancelAction(player);
    }

    private void mountDrone(Player player, String weapon) {
        if (!canMove() || player.down || !player.job.equals("drone")
                || player.drone != null && player.drone.active
                || !weapon.equals("none") && (!DroneRules.mountable(weapon) || !player.weapons.owns(weapon))) return;
        if (player.drone == null) player.drone = new Drone();
        player.drone.weapon = weapon.equals("none") ? "" : weapon;
    }

    private void releaseDroneControl(Player player) {
        if (player.drone == null) return;
        player.drone.controlled = false;
        player.moveX = player.moveY = 0;
        player.firing = player.dashHeld = player.dashing = false;
        player.stopRailgun();
    }

    private void recoverDrone(Player player) {
        if (!canMove() || player.down || player.drone == null || !player.drone.active
                || !DroneRules.canRecover(distance(player.x, player.y, player.drone.x, player.drone.y),
                    GameMap.hasClearLine(player.x, player.y, player.drone.x, player.drone.y))) return;
        recallDrone(player);
    }

    private void recallDrone(Player player) {
        if (player.drone == null || !player.drone.active) return;
        if (player.drone.controlled) releaseDroneControl(player);
        player.drone.active = false;
        player.drone.controlled = false;
        player.drone.attackers.clear();
    }

    private void selfDestructDrone(Player player) {
        if (!canMove() || !DroneRules.canSelfDestruct(player)) return;
        Drone drone = player.drone;
        gameEffects.droneSelfDestruct(player, drone);
        damageDrone(player, drone.hp);
        combat.droneExplosion(player, drone);
    }

    private void damageDrone(Player owner, double damage) {
        owner.drone.hp = Math.max(0, owner.drone.hp - damage);
        if (owner.drone.hp <= 0) {
            String weapon = owner.drone.weapon;
            owner.weapons.remove(weapon);
            owner.enchantments.remove(weapon);
            if (owner.weapon.equals(weapon)) owner.equipWeapon("bat");
            owner.weaponCooldowns.remove(weapon);
            owner.weaponCooldownMaxima.remove(weapon);
            owner.drone.weapon = "";
            recallDrone(owner);
            gameEffects.feedback(owner, "ドローンが壊れました");
        }
    }

    private void pickupTeleport(Player player, MapPoint point) {
        if (!canUseFacilities() || player.down || player.movingCore
                || !Double.isFinite(point.x()) || !Double.isFinite(point.y())
                || !JobRules.canRecoverTeleport(player.job, player.teleportPads.contains(point),
                    distance(player.x, player.y, point.x(), point.y()),
                    GameMap.hasClearLine(player.x, player.y, point.x(), point.y()))) return;
        player.teleportPads.remove(point);
        player.teleportPairs.remove(point);
        gameEffects.feedback(player, "テレポーターを回収しました");
    }

    private void useTeleport(Player player) {
        if (!canMove() || player.down || player.movingCore || player.teleportCooldown > 0) return;
        MapPoint destination = null;
        double nearest = 45;
        for (Player owner : players) {
            for (int i = 0; i < owner.teleportPads.size(); i++) {
                MapPoint partner = JobRules.teleportPartner(owner, i);
                if (partner == null) continue;
                MapPoint from = owner.teleportPads.get(i);
                double range = distance(player.x, player.y, from.x(), from.y());
                if (range > nearest || !GameMap.hasClearLine(player.x, player.y, from.x(), from.y())) continue;
                nearest = range;
                destination = partner;
            }
        }
        if (destination == null) return;
        if (!JobRules.canTeleportTo(destination, canOccupy(destination.x(), destination.y(), 5),
                player, players, enemies, coreX, coreY)) {
            gameEffects.feedback(player, "移動先が塞がっています");
            return;
        }
        player.x = destination.x(); player.y = destination.y();
        player.scoutDashRemaining = 0;
        player.teleportCooldown = 1.5;
        cancelAction(player);
    }

    private void handleDash(Player player, String[] parts) {
        if (parts.length < 2 || !canMove() || player.down) return;
        player.dashHeld = parts[1].equals("1") || parts[1].equalsIgnoreCase("true");
        if (!player.dashHeld) player.dashing = false;
    }

    private boolean hasHealingRescue() {
        return players.stream().anyMatch(owner -> owner.healRemaining > 0 && players.stream().anyMatch(target -> target.down
                && JobRules.insideHealingArea(target.x, target.y, owner.healX, owner.healY)
                && GameMap.hasClearLine(owner.healX, owner.healY, target.x, target.y, unlockedAreas)));
    }

    private void updateHealingAreas(double dt) {
        for (Player owner : players) {
            double activeTime = Math.min(dt, owner.healRemaining);
            owner.healRemaining = Math.max(0, owner.healRemaining - dt);
            if (activeTime <= 0) continue;
            for (Player target : players) {
                if (!JobRules.insideHealingArea(target.x, target.y, owner.healX, owner.healY)
                        || !GameMap.hasClearLine(owner.healX, owner.healY, target.x, target.y, unlockedAreas)) continue;
                if (target.down) revivePlayer(target);
                else target.hp = Math.min(JobRules.maxHp(target.job), target.hp + JobRules.HEAL_PER_SECOND * activeTime);
            }
        }
    }

    private void handleSecondaryFire(Player player, String[] parts) {
        if (parts.length < 4) return;
        if (parts[3].equals("0")) { player.secondaryFiring = false; player.secondaryHookPressHandled = false; player.stopSecondaryRailgun(); return; }
        if (!canMove() || !player.job.equals("attacker") || player.down || player.movingCore || player.selectedBuild != null) return;
        double x = Double.parseDouble(parts[1]), y = Double.parseDouble(parts[2]);
        if (!Double.isFinite(x) || !Double.isFinite(y)) return;
        player.secondaryAimX = clamp(x, 0, WORLD_W); player.secondaryAimY = clamp(y, 0, WORLD_H);
        boolean begins = !player.secondaryFiring;
        player.secondaryFiring = true;
        if (begins) combat.attackSecondary(player, player.secondaryAimX, player.secondaryAimY);
    }

    private void handleFire(Player player, String[] parts) {
        if (parts.length < 4 || !canMove() || player.down) return;
        double x = Double.parseDouble(parts[1]);
        double y = Double.parseDouble(parts[2]);
        if (!Double.isFinite(x) || !Double.isFinite(y)) return;
        boolean active = parts[3].equals("1") || parts[3].equalsIgnoreCase("true");
        if (JobRules.attackBlocked(player) || player.movingCore || player.selectedBuild != null && !DroneRules.controlling(player)) {
            player.firing = player.secondaryFiring = false;
            return;
        }
        boolean beginsPress = active && !player.firing;
        player.aimX = clamp(x, 0, WORLD_W);
        player.aimY = clamp(y, 0, WORLD_H);
        player.firing = active;
        if (!active) player.hookPressHandled = false;
        if (!active) player.stopRailgun();
        if (beginsPress && (player.cooldown <= 0 || DroneRules.controlling(player))) {
            combat.attackAt(player, player.aimX, player.aimY);
        }
    }

    private void startMatch(Player host, boolean debugMode) {
        resetWorld();
        this.debugMode = debugMode;
        if (debugMode) {
            host.credits = 500_000;
        }
        phase = GamePhase.PREPARING;
        prepTime = GameConfig.prepSeconds(1);
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

    private boolean isExplosionBossRound() {
        return round >= 25 && (round - 25) % 10 == 0;
    }

    private void beginRound() {
        round++;
        selectRoundSpawns(round);
        phase = GamePhase.WAVE;
        queuedEnemies = 6 + round * 3 - earlyRoundRelief();
        queuedBosses = isExplosionBossRound() ? 1 : round % 4 == 0 ? round / 4 : 0;
        if (round >= 40) {
            // Double the R40 population, then add 20 percentage points per round.
            queuedEnemies = (queuedEnemies * (10 + round - 40) + 4) / 5;
            if (!isExplosionBossRound()) queuedBosses *= 2;
        }
        queuedEnemies = (int) Math.round(queuedEnemies * 0.8);
        if (round >= 10 && round <= 24) {
            double extra = round <= 20 ? .1 : (25 - round) * .02;
            queuedEnemies = (int) Math.ceil(queuedEnemies * (1 + extra));
        }
        if (debugMode && round == 5) queuedBosses++;
        queuedBlueEnemies = round >= 40 ? random.nextInt(3) : 0;
        roundEnemyTotal = queuedEnemies + queuedBosses;
        explosionBossSpawned = false;
        wardenSpawned = false;
        // Reserve one simultaneous swarm within the regular population on selected late rounds.
        queuedTinyEnemies = round >= 40 && (round - 40) % 3 == 0
                ? Math.min(queuedEnemies, (int) Math.round((48 + (round - 40) * 4) * 0.8)) : 0;
        roundEvent = isExplosionBossRound() ? "boss_assault" : round % 4 == 3 ? "blackout"
                : round >= 5 && round % 4 == 1 ? "door_failure"
                : round % 4 == 0 ? "boss_assault" : "none";
        failedSpawnId = roundEvent.equals("door_failure")
                ? activeSpawnIds.get(random.nextInt(activeSpawnIds.size())) : null;
        if (roundEvent.equals("blackout") && !blackoutActive) startBlackout();
        spawnTimer = 8;
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
                player.reviveInvulnerableRemaining = JobRules.REVIVE_INVULNERABLE_DURATION;
                player.moveX = player.moveY = 0;
            }
            cancelAction(player);
        }
        if (round >= MAX_ROUNDS) {
            phase = GamePhase.WON;
            victoryMoveRemaining = 10;
            setNotice("すべての敵を倒しました。防衛成功です");
            return;
        }
        int reward = (int) Math.round((18 + round * 3) * GameConfig.goldMultiplier(round));
        players.forEach(player -> {
            var payout = GoldRewardRules.payout(reward, null, false, player.goldRewardRemainder, player.job);
            player.credits += payout.credits();
            player.goldRewardRemainder = payout.remainder();
        });
        phase = GamePhase.PREPARING;
        prepTime = GameConfig.prepSeconds(round + 1) + nextPrepBonusSeconds;
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
            case "entry-room", "recovery-room" -> 8;
            case "transit-hall" -> 10;
            case "armory-wing", "shotgun-room", "smg-room", "ricochet-room" -> 10;
            case "rifle-room", "sniper-room", "revolver-room", "lmg-room" -> 12;
            case "forest" -> 14;
            case "relay-gallery" -> 16;
            case "mine" -> 18;
            case "security-hall", "command-room", "heavy-arms-area" -> 20;
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
            if (phase == GamePhase.WON && (!player.human || player.down)) continue;
            if (player.missileControl) continue;
            if (DroneRules.controlling(player)) {
                Drone drone = player.drone;
                double nextX = clamp(drone.x + player.moveX * DroneRules.SPEED * dt, 7, WORLD_W - 7);
                double nextY = clamp(drone.y + player.moveY * DroneRules.SPEED * dt, 7, WORLD_H - 7);
                // Flight ignores placed equipment, but respects walls and locked areas.
                if (GameMap.canOccupy(nextX, drone.y, 5, unlockedAreas)) drone.x = nextX;
                if (GameMap.canOccupy(drone.x, nextY, 5, unlockedAreas)) drone.y = nextY;
                player.dashing = false;
                continue;
            }
            if (player.scoutDashRemaining > 0) {
                if (player.down || player.movingCore || player.selectedBuild != null
                        || player.railgunRemaining > 0 || player.railgunCharge > 0 || player.secondaryRailgunRemaining > 0 || player.secondaryRailgunCharge > 0) {
                    player.scoutDashRemaining = 0;
                } else {
                    double travel = JobRules.SCOUT_DASH_SPEED * Math.min(dt, player.scoutDashRemaining);
                    MapPoint next = JobRules.advanceScoutDash(player.x, player.y,
                            player.scoutDashDx, player.scoutDashDy, travel, (x, y) -> canOccupy(x, y, 5));
                    boolean blocked = distance(player.x, player.y, next.x(), next.y()) + .001 < travel;
                    player.x = next.x(); player.y = next.y();
                    player.scoutDashRemaining = blocked ? 0 : Math.max(0, player.scoutDashRemaining - dt);
                    if (player.scoutDashRemaining < 1e-9) player.scoutDashRemaining = 0;
                    player.dashing = false;
                    continue;
                }
            }
            double input = Math.hypot(player.moveX, player.moveY);
            if (player.dashExhausted && player.stamina >= 28) player.dashExhausted = false;
            player.dashing = player.railgunRemaining <= 0 && player.railgunCharge <= 0 && player.secondaryRailgunRemaining <= 0 && player.secondaryRailgunCharge <= 0 && !player.down && !player.movingCore
                    && player.dashHeld && !player.dashExhausted
                    && input > 0.12 && player.stamina > 0;
            if (player.dashing) {
                player.stamina = Math.max(0, player.stamina - JobRules.staminaDrain(player.job) * dt);
                if (player.stamina <= 0) {
                    player.dashExhausted = true;
                    player.dashing = false;
                }
            } else {
                player.stamina = Math.min(JobRules.staminaMax(player.job), player.stamina + JobRules.staminaRecovery(player.job) * dt);
            }
            double speed = player.down ? JobRules.downSpeed(player.job) : player.movingCore ? 82 : player.dashing ? JobRules.dashSpeed(player.job) : 155;
            if (player.railgunRemaining > 0 || player.secondaryRailgunRemaining > 0) speed = 155 * .3;
            else if (player.railgunCharge > 0 || player.secondaryRailgunCharge > 0) speed = 155 * .6;
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

    private void updateMedbay(double dt) {
        boolean preparing = phase == GamePhase.PREPARING;
        double healPerSecond = preparing ? GameConfig.MEDBAY_PREP_HEAL_PER_SECOND
                : GameConfig.MEDBAY_HEAL_PER_SECOND;
        for (Player player : players) {
            double healingTime = preparing ? dt : Math.max(0, dt - player.medbayDamageDelay);
            player.medbayDamageDelay = Math.max(0, player.medbayDamageDelay - dt);
            if (healingTime > 0 && isMedbayHealing(player)) {
                player.hp = Math.min(JobRules.maxHp(player.job), player.hp + healPerSecond * healingTime);
            }
        }
    }

    boolean isMedbayHealing(Player player) {
        return canUseFacilities() && !player.down && player.hp < JobRules.maxHp(player.job)
                && (phase == GamePhase.PREPARING || player.medbayDamageDelay <= 0)
                && GameMap.MEDBAYS.stream().anyMatch(station -> isPointUnlocked(station.x(), station.y())
                        && canInteract(player, station.x(), station.y(), GameConfig.MEDBAY_RANGE));
    }

    private void updateRevives(double dt) {
        for (Player player : players) {
            Player target = player.down || DroneRules.controlling(player) ? null : players.stream()
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
            if (player.actionProgress >= JobRules.reviveSeconds(player.job)) {
                revivePlayer(target);
                cancelAction(player);
            }
        }
    }

    private void revivePlayer(Player target) {
        target.down = false;
        target.hp = 45;
        target.reviveInvulnerableRemaining = JobRules.REVIVE_INVULNERABLE_DURATION;
        target.moveX = target.moveY = 0;
        cancelAction(target);
        for (Player rescuer : players) {
            if (target.id.equals(rescuer.actionTarget)) cancelAction(rescuer);
        }
        setNotice(target.name + "が復帰しました");
    }

    private void updateFactories(double dt) {
        for (MaterialFactory factory : factories) {
            int produced = factory.produce(dt);
            for (int i = 0; i < produced; i++) {
                List<MapPoint> emptyTiles = new ArrayList<>();
                for (int row = -1; row <= 1; row++) {
                    for (int column = -1; column <= 1; column++) {
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
            node.respawnTimer = ResourceRules.respawnSeconds(node.type, node.requiredArea, node.id);
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
                            && (!drop.type.equals("medkit") || player.medkits < GameConfig.MEDKIT_CAPACITY)
                            && (!player.id.equals(drop.droppedBy) || drop.ownerLeft)
                            && GameMap.hasClearLine(player.x, player.y, drop.x, drop.y)
                            && distance(player.x, player.y, drop.x, drop.y) <= 30)
                    .findFirst().orElse(null);
            if (collector == null) continue;
            int collected = drop.type.equals("medkit")
                    ? InventoryDropRules.pickupAmount(drop.amount, collector.medkits, GameConfig.MEDKIT_CAPACITY)
                    : drop.amount;
            if (drop.type.equals("medkit")) collector.medkits += collected;
            else addResource(collector, drop.type, collected);
            drop.amount -= collected;
            if (drop.amount == 0) drop.pickupDelay = -1;
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
                String bossType = isExplosionBossRound() && !explosionBossSpawned ? "explosionBoss"
                        : (debugMode ? round == 5 : WardenRules.appearsInRound(round)) && !wardenSpawned ? "warden"
                        : round >= 40 ? "titan" : round >= 24 ? "warlord" : "boss";
                spawnEnemy(bossType, spawn);
                queuedBosses--;
            } else if (queuedEnemies > 0) {
                spawnEnemy(queuedBlueEnemies > 0 ? "blueAce" : selectEnemyType(spawn), spawn);
                if (queuedBlueEnemies > 0) queuedBlueEnemies--;
                queuedEnemies--;
            }
            double eventMultiplier = roundEvent.equals("door_failure")
                    && spawn.id().equals(failedSpawnId) ? 0.58 : 1;
            // Give R1-R25 more breathing room, including during door failures.
            double minimumInterval = 0.28 + 0.42 * earlyRoundReliefScale();
            spawnTimer = Math.max(minimumInterval,
                    (1.15 - round * 0.045 + earlyRoundRelief() * 0.04) * eventMultiplier);
        }
    }

    private int earlyRoundRelief() {
        // Keep the gentle opening, then ease crowds through R25 and taper off by R35.
        int openingRelief = switch (round) {
            case 1 -> 3;
            case 2 -> 4;
            case 3 -> 5;
            case 4, 5 -> 6;
            case 6 -> 5;
            default -> Math.max(0, Math.min(4, 11 - round));
        };
        int midgameRelief = (int) Math.round((6 + round * 3) * 0.15 * earlyRoundReliefScale());
        return Math.max(openingRelief, midgameRelief);
    }

    private double earlyRoundReliefScale() {
        return round <= 25 ? 1 : Math.max(0, (35 - round) / 10.0);
    }

    private String selectEnemyType(SpawnPoint spawn) {
        if (round >= 14 && random.nextDouble() < .035) return "blackout";
        if (round >= 10 && random.nextDouble() < .06) return "seeker";
        if (round >= 6 && random.nextDouble() < .025) return "gilded";
        if (round >= 22 && random.nextDouble() < .025) return "carrier";
        // Reserve a growing share for elites, retaining each entrance's original mix.
        if (round >= 15 && random.nextDouble() < .10) return "bomber";
        double eliteRoll = random.nextDouble();
        double eliteChance = 0;
        if (round >= 34 && eliteRoll < (eliteChance += 0.12)) return "champion";
        if (round >= 26 && eliteRoll < (eliteChance += 0.14)) return "siege";
        if (round >= 18 && eliteRoll < (eliteChance += 0.16)) return "hunter";
        if (round >= 18 && eliteRoll < (eliteChance += 0.16)) return "ghost";
        if (round >= 10 && eliteRoll < (eliteChance += 0.18)) return "armored";
        if (round >= 12 && eliteRoll < (eliteChance += round <= 25 ? 0.04 : 0.08)) return "artillery";
        if (round >= 7 && eliteRoll < (eliteChance += Math.min(0.10, 0.04 + (round - 7) * 0.03))) return "shield";
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

    private SpawnPoint explosionBossSpawn(SpawnPoint fallback) {
        SpawnPoint deepest = fallback;
        double greatestDepth = -1;
        for (SpawnPoint candidate : GameMap.SPAWN_POINTS) {
            // Keep supply pockets safe, while letting debug previews use unlocked combat areas.
            if (!interiorSpawnEligible(candidate, Math.max(round, 25))) continue;
            List<MapPoint> path = findPath(candidate.x(), candidate.y(), CORE_X, CORE_Y, 17, false);
            if (path.isEmpty()) continue;
            MapPoint end = path.get(path.size() - 1);
            // The pathfinder may return a partial route for an unreachable destination.
            if (distance(end.x(), end.y(), CORE_X, CORE_Y) > GameMap.TILE_SIZE
                    || !canEnemyTravel(end.x(), end.y(), CORE_X, CORE_Y)) continue;
            double depth = 0, x = candidate.x(), y = candidate.y();
            for (MapPoint point : path) {
                depth += distance(x, y, point.x(), point.y());
                x = point.x(); y = point.y();
            }
            depth += distance(x, y, CORE_X, CORE_Y);
            if (depth > greatestDepth) {
                greatestDepth = depth;
                deepest = candidate;
            }
        }
        return deepest;
    }

    private void spawnEnemy(String type, SpawnPoint spawn) {
        if (type.equals("explosionBoss")) spawn = explosionBossSpawn(spawn);
        double hp;
        double speed;
        double damage;
        int reward;
        switch (type) {
            case "blackout" -> { hp = 180 + round * 12; speed = 100; damage = 14 + round * .6; reward = 90; }
            case "seeker" -> { hp = 100 + round * 9; speed = 70; damage = 22 + round * .4; reward = 65; }
            case "gilded" -> { hp = 120 + round * 10; speed = 82; damage = 12 + round; reward = 1200; }
            case "blueAce" -> { hp = 2600 + round * 70; speed = 320; damage = 55; reward = 900; }
            case "carrier" -> { hp = 500 + round * 20; speed = 72; damage = 22 + round * .5; reward = 120; }
            case "warden" -> {
                hp = (1600 + round * 50) * 10;
                speed = 44;
                damage = 38 + round * .6;
                reward = 600;
                wardenSpawned = true;
            }
            case "explosionBoss" -> {
                hp = (2200 + round * 60) * 15;
                speed = 24;
                damage = 0;
                reward = 0;
                explosionBossSpawned = true;
            }
            case "bomber" -> {
                hp = 45 + round * 4;
                speed = 90 + round * 2;
                damage = 55 + round * 2;
                reward = 25;
            }
            case "artillery" -> {
                hp = 65 + round * 5;
                speed = 42 + round * .6;
                damage = 18 + round * .8;
                reward = 45;
            }
            case "shield" -> {
                hp = 100 + round * 9;
                speed = 32 + round * .6;
                damage = 14 + round;
                reward = 35;
            }
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
            case "hunter", "ghost" -> {
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
        // Retain route metadata for snapshots/threat scoring; movement uses the shared field.
        if (GameMap.spawnArea(spawn) != null) spawn = new SpawnPoint(spawn.id(), spawn.name(),
                spawn.x(), spawn.y(), spawn.lane(), spawn.enemyBias(), spawn.speedMultiplier(),
                spawn.targetPriority(), List.of(new MapPoint(spawn.x(), spawn.y()), new MapPoint(coreX, coreY)));
        enemies.add(new Enemy(nextEnemyId++, type, spawn, hp * 2, speed * 0.5, damage,
                (int) Math.round(reward * 2.5 * GameConfig.goldMultiplier(round))));
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
            } else if (BuildingRules.isTurret(defense.type) && defense.cooldown <= 0) {
                Enemy target = enemies.stream()
                        .filter(enemy -> enemy.hp > 0 && distance(slot.x, slot.y, enemy.x, enemy.y) <= (defense.type.equals("overclockSilver") ? 480 : defense.type.equals("silverTurret") ? 380 : 300))
                        .filter(enemy -> GameMap.hasClearLine(slot.x, slot.y, enemy.x, enemy.y, unlockedAreas))
                        .min(Comparator.comparingDouble(enemy -> distance(enemy.x, enemy.y, coreX, coreY)))
                        .orElse(null);
                if (target != null) {
                    double tinyHitChance = switch (defense.type) {
                        case "overclockSilver" -> .8;
                        case "silverTurret" -> .4;
                        case "copperTurret" -> .3;
                        default -> .2;
                    };
                    boolean hit = !target.type.equals("tiny") || random.nextDouble() < tinyHitChance;
                    double turretDamage = (17+round*.5)*(defense.type.equals("overclockSilver") ? 14 : defense.type.equals("silverTurret") ? 3.5 : defense.type.equals("copperTurret") ? 2 : 1);
                    turretDamage = target.shieldedDamage(turretDamage, slot.x, slot.y);
                    double dealt = hit ? combat.damageEnemy(target, turretDamage, null) : 0;
                    double missAngle = Math.atan2(target.y - slot.y, target.x - slot.x) + Math.PI / 2;
                    gameEffects.hit("trap", "turret", slot.x, slot.y,
                            target.x + (hit ? 0 : Math.cos(missAngle) * 16),
                            target.y + (hit ? 0 : Math.sin(missAngle) * 16),
                            dealt, target.hp <= 0, 0, false, hit ? target.id : null);
                    defense.cooldown = defense.type.equals("overclockSilver") ? .15 : defense.type.equals("silverTurret") ? .45 : .7;
                }
            } else if (defense.type.equals("mine")) {
                Enemy trigger = enemies.stream()
                        .filter(enemy -> enemy.hp > 0 && distance(slot.x, slot.y, enemy.x, enemy.y) < 58)
                        .findFirst().orElse(null);
                if (trigger != null) {
                    for (Enemy enemy : enemies) {
                        if (enemy.hp > 0 && distance(slot.x, slot.y, enemy.x, enemy.y) < 120) {
                            double dealt = combat.damageEnemy(enemy, 450, null);
                            gameEffects.hit("trap", "mine", slot.x, slot.y, enemy.x, enemy.y,
                                    dealt, enemy.hp <= 0, 0, false, enemy.id);
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
        updateArtilleryShells(dt);
        if (!enemies.isEmpty()) enemyNavigation.prepare(coreX, coreY, unlockedAreas);
        long remaining = queuedEnemies + queuedBosses + enemies.stream()
                .filter(e -> e.hp > 0 && !e.type.equals("explosionBoss")).count();
        List<Enemy> defeatedExplosionBosses = new ArrayList<>();
        List<Enemy> releasingCarriers = new ArrayList<>();
        for (Enemy enemy : enemies) {
            if (enemy.hp <= 0) {
                if (enemy.type.equals("explosionBoss") && !enemy.offspringSpawned) defeatedExplosionBosses.add(enemy);
                continue;
            }
            if (enemy.type.equals("blackout") && !enemy.powerCut
                    && EnemyProjectileSystem.target(enemy, players, EnemyProjectileSystem.BLACKOUT_RANGE, unlockedAreas) != null)
                enemy.powerCut = true;
            boolean frozen = enemy.frozenRemaining > 0;
            enemy.frozenRemaining = Math.max(0, enemy.frozenRemaining - dt);
            if (enemy.type.equals("explosionBoss")) {
                updateExplosionBoss(enemy, dt, remaining);
                if (enemy.exploded) defeatedExplosionBosses.add(enemy);
                continue;
            }
            if (enemy.hookPulled || frozen) continue;
            if (updateBossCharge(enemy, dt)) continue;
            if (SpecialEnemyRules.carriesHunters(enemy)) {
                Player witness = players.stream().filter(p -> SpecialEnemyRules.canRelease(enemy, p,
                        GameMap.hasClearLine(enemy.x, enemy.y, p.x, p.y, unlockedAreas))).findFirst().orElse(null);
                enemy.releaseProgress = witness == null ? 0 : enemy.releaseProgress + dt;
                if (enemy.releaseProgress >= 1.5) {
                    enemy.offspringSpawned = true;
                    enemy.bagHp = 0;
                    releasingCarriers.add(enemy);
                }
            }
            enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
            if (enemy.type.equals("seeker")) {
                Player target = EnemyProjectileSystem.target(enemy, players, EnemyProjectileSystem.SHOT_RANGE, unlockedAreas);
                if (target != null) {
                    enemy.faceToward(target.x, target.y);
                    if (enemy.attackCooldown <= 0) {
                        enemyProjectiles.add(new EnemyProjectileSystem.Shot(nextProjectileId++, enemy, target));
                        enemy.attackCooldown = 2.5;
                    }
                    if (distance(enemy.x, enemy.y, target.x, target.y) > 260)
                        moveEnemyToward(enemy, target.x, target.y, enemy.speed * enemy.slow * dt);
                    continue;
                }
            }
            enemy.pathTimer -= dt;
            updateEnemyWander(enemy, dt);
            if (enemy.type.equals("artillery") && updateArtillery(enemy, dt)) continue;
            double moveSpeed = enemy.speed * (enemy.warden == null ? 1
                    : WardenRules.movementMultiplier(WardenRules.phase(enemy.hp, enemy.maxHp)));
            if (enemy.warden != null && WardenCombatSystem.update(enemy, dt, wardenTarget(enemy), wardenWorld)) continue;

            TrapSlot barricade = trapSlots.stream()
                    .filter(slot -> slot.defense != null
                            && BuildingRules.blocksMovement(slot.defense.type)
                            && distance(enemy.x, enemy.y, slot.x, slot.y) < 52)
                    .min(Comparator.comparingDouble(slot -> distance(enemy.x, enemy.y, slot.x, slot.y)))
                    .orElse(null);
            if (barricade != null) {
                attackDefense(enemy, barricade);
                continue;
            }

            Decoy decoyTarget = DecoyRules.target(enemy, decoys,
                    (x, y) -> GameMap.hasClearLine(enemy.x, enemy.y, x, y, unlockedAreas));
            if (decoyTarget != null) {
                enemy.navigationTimer = 0;
                enemy.faceToward(decoyTarget.x, decoyTarget.y);
                if (distance(enemy.x, enemy.y, decoyTarget.x, decoyTarget.y) <= 36) {
                    if (enemy.attackCooldown <= 0) {
                        decoyTarget.hp -= enemy.damage;
                        enemy.attackCooldown = .9;
                    }
                } else moveEnemyToward(enemy, decoyTarget.x, decoyTarget.y, moveSpeed * enemy.slow * dt);
                continue;
            }
            Player playerTarget = enemyNavigation.visiblePlayer(enemy, players, dt);
            Player droneTarget = DroneRules.target(enemy, players);
            if (droneTarget != null && (playerTarget == null || !playerTarget.job.equals("tank"))) {
                Drone drone = droneTarget.drone;
                enemy.navigationTimer = 0;
                enemy.faceToward(drone.x, drone.y);
                if (distance(enemy.x, enemy.y, drone.x, drone.y) <= 36
                        && GameMap.hasClearLine(enemy.x, enemy.y, drone.x, drone.y)) {
                    if (enemy.attackCooldown <= 0) {
                        damageDrone(droneTarget, enemy.damage);
                        enemy.attackCooldown = .9;
                    }
                } else moveEnemyToward(enemy, drone.x, drone.y, moveSpeed * enemy.slow * dt);
                continue;
            }

            advanceEnemyRoute(enemy);
            if (enemy.isBoss() && enemy.warden == null) {
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
            TrapSlot defenseTarget = nearestDefense(enemy, defenseRange);
            boolean preferDefense = enemy.targetPriority.equals("defenses")
                    && (playerTarget == null || !playerTarget.job.equals("tank"));
            if (preferDefense && defenseTarget != null || playerTarget == null) {
                playerTarget = null;
            } else if (playerTarget != null) {
                defenseTarget = null;
            }

            if (defenseTarget != null) {
                enemy.navigationTimer = 0;
                double targetDistance = distance(enemy.x, enemy.y, defenseTarget.x, defenseTarget.y);
                if (targetDistance <= 38) attackDefense(enemy, defenseTarget);
                else moveEnemyToward(enemy, defenseTarget.x, defenseTarget.y, moveSpeed * enemy.slow * dt);
                continue;
            }
            if (playerTarget != null) {
                enemy.navigationTimer = 0;
                enemy.faceToward(playerTarget.x, playerTarget.y);
                double targetDistance = distance(enemy.x, enemy.y, playerTarget.x, playerTarget.y);
                if (targetDistance <= 36) {
                    if (!GameMap.hasClearLine(enemy.x, enemy.y, playerTarget.x, playerTarget.y)) continue;
                    if (enemy.attackCooldown <= 0) {
                        if (!JobRules.avoidsContactDamage(playerTarget, enemy)) damagePlayer(playerTarget, enemy.damage);
                        enemy.attackCooldown = 0.9;
                    }
                } else {
                    // Follow the last visible position until the next perception check.
                    // A player ducking behind a wall must not trigger per-enemy path searches.
                    moveEnemyDirect(enemy, enemy.visiblePlayerX, enemy.visiblePlayerY, moveSpeed * enemy.slow * dt);
                }
                continue;
            }

            if (distance(enemy.x, enemy.y, coreX, coreY) <= 72
                    && GameMap.hasClearLine(enemy.x, enemy.y, coreX, coreY)) {
                enemy.faceToward(coreX, coreY);
                if (enemy.attackCooldown <= 0) {
                    damageCore(enemy.damage);
                    enemy.attackCooldown = 0.9;
                }
            } else {
                MapPoint target = enemyNavigation.coreTarget(enemy, dt);
                moveEnemyDirect(enemy, target.x(), target.y(),
                        moveSpeed * enemy.slow * dt);
            }
        }
        // Add offspring after iteration for both combat deaths and timed explosions.
        for (Enemy boss : defeatedExplosionBosses) spawnExplosionBossRunners(boss);
        for (Enemy carrier : releasingCarriers) {
            SpawnPoint source = GameMap.spawnById(carrier.spawnId);
            SpawnPoint release = new SpawnPoint(source.id(), source.name(), carrier.x, carrier.y, source.lane(),
                    source.enemyBias(), source.speedMultiplier(), source.targetPriority(), List.of(new MapPoint(coreX, coreY)));
            for (int i = 0; i < SpecialEnemyRules.HUNTERS; i++) spawnEnemy("hunter", release);
            roundEnemyTotal += SpecialEnemyRules.HUNTERS;
        }
    }

    private boolean updateBossCharge(Enemy enemy, double dt) {
        if (!enemy.type.equals("boss")) return false;
        return BossChargeSystem.update(enemy, dt, new BossChargeSystem.World() {
            public List<Player> players() { return players; }
            public List<TrapSlot> slots() { return trapSlots; }
            public boolean canOccupy(double x, double y) { return GameSession.this.canOccupy(x, y, 17); }
            public boolean visible(Enemy e, Player p) {
                return GameMap.hasClearLine(e.x, e.y, p.x, p.y, unlockedAreas);
            }
            public void hit(Player p, double amount) { damagePlayer(p, amount); }
            public void hit(TrapSlot slot, double amount) {
                slot.defense.hp -= amount;
                if (slot.defense.hp <= 0) slot.defense = null;
            }
        });
    }

    private void spawnExplosionBossRunners(Enemy boss) {
        if (boss.offspringSpawned) return;
        boss.offspringSpawned = true;
        SpawnPoint entrance = GameMap.spawnById(boss.spawnId);
        SpawnPoint remains = new SpawnPoint(entrance.id(), entrance.name(), boss.x, boss.y,
                entrance.lane(), entrance.enemyBias(), entrance.speedMultiplier(), entrance.targetPriority(),
                List.of(new MapPoint(coreX, coreY)));
        for (int i = 0; i < 5; i++) spawnEnemy("runner", remains);
    }

    private MapPoint wardenTarget(Enemy enemy) {
        if (enemy.warden.action != WardenRules.Action.IDLE || enemy.specialCooldown > 0
                || WardenRules.phase(enemy.hp, enemy.maxHp) < 2) return null;
        Decoy decoy = DecoyRules.target(enemy, decoys,
                (x, y) -> GameMap.hasClearLine(enemy.x, enemy.y, x, y, unlockedAreas));
        if (decoy != null) return new MapPoint(decoy.x, decoy.y);
        Player player = nearestPlayer(enemy, 520);
        Player drone = DroneRules.target(enemy, players);
        if (drone != null && (player == null || !player.job.equals("tank")))
            return new MapPoint(drone.drone.x, drone.drone.y);
        return player == null ? new MapPoint(coreX, coreY) : new MapPoint(player.x, player.y);
    }

    private void updateExplosionBoss(Enemy enemy, double dt, long remaining) {
        enemy.pathTimer -= dt;
        if (enemy.fuse < 0 && SpecialEnemyRules.armsExplosion(remaining, roundEnemyTotal)) {
            enemy.fuse = GameConfig.EXPLOSION_BOSS_FUSE_SECONDS;
        }
        if (enemy.fuse >= 0) {
            enemy.fuse = Math.max(0, enemy.fuse - dt);
            if (enemy.fuse <= 1e-9) {
                enemy.fuse = 0;
                enemy.exploded = true;
                enemy.hp = 0;
                double radius = GameConfig.EXPLOSION_BOSS_BLAST_RADIUS;
                gameEffects.explosion(enemy.x, enemy.y, radius);
                for (Player target : players) {
                    if (target.drone != null && target.drone.active
                            && SpecialEnemyRules.overlapsBlast(enemy.x, enemy.y, target.drone.x, target.drone.y, 12, radius))
                        damageDrone(target, GameConfig.EXPLOSION_BOSS_DAMAGE);
                    if (!target.down && SpecialEnemyRules.overlapsBlast(enemy.x, enemy.y, target.x, target.y, 12, radius)) {
                        damagePlayer(target, GameConfig.EXPLOSION_BOSS_DAMAGE);
                    }
                }
                for (TrapSlot slot : trapSlots) {
                    if (slot.defense != null && SpecialEnemyRules.overlapsBlast(enemy.x, enemy.y, slot.x, slot.y, 20, radius)) {
                        slot.defense.hp -= GameConfig.EXPLOSION_BOSS_DEFENSE_DAMAGE;
                        if (slot.defense.hp <= 0) slot.defense = null;
                    }
                }
                factories.removeIf(factory -> SpecialEnemyRules.overlapsBlast(enemy.x, enemy.y, factory.x, factory.y, 20, radius));
                if (SpecialEnemyRules.overlapsBlast(enemy.x, enemy.y, coreX, coreY, 24, radius))
                    damageCore(GameConfig.EXPLOSION_BOSS_DAMAGE);
                for (Decoy decoy : decoys)
                    if (distance(enemy.x, enemy.y, decoy.x, decoy.y) <= radius)
                        decoy.hp -= GameConfig.EXPLOSION_BOSS_DAMAGE;
                return;
            }
        }
        if (enemy.hookPulled) return;
        Player target = nearestPlayer(enemy, WORLD_W + WORLD_H);
        Decoy decoyTarget = DecoyRules.target(enemy, decoys,
                (x, y) -> GameMap.hasClearLine(enemy.x, enemy.y, x, y, unlockedAreas));
        if (decoyTarget != null) {
            enemy.faceToward(decoyTarget.x, decoyTarget.y);
            moveEnemyToward(enemy, decoyTarget.x, decoyTarget.y, enemy.speed * enemy.slow * dt);
            return;
        }
        Player droneOwner = DroneRules.target(enemy, players);
        if (droneOwner != null && (target == null || !target.job.equals("tank"))) {
            enemy.faceToward(droneOwner.drone.x, droneOwner.drone.y);
            moveEnemyToward(enemy, droneOwner.drone.x, droneOwner.drone.y, enemy.speed * enemy.slow * dt);
            return;
        }
        if (target != null) {
            enemy.faceToward(target.x, target.y);
            if (distance(enemy.x, enemy.y, target.x, target.y) > 36)
                moveEnemyToward(enemy, target.x, target.y, enemy.speed * enemy.slow * dt);
        }
    }

    private boolean inBomberBlast(Enemy enemy, double x, double y, double radius) {
        return distance(enemy.x, enemy.y, x, y) <= radius
                && GameMap.hasClearLine(enemy.x, enemy.y, x, y);
    }

    private void explodeBomber(Enemy bomber) {
        if (bomber.exploded) return;
        bomber.exploded = true;
        bomber.hp = 0;
        double radius = GameConfig.BOMBER_BLAST_RADIUS;
        gameEffects.explosion(bomber.x, bomber.y, radius);
        for (Player target : players) {
            if (target.drone != null && target.drone.active && target.drone.attackers.contains(bomber.id)
                    && inBomberBlast(bomber, target.drone.x, target.drone.y, radius)) damageDrone(target, bomber.damage);
            if (!target.down && inBomberBlast(bomber, target.x, target.y, radius))
                damagePlayer(target, JobRules.maxHp(target.job) * GameConfig.BOMBER_PLAYER_DAMAGE_FRACTION);
        }
        for (TrapSlot slot : trapSlots) {
            if (slot.defense != null && inBomberBlast(bomber, slot.x, slot.y, radius)) {
                slot.defense.hp -= bomber.damage * 2;
                if (slot.defense.hp <= 0) slot.defense = null;
            }
        }
        if (inBomberBlast(bomber, coreX, coreY, radius)) damageCore(bomber.damage);
        for (Decoy decoy : decoys)
            if (inBomberBlast(bomber, decoy.x, decoy.y, radius)) decoy.hp -= bomber.damage;
    }

    private boolean updateArtillery(Enemy enemy, double dt) {
        enemy.specialCooldown = Math.max(0, enemy.specialCooldown - dt);
        Decoy decoyTarget = DecoyRules.target(enemy, decoys, (x, y) -> canArtilleryAim(enemy, x, y));
        if (decoyTarget != null) {
            if (distance(enemy.x, enemy.y, decoyTarget.x, decoyTarget.y) < 110) return false;
            enemy.faceToward(decoyTarget.x, decoyTarget.y);
            if (enemy.specialCooldown <= 0) {
                artilleryShells.add(new ArtilleryShell(enemy.x, enemy.y, decoyTarget.x, decoyTarget.y, enemy.damage * 3, enemy.id));
                enemy.specialCooldown = GameConfig.ARTILLERY_COOLDOWN;
            }
            return true;
        }
        Player target = players.stream()
                .filter(player -> !player.down && !JobRules.concealedFrom(player, enemy) && canArtilleryAim(enemy, player.x, player.y))
                .min(Comparator.comparingInt(JobRules::targetPriority)
                        .thenComparingDouble(player -> distance(enemy.x, enemy.y, player.x, player.y)))
                .orElse(null);
        Player droneOwner = DroneRules.target(enemy, players);
        if (droneOwner != null && (target == null || !target.job.equals("tank"))) {
            Drone drone = droneOwner.drone;
            enemy.faceToward(drone.x, drone.y);
            if (canArtilleryAim(enemy, drone.x, drone.y)) {
                if (distance(enemy.x, enemy.y, drone.x, drone.y) < 110) {
                    if (distance(enemy.x, enemy.y, drone.x, drone.y) <= 36 && enemy.attackCooldown <= 0) {
                        damageDrone(droneOwner, enemy.damage);
                        enemy.attackCooldown = .9;
                    } else moveEnemyToward(enemy, drone.x, drone.y, enemy.speed * dt);
                } else if (enemy.specialCooldown <= 0) {
                    artilleryShells.add(new ArtilleryShell(enemy.x, enemy.y, drone.x, drone.y, enemy.damage * 3, enemy.id));
                    enemy.specialCooldown = GameConfig.ARTILLERY_COOLDOWN;
                }
            } else moveEnemyToward(enemy, drone.x, drone.y, enemy.speed * dt);
            return true;
        }
        TrapSlot defense = target == null ? trapSlots.stream()
                .filter(slot -> slot.defense != null && !slot.defense.type.equals("mine")
                        && !BuildingRules.isTurret(slot.defense.type)
                        && canArtilleryAim(enemy, slot.x, slot.y))
                .min(Comparator.comparingDouble(slot -> distance(enemy.x, enemy.y, slot.x, slot.y)))
                .orElse(null) : null;
        double x = target != null ? target.x : defense != null ? defense.x : coreX;
        double y = target != null ? target.y : defense != null ? defense.y : coreY;
        if (!canArtilleryAim(enemy, x, y)) return false;
        // At close range retain ordinary movement/melee, so rushing the shooter is useful.
        if (distance(enemy.x, enemy.y, x, y) < 110) return false;
        enemy.faceToward(x, y);
        if (enemy.specialCooldown <= 0) {
            artilleryShells.add(new ArtilleryShell(enemy.x, enemy.y, x, y, enemy.damage * 3, enemy.id));
            enemy.specialCooldown = GameConfig.ARTILLERY_COOLDOWN;
        }
        return true;
    }

    private boolean canArtilleryAim(Enemy enemy, double x, double y) {
        return distance(enemy.x, enemy.y, x, y) <= GameConfig.ARTILLERY_RANGE
                && GameMap.hasClearLine(enemy.x, enemy.y, x, y);
    }

    private void updateArtilleryShells(double dt) {
        var iterator = artilleryShells.iterator();
        while (iterator.hasNext()) {
            ArtilleryShell shell = iterator.next();
            shell.remaining -= dt;
            if (shell.remaining > 1e-9) continue;
            iterator.remove();
            for (Player player : players) {
                if (player.drone != null && player.drone.active && player.drone.attackers.contains(shell.enemyId)
                        && inArtilleryBlast(shell, player.drone.x, player.drone.y)) damageDrone(player, shell.damage);
                if (inArtilleryBlast(shell, player.x, player.y)) damagePlayer(player, shell.damage);
            }
            for (TrapSlot slot : trapSlots) {
                if (slot.defense != null
                        && !BuildingRules.isTurret(slot.defense.type)
                        && inArtilleryBlast(shell, slot.x, slot.y)) {
                    slot.defense.hp -= shell.damage;
                    if (slot.defense.hp <= 0) slot.defense = null;
                }
            }
            if (inArtilleryBlast(shell, coreX, coreY)) damageCore(shell.damage);
            for (Decoy decoy : decoys)
                if (inArtilleryBlast(shell, decoy.x, decoy.y)) decoy.hp -= shell.damage;
            events.broadcast("{\"type\":\"effect\",\"effect\":\"acid-impact\",\"x\":"
                    + roundOne(shell.x) + ",\"y\":" + roundOne(shell.y)
                    + ",\"radius\":" + GameConfig.ARTILLERY_BLAST_RADIUS + "}");
        }
    }

    private boolean inArtilleryBlast(ArtilleryShell shell, double x, double y) {
        return distance(shell.x, shell.y, x, y) <= GameConfig.ARTILLERY_BLAST_RADIUS
                && GameMap.hasClearLine(shell.x, shell.y, x, y);
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
                        && !(enemy.type.equals("artillery")
                            && BuildingRules.isTurret(slot.defense.type))
                        && distance(enemy.x, enemy.y, slot.x, slot.y) <= range)
                .min(Comparator.comparingDouble(slot -> distance(enemy.x, enemy.y, slot.x, slot.y)))
                .orElse(null);
    }

    private Player nearestPlayer(Enemy enemy, double range) {
        return players.stream()
                .filter(player -> !player.down && !JobRules.concealedFrom(player, enemy)
                        && distance(enemy.x, enemy.y, player.x, player.y) <= range)
                .min(Comparator.comparingInt(JobRules::targetPriority)
                        .thenComparingDouble(player -> distance(enemy.x, enemy.y, player.x, player.y)))
                .orElse(null);
    }

    private void attackDefense(Enemy enemy, TrapSlot slot) {
        enemy.faceToward(slot.x, slot.y);
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
        if (enemy.frozenRemaining > 0) return;
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
        moveEnemyDirect(enemy, targetX, targetY, amount);
    }

    private void moveEnemyDirect(Enemy enemy, double targetX, double targetY, double amount) {
        if (enemy.frozenRemaining > 0) return;
        double dx = targetX - enemy.x;
        double dy = targetY - enemy.y;
        enemy.faceToward(targetX, targetY);
        double length = Math.max(1, Math.hypot(dx, dy));
        amount = Math.min(amount, length);
        double nextX = clamp(enemy.x + dx / length * amount, 18, WORLD_W - 18);
        double nextY = clamp(enemy.y + dy / length * amount, 18, WORLD_H - 18);
        if (canOccupy(nextX, enemy.y, 17)) enemy.x = nextX;
        if (canOccupy(enemy.x, nextY, 17)) enemy.y = nextY;
    }

    private void damageCore(double rawDamage) {
        double damage = rawDamage * Math.max(0.55, 1 - coreDefenseLevel * 0.1);
        if (teamBuffAt(coreX, coreY)) damage *= UpgradeRules.TEAM_DEFENSE;
        if (coreShield > 0) {
            double absorbed = Math.min(coreShield, damage);
            coreShield -= absorbed;
            damage -= absorbed;
        }
        coreHp = Math.max(0, coreHp - damage);
    }

    // Later boss spawning and artillery dodging still require a body-safe segment.
    // CORE steering uses its own shared field; local movement retains axis steps.
    private boolean canEnemyTravel(double fromX, double fromY, double toX, double toY) {
        return laterFeatureTravel.canTravel(fromX, fromY, toX, toY, 17, unlockedAreas);
    }

    private boolean dodgeArtillery(Player bot) {
        boolean threatened = artilleryShells.stream().anyMatch(shell -> shell.remaining <= 1.2
                // Keep avoiding the shell until impact, even just outside its blast.
                && distance(bot.x, bot.y, shell.x, shell.y) <= GameConfig.ARTILLERY_BLAST_RADIUS + 100
                && GameMap.hasClearLine(shell.x, shell.y, bot.x, bot.y));
        if (!threatened) return false;
        double bestScore = Double.NEGATIVE_INFINITY, bestX = bot.x, bestY = bot.y;
        for (int direction = 0; direction < 8; direction++) {
            double angle = direction * Math.PI / 4;
            double x = bot.x + Math.cos(angle) * 100, y = bot.y + Math.sin(angle) * 100;
            if (!canOccupy(x, y, 12) || !canEnemyTravel(bot.x, bot.y, x, y)) continue;
            double score = artilleryShells.stream()
                    .mapToDouble(shell -> distance(x, y, shell.x, shell.y)).min().orElse(0);
            if (score > bestScore) { bestScore = score; bestX = x; bestY = y; }
        }
        if (!Double.isFinite(bestScore)) return false;
        // This segment is already body-safe. Avoid the old tile route's detour
        // so reverting general pathfinding does not weaken artillery evasion.
        double length = Math.max(1, distance(bot.x, bot.y, bestX, bestY));
        bot.dashHeld = false;
        steerBot(bot, (bestX - bot.x) / length, (bestY - bot.y) / length);
        return true;
    }

    private void updateBots(double dt) {
        for (Player bot : players) {
            if (bot.human) continue;
            bot.firing = bot.secondaryFiring = false;
            updateBotWander(bot, dt);
            bot.dashHeld = false;
            bot.botSpendCooldown = Math.max(0, bot.botSpendCooldown - dt);
            if (bot.down) {
                bot.botSeekingMedbay = false;
                updateDownedBot(bot);
                continue;
            }
            if (phase == GamePhase.WAVE && (dodgeWarden(bot) || dodgeArtillery(bot))) continue;

            Player downed = bestBotRescueTarget(bot);
            if (downed != null && shouldBotRescue(bot, downed)) {
                if (distance(bot.x, bot.y, downed.x, downed.y) < 65
                        && GameMap.hasClearLine(bot.x, bot.y, downed.x, downed.y)) {
                    bot.moveX = 0;
                    bot.moveY = 0;
                } else moveBotToward(bot, downed.x, downed.y);
                Enemy threat = bestBotCombatTarget(bot);
                if (threat != null && recognizeBotTarget(bot, threat, dt)) {
                    BotWeaponPolicy.select(bot, distance(bot.x, bot.y, threat.x, threat.y));
                    attack(bot, threat.id);
                } else if (threat == null) {
                    clearBotTarget(bot);
                }
                continue;
            }
            if (bot.movingCore) { updateBotCoreTransport(bot); continue; }
            boolean immediateDanger = enemies.stream().anyMatch(enemy -> enemy.hp > 0
                    && (distance(bot.x, bot.y, enemy.x, enemy.y) < 240
                    || distance(coreX, coreY, enemy.x, enemy.y) < 240));
            boolean personalDanger = enemies.stream().anyMatch(enemy -> enemy.hp>0 && distance(bot.x,bot.y,enemy.x,enemy.y)<240);
            useBotJobAbility(bot, personalDanger);
            if (updateBotRecovery(bot, personalDanger, immediateDanger)) continue;
            if (!personalDanger && bot.hp > 55 && tryBotUnlock(bot)) continue;
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

    private boolean dodgeWarden(Player bot) {
        List<Enemy> threats = enemies.stream().filter(enemy -> enemy.hp > 0 && enemy.warden != null
                && enemy.warden.action != WardenRules.Action.IDLE
                && GameMap.hasClearLine(enemy.x, enemy.y, bot.x, bot.y, unlockedAreas)).toList();
        if (threats.isEmpty()) return false;
        double current = wardenClearance(threats, bot.x, bot.y);
        if (current >= 0) return false;
        double best = current, bestX = bot.x, bestY = bot.y;
        for (double range : new double[]{100, 180}) for (int direction = 0; direction < 16; direction++) {
            double angle = direction * Math.PI / 8;
            double x = bot.x + Math.cos(angle) * range, y = bot.y + Math.sin(angle) * range;
            if (!canOccupy(x, y, 12) || !canEnemyTravel(bot.x, bot.y, x, y)) continue;
            if (wardenClearance(threats, bot.x + Math.cos(angle) * 30, bot.y + Math.sin(angle) * 30) <= current + 1) continue;
            double score = wardenClearance(threats, x, y);
            if (score > best + 1) { best = score; bestX = x; bestY = y; }
        }
        if (best <= current + 1) return false;
        double length = distance(bot.x, bot.y, bestX, bestY);
        steerBot(bot, (bestX - bot.x) / length, (bestY - bot.y) / length);
        return true;
    }

    private double wardenClearance(List<Enemy> threats, double x, double y) {
        return threats.stream().mapToDouble(enemy -> WardenRules.clearance(enemy.warden.action,
                enemy.x, enemy.y, enemy.warden.targetX, enemy.warden.targetY, x, y)).min().orElse(Double.POSITIVE_INFINITY);
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
            case "boss", "warlord", "titan", "warden" -> 460;
            case "champion" -> 260;
            case "siege" -> 240;
            case "artillery" -> 250;
            case "armored" -> 200;
            case "shield" -> 170;
            case "hunter", "ghost" -> 190;
            case "brute" -> 180;
            case "runner" -> 125;
            default -> 70;
        };
        if (enemy.lane.equals(assignedLane(bot.slot, activeLanes))) score += 90;
        score += BotCombatRules.urgentThreatBonus(distance(enemy.x, enemy.y, coreX, coreY),
                distance(bot.x, bot.y, enemy.x, enemy.y), GameMap.hasClearLine(bot.x, bot.y, enemy.x, enemy.y, unlockedAreas));
        score += (1 - enemy.hp / enemy.maxHp) * 55;
        score -= distance(bot.x, bot.y, enemy.x, enemy.y) * 0.34;
        long otherClaims = players.stream().filter(player -> player != bot && !player.human
                && !player.down && player.botTargetEnemyId == enemy.id).count();
        score -= otherClaims * (enemy.isBoss() || distance(enemy.x, enemy.y, coreX, coreY) < 160 ? 35 : 145);
        return score;
    }

    private boolean recognizeBotTarget(Player bot, Enemy candidate, double dt) {
        if (bot.botObservedEnemyId != candidate.id) {
            bot.botObservedEnemyId = candidate.id;
            bot.botRecognitionTimer = BOT_REACTION_SECONDS;
        }
        bot.botRecognitionTimer = Math.max(0, bot.botRecognitionTimer - dt);
        if (bot.botRecognitionTimer > 1e-9) return false;
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
        int nearbyEnemies = (int) enemies.stream().filter(enemy -> enemy.hp > 0
                && distance(enemy.x, enemy.y, target.x, target.y) < 125).limit(4).count();
        BotWeaponPolicy.select(bot, targetDistance, target.hp, nearbyEnemies);
        WeaponStats weapon = weaponStats(bot.weapon);
        double effectiveRange = weapon.range() - 8;
        boolean clearShot = GameMap.hasClearLine(bot.x, bot.y, target.x, target.y, unlockedAreas);
        if (clearShot) {
            attack(bot, target.id);
        }

        double preferredRange = BotWeaponPolicy.preferredRange(bot.weapon);
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

    private void moveBotToSaferPosition(Player bot, Enemy enemy) {
        double bestX = bot.x;
        double bestY = bot.y;
        double bestScore = Double.NEGATIVE_INFINITY;
        for (int index = 0; index < 12; index++) {
            double angle = Math.PI * 2 * index / 12.0 + bot.slot * 0.31;
            double candidateX = bot.x + Math.cos(angle) * 86;
            double candidateY = bot.y + Math.sin(angle) * 86;
            if (!canOccupy(candidateX, candidateY, 5) || !canEnemyTravel(bot.x, bot.y, candidateX, candidateY)) continue;
            double enemyDistance = enemies.stream().filter(threat -> threat.hp > 0)
                    .mapToDouble(threat -> distance(candidateX, candidateY, threat.x, threat.y)).min()
                    .orElse(distance(candidateX, candidateY, enemy.x, enemy.y));
            double teamSpacing = players.stream().filter(player -> player != bot && !player.down)
                    .mapToDouble(player -> distance(candidateX, candidateY, player.x, player.y))
                    .min().orElse(120);
            double score = BotCombatRules.safePositionScore(enemyDistance, teamSpacing,
                    GameMap.hasClearLine(candidateX, candidateY, enemy.x, enemy.y, unlockedAreas));
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
        double wander = Math.hypot(desiredX, desiredY) > .01 ? .08 : 0;
        double steeringX = desiredX + bot.botWanderX * wander;
        double steeringY = desiredY + bot.botWanderY * wander;
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
        if (bot.botSpendCooldown > 0) return false;
        UnlockArea area = GameMap.AREAS.stream()
                .filter(unit -> !unlockedAreas.contains(unit.id()) && terminalAccessible(unit)
                        && bot.credits >= unlockCost(unit.id()))
                .min(Comparator.comparingDouble(unit -> distance(bot.x, bot.y, unit.terminalX(), unit.terminalY())))
                .orElse(null);
        return area != null && botUse(bot, area.terminalX(), area.terminalY(), 65,
                () -> unlockArea(bot, area.id()));
    }

    private boolean updateBotRecovery(Player bot, boolean personalDanger, boolean immediateDanger) {
        if (bot.medkits > 0 && (bot.hp <= 40 || personalDanger && bot.hp <= 60)) {
            useItem(bot, "medkit");
        }
        double targetHp = JobRules.maxHp(bot.job) * (phase == GamePhase.PREPARING ? 1 : .9);
        if (bot.hp >= targetHp) {
            bot.botSeekingMedbay = false;
            return false;
        }
        Station med = GameMap.MEDBAYS.stream().filter(station -> isPointUnlocked(station.x(), station.y()))
                .min(Comparator.comparingDouble(station -> distance(bot.x, bot.y, station.x(), station.y())))
                .orElse(null);
        if (med == null) {
            bot.botSeekingMedbay = false;
            UnlockArea room = GameMap.areaById("recovery-room");
            if (bot.hp < 85 && !immediateDanger && !blackoutActive && bot.botSpendCooldown <= 0
                    && bot.credits >= unlockCost(room.id()) && terminalAccessible(room)) {
                return botUse(bot, room.terminalX(), room.terminalY(), 65, () -> unlockArea(bot, room.id()));
            }
            return false;
        }
        if (!bot.botSeekingMedbay) {
            double startHp = phase == GamePhase.PREPARING ? 85 : 55;
            if (bot.hp >= startHp) return false;
            bot.botSeekingMedbay = true;
        }
        // Recovery is free, but never park at a station that cannot safely heal us.
        boolean stationDanger = enemies.stream().anyMatch(enemy -> enemy.hp > 0
                && distance(med.x(), med.y(), enemy.x, enemy.y) < 240
                && GameMap.hasClearLine(med.x(), med.y(), enemy.x, enemy.y))
                || artilleryShells.stream().anyMatch(shell -> inArtilleryBlast(shell, med.x(), med.y()));
        if (personalDanger || immediateDanger || stationDanger || blackoutActive) return false;
        if (canInteract(bot, med.x(), med.y(), GameConfig.MEDBAY_RANGE - 10)) {
            bot.moveX = 0;
            bot.moveY = 0;
        } else {
            moveBotToward(bot, med.x(), med.y());
        }
        return true;
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
        if (tryBotUnlock(bot)) return true;
        TrapSlot damaged = trapSlots.stream().filter(slot -> slot.defense != null
                && slot.defense.hp < slot.defense.maxHp * .65
                && BuildingRules.repair(slot.defense.type, slot.defense.hp, slot.defense.maxHp, materials(bot)).status() == BuildingRules.RepairStatus.READY
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
            boolean owned = bot.weapons.owns(item);
            if (shop == null || !isPointUnlocked(shop.x(), shop.y())
                    || bot.credits < (owned ? ammoRefillCost(item) : shop.cost())) continue;
            if (DroneRules.mounted(bot, item)) continue;
            if (owned ? weaponAmmo(bot, item) > bot.weapons.capacity(item) * (phase == GamePhase.PREPARING ? .5 : .25)
                    : !BotWeaponPolicy.worthwhileUpgrade(bot, item)) continue;
            return botUse(bot, shop.x(), shop.y(), 55, () -> buy(bot, item));
        }
        if (phase != GamePhase.PREPARING) return false;
        ShopUnit kitShop = GameMap.shopByItem("medkit");
        if (bot.medkits == 0 && bot.credits >= kitShop.cost() && isPointUnlocked(kitShop.x(), kitShop.y())) {
            return botUse(bot, kitShop.x(), kitShop.y(), 55, () -> buy(bot, "medkit"));
        }
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
        var recipe = JobRules.recipe(bot.job, BUILD_RECIPES.get(buildType));
        if (BuildingRules.canAfford(recipe, materials(bot))) {
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

    private static void grantWeapon(Player player, String item) {
        if (WeaponCatalog.find(item) == null || item.equals("bat")) return;
        if (!player.weapons.grant(item)) return;
        player.equipWeapon(item);
        player.selectedBuild = null;
    }

    private void attack(Player player, int enemyId) {
        if (player.human) return;
        Enemy target = enemies.stream().filter(enemy -> enemy.id == enemyId && enemy.hp > 0).findFirst().orElse(null);
        if (target == null || !GameMap.hasClearLine(player.x, player.y, target.x, target.y, unlockedAreas)) return;
        double range = distance(player.x, player.y, target.x, target.y);
        if (range <= weaponStats(player.weapon).range() - 8) {
            player.aimX = target.x; player.aimY = target.y;
            player.firing = player.weapon.equals("railgun");
            combat.attackAt(player, target.x, target.y);
        }
        if (player.job.equals("attacker") && range <= weaponStats(player.secondaryWeapon).range() - 8) {
            player.secondaryAimX = target.x; player.secondaryAimY = target.y;
            player.secondaryFiring = true;
            combat.attackSecondary(player, target.x, target.y);
        }
    }

    private void useBotJobAbility(Player bot, boolean personalDanger) {
        if (phase != GamePhase.WAVE || bot.selectedBuild != null || bot.movingCore) return;
        if (bot.job.equals("healer")) {
            int wounded = (int) players.stream().filter(player -> !player.down
                    && player.hp < JobRules.maxHp(player.job) * .8
                    && distance(bot.x, bot.y, player.x, player.y) <= JobRules.HEAL_HALF_SIZE
                    && GameMap.hasClearLine(bot.x, bot.y, player.x, player.y, unlockedAreas)).count();
            if (BotCombatRules.shouldHeal(true, bot.jobCooldown, bot.healRemaining > 0, wounded)) useJobAbility(bot);
        } else if (bot.job.equals("spy") && personalDanger && bot.hp < JobRules.maxHp(bot.job) * .7) {
            if (bot.spyRemaining <= 0 && bot.jobCooldown <= 0) useJobAbility(bot);
        }
    }

    static WeaponStats weaponStats(String weapon) { return WeaponCatalog.stats(weapon); }

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

    private void switchSecondaryWeapon(Player player, String weapon) {
        if (!canMove() || !player.job.equals("attacker") || player.down || player.movingCore
                || weapon.equals(player.weapon) || !player.weapons.owns(weapon) || DroneRules.mounted(player, weapon)) return;
        player.equipSecondaryWeapon(weapon);
        player.secondaryFiring = false;
    }

    private void switchWeapon(Player player, String weapon) {
        if (player.job.equals("attacker") && weapon.equals(player.secondaryWeapon)) return;
        if (player.weapons.owns(weapon) && !DroneRules.mounted(player, weapon)) {
            releaseCarriedCore(player);
            player.equipWeapon(weapon);
            player.selectedBuild = null;
            player.movingCore = false;
            player.firing = player.secondaryFiring = false;
        }
    }

    private void buy(Player player, String item) {
        String outgoing = player.human || player.weapons.canAcquire(item) ? null
                : WeaponCatalog.ALL.stream().map(WeaponCatalog.Definition::id)
                .filter(id -> !id.equals("bat") && player.weapons.owns(id)).findFirst().orElse(null);
        buy(player, item, outgoing);
    }

    private void buy(Player player, String item, String outgoing) {
        if (!canUseFacilities() || player.down) return;
        if(item.equals("medkit")) {
            ShopUnit kitShop = GameMap.shopByItem("medkit");
            if (!isPointUnlocked(kitShop.x(), kitShop.y())
                    || !canInteract(player, kitShop.x(), kitShop.y(), 70)) return;
            if(player.medkits >= GameConfig.MEDKIT_CAPACITY) { gameEffects.feedback(player,"回復キットは5個まで持てます"); return; }
            if(spend(player,GameConfig.MEDKIT_PRICE)) { player.medkits++; gameEffects.purchased(player, item, false); gameEffects.feedback(player,"回復キットを購入しました"); }
            else gameEffects.feedback(player,"お金が足りません");
            return;
        }
        ShopUnit shop = GameMap.SHOP_UNITS.stream().filter(unit -> unit.item().equals(item))
                .filter(unit -> isPointUnlocked(unit.x(), unit.y()) && canInteract(player, unit.x(), unit.y(), 70))
                .min(Comparator.comparingDouble(unit -> distance(player.x, player.y, unit.x(), unit.y())))
                .orElse(null);
        if (shop == null) {
            gameEffects.feedback(player, "ショップに近づいてください");
            return;
        }
        if (item.endsWith("Factory")) {
            if (!spend(player, JobRules.buildingCost(player.job, shop.cost()))) { gameEffects.feedback(player, "お金が足りません"); return; }
            player.addBuildItem(item, 1);
            gameEffects.purchased(player, item, false);
            player.selectedBuild = item;
            releaseCarriedCore(player);
            gameEffects.feedback(player, shop.label() + "を購入しました。Rで設置できます");
            return;
        }
        if (buyUpgrade(player, shop, outgoing)) return;
        if (WeaponCatalog.find(item) != null && !item.equals("bat")) {
            buyOrRefillWeapon(player, shop, item, outgoing);
            return;
        }
        switch (item) {
            case "ammo" -> {
                List<String> owned = WeaponCatalog.ALL.stream().filter(WeaponCatalog.Definition::usesAmmo)
                        .map(WeaponCatalog.Definition::id).filter(player.weapons::owns)
                        .filter(weapon -> !DroneRules.mounted(player, weapon)).toList();
                if (owned.isEmpty()) {
                    gameEffects.feedback(player, "弾薬を使う武器を持っていません");
                    return;
                }
                if (owned.stream().allMatch(weapon -> weaponAmmo(player, weapon) >= player.weapons.capacity(weapon))) {
                    return;
                }
                int refillPrice = Math.max(shop.cost(), owned.stream().mapToInt(GameSession::ammoRefillCost).max().orElse(0));
                if (spend(player, refillPrice)) {
                    owned.forEach(weapon -> setWeaponAmmo(player, weapon, player.weapons.capacity(weapon)));
                    gameEffects.feedback(player, "弾薬を補充しました");
                    events.send(player, "{\"type\":\"ammo-refilled\"}");
                } else {
                    gameEffects.feedback(player, "お金が足りません");
                }
            }
            default -> { }
        }
    }

    boolean teamBuffAt(double x, double y) {
        UnlockArea area = GameMap.areaById(UpgradeRules.AREA);
        return teamBuffRemaining > 0 && unlockedAreas.contains(UpgradeRules.AREA) && area.contains(x, y);
    }

    private boolean buyUpgrade(Player player, ShopUnit shop, String selection) {
        switch (shop.item()) {
            case "gacha" -> resolveGacha(player, selection);
            case "enchant" -> {
                if (selection == null || WeaponCatalog.find(selection) == null || selection.equals("bat") || WeaponCatalog.stats(selection).damage() <= 0) return true;
                int level = player.enchantments.getOrDefault(selection, 0);
                if (!UpgradeRules.canEnchant(player.weapons.owns(selection), DroneRules.mounted(player, selection), level, player.credits)) {
                    gameEffects.feedback(player, "強化できません"); return true;
                }
                spend(player, UpgradeRules.enchantCost(level));
                player.enchantments.put(selection, level + 1);
                gameEffects.purchased(player, selection, false);
                gameEffects.feedback(player, "武器を強化しました");
            }
            case "armor" -> {
                boolean bottoms = "bottoms".equals(selection), tops = "tops".equals(selection);
                if (!bottoms && !tops || bottoms && player.armorBottoms || tops && player.armorTops) return true;
                if (!spend(player, bottoms ? UpgradeRules.BOTTOMS_COST : UpgradeRules.TOPS_COST)) {
                    gameEffects.feedback(player, "お金が足りません"); return true;
                }
                if (bottoms) player.armorBottoms = true; else player.armorTops = true;
                gameEffects.purchased(player, shop.item(), false);
                gameEffects.feedback(player, "防具を購入しました");
            }
            case "overclockSilver" -> {
                int compressionCost = JobRules.buildingCost(player.job, UpgradeRules.COMPRESSION_COST);
                if (player.silverTurretItems < compressionCost) {
                    gameEffects.feedback(player, "銀タレットが足りません"); return true;
                }
                for (int i = 0; i < compressionCost; i++) player.takeDefense("silverTurret");
                player.addBuildItem("silverTurret", -compressionCost);
                player.addBuildItem("overclockSilver", 1);
                player.selectedBuild = "overclockSilver";
                releaseCarriedCore(player);
                gameEffects.purchased(player, shop.item(), false);
                gameEffects.feedback(player, "オーバークロックシルバーを購入しました");
            }
            case "teamMachine" -> {
                if (teamBuffRemaining > 0) return true;
                if (!spend(player, UpgradeRules.TEAM_COST)) {
                    gameEffects.feedback(player, "お金が足りません"); return true;
                }
                teamBuffRemaining = UpgradeRules.TEAM_DURATION;
                gameEffects.purchased(player, shop.item(), false);
                gameEffects.feedback(player, "チーム強化を開始しました");
            }
            default -> { return false; }
        }
        return true;
    }

    private void resolveGacha(Player player, String selection) {
        if ("roll".equals(selection)) {
            if (player.gachaWeapon != null) return;
            if (!spend(player, GachaRules.COST)) {
                gameEffects.feedback(player, "お金が足りません"); return;
            }
            player.gachaWeapon = GachaRules.POOL.get(random.nextInt(GachaRules.POOL.size()));
            gameEffects.sound(player, "item-use", "gacha");
            return;
        }
        String result = player.gachaWeapon;
        if (result == null) return;
        if (!GachaRules.POOL.contains(result)) { player.gachaWeapon = null; return; }
        if ("skip".equals(selection)) { player.gachaWeapon = null; return; }
        if (selection == null || DroneRules.mounted(player, result)) return;
        if (result.equals("silverAmmo200")) {
            if (!"take".equals(selection) || !player.weapons.addSilverAmmo(200)) return;
            player.gachaWeapon = null; gameEffects.purchased(player, result, false); return;
        }
        if (result.equals("plasmaBlade") && !player.weapons.owns(result) && !"take".equals(selection) && !"bat".equals(selection)) return;
        boolean owned = player.weapons.owns(result);
        if (!owned) {
            if (!player.weapons.canAcquire(result)) {
                if (!player.weapons.canExchange(result, selection) || DroneRules.mounted(player, selection)) return;
                player.weapons.exchange(result, selection);
                player.enchantments.remove(selection);
                if (player.secondaryWeapon.equals(selection)) {
                    player.equipSecondaryWeapon("bat"); player.secondaryFiring = false;
                }
            } else if (!"take".equals(selection) && !(result.equals("plasmaBlade") && selection.equals("bat"))) return;
            HookSystem.clear(player);
            releaseCarriedCore(player);
            if (result.equals("plasmaBlade")) { player.enchantments.remove("bat");
                if (player.secondaryWeapon.equals("bat")) player.secondaryWeapon = "none"; }
            grantWeapon(player, result);
        } else {
            if (!"take".equals(selection)) return;
            setWeaponAmmo(player, result, player.weapons.capacity(result));
        }
        player.gachaWeapon = null;
        gameEffects.purchased(player, result, !owned);
        gameEffects.feedback(player, owned ? "弾薬を補充しました" : "入手しました");
    }

    private void buyOrRefillWeapon(Player player, ShopUnit shop, String item, String outgoing) {
        if (DroneRules.mounted(player, item) || outgoing != null && DroneRules.mounted(player, outgoing)) {
            gameEffects.feedback(player, "ドローンを回収してください");
            return;
        }
        if (player.weapons.owns(item)) {
            int capacity = player.weapons.capacity(item);
            if (weaponAmmo(player, item) >= capacity) {
                return;
            }
            if (spend(player, ammoRefillCost(item))) {
                setWeaponAmmo(player, item, capacity);
                gameEffects.feedback(player, "弾薬を補充しました");
                events.send(player, "{\"type\":\"ammo-refilled\"}");
            } else {
                gameEffects.feedback(player, "お金が足りません");
            }
            return;
        }
        boolean exchange = !player.weapons.canAcquire(item);
        if (exchange && !player.weapons.canExchange(item, outgoing)) {
            gameEffects.feedback(player, "交換する武器を選んでください");
            return;
        }
        if (spend(player, shop.cost())) {
            releaseCarriedCore(player);
            if (exchange) {
                player.weapons.exchange(item, outgoing);
                player.enchantments.remove(outgoing);
                if (player.secondaryWeapon.equals(outgoing)) {
                    player.equipSecondaryWeapon(item);
                    player.secondaryFiring = false;
                }
            }
            grantWeapon(player, item);
            gameEffects.purchased(player, item, true);
            gameEffects.feedback(player, "購入しました");
        } else {
            gameEffects.feedback(player, "お金が足りません");
        }
    }

    static int weaponAmmo(Player player, String item) { return player.weapons.ammo(item); }

    static int weaponAmmoCapacity(String item) { return WeaponCatalog.capacity(item); }

    private static void setWeaponAmmo(Player player, String item, int ammo) { player.weapons.setAmmo(item, ammo); }

    private void gather(Player player, String resource) {
        if (!canUseFacilities() || player.down) return;
        if (player.gatherCooldown > 0) {
            gameEffects.feedback(player, "まだ採取できません");
            return;
        }
        if (resource.equals("wood")) {
            if (!isPointUnlocked(WOODCUTTER_X, WOODCUTTER_Y) || !canInteract(player, WOODCUTTER_X, WOODCUTTER_Y, 110)) {
                gameEffects.feedback(player, "伐採所に近づいてください");
                return;
            }
            player.wood += 4;
            gameEffects.feedback(player, "木材を4個入手しました");
        } else if (resource.equals("ore")) {
            if (!isPointUnlocked(QUARRY_X, QUARRY_Y) || !canInteract(player, QUARRY_X, QUARRY_Y, 110)) {
                gameEffects.feedback(player, "採石場に近づいてください");
                return;
            }
            player.ore++;
            gameEffects.feedback(player, "鉄を1個入手しました");
        } else {
            return;
        }
        player.gatherCooldown = resource.equals("ore") ? GATHER_COOLDOWN_SECONDS / 3 : GATHER_COOLDOWN_SECONDS;
    }

    private void dropResource(Player player, String[] parts) {
        if (!Set.of("wood", "ore", "copper", "silver").contains(parts[1])) return;
        dropInventory(player, parts);
    }

    private void dropInventory(Player player, String[] parts) {
        if (!canUseFacilities() || player.down) return;
        String type = parts[1];
        int available = type.equals("medkit") ? player.medkits : resourceCount(player,type);
        int requested;
        try {
            requested = Integer.parseInt(parts[2]);
        } catch (NumberFormatException error) {
            return;
        }
        int amount = InventoryDropRules.dropAmount(available, requested);
        if (amount <= 0) {
            gameEffects.feedback(player, type.equals("medkit") ? "回復キットがありません" : "渡せる素材がありません");
            return;
        }
        MapPoint origin = GameMap.snapToTile(player.x, player.y);
        MapPoint target = GameMap.snapToTile(origin.x() + player.facingX * GameMap.TILE_SIZE,
                origin.y() + player.facingY * GameMap.TILE_SIZE);
        double dropX = canOccupy(target.x(), target.y(), 5) ? target.x() : player.x;
        double dropY = canOccupy(target.x(), target.y(), 5) ? target.y() : player.y;
        if (type.equals("medkit")) player.medkits -= amount;
        else addResource(player,type,-amount);
        droppedResources.add(new DroppedResource(nextDroppedResourceId++, type,
                dropX, dropY, amount, player.id));
        gameEffects.feedback(player, type.equals("medkit") ? "回復キットを置きました" : "素材を置きました");
    }

    private void craft(Player player, String type) {
        if (!canUseFacilities() || player.down
                || !(type.equals("silverAmmo") || BUILD_RECIPES.containsKey(type))) return;
        boolean nearWorkbench = GameMap.WORKBENCH_UNITS.stream()
                .filter(workbench -> workbench.requiredArea() == null
                        || unlockedAreas.contains(workbench.requiredArea()))
                .anyMatch(workbench -> canInteract(player, workbench.x(), workbench.y(), 110));
        if (!nearWorkbench) {
            gameEffects.feedback(player, "作業台に近づいてください");
            return;
        }
        if (type.equals("silverAmmo")) {
            if (!player.weapons.buySilverAmmo(player.silver)) {
                gameEffects.feedback(player, "銀が足りません");
                return;
            }
            player.silver -= SilverAmmoRules.COST;
            gameEffects.purchased(player, type, false);
            gameEffects.feedback(player, "銀弾を" + SilverAmmoRules.PACK_SIZE + "発製作しました");
            return;
        }
        var recipe = JobRules.recipe(player.job, BUILD_RECIPES.get(type));
        if (!BuildingRules.canAfford(recipe, materials(player))) {
            gameEffects.feedback(player, "素材が足りません");
            return;
        }
        recipe.forEach((resource,cost) -> addResource(player,resource,-cost));
        player.addBuildItem(type, 1);
        player.selectedBuild = type;
        releaseCarriedCore(player);
        gameEffects.feedback(player, "製作しました");
    }

    private void equipBuild(Player player, String type) {
        if (type.equals("none")) {
            releaseCarriedCore(player);
            player.selectedBuild = null;
        } else if ((type.equals("teleporter") || BuildingRules.isDefense(type) || type.endsWith("Factory")) && player.buildItemCount(type) > 0) {
            releaseCarriedCore(player);
            player.selectedBuild = type;
            player.firing = player.secondaryFiring = false;
            player.stopRailgun();
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
        if (!canUseFacilities() || player.down || player.movingCore) return;
        MaterialFactory quarry = factories.stream().filter(unit -> (target == null || unit.id.equals(target))
                && canInteract(player, unit.x, unit.y, 70))
                .min(Comparator.comparingDouble(unit -> distance(player.x, player.y, unit.x, unit.y)))
                .orElse(null);
        if (quarry != null && target != null) { pickupFactory(player, quarry.id); return; }
        TrapSlot slot = trapSlots.stream()
                .filter(unit -> unit.defense != null && unit.temporaryRemaining <= 0 && canInteract(player, unit.x, unit.y, 100))
                .filter(unit -> target == null || unit.id.equals(target))
                .min(Comparator.comparingDouble(unit -> distance(player.x, player.y, unit.x, unit.y)))
                .orElse(null);
        boolean nearCore = player.selectedBuild == null && (target == null || target.equals("core"))
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
                || player.medkits <= 0 || player.hp >= JobRules.maxHp(player.job)) return;
        player.medkits--;
        player.hp = Math.min(JobRules.maxHp(player.job), player.hp + GameConfig.MEDKIT_HEAL);
        gameEffects.sound(player, "item-use", item);
        gameEffects.feedback(player, "回復キットを使いました");
    }

    private void equipCore(Player player) {
        if (!canUseFacilities() || player.down
                || !canInteract(player, coreX, coreY, 130)) {
            gameEffects.feedback(player, "コアに近づいてください");
            return;
        }
        Player carrier = players.stream()
                .filter(other -> other != player && other.movingCore)
                .findFirst().orElse(null);
        if (carrier != null) {
            gameEffects.feedback(player, "コアはほかのプレイヤーが運んでいます");
            return;
        }
        player.movingCore = true;
        player.dashHeld = false;
        player.dashing = false;
        player.scoutDashRemaining = 0;
        player.selectedBuild = null;
        player.firing = player.secondaryFiring = false;
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
            gameEffects.feedback(player, "もう少し近づいてください");
            return;
        }
        if (BuildingRules.teleportPadOccupied(point, players, 45) || !BuildingRules.canPlaceCore(point,
                GameMap.canPlaceCore(point.x(), point.y(), unlockedAreas), buildingPlacementState(), player)) {
            gameEffects.feedback(player, "ここにはコアを置けません");
            return;
        }
        coreX = point.x();
        coreY = point.y();
        player.movingCore = false;
        setNotice("コアを移設しました");
    }

    private void placeInFacingTile(Player player) {
        if (!canUseFacilities() || player.down) return;
        MapPoint point = frontPlacementPoint(player);
        double targetX = point.x(), targetY = point.y();
        placeInFacingPoint(player, targetX, targetY);
    }

    private MapPoint frontPlacementPoint(Player player) {
        MapPoint origin = GameMap.snapToTile(player.x, player.y);
        double targetX = origin.x() + player.facingX * GameMap.TILE_SIZE;
        double targetY = origin.y() + player.facingY * GameMap.TILE_SIZE;
        if (!player.movingCore && Math.abs(targetX - player.x) < 23
                && Math.abs(targetY - player.y) < 23) {
            targetX += player.facingX * GameMap.TILE_SIZE;
            targetY += player.facingY * GameMap.TILE_SIZE;
        }
        return GameMap.snapToTile(targetX, targetY);
    }

    private void placeInFacingPoint(Player player, double targetX, double targetY) {
        if (player.movingCore) {
            placeCore(player, new String[] {"PLACE_CORE",
                    Double.toString(targetX), Double.toString(targetY)});
        } else if ("teleporter".equals(player.selectedBuild)) {
            placeTeleport(player, GameMap.snapToTile(targetX, targetY));
        } else if (player.selectedBuild != null && player.selectedBuild.endsWith("Factory")) {
            placeFactory(player, GameMap.snapToTile(targetX, targetY));
        } else if (player.selectedBuild != null) {
            placeDefense(player, new String[] {"PLACE",
                    Double.toString(targetX), Double.toString(targetY), player.selectedBuild});
        } else {
            gameEffects.feedback(player, "先に設置するアイテムを選んでください");
        }
    }

    private void placeFactory(Player player, MapPoint point) {
        String item = player.selectedBuild;
        ShopUnit shop = GameMap.shopByItem(item);
        if (shop == null || !item.endsWith("Factory") || player.buildItemCount(item) <= 0) return;
        if (!canPlaceDefenseAt(point, null)) {
            gameEffects.feedback(player, "ここには設置できません");
            return;
        }
        factories.add(new MaterialFactory("quarry-" + nextFactoryId++, shop, point));
        player.addBuildItem(item, -1);
        if (player.buildItemCount(item) == 0) player.selectedBuild = null;
        gameEffects.feedback(player, "製造装置を設置しました");
    }

    private void pickupFactory(Player player, String id) {
        if (!canUseFacilities() || player.down) return;
        MaterialFactory factory = factories.stream().filter(unit -> unit.id.equals(id)
                && canInteract(player, unit.x, unit.y, 70)).findFirst().orElse(null);
        if (factory == null) return;
        factories.remove(factory);
        String item = factory.shop.item();
        player.addBuildItem(item, 1);
        gameEffects.feedback(player, "製造装置を回収しました");
    }

    private void build(Player player, String slotId, String type) {
        if (!canUseFacilities() || player.down || !BuildingRules.isDefense(type)) return;
        TrapSlot slot = slotById(slotId);
        if (slot == null || !canInteract(player, slot.x, slot.y, 100)) {
            gameEffects.feedback(player, "もう少し近づいてください");
            return;
        }
        if (slot.requiredArea != null && !unlockedAreas.contains(slot.requiredArea)) {
            gameEffects.feedback(player, "このエリアはまだ開放されていません");
            return;
        }
        if (slot.defense != null) {
            gameEffects.feedback(player, "すでに設備が置かれています");
            return;
        }
        if (player.buildItemCount(type) <= 0) {
            gameEffects.feedback(player, "先にこの設備を製作してください");
            return;
        }
        if (!canPlaceDefenseAt(new MapPoint(slot.x, slot.y), slot)) return;
        player.addBuildItem(type, -1);
        slot.ownerId = player.id;
        slot.defense = player.takeDefense(type);
        gameEffects.sound(player,"item-use","build");
        gameEffects.feedback(player, "設置しました");
    }

    private void placeDefense(Player player, String[] parts) {
        if (!canUseFacilities() || player.down || !BuildingRules.isDefense(parts[3])) return;
        double requestedX = Double.parseDouble(parts[1]);
        double requestedY = Double.parseDouble(parts[2]);
        if (!Double.isFinite(requestedX) || !Double.isFinite(requestedY)) return;
        MapPoint point = GameMap.snapToTile(requestedX, requestedY);
        if (distance(player.x, player.y, point.x(), point.y()) > 180) {
            gameEffects.feedback(player, "もう少し近づいてください");
            return;
        }
        if (!canPlaceDefenseAt(point, null)) {
            gameEffects.feedback(player, "ここには設置できません");
            return;
        }
        String type = parts[3];
        if (!type.equals(player.selectedBuild) || player.buildItemCount(type) <= 0) {
            gameEffects.feedback(player, "設置する設備を手に持ってください");
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
        gameEffects.sound(player,"item-use","build");
        gameEffects.feedback(player, "設置しました");
    }

    private BuildingRules.PlacementState buildingPlacementState() {
        return new BuildingRules.PlacementState(coreX, coreY, factories, trapSlots, players, enemies);
    }

    private static BuildingRules.Materials materials(Player player) {
        return new BuildingRules.Materials(player.wood, player.ore, player.copper, player.silver);
    }

    private boolean canPlaceDefenseAt(MapPoint point, TrapSlot ignored) {
        return !BuildingRules.teleportPadOccupied(point, players, 36)
                && BuildingRules.canPlaceDefense(point,
                GameMap.canPlaceDefense(point.x(), point.y(), unlockedAreas), buildingPlacementState(), ignored);
    }

    private void removeDefense(Player player, String slotId) {
        if (!canUseFacilities() || player.down) return;
        TrapSlot slot = slotById(slotId);
        if (slot == null || slot.defense == null || slot.temporaryRemaining > 0
                || !canInteract(player, slot.x, slot.y, 100)) return;
        trapSlots.remove(slot);
        player.recoverDefense(slot.defense);
        gameEffects.feedback(player, "設備を回収しました");
    }

    private void repair(Player player, String slotId) {
        if (!canUseFacilities() || player.down) return;
        TrapSlot slot = slotById(slotId);
        if (slot == null || slot.defense == null || slot.temporaryRemaining > 0
                || !canInteract(player, slot.x, slot.y, 100)) return;
        var plan = BuildingRules.repair(slot.defense.type, slot.defense.hp, slot.defense.maxHp, materials(player));
        if (plan.status() == BuildingRules.RepairStatus.FULL) {
            gameEffects.feedback(player, "設備の耐久値は満タンです");
            return;
        }
        if (plan.status() == BuildingRules.RepairStatus.MISSING_MATERIAL) {
            gameEffects.feedback(player, "素材が足りません");
            return;
        }
        addResource(player, plan.resource(), -1);
        slot.defense.hp = slot.defense.maxHp;
        gameEffects.feedback(player, "設備を修理しました");
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
                    gameEffects.feedback(player, "コアを強化しました");
                } else {
                    gameEffects.feedback(player, "お金が足りません");
                }
            }
            case "shield" -> {
                int cost = coreUpgradeCost("shield");
                if (spend(player, cost)) {
                    coreMaxShield += 180;
                    coreShield = coreMaxShield;
                    gameEffects.feedback(player, "コアを強化しました");
                } else {
                    gameEffects.feedback(player, "お金が足りません");
                }
            }
            case "defense" -> {
                int cost = coreUpgradeCost("defense");
                if (coreDefenseLevel >= 4) {
                    gameEffects.feedback(player, "すでに最大レベルです");
                    return;
                }
                if (spend(player, cost)) {
                    coreDefenseLevel++;
                    gameEffects.feedback(player, "コアを強化しました");
                } else {
                    gameEffects.feedback(player, "お金が足りません");
                }
            }
            case "regen" -> {
                int cost = coreUpgradeCost("regen");
                if (coreRegenLevel >= 4) {
                    gameEffects.feedback(player, "すでに最大レベルです");
                    return;
                }
                if (spend(player, cost)) {
                    coreRegenLevel++;
                    gameEffects.feedback(player, "コアを強化しました");
                } else {
                    gameEffects.feedback(player, "お金が足りません");
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
            gameEffects.feedback(player, "準備時間の操作端末に近づいてください");
            return;
        }
        if (!spend(player, prepExtensionCost())) {
            gameEffects.feedback(player, "お金が足りません");
            return;
        }
        if (phase == GamePhase.PREPARING) {
            prepTime += console.seconds();
            gameEffects.feedback(player, "準備時間を1分延長しました");
        } else {
            nextPrepBonusSeconds += console.seconds();
            gameEffects.feedback(player, "次の準備時間を1分延長しました");
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
        resetBreaker(player, breakerId, false);
    }

    private void repairBreakerFromMap(Player player, String breakerId) {
        if (!player.job.equals("hacker") || !player.missileControl) return;
        boolean sourceAccessible = player.breakerControl == null ? canOperate(player, GameMap.MISSILE_COMPUTER)
                : canOperateBreaker(player, GameMap.breakerById(player.breakerControl));
        if (!sourceAccessible) return;
        resetBreaker(player, breakerId, true);
    }

    private void resetBreaker(Player player, String breakerId, boolean fromMap) {
        if (!canUseFacilities() || player.down) return;
        BreakerTerminal breaker = GameMap.breakerById(breakerId);
        if (breaker == null
                || breaker.requiredArea() != null
                && !unlockedAreas.contains(breaker.requiredArea())) return;
        if (!blackoutActive) {
            gameEffects.feedback(player, "電力は正常です");
            return;
        }
        boolean nearby = fromMap || (DroneRules.controlling(player)
                ? DroneRules.canInteract(distance(player.drone.x, player.drone.y, breaker.x(), breaker.y()),
                    hasInteractionPath(player.drone.x, player.drone.y, breaker.x(), breaker.y()))
                : canInteract(player, breaker.x(), breaker.y(), 95));
        if (!nearby) {
            gameEffects.feedback(player, "ブレーカーに近づいてください");
            return;
        }
        if (!trippedBreakers.remove(breaker.id())) {
            gameEffects.feedback(player, "このブレーカーは正常です");
            return;
        }
        int remaining = trippedBreakers.size();
        if (remaining == 0) {
            blackoutActive = false;
            gameEffects.feedback(player, "電力を復旧しました");
            setNotice("電力が復旧しました");
        }
    }

    private void unlockArea(Player player, String areaId) {
        if (!canUseFacilities() || player.down) return;
        UnlockArea area = GameMap.areaById(areaId);
        if (area == null || !terminalAccessible(area)) return;
        if (unlockedAreas.contains(areaId)) {
            gameEffects.feedback(player, "このエリアは開放済みです");
            return;
        }
        if (!canInteract(player, area.terminalX(), area.terminalY(), 100)) {
            gameEffects.feedback(player, "開放端末に近づいてください");
            return;
        }
        int cost = unlockCost(areaId);
        if (spend(player, cost)) {
            unlockedAreas.add(areaId);
            // Opened areas only become spawn candidates when the next round starts.
            setNotice(area.name() + "を開放しました");
        } else {
            gameEffects.feedback(player, "お金が足りません");
        }
    }

    private boolean spend(Player player, int amount) {
        if (player.credits < amount) return false;
        player.credits -= amount;
        return true;
    }

    private void damagePlayer(Player player, double damage) {
        if (player.down || JobRules.invulnerable(player) || damage <= 0) return;
        if (JobRules.protectedByTank(player, players,
                (target, tank) -> GameMap.hasClearLine(target.x, target.y, tank.x, tank.y, unlockedAreas)))
            damage *= JobRules.TANK_DAMAGE_FACTOR;
        events.broadcast("{\"type\":\"effect\",\"effect\":\"player-hit\",\"playerId\":\"" + player.id + "\"}");
        if (player.movingCore) damageCore(damage);
        damage *= UpgradeRules.armorMultiplier(player.armorBottoms, player.armorTops);
        if (teamBuffAt(player.x, player.y)) damage *= UpgradeRules.TEAM_DEFENSE;
        player.medbayDamageDelay = GameConfig.MEDBAY_DAMAGE_DELAY;
        player.hp = Math.max(0, player.hp - damage);
        if (player.hp <= 0) {
            releaseDroneControl(player);
            player.down = true;
            if (player.spyRemaining > 0) {
                player.spyRemaining = 0;
                if (player.job.equals("spy")) player.jobCooldown = JobRules.SPY_COOLDOWN;
            }
            events.broadcast("{\"type\":\"effect\",\"effect\":\"player-down\",\"playerId\":\"" + player.id
                    + "\",\"x\":" + player.x + ",\"y\":" + player.y + "}");
            cancelAction(player);
            player.moveX = 0;
            player.moveY = 0;
            player.dashHeld = false;
            player.dashing = false;
            player.scoutDashRemaining = 0;
            player.firing = player.secondaryFiring = false;
            releaseCarriedCore(player);
            setNotice(player.name + "がダウンしました");
        }
    }

    private void releaseCarriedCore(Player player) {
        if (!player.movingCore) return;
        coreX = player.x;
        coreY = player.y;
        player.movingCore = false;
    }

    private void resetWorld() {
        backup = null; backupUsed = false; rewindRemaining = 0;
        enemyProjectiles.clear(); combat.rockets.clear(); nextProjectileId = 0;
        elapsedSeconds = 0;
        victoryMoveRemaining = 0;
        teamBuffRemaining = 0;
        explosionBossSpawned = false;
        wardenSpawned = false;
        roundEnemyTotal = 0;
        debugMode = false;
        phase = GamePhase.LOBBY;
        round = 0;
        prepTime = 0;
        queuedEnemies = 0;
        queuedTinyEnemies = queuedBlueEnemies = 0;
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
        artilleryShells.clear();
        missiles.clear();
        poisonClouds.clear();
        decoys.clear();
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
            player.hp = JobRules.maxHp(player.job);
            player.decoyCooldown = 0;
            player.medbayDamageDelay = 0;
            player.roomReady = false;
            player.down = false;
            player.dashHeld = false;
            player.dashing = false;
            player.scoutDashRemaining = 0;
            player.dashExhausted = false;
            player.missileControl = false; player.breakerControl = null; player.missileCooldown = 0;
            player.stamina = JobRules.staminaMax(player.job);
            player.spyCheckedEnemies.clear(); player.spyHostileEnemies.clear();
            player.spyRemaining = 0;
            player.drone = null;
            player.secondaryFiring = false; player.stopSecondaryRailgun();
            player.secondaryWeapon = "bat";
            player.secondaryWeaponCooldowns.clear(); player.secondaryWeaponCooldownMaxima.clear();
            player.secondaryCooldown = player.secondaryCooldownMax = player.healRemaining = 0;
            player.jobCooldown = 0;
            player.teleportCooldown = 0;
            player.tpInvulnerableRemaining = 0;
            player.reviveInvulnerableRemaining = 0;
            player.teleportPads.clear(); player.teleportPairs.clear();
            player.equipWeapon("pistol");
            player.weaponCooldowns.clear();
            player.weaponCooldownMaxima.clear();
            player.cooldown = 0;
            player.cooldownMax = 0;
            player.firing = player.secondaryFiring = false;
            player.aimX = player.x + 100;
            player.aimY = player.y;
            player.stopRailgun();
            HookSystem.clear(player);
            player.hookPressHandled = false;
            player.secondaryHookPressHandled = false;
            player.gachaWeapon = null;
            player.weapons.clear();
            player.enchantments.clear();
            player.armorBottoms = player.armorTops = false;
            player.overclockSilverItems = 0;
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
            player.barricadeItems = player.copperBarricadeItems = player.silverBarricadeItems = 0;
            player.credits = 0;
            player.goldRewardRemainder = 0;
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
            player.botSeekingMedbay = false;
            player.botExtendedRound = -1;
            player.botSharedRound = -1;
            player.botPath = List.of();
            player.botPathIndex = 0;
            player.botPathTimer = 0;
            player.botPathTargetX = Double.NaN;
            player.botPathTargetY = Double.NaN;
            cancelAction(player);
            index++;
        }
        refreshCpuNames();
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
        return distance(player.x, player.y, x, y) <= range && hasInteractionPath(player.x, player.y, x, y);
    }

    private boolean hasInteractionPath(double originX, double originY, double x, double y) {
        double separation = distance(originX, originY, x, y);
        // Allow only the terminal's own tile, including diagonal approaches.
        boolean mounted = !GameMap.canOccupy(x, y, 0, unlockedAreas);
        for (double step = 0; step < separation; step += 4) {
            double factor = step / Math.max(1, separation);
            double sampleX = originX + (x - originX) * factor;
            double sampleY = originY + (y - originY) * factor;
            if (mounted && Math.floor(sampleX / GameMap.TILE_SIZE) == Math.floor(x / GameMap.TILE_SIZE)
                    && Math.floor(sampleY / GameMap.TILE_SIZE) == Math.floor(y / GameMap.TILE_SIZE)) continue;
            if (!GameMap.canOccupy(sampleX, sampleY, 0, unlockedAreas)) return false;
        }
        return true;
    }

    private boolean canOccupy(double x, double y, double radius) {
        if (!GameMap.canOccupy(x, y, radius, unlockedAreas)) return false;
        return trapSlots.stream().noneMatch(slot -> slot.defense != null
                && BuildingRules.blocksMovement(slot.defense.type)
                && distance(x, y, slot.x, slot.y) < radius + 18);
    }

    private void cancelAction(Player player) {
        player.actionTarget = null;
        player.actionProgress = 0;
    }

    private void setNotice(String text) {
        notice = text;
        noticeVersion++;
        events.broadcast("{\"type\":\"log\",\"version\":" + noticeVersion
                + ",\"message\":\"" + escapeJson(text) + "\"}");
    }
}
