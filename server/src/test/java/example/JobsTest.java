package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class JobsTest {
    GameSession game;
    Player player;

    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player recipient, String message) { }
        });
        player = game.connectPlayer("jobs-test");
        game.setRoomOwner(player);
    }

    void start(String job) {
        game.handleMessage(player, "JOB:" + job);
        game.handleMessage(player, "START");
        game.players.forEach(p -> p.human = true);
        game.prepTime = 1000;
        player.x = 1140; player.y = 1900;
    }

    Object call(String name, Class<?>[] types, Object... args) throws Exception {
        Method method = GameSession.class.getDeclaredMethod(name, types);
        method.setAccessible(true);
        return method.invoke(game, args);
    }

    @Test void lobbySelectionClearsReadyAndPersistsThroughStartAndReconnect() {
        assertEquals("healer", player.job);
        Player guest = game.connectPlayer("guest");
        game.handleMessage(guest, "ROOM_READY:1");
        game.handleMessage(guest, "JOB:tp");
        assertFalse(guest.roomReady);
        game.handleMessage(guest, "JOB:invalid");
        assertEquals("tp", guest.job);
        game.handleMessage(guest, "ROOM_READY:1");
        game.handleMessage(player, "JOB:scout");
        game.handleMessage(player, "START");
        assertEquals("scout", player.job);
        assertEquals("tp", guest.job);
        game.handleMessage(player, "JOB:spy");
        assertEquals("scout", player.job);
        game.disconnectPlayer(player);
        assertSame(player, game.connectPlayer("jobs-test"));
        assertEquals("scout", player.job);
    }

    @Test void healerRevivesAtTwoSecondsButOtherJobsNeedFour() throws Exception {
        start("healer");
        Player target = game.players.get(1);
        target.x = player.x + 40; target.y = player.y; target.down = true; target.hp = 0;
        call("updateRevives", new Class<?>[]{double.class}, 1.99);
        assertTrue(target.down);
        call("updateRevives", new Class<?>[]{double.class}, .02);
        assertFalse(target.down);
        assertEquals(45, target.hp);
        player.job = "scout";
        target.down = true; target.hp = 0;
        call("updateRevives", new Class<?>[]{double.class}, 3.99);
        assertTrue(target.down);
        call("updateRevives", new Class<?>[]{double.class}, .02);
        assertFalse(target.down);
    }

    @Test void scoutMovesFasterAndUsesLessStaminaWithCpuAndHumanRules() throws Exception {
        start("scout");
        player.moveX = 1; player.dashHeld = true;
        call("updatePlayers", new Class<?>[]{double.class}, .1);
        assertEquals(1170.5, player.x, 1e-6);
        assertEquals(97.625, player.stamina, 1e-6);
        player.human = false;
        call("updatePlayers", new Class<?>[]{double.class}, .1);
        assertEquals(1201, player.x, 1e-6);
        assertEquals(95.25, player.stamina, 1e-6);
        player.job = "healer";
        call("updatePlayers", new Class<?>[]{double.class}, .1);
        assertEquals(1227.5, player.x, 1e-6);
        assertEquals(91.45, player.stamina, 1e-6);
    }

    @Test void spyAvoidsRecognitionAndMeleeUntilExpiryButExplosionsStillHurt() throws Exception {
        start("spy");
        Enemy enemy = new Enemy(99, "grunt", GameMap.SPAWN_POINTS.get(0), 100, 0, 10, 0);
        enemy.x = player.x; enemy.y = player.y - 20;
        game.enemies.add(enemy);
        game.phase = GamePhase.WAVE;
        game.queuedEnemies = 1;
        game.handleMessage(player, "JOB_ABILITY");
        assertTrue(JobRules.disguised(player));
        assertNull(call("nearestPlayer", new Class<?>[]{Enemy.class, double.class}, enemy, 36.0));
        call("updateEnemies", new Class<?>[]{double.class}, .05);
        assertEquals(100, player.hp);
        call("damagePlayer", new Class<?>[]{Player.class, double.class}, player, 10.0);
        assertEquals(90, player.hp, "area damage is not blocked by disguise");
        game.update(8);
        assertFalse(JobRules.disguised(player));
        assertSame(player, call("nearestPlayer", new Class<?>[]{Enemy.class, double.class}, enemy, 36.0));
        game.handleMessage(player, "JOB_ABILITY");
        assertEquals(0, player.spyRemaining);
        game.update(22);
        game.handleMessage(player, "JOB_ABILITY");
        assertEquals(8, player.spyRemaining);
    }

    @Test void teleportPairIsLimitedAndUsableByAlliesWithSafeDestinationAndCooldown() {
        start("tp");
        player.facingX = 1; player.facingY = 0;
        game.handleMessage(player, "JOB_ABILITY");
        assertEquals(1, player.teleportPads.size());
        Player ally = game.players.get(1);
        ally.x = 1180; ally.y = 1900;
        game.handleMessage(ally, "TELEPORT");
        assertEquals(1180, ally.x, "unfinished pair cannot be used");
        player.y = 1820;
        game.handleMessage(player, "JOB_ABILITY");
        assertEquals(2, player.teleportPads.size());
        game.handleMessage(ally, "TELEPORT");
        assertEquals(1820, ally.y);
        game.handleMessage(ally, "TELEPORT");
        assertEquals(1820, ally.y);
        ally.teleportCooldown = 0;
        Player blocker = game.players.get(2);
        blocker.x = 1180; blocker.y = 1900;
        game.handleMessage(ally, "TELEPORT");
        assertEquals(1820, ally.y);
        blocker.x = 820;
        ally.movingCore = true;
        game.handleMessage(ally, "TELEPORT");
        assertEquals(1820, ally.y);
        ally.movingCore = false;
        game.handleMessage(ally, "TELEPORT");
        assertEquals(1900, ally.y);
        game.handleMessage(player, "JOB_ABILITY");
        assertTrue(player.teleportPads.isEmpty(), "completed pair is recovered rather than adding a third pad");
    }

    @Test void teleportPlacementRejectsWallsOverlapAndWrongJob() {
        start("tp");
        player.x = 1140; player.facingX = 1; player.facingY = 0;
        game.handleMessage(player, "JOB_ABILITY");
        game.handleMessage(player, "JOB_ABILITY");
        assertEquals(1, player.teleportPads.size());
        assertTrue(BuildingRules.teleportPadOccupied(new MapPoint(1180, 1900), game.players, 36));
        player.x = 900; player.y = 600;
        game.handleMessage(player, "JOB_ABILITY");
        assertEquals(1, player.teleportPads.size());
        player.job = "healer";
        game.handleMessage(player, "JOB_ABILITY");
        assertEquals(1, player.teleportPads.size());
    }

    @Test void adjacentPadsUseNearestEndpointAndBlockedTerrainStopsArrival() {
        start("tp");
        player.teleportPads.add(new MapPoint(1180, 1900));
        player.teleportPads.add(new MapPoint(1220, 1900));
        player.x = 1180;
        game.handleMessage(player, "TELEPORT");
        assertEquals(1220, player.x);
        player.teleportCooldown = 0;
        game.handleMessage(player, "TELEPORT");
        assertEquals(1180, player.x);
        player.teleportCooldown = 0;
        player.teleportPads.set(1, new MapPoint(940, 600));
        game.handleMessage(player, "TELEPORT");
        assertEquals(1180, player.x);
    }

    @Test void snapshotIncludesJobsTimersMovementRulesAndPads() throws Exception {
        start("tp");
        player.facingX = 1; player.facingY = 0;
        game.handleMessage(player, "JOB_ABILITY");
        var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game));
        var me = snapshot.get("players").get(0);
        assertEquals("tp", me.get("job").asText());
        assertEquals(1, me.get("teleportPads").size());
        assertEquals(265, me.get("dashSpeed").asDouble());
        assertEquals(4, me.get("reviveSeconds").asDouble());
        assertEquals(0, me.get("jobCooldown").asDouble());
    }
}
