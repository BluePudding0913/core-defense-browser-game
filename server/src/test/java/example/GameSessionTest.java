package example;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class GameSessionTest {
    private RecordingEvents events;
    private GameSession game;
    private Player player;

    @BeforeEach
    void setUp() {
        events = new RecordingEvents();
        game = new GameSession(events);
        player = game.connectPlayer("test-session-a");
        assertNotNull(player);
        game.setRoomOwner(player);
    }

    @Test
    void startReadyClearAndNextRoundProgressThroughExpectedPhases() {
        game.handleMessage(player, "ROOM_READY:1");
        game.handleMessage(player, "START");
        assertEquals(GamePhase.PREPARING, game.phase);
        assertEquals(0, game.round);

        game.handleMessage(player, "READY");
        game.update(0.05);

        assertEquals(GamePhase.WAVE, game.phase);
        assertEquals(1, game.round);
        assertEquals(9, game.queuedEnemies);
        assertEquals(3, game.activeSpawnIds.size());
        assertEquals(3, Set.copyOf(game.activeSpawnIds).size());

        game.queuedEnemies = 0;
        game.queuedBosses = 0;
        game.enemies.clear();
        game.update(0.05);

        assertEquals(GamePhase.PREPARING, game.phase);
        assertEquals(GameConfig.PREP_SECONDS, game.prepTime);
        assertEquals(21, player.credits);
        assertTrue(game.players.stream().allMatch(candidate -> candidate.credits == 21),
                "round rewards should be granted to every personal balance");

        game.handleMessage(player, "READY");
        game.update(0.05);
        assertEquals(GamePhase.WAVE, game.phase);
        assertEquals(2, game.round);
        assertEquals(12, game.queuedEnemies);
    }

    @Test
    void onlyTheOwnerCanStartAfterEveryHumanPlayerIsReady() {
        Player guest = game.connectPlayer("test-session-b");
        assertNotNull(guest);

        game.handleMessage(player, "START");
        assertEquals(GamePhase.LOBBY, game.phase,
                "the owner must wait until every connected player is ready");

        game.handleMessage(guest, "ROOM_READY:1");
        game.handleMessage(guest, "START");
        assertEquals(GamePhase.LOBBY, game.phase, "a guest must not be able to start the room");

        game.handleMessage(player, "START");
        assertEquals(GamePhase.PREPARING, game.phase);
        assertTrue(game.players.stream().noneMatch(candidate -> candidate.roomReady),
                "ready flags should reset once the match starts");
    }

    @Test
    void ownerCanStartAloneWithoutReadyingEvenAfterReconnectOrReplay() {
        assertTrue(game.roomReadyForStart());
        game.handleMessage(player, "ROOM_READY:0");
        assertTrue(game.roomReadyForStart());
        game.disconnectPlayer(player);
        assertFalse(game.roomReadyForStart());
        assertSame(player, game.connectPlayer("test-session-a"));
        assertTrue(game.roomReadyForStart());
        game.handleMessage(player, "START");
        assertEquals(GamePhase.PREPARING, game.phase);
        game.phase = GamePhase.LOST;
        assertTrue(game.roomReadyForStart());
        game.handleMessage(player, "START");
        assertEquals(GamePhase.PREPARING, game.phase);
    }

    @Test
    void newOwnerDoesNotNeedToReadyAfterOwnershipTransfer() {
        Player guest = game.connectPlayer("test-session-b");
        assertNotNull(guest);
        assertFalse(game.roomReadyForStart());
        game.disconnectPlayer(player);
        game.setRoomOwner(guest);
        assertTrue(game.roomReadyForStart());
        game.handleMessage(guest, "START");
        assertEquals(GamePhase.PREPARING, game.phase);
    }

    @Test
    void purchaseRequiresTheFacilityAndWeaponUnitRefillsItsAmmo() {
        startPreparing();
        player.credits = 700;
        game.unlockedAreas.addAll(Set.of("entry-room", "shotgun-room"));
        ShopUnit shotgunShop = GameMap.shopByItem("shotgun");
        player.x = shotgunShop.x();
        player.y = shotgunShop.y();

        game.handleMessage(player, "BUY:shotgun");

        assertTrue(player.ownsShotgun);
        assertEquals("shotgun", player.weapon);
        assertEquals(GameSession.weaponAmmoCapacity("shotgun"), player.shotgunAmmo);
        assertEquals(250, player.credits);

        player.shotgunAmmo = 4;
        game.handleMessage(player, "BUY:shotgun");
        assertEquals(GameSession.weaponAmmoCapacity("shotgun"), player.shotgunAmmo);
        assertEquals(130, player.credits,
                "the weapon unit should refill its own ammunition for 120G");

        game.handleMessage(player, "BUY:shotgun");
        assertEquals(130, player.credits, "full ammunition must not be charged again");

        player.credits = 1_000;
        game.handleMessage(player, "BUY:rifle");
        assertFalse(player.ownsRifle);
        assertEquals(1_000, player.credits,
                "a shop unit must sell only the item assigned to that unit");

        player.x = GameMap.CORE_X;
        player.y = GameMap.CORE_Y;
        game.handleMessage(player, "BUY:ammo");
        assertEquals(GameSession.weaponAmmoCapacity("shotgun"), player.shotgunAmmo);
        assertEquals(1_000, player.credits, "a remote purchase must be rejected");
    }

    @Test
    void enemiesCycleAcrossTheFixedSpawnLocationsForTheRound() {
        startWave();
        game.players.forEach(candidate -> candidate.human = true);
        for (int i = 0; i < 160; i++) game.update(.05);
        for (int i = 0; i < 4; i++) game.update(1.5);

        Set<String> usedSpawns = game.enemies.stream().map(enemy -> enemy.spawnId)
                .collect(java.util.stream.Collectors.toSet());
        assertTrue(usedSpawns.containsAll(game.activeSpawnIds),
                "the wave must visibly use every fixed spawn location");
    }

    @Test
    void addedWeaponsCanBePurchasedAndRestockedAtTheirOwnUnits() {
        startPreparing();
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        player.credits = 2_000;

        ShopUnit smgShop = GameMap.shopByItem("smg");
        player.x = smgShop.x();
        player.y = smgShop.y();
        game.handleMessage(player, "BUY:smg");
        assertTrue(player.ownsSmg);
        assertEquals("smg", player.weapon);
        assertEquals(GameSession.weaponAmmoCapacity("smg"), player.smgAmmo);

        ShopUnit sniperShop = GameMap.shopByItem("sniper");
        player.x = sniperShop.x();
        player.y = sniperShop.y();
        game.handleMessage(player, "BUY:sniper");
        assertTrue(player.ownsSniper);
        assertEquals("sniper", player.weapon);
        assertEquals(48, player.sniperAmmo);

        ShopUnit ammoShop = GameMap.shopByItem("ammo");
        player.x = ammoShop.x();
        player.y = ammoShop.y();
        game.handleMessage(player, "BUY:ammo");
        assertEquals(GameSession.weaponAmmoCapacity("smg"), player.smgAmmo);
        assertEquals(48, player.sniperAmmo);
    }

    @Test
    void attackRewardsOnlyThePlayersWhoLandHitsAndRespectsCooldown() {
        startWave();
        player.x = GameMap.CORE_X;
        player.y = GameMap.CORE_Y;
        Player teammate = game.players.get(1);
        teammate.human = true;
        teammate.x = player.x;
        teammate.y = player.y;
        Enemy enemy = new Enemy(9_001, "grunt", GameMap.SPAWN_POINTS.get(0),
                45, 0, 0, 15);
        enemy.x = player.x + 50;
        enemy.y = player.y;
        game.enemies.add(enemy);
        int initialCredits = player.credits;
        int teammateInitialCredits = teammate.credits;

        game.handleMessage(player, "ATTACK:" + enemy.id);

        assertEquals(19, enemy.hp);
        assertEquals(player.x + 50, enemy.x,
                "ordinary pistol hits should not knock enemies backward");
        assertEquals(0.38, player.cooldown);
        assertEquals(initialCredits + 8, player.credits,
                "the first attacker should immediately earn their damage share");
        assertEquals(teammateInitialCredits, teammate.credits);
        assertFalse(events.broadcasts.isEmpty(), "an attack should publish a hit effect");
        assertTrue(events.broadcasts.stream().anyMatch(message ->
                message.contains("\"effect\":\"hit\"") && message.contains("\"credits\":8")),
                "the hit effect should report the credits earned by that hit");
        assertTrue(events.broadcasts.stream().anyMatch(message ->
                message.contains("\"effect\":\"hit\"") && message.contains("\"headshot\":false")),
                "aiming at the center should remain a normal body shot");

        game.handleMessage(player, "ATTACK:" + enemy.id);
        assertEquals(19, enemy.hp, "cooldown must reject a second immediate attack");
        assertEquals(initialCredits + 8, player.credits);

        game.handleMessage(teammate, "ATTACK:" + enemy.id);
        assertTrue(enemy.hp <= 0);
        assertEquals(initialCredits + 8, player.credits,
                "a teammate's hit must not change the first attacker's balance");
        assertEquals(teammateInitialCredits + 7, teammate.credits);
        assertEquals(0, player.kills);
        assertEquals(1, teammate.kills);
    }

    @Test
    void aimingAtTheUpperHitboxDealsHeadshotDamage() {
        startWave();
        game.players.forEach(candidate -> candidate.human = true);
        game.enemies.clear();
        player.x = GameMap.CORE_X;
        player.y = GameMap.CORE_Y;
        Enemy enemy = new Enemy(9_020, "grunt", GameMap.SPAWN_POINTS.get(0),
                500, 0, 0, 0);
        enemy.x = player.x + 100;
        enemy.y = player.y;
        game.enemies.add(enemy);
        events.broadcasts.clear();

        game.handleMessage(player, "FIRE:" + enemy.x + ":" + (enemy.y - 10.5) + ":1");
        game.handleMessage(player, "FIRE:" + enemy.x + ":" + (enemy.y - 10.5) + ":0");

        assertEquals(448, enemy.hp, 0.001, "a pistol headshot should deal 2x damage");
        assertTrue(events.broadcasts.stream().anyMatch(message ->
                message.contains("\"headshot\":true") && message.contains("\"damage\":52.0")),
                "the hit effect should identify the headshot for client feedback");
    }

    @Test
    void heavyMeleeWeaponStillKnocksEnemiesBackward() {
        startWave();
        player.x = GameMap.CORE_X;
        player.y = GameMap.CORE_Y;
        game.handleMessage(player, "WEAPON:bat");
        Enemy enemy = new Enemy(9_002, "grunt", GameMap.SPAWN_POINTS.get(0),
                500, 0, 0, 0);
        enemy.x = player.x + 45;
        enemy.y = player.y;
        double initialX = enemy.x;
        game.enemies.add(enemy);

        game.handleMessage(player, "ATTACK:" + enemy.id);

        assertTrue(enemy.x > initialX, "the bat should retain its deliberate knockback");
    }

    @Test
    void directionalFireProducesAVisibleShotEvenWhenItMisses() {
        startWave();
        player.x = GameMap.CORE_X;
        player.y = GameMap.CORE_Y;
        events.broadcasts.clear();

        game.handleMessage(player, "FIRE:" + player.x + ":" + (player.y - 500) + ":1");
        game.handleMessage(player, "FIRE:" + player.x + ":" + (player.y - 500) + ":0");

        assertEquals(0.38, player.cooldown);
        assertTrue(events.broadcasts.stream().anyMatch(message ->
                message.contains("\"effect\":\"hit\"") && message.contains("\"damage\":0.0")));
    }

    @Test
    void heldFireRepeatsAtTheWeaponCooldown() {
        startWave();
        game.players.forEach(candidate -> candidate.human = true);
        player.x = GameMap.CORE_X;
        player.y = GameMap.CORE_Y;
        Enemy enemy = new Enemy(9_010, "grunt", GameMap.SPAWN_POINTS.get(0),
                500, 0, 0, 0);
        enemy.x = player.x + 100;
        enemy.y = player.y;
        game.enemies.add(enemy);

        game.handleMessage(player, "FIRE:" + (player.x + 500) + ":" + player.y + ":1");
        assertEquals(474, enemy.hp);
        game.update(0.38);
        assertEquals(448, enemy.hp, "holding fire must shoot again as soon as cooldown expires");
        game.handleMessage(player, "FIRE:" + (player.x + 500) + ":" + player.y + ":0");
    }

    @Test
    void releasedClickDuringCooldownIsNotQueued() {
        startWave();
        game.players.forEach(candidate -> candidate.human = true);
        player.x = GameMap.CORE_X;
        player.y = GameMap.CORE_Y;
        player.cooldown = 0.2;
        Enemy enemy = new Enemy(9_011, "grunt", GameMap.SPAWN_POINTS.get(0),
                500, 0, 0, 0);
        enemy.x = player.x + 100;
        enemy.y = player.y;
        game.enemies.add(enemy);

        game.handleMessage(player, "FIRE:" + (player.x + 500) + ":" + player.y + ":1");
        game.handleMessage(player, "FIRE:" + (player.x + 500) + ":" + player.y + ":0");
        assertEquals(500, enemy.hp);

        game.update(0.2);
        assertEquals(500, enemy.hp, "a released click made during cooldown must not be queued");
    }

    @Test
    void coreCarrierCannotFireWeapons() {
        startWave();
        game.players.forEach(candidate -> candidate.human = true);
        game.enemies.clear();
        game.queuedEnemies = 0;
        game.queuedBosses = 0;
        player.x = game.coreX;
        player.y = game.coreY;
        game.handleMessage(player, "EQUIP_CORE");
        assertTrue(player.movingCore);

        Enemy enemy = new Enemy(9_012, "grunt", GameMap.SPAWN_POINTS.get(0),
                500, 0, 0, 0);
        enemy.x = player.x + 100;
        enemy.y = player.y;
        game.enemies.add(enemy);

        game.handleMessage(player, "FIRE:" + (player.x + 500) + ":" + player.y + ":1");
        game.update(1);

        assertEquals(500, enemy.hp, "a core carrier must not fire any weapon");
    }

    @Test
    void unlockedResourceNodesAreCollectedAutomaticallyAndRespawn() {
        startPreparing();
        game.unlockedAreas.add("forest");
        ResourceNode node = game.resourceNodes.stream()
                .filter(candidate -> candidate.type.equals("wood")).findFirst().orElseThrow();
        player.x = node.x;
        player.y = node.y;

        game.update(0.05);
        assertEquals(1, player.wood);
        assertFalse(node.available);

        game.update(12);
        game.update(0.05);
        assertEquals(2, player.wood);
    }

    @Test
    void droppedMaterialsCanBeCollectedByAnotherPlayer() {
        startPreparing();
        game.players.forEach(candidate -> candidate.human = true);
        Player collector = game.players.get(1);
        player.x = 1_020;
        player.y = 1_900;
        player.facingX = 1;
        player.facingY = 0;
        player.wood = 5;
        collector.x = 1_060;
        collector.y = 1_900;
        game.players.get(2).x = 900;
        game.players.get(2).y = 1_980;
        game.players.get(3).x = 900;
        game.players.get(3).y = 1_820;

        game.handleMessage(player, "DROP_RESOURCE:wood:2");
        assertEquals(3, player.wood);
        assertEquals(1, game.droppedResources.size());
        assertTrue(SnapshotBuilder.build(game).contains("\"drops\":[{\"id\":"));

        game.update(2.4);
        assertEquals(0, collector.wood, "a dropped item must remain visible during its pickup delay");
        assertEquals(1, game.droppedResources.size());

        game.update(0.2);
        assertEquals(2, collector.wood);
        assertTrue(game.droppedResources.isEmpty());
    }

    @Test
    void earlyResourcePocketsRequireTheirOwnPaidAreas() {
        startPreparing();
        ResourceNode wood = game.resourceNodes.stream()
                .filter(candidate -> candidate.id.equals("early-wood-1"))
                .findFirst().orElseThrow();
        ResourceNode ore = game.resourceNodes.stream()
                .filter(candidate -> candidate.id.equals("early-ore-1"))
                .findFirst().orElseThrow();

        player.x = wood.x;
        player.y = wood.y;
        game.update(0.05);
        assertEquals(0, player.wood, "the side pocket must stay sealed before its area opens");

        game.unlockedAreas.add("wood-room");
        game.update(0.05);
        assertEquals(1, player.wood);

        player.x = ore.x;
        player.y = ore.y;
        game.update(0.05);
        assertEquals(0, player.ore, "ore must remain locked when only the wood room is open");
        game.unlockedAreas.add("ore-room");
        game.update(0.05);
        assertEquals(3, player.ore);
    }

    @Test
    void coreCanBePlacedOnTheFacingUnlockedFloorTile() {
        startPreparing();
        player.x = game.coreX;
        player.y = game.coreY;

        game.handleMessage(player, "EQUIP_CORE");
        assertTrue(player.movingCore);

        player.x = 1_020;
        player.y = 1_700;
        game.handleMessage(player, "MOVE:0:-1");
        game.handleMessage(player, "PLACE_FRONT");
        assertEquals(GameMap.CORE_X, game.coreX,
                "a sealed room must reject core placement");
        assertTrue(player.movingCore);

        player.x = GameMap.CORE_X;
        player.y = GameMap.CORE_Y;
        game.handleMessage(player, "MOVE:1:0");
        game.handleMessage(player, "PLACE_FRONT");
        assertEquals(1_060, game.coreX);
        assertEquals(1_900, game.coreY);
        assertFalse(player.movingCore);
        assertTrue(SnapshotBuilder.build(game).contains("\"core\":{\"x\":1060.0"));
    }

    @Test
    void carryingCoreSlowsMovementDisablesDashAndMovesTheCoreWithTheCarrier() {
        startPreparing();
        player.x = game.coreX;
        player.y = game.coreY;
        game.handleMessage(player, "EQUIP_CORE");
        game.handleMessage(player, "DASH:1");
        game.handleMessage(player, "MOVE:1:0");
        double startX = player.x;

        game.update(0.5);

        assertEquals(startX + 41, player.x, 0.01);
        assertFalse(player.dashing);
        assertEquals(player.x, game.coreX, 0.01);
        assertEquals(player.y, game.coreY, 0.01);
    }

    @Test
    void damageToTheCoreCarrierAlsoDamagesTheCore() {
        startWave();
        game.enemies.clear();
        game.queuedEnemies = 0;
        game.queuedBosses = 0;
        game.players.forEach(candidate -> {
            candidate.human = true;
            candidate.x = 1_400;
            candidate.y = 1_900;
        });
        player.x = game.coreX;
        player.y = game.coreY;
        game.handleMessage(player, "EQUIP_CORE");

        SpawnPoint spawn = GameMap.spawnById("east-field");
        Enemy enemy = new Enemy(9_040, "grunt", spawn, 500, 0, 10, 0);
        enemy.x = player.x;
        enemy.y = player.y;
        enemy.routeIndex = enemy.route.size();
        game.enemies.add(enemy);
        double playerHp = player.hp;
        double coreHp = game.coreHp;

        game.update(0.05);

        assertEquals(playerHp - 10, player.hp);
        assertEquals(coreHp - 10, game.coreHp);
    }

    @Test
    void nearbyPlayerIsRevivedOnlyAfterFourSeconds() {
        startPreparing();
        game.players.forEach(candidate -> candidate.human = true);
        Player target = game.players.get(1);
        player.x = 1020;
        player.y = 1900;
        target.x = 1060;
        target.y = 1900;
        target.hp = 0;
        target.down = true;

        assertNull(player.actionTarget);

        game.update(3.99);
        assertTrue(target.down);
        game.update(0.02);

        assertFalse(target.down);
        assertEquals(45, target.hp);
        assertNull(player.actionTarget);
    }

    @Test
    void movementStopsAtAMapWall() {
        startPreparing();
        player.x = 805;
        player.y = 1_860;

        game.handleMessage(player, "MOVE:-1:0");
        game.update(0.1);

        assertEquals(805, player.x, "the player collision must not cross the map wall");
        assertEquals(1_860, player.y);
    }

    @Test
    void craftedDefenseConsumesMaterialsAndCanBePlaced() {
        startPreparing();
        game.unlockedAreas.add("entry-room");
        player.x = GameMap.WORKBENCH_X;
        player.y = GameMap.WORKBENCH_Y;
        player.wood = 2;
        player.ore = 6;
        game.handleMessage(player, "CRAFT:mine");

        assertEquals(1, player.mineItems);
        assertEquals(1, player.wood);
        assertEquals(1, player.ore);
        assertEquals("mine", player.selectedBuild);
        int initialSlots = game.trapSlots.size();
        player.x = 1_020;
        player.y = 1_380;
        game.handleMessage(player, "MOVE:1:0");
        game.handleMessage(player, "PLACE_FRONT");

        assertEquals(initialSlots + 1, game.trapSlots.size());
        TrapSlot placed = game.trapSlots.get(game.trapSlots.size() - 1);
        assertEquals(1_060, placed.x);
        assertEquals(1_380, placed.y);
        assertEquals("mine", placed.defense.type);
        assertEquals(0, player.mineItems);
        assertNull(player.selectedBuild);
    }

    @Test
    void distributedWorkbenchRequiresItsAreaAndCanCraftWhenUnlocked() {
        startPreparing();
        WorkbenchUnit workbench = GameMap.WORKBENCH_UNITS.stream()
                .filter(candidate -> candidate.id().equals("workbench-command"))
                .findFirst().orElseThrow();
        player.x = workbench.x();
        player.y = workbench.y();
        player.wood = 8;

        game.handleMessage(player, "CRAFT:block");
        assertEquals(0, player.blockItems);

        game.unlockedAreas.add(workbench.requiredArea());
        game.handleMessage(player, "CRAFT:block");
        assertEquals(1, player.blockItems);
        assertEquals(4, player.wood);
    }

    @Test
    void placedBlockSnapsToTheGridBlocksMovementAndCanBeRemoved() {
        startPreparing();
        player.x = 1_140;
        player.y = 1_900;
        player.blockItems = 1;
        player.selectedBuild = "block";
        int initialSlots = game.trapSlots.size();
        game.handleMessage(player, "MOVE:1:0");
        game.handleMessage(player, "PLACE_FRONT");

        assertEquals(initialSlots + 1, game.trapSlots.size());
        TrapSlot block = game.trapSlots.get(game.trapSlots.size() - 1);
        assertEquals(1_180, block.x);
        assertEquals(1_900, block.y);
        assertEquals("block", block.defense.type);

        player.x = 1_140;
        player.y = 1_900;
        game.handleMessage(player, "MOVE:1:0");
        game.update(0.2);
        assertEquals(1_140, player.x, "a placed block must stop player movement");

        game.handleMessage(player, "REMOVE:" + block.id);
        assertEquals(initialSlots, game.trapSlots.size());
        assertEquals(1, player.blockItems, "removing a block returns it to the owner");
    }

    @Test
    void noticesAreBroadcastImmediatelyAsLogEvents() {
        game.handleMessage(player, "ROOM_READY:1");
        events.broadcasts.clear();

        game.handleMessage(player, "START");

        assertTrue(events.broadcasts.stream().anyMatch(message -> message.contains("\"type\":\"log\"")));
        assertTrue(events.broadcasts.stream().anyMatch(message -> message.contains("次のラウンドの準備を始めます")));
    }

    @Test
    void staleOrDuplicateInputSequenceIsIgnoredAndAcknowledgedInSnapshots() {
        game.handleMessage(player, "INPUT:1:ROOM_READY:1");
        game.handleMessage(player, "INPUT:2:START");
        assertEquals(GamePhase.PREPARING, game.phase);
        assertEquals(2, player.lastProcessedInput);

        game.handleMessage(player, "INPUT:1:READY");
        assertEquals(12, game.prepTime, "an older input must not change the game");

        game.handleMessage(player, "INPUT:3:READY");
        assertEquals(0, game.prepTime);
        assertTrue(SnapshotBuilder.build(game).contains("\"ackInput\":3"));
    }

    @Test
    void reconnectTokenRestoresTheSamePlayerAndState() {
        player.name = "Reconnect Tester";
        player.x = 777;
        player.ownsShotgun = true;
        game.disconnectPlayer(player);

        Player rejoined = game.connectPlayer("test-session-a");

        assertSame(player, rejoined);
        assertTrue(rejoined.human);
        assertEquals("Reconnect Tester", rejoined.name);
        assertEquals(777, rejoined.x);
        assertTrue(rejoined.ownsShotgun);
    }

    @Test
    void enemyFollowsTheEntryCorridorBeforeTurningTowardTheCore() {
        startWave();
        game.players.forEach(candidate -> candidate.human = true);
        game.enemies.clear();
        game.queuedEnemies = 0;
        game.queuedBosses = 0;
        SpawnPoint spawn = GameMap.spawnById("south-gate");
        Enemy enemy = new Enemy(9_002, "grunt", spawn, 500, 100, 0, 0);
        game.enemies.add(enemy);

        game.update(1);

        assertTrue(enemy.y < spawn.y());
        assertEquals(100, enemy.speed, 0.01, "the entry speed characteristic must be applied");
    }

    @Test
    void enemiesUseSlightlyDifferentLinesTowardTheSameRoutePoint() {
        startWave();
        game.players.forEach(candidate -> {
            candidate.human = true;
            candidate.moveX = 0;
            candidate.moveY = 0;
        });
        game.enemies.clear();
        game.queuedEnemies = 0;
        game.queuedBosses = 0;
        SpawnPoint spawn = GameMap.spawnById("south-gate");
        Enemy first = new Enemy(9_020, "grunt", spawn, 500, 100, 0, 0);
        Enemy second = new Enemy(9_021, "grunt", spawn, 500, 100, 0, 0);
        game.enemies.add(first);
        game.enemies.add(second);

        game.update(0.5);

        assertTrue(GameSupport.distance(first.x, first.y, second.x, second.y) > 0.1,
                "enemy drift should stop identical single-file movement");
    }

    @Test
    void cpuNeedsTimeToRecognizeANewEnemyBeforeAttacking() {
        startWave();
        game.enemies.clear();
        game.queuedEnemies = 0;
        game.queuedBosses = 0;
        Player bot = game.players.get(1);
        SpawnPoint spawn = GameMap.spawnById("south-gate");
        Enemy enemy = new Enemy(9_030, "grunt", spawn, 500, 0, 0, 0);
        enemy.x = bot.x + 100;
        enemy.y = bot.y;
        game.enemies.add(enemy);

        game.update(0.05);
        assertEquals(500, enemy.hp, "CPU should not attack on the first sighting");

        game.update(0.7);
        assertTrue(enemy.hp < 500, "CPU should attack after its recognition delay");
    }

    @Test
    void cpuPrioritizesAnEnemyThreateningTheCoreOverANearbyDecoy() {
        startWave();
        game.enemies.clear();
        game.queuedEnemies = 0;
        game.queuedBosses = 0;
        Player bot = game.players.get(1);
        game.players.get(2).human = true;
        game.players.get(3).human = true;
        bot.x = game.coreX + 500;
        bot.y = game.coreY;
        SpawnPoint spawn = GameMap.SPAWN_POINTS.get(0);
        Enemy nearbyDecoy = new Enemy(9_031, "grunt", spawn, 500, 0, 0, 0);
        nearbyDecoy.x = bot.x + 70;
        nearbyDecoy.y = bot.y;
        Enemy coreThreat = new Enemy(9_032, "runner", spawn, 500, 0, 0, 0);
        coreThreat.x = game.coreX + 70;
        coreThreat.y = game.coreY;
        coreThreat.routeIndex = coreThreat.route.size();
        game.enemies.add(nearbyDecoy);
        game.enemies.add(coreThreat);

        game.update(1.3);

        assertEquals(coreThreat.id, bot.botTargetEnemyId,
                "CPU threat scoring should protect the core instead of chasing the nearest enemy");
    }

    @Test
    void cpuSpendsPersonalGoldOnAvailableWeapons() {
        startPreparing();
        game.unlockedAreas.addAll(Set.of("entry-room", "shotgun-room"));
        Player bot = game.players.get(1);
        bot.credits = 450;

        game.prepTime = 90;
        game.update(.05);
        assertFalse(bot.ownsShotgun, "CPU must travel to the facility before buying");
        for (int i = 0; i < 900 && !bot.ownsShotgun; i++) game.update(.05);

        assertTrue(bot.ownsShotgun);
        assertEquals(0, bot.credits);
        assertEquals("shotgun", bot.weapon);
    }

    @Test
    void cpuPlayersSeparateInsteadOfStackingOnOnePoint() {
        startPreparing();
        List<Player> bots = game.players.stream().filter(candidate -> !candidate.human).toList();
        bots.forEach(bot -> { bot.x = 1020; bot.y = 1900; });

        game.update(0.7);

        double widestSeparation = 0;
        for (Player first : bots) {
            for (Player second : bots) {
                widestSeparation = Math.max(widestSeparation,
                        GameSupport.distance(first.x, first.y, second.x, second.y));
            }
        }
        assertTrue(widestSeparation > 20, "CPU formation and avoidance should spread the team");
    }

    @Test
    void cpuUsesWalkableTilePathsToReachADeepCorePosition() {
        startPreparing();
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        game.coreX = 300;
        game.coreY = 300;
        game.prepTime = 100;
        Player bot = game.players.get(1);
        game.players.get(2).human = true;
        game.players.get(3).human = true;
        bot.x = 1_020;
        bot.y = 1_900;
        double initialDistance = GameSupport.distance(bot.x, bot.y, game.coreX, game.coreY);

        for (int i = 0; i < 200; i++) game.update(0.1);

        assertTrue(GameSupport.distance(bot.x, bot.y, game.coreX, game.coreY)
                < initialDistance - 700,
                "CPU should navigate the corridor instead of walking into a wall");
        assertTrue(GameMap.canOccupy(bot.x, bot.y, 5, game.unlockedAreas));
    }

    @Test
    void turretCannotShootAnEnemyThroughAWall() {
        startWave();
        game.players.forEach(candidate -> candidate.human = true);
        game.enemies.clear();
        game.queuedEnemies = 0;
        game.queuedBosses = 0;
        TrapSlot slot = new TrapSlot("wall-test-turret", "south", 1_200, 1_900, null);
        slot.defense = new Defense("turret");
        game.trapSlots.add(slot);
        Enemy enemy = new Enemy(9_040, "grunt", GameMap.SPAWN_POINTS.get(0),
                500, 0, 0, 0);
        enemy.x = 1_200;
        enemy.y = 1_650;
        game.enemies.add(enemy);
        assertFalse(GameMap.hasClearLine(slot.x, slot.y, enemy.x, enemy.y));

        game.update(0.1);

        assertEquals(500, enemy.hp, 0.001,
                "a turret must ignore targets hidden behind solid map tiles");
    }

    @Test
    void defensePriorityEnemiesAttackBuiltEquipmentBeforeNearbyPlayers() {
        startWave();
        game.enemies.clear();
        game.queuedEnemies = 0;
        game.queuedBosses = 0;
        game.players.forEach(candidate -> candidate.human = true);
        TrapSlot slot = new TrapSlot("test-defense", "east", 1080, 550, null);
        game.trapSlots.add(slot);
        slot.defense = new Defense("turret");
        double initialDefenseHp = slot.defense.hp;
        player.x = slot.x + 34;
        player.y = slot.y;
        SpawnPoint spawn = GameMap.spawnById("west-field");
        Enemy enemy = new Enemy(9_003, "brute", spawn, 500, 0, 25, 0);
        enemy.x = player.x;
        enemy.y = player.y;
        game.enemies.add(enemy);

        game.update(0.05);

        assertTrue(slot.defense.hp < initialDefenseHp,
                () -> "defense hp=" + slot.defense.hp + ", priority=" + enemy.targetPriority
                        + ", cooldown=" + enemy.attackCooldown + ", distance="
                        + GameSupport.distance(enemy.x, enemy.y, slot.x, slot.y));
        assertEquals(100, player.hp, "a defense-priority enemy must ignore the nearby player first");
    }

    @Test
    void scheduledRoundEventsIncludeBlackoutDoorFailureAndMultipleBosses() {
        startPreparing();

        beginSpecificRound(3);
        assertEquals("blackout", game.roundEvent);
        assertTrue(game.blackoutActive);
        assertEquals(1, game.blackoutBreakerTotal,
                "the always-accessible outdoor breaker must make a blackout solvable");

        beginSpecificRound(5);
        assertEquals("door_failure", game.roundEvent);
        assertTrue(game.activeSpawnIds.contains(game.failedSpawnId));

        beginSpecificRound(8);
        assertEquals("boss_assault", game.roundEvent);
        assertEquals(2, game.queuedBosses);

        beginSpecificRound(20);
        assertEquals("boss_assault", game.roundEvent);
        assertEquals(5, game.queuedBosses);
        game.queuedEnemies = 0;
        game.queuedBosses = 0;
        game.enemies.clear();
        game.update(0.05);
        assertEquals(GamePhase.PREPARING, game.phase, "round 20 must no longer finish the match");
        beginSpecificRound(50);
        game.queuedEnemies=0; game.queuedBosses=0; game.enemies.clear(); game.update(.05);
        assertEquals(GamePhase.WON, game.phase, "clearing round 50 should win the match");
    }

    @Test
    void nearbyBreakerRestoresPowerAfterBlackout() {
        startPreparing();
        beginSpecificRound(3);
        BreakerTerminal breaker = GameMap.BREAKER_TERMINALS.stream()
                .filter(candidate -> candidate.requiredArea() == null)
                .findFirst().orElseThrow();

        game.handleMessage(player, "BREAKER:" + breaker.id());
        assertTrue(game.blackoutActive, "a remote player must not reset the breaker");

        player.x = breaker.x();
        player.y = breaker.y();
        game.handleMessage(player, "BREAKER:" + breaker.id());

        assertFalse(game.blackoutActive);
        assertTrue(game.trippedBreakers.isEmpty());
        assertTrue(game.notice.contains("電力が復旧しました"));
    }

    @Test
    void blackoutUsesOneBreakerAndPersistsAfterRoundClear() {
        startPreparing();
        game.unlockedAreas.add("entry-room");
        game.unlockedAreas.add("transit-hall");
        beginSpecificRound(3);

        assertEquals(1, game.blackoutBreakerTotal);
        assertEquals(1, game.trippedBreakers.size());
        game.queuedEnemies = 0;
        game.queuedBosses = 0;
        game.enemies.clear();
        game.update(0.05);

        assertEquals(GamePhase.PREPARING, game.phase);
        assertTrue(game.blackoutActive, "round clear must not repair the breaker");
        assertEquals(1, game.trippedBreakers.size());
    }

    @Test
    void timeControlExtendsPreparationByOneMinuteForTenGold() {
        startPreparing();
        player.credits = 10;
        game.unlockedAreas.add(GameMap.PREP_CONSOLE.requiredArea());
        player.x = GameMap.PREP_CONSOLE.x();
        player.y = GameMap.PREP_CONSOLE.y();
        double previousTime = game.prepTime;
        int previousGold = player.credits;

        game.handleMessage(player, "EXTEND_PREP");

        assertEquals(previousTime + 60, game.prepTime);
        assertEquals(previousGold - 10, player.credits);
    }

    @Test
    void timeControlDuringWaveExtendsTheNextBreak() {
        startWave();
        player.credits = 10;
        game.unlockedAreas.add(GameMap.PREP_CONSOLE.requiredArea());
        player.x = GameMap.PREP_CONSOLE.x();
        player.y = GameMap.PREP_CONSOLE.y();

        game.handleMessage(player, "EXTEND_PREP");
        assertEquals(60, game.nextPrepBonusSeconds);

        game.queuedEnemies = 0;
        game.queuedBosses = 0;
        game.enemies.clear();
        game.update(0.05);
        assertEquals(GameConfig.PREP_SECONDS + 60, game.prepTime);
        assertEquals(0, game.nextPrepBonusSeconds);
    }

    @Test
    void bossPulseDamagesTheCoreAndPlayersInItsDefenseZone() {
        startWave();
        game.enemies.clear();
        game.queuedEnemies = 0;
        game.queuedBosses = 0;
        game.players.forEach(candidate -> candidate.human = true);
        player.x = GameMap.CORE_X;
        player.y = GameMap.CORE_Y;
        Enemy boss = new Enemy(9_004, "boss", GameMap.spawnById("south-gate"),
                1_000, 0, 48, 0);
        boss.x = GameMap.CORE_X + 200;
        boss.y = GameMap.CORE_Y;
        boss.routeIndex = boss.route.size();
        boss.specialCooldown = 0;
        game.enemies.add(boss);

        game.update(0.05);

        assertTrue(game.coreHp < game.coreMaxHp);
        assertTrue(player.hp < 100);
        assertTrue(events.broadcasts.stream().anyMatch(message -> message.contains("core-pulse")));
    }

    private void beginSpecificRound(int targetRound) {
        game.phase = GamePhase.PREPARING;
        game.round = targetRound - 1;
        game.prepTime = 0;
        game.queuedEnemies = 0;
        game.queuedBosses = 0;
        game.enemies.clear();
        game.update(0.05);
        assertEquals(targetRound, game.round);
        assertEquals(GamePhase.WAVE, game.phase);
    }

    private static MapPoint nearbyBuildPoint(UnlockArea area, Player player) {
        for (AreaTile tile : area.tiles()) {
            MapPoint point = GameMap.snapToTile(tile.column() * GameMap.TILE_SIZE,
                    tile.row() * GameMap.TILE_SIZE);
            if (GameMap.canPlaceDefense(point.x(), point.y(), Set.of(area.id()))
                    && GameSupport.distance(point.x(), point.y(), player.x, player.y) <= 180
                    && GameSupport.distance(point.x(), point.y(), player.x, player.y) >= 48) {
                return point;
            }
        }
        throw new AssertionError("no nearby build point for " + area.id());
    }

    private void startPreparing() {
        game.handleMessage(player, "ROOM_READY:1");
        game.handleMessage(player, "START");
        assertEquals(GamePhase.PREPARING, game.phase);
    }

    private void startWave() {
        startPreparing();
        game.handleMessage(player, "READY");
        game.update(0.05);
        assertEquals(GamePhase.WAVE, game.phase);
    }

    private static final class RecordingEvents implements GameEventSink {
        final List<String> broadcasts = new ArrayList<>();
        final List<String> directMessages = new ArrayList<>();

        @Override
        public void broadcast(String message) {
            broadcasts.add(message);
        }

        @Override
        public void send(Player recipient, String message) {
            directMessages.add(recipient.id + ":" + message);
        }
    }
}
