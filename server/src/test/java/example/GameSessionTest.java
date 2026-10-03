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
    }

    @Test
    void startReadyClearAndNextRoundProgressThroughExpectedPhases() {
        game.handleMessage(player, "START");
        assertEquals(GamePhase.PREPARING, game.phase);
        assertEquals(0, game.round);

        game.handleMessage(player, "READY");
        game.update(0.05);

        assertEquals(GamePhase.WAVE, game.phase);
        assertEquals(1, game.round);
        assertEquals(12, game.queuedEnemies);
        assertEquals(1, game.activeSpawnIds.size());

        game.queuedEnemies = 0;
        game.queuedBosses = 0;
        game.enemies.clear();
        game.update(0.05);

        assertEquals(GamePhase.PREPARING, game.phase);
        assertEquals(GameConfig.PREP_SECONDS, game.prepTime);
        assertEquals(910, player.credits);
        assertTrue(game.players.stream().allMatch(candidate -> candidate.credits == 910),
                "round rewards should be granted to every personal balance");

        game.handleMessage(player, "READY");
        game.update(0.05);
        assertEquals(GamePhase.WAVE, game.phase);
        assertEquals(2, game.round);
        assertEquals(16, game.queuedEnemies);
    }

    @Test
    void purchaseRequiresTheFacilityAndChargesOnlyOnce() {
        startPreparing();
        player.x = GameMap.ARMORY_X;
        player.y = GameMap.ARMORY_Y;

        game.handleMessage(player, "BUY:shotgun");

        assertTrue(player.ownsShotgun);
        assertEquals("shotgun", player.weapon);
        assertEquals(30, player.shotgunAmmo);
        assertEquals(250, player.credits);

        game.handleMessage(player, "BUY:shotgun");
        assertEquals(250, player.credits, "an owned weapon must not be charged twice");

        player.x = GameMap.CORE_X;
        player.y = GameMap.CORE_Y;
        player.credits = 1_000;
        game.handleMessage(player, "BUY:rifle");
        assertFalse(player.ownsRifle);
        assertEquals(1_000, player.credits, "a remote purchase must be rejected");
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
        assertEquals(0.38, player.cooldown);
        assertEquals(initialCredits + 8, player.credits,
                "the first attacker should immediately earn their damage share");
        assertEquals(teammateInitialCredits, teammate.credits);
        assertFalse(events.broadcasts.isEmpty(), "an attack should publish a hit effect");

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
    void clickDuringCooldownQueuesAShotInsteadOfDroppingTheInput() {
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
        assertEquals(474, enemy.hp, "a click made during cooldown must fire when ready");
    }

    @Test
    void resourceSitesProvidePersonalCraftingMaterialsWithACooldown() {
        startPreparing();
        player.x = GameMap.WOODCUTTER_X;
        player.y = GameMap.WOODCUTTER_Y;

        game.handleMessage(player, "GATHER:wood");
        assertEquals(4, player.wood);
        game.handleMessage(player, "GATHER:wood");
        assertEquals(4, player.wood, "a resource site cannot be spammed during cooldown");

        game.update(GameConfig.GATHER_COOLDOWN_SECONDS);
        game.handleMessage(player, "GATHER:wood");
        assertEquals(8, player.wood);
    }

    @Test
    void nearbyPlayerIsRevivedOnlyAfterFourSeconds() {
        startPreparing();
        game.players.forEach(candidate -> candidate.human = true);
        Player target = game.players.get(1);
        player.x = 900;
        player.y = 600;
        target.x = 940;
        target.y = 600;
        target.hp = 0;
        target.down = true;

        game.handleMessage(player, "INTERACT:" + target.id);
        assertEquals(target.id, player.actionTarget);

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
        player.x = 330;
        player.y = 200;

        game.handleMessage(player, "MOVE:1:0");
        game.update(0.1);

        assertEquals(330, player.x, "the player radius must not cross the wall at x=360");
        assertEquals(200, player.y);
    }

    @Test
    void craftedDefenseConsumesMaterialsAndCanBePlaced() {
        startPreparing();
        player.x = GameMap.WORKBENCH_X;
        player.y = GameMap.WORKBENCH_Y;
        player.wood = 2;
        player.ore = 6;
        game.handleMessage(player, "CRAFT:mine");

        assertEquals(1, player.mineItems);
        assertEquals(1, player.wood);
        assertEquals(1, player.ore);
        assertEquals("mine", player.selectedBuild);
        player.x = 2_460;
        player.y = 1_940;
        game.handleMessage(player, "PLACE:2460:2020:mine");

        assertEquals(1, game.trapSlots.size());
        assertEquals("mine", game.trapSlots.get(0).defense.type);
        assertEquals(0, player.mineItems);
        assertNull(player.selectedBuild);
    }

    @Test
    void placedBlockSnapsToTheGridBlocksMovementAndCanBeRemoved() {
        startPreparing();
        player.x = 2_410;
        player.y = 2_020;
        player.blockItems = 1;
        player.selectedBuild = "block";
        game.handleMessage(player, "PLACE:2479:2039:block");

        assertEquals(1, game.trapSlots.size());
        TrapSlot block = game.trapSlots.get(0);
        assertEquals(2_460, block.x);
        assertEquals(2_020, block.y);
        assertEquals("block", block.defense.type);

        player.x = 2_410;
        player.y = 2_020;
        game.handleMessage(player, "MOVE:1:0");
        game.update(0.2);
        assertEquals(2_410, player.x, "a placed block must stop player movement");

        game.handleMessage(player, "REMOVE:" + block.id);
        assertTrue(game.trapSlots.isEmpty());
        assertEquals(1, player.blockItems, "removing a block returns it to the owner");
    }

    @Test
    void noticesAreBroadcastImmediatelyAsLogEvents() {
        events.broadcasts.clear();

        game.handleMessage(player, "START");

        assertTrue(events.broadcasts.stream().anyMatch(message -> message.contains("\"type\":\"log\"")));
        assertTrue(events.broadcasts.stream().anyMatch(message -> message.contains("CORE防衛準備")));
    }

    @Test
    void staleOrDuplicateInputSequenceIsIgnoredAndAcknowledgedInSnapshots() {
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
        game.enemies.clear();
        game.queuedEnemies = 0;
        game.queuedBosses = 0;
        SpawnPoint spawn = GameMap.spawnById("north-east-tunnel");
        Enemy enemy = new Enemy(9_002, "grunt", spawn, 500, 100, 0, 0);
        game.enemies.add(enemy);

        game.update(1);

        assertEquals(spawn.x(), enemy.x, 0.01,
                "the enemy must travel down the reactor corridor before turning toward CORE");
        assertTrue(enemy.y > spawn.y());
        assertEquals(110, enemy.speed, 0.01, "the entry speed characteristic must be applied");
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
        SpawnPoint spawn = GameMap.spawnById("east-gate");
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

        beginSpecificRound(5);
        assertEquals("door_failure", game.roundEvent);
        assertTrue(game.activeSpawnIds.contains(game.failedSpawnId));

        beginSpecificRound(8);
        assertEquals("boss_assault", game.roundEvent);
        assertEquals(2, game.queuedBosses);
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
        Enemy boss = new Enemy(9_004, "boss", GameMap.spawnById("north-service-hatch"),
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
        for (double y = area.y() + GameMap.TILE_SIZE / 2.0;
                y < area.y() + area.height(); y += GameMap.TILE_SIZE) {
            for (double x = area.x() + GameMap.TILE_SIZE / 2.0;
                    x < area.x() + area.width(); x += GameMap.TILE_SIZE) {
                MapPoint point = GameMap.snapToTile(x, y);
                if (GameMap.canPlaceDefense(point.x(), point.y(), Set.of(area.id()))
                        && GameSupport.distance(point.x(), point.y(), player.x, player.y) <= 180
                        && GameSupport.distance(point.x(), point.y(), player.x, player.y) >= 48) {
                    return point;
                }
            }
        }
        throw new AssertionError("no nearby build point for " + area.id());
    }

    private void startPreparing() {
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
