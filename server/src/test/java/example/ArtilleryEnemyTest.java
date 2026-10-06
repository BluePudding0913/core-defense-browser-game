package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ArtilleryEnemyTest {
    GameSession game;
    Player player;
    Enemy artillery;
    List<String> effects = new ArrayList<>();

    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { effects.add(message); }
            public void send(Player recipient, String message) { }
        });
        player = game.connectPlayer("artillery-test");
        game.players.clear(); game.players.add(player); player.human = true;
        game.trapSlots.clear();
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        game.round = 12; game.phase = GamePhase.WAVE;
        artillery = new Enemy(9000, "artillery", GameMap.SPAWN_POINTS.get(0), 250, 20, 28, 100);
        artillery.x = 1020; artillery.y = 1900;
        player.x = 1220; player.y = 1900; player.hp = 100;
        game.coreX = 1020; game.coreY = 1980;
        game.enemies.add(artillery);
        assertTrue(GameMap.hasClearLine(artillery.x, artillery.y, player.x, player.y));
    }

    Object invoke(String name, Class<?>[] types, Object... args) throws Exception {
        Method method = GameSession.class.getDeclaredMethod(name, types);
        method.setAccessible(true);
        return method.invoke(game, args);
    }

    void update(double dt) throws Exception {
        invoke("updateEnemies", new Class<?>[]{double.class}, dt);
    }

    @Test void fixedAimAllowsDodgingAndFlightSurvivesShooterDeath() throws Exception {
        update(.05);
        assertEquals(1, game.artilleryShells.size()); assertEquals(100, player.hp);
        assertEquals(1020, artillery.x); assertEquals(1900, artillery.y);
        assertEquals(1220, game.artilleryShells.get(0).x);
        player.x = 1120; artillery.hp = 0;
        update(1.45); assertEquals(1, game.artilleryShells.size());
        update(.05); assertTrue(game.artilleryShells.isEmpty());
        assertEquals(100, player.hp);
        assertTrue(effects.stream().anyMatch(message -> message.contains("acid-impact")));
    }

    @Test void landingDamagesPlayersDefensesAndCoreOnlyOnce() throws Exception {
        game.coreX = player.x; game.coreY = player.y;
        TrapSlot slot = new TrapSlot("blast-block", "test", player.x + 20, player.y, null);
        slot.defense = new Defense("block"); slot.defense.hp = 10;
        game.trapSlots.add(slot);
        List<TrapSlot> turrets = new ArrayList<>();
        for (String type : List.of("turret", "copperTurret", "silverTurret")) {
            TrapSlot turret = new TrapSlot("blast-" + type, "test", player.x, player.y, null);
            turret.defense = new Defense(type); turret.defense.hp = 10;
            turrets.add(turret); game.trapSlots.add(turret);
        }
        update(.05); artillery.hp = 0; update(1.5);
        assertEquals(16, player.hp); assertNull(slot.defense); assertEquals(916, game.coreHp);
        for (TrapSlot turret : turrets) {
            assertNotNull(turret.defense, "Acid must not destroy " + turret.id);
            assertEquals(10, turret.defense.hp, "Acid must not damage " + turret.id);
        }
        update(1.5); assertEquals(16, player.hp); assertEquals(916, game.coreHp);
    }

    @Test void cooldownLimitsFireAndCloseRangeUsesMelee() throws Exception {
        update(.05); update(1.5); assertEquals(16, player.hp);
        assertTrue(game.artilleryShells.isEmpty());
        update(2.45); assertTrue(game.artilleryShells.isEmpty());
        update(.05); assertEquals(1, game.artilleryShells.size());
        game.artilleryShells.clear(); artillery.specialCooldown = 0;
        player.hp = 100;
        player.x = artillery.x + 20; update(.05);
        assertTrue(game.artilleryShells.isEmpty()); assertEquals(72, player.hp);
    }

    @Test void rangeAndWallsPreventFiringAndWallsContainSplash() throws Exception {
        assertEquals(false, invoke("canArtilleryAim", new Class<?>[]{Enemy.class, double.class, double.class},
                artillery, artillery.x + 421, artillery.y));
        artillery.x = 860; artillery.y = 420;
        assertEquals(false, invoke("canArtilleryAim", new Class<?>[]{Enemy.class, double.class, double.class},
                artillery, 900., 500.));
        player.x = 892; player.y = 492;
        assertTrue(GameMap.canOccupy(892, 492, 12, game.unlockedAreas));
        assertTrue(GameMap.canOccupy(860, 450, 12, game.unlockedAreas));
        assertFalse(GameMap.hasClearLine(860, 450, 892, 492));
        game.enemies.clear();
        game.artilleryShells.add(new ArtilleryShell(860, 420, 860, 450, 28));
        update(1.5); assertEquals(100, player.hp);
    }

    @Test void snapshotsIncludeFlightAndRoundWaitsForLastShell() throws Exception {
        update(.05); artillery.hp = 0;
        var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game));
        var shell = snapshot.path("artilleryShells").get(0);
        assertEquals(64, shell.path("radius").asDouble());
        assertEquals(1.5, shell.path("remaining").asDouble());
        assertEquals(1.5, shell.path("duration").asDouble());
        assertEquals(1020, shell.path("sourceX").asDouble());
        game.queuedEnemies = game.queuedBosses = 0; game.update(.05);
        assertEquals(GamePhase.WAVE, game.phase); assertTrue(game.enemies.isEmpty());
        player.x = 1120;
        for (int i = 0; i < 30; i++) game.update(.05);
        assertEquals(GamePhase.PREPARING, game.phase);
        game.artilleryShells.add(new ArtilleryShell(1020, 1900, 1220, 1900, 28));
        invoke("resetWorld", new Class<?>[]{}); assertTrue(game.artilleryShells.isEmpty());
    }

    @Test void coreAndDefensesCanBeBombardedWithoutPlayersInRange() throws Exception {
        game.players.clear(); game.coreX = 1220; game.coreY = 1900; update(.05);
        assertEquals(1220, game.artilleryShells.get(0).x);
        game.artilleryShells.clear(); artillery.specialCooldown = 0;
        TrapSlot slot = new TrapSlot("target-turret", "test", 1180, 1900, null);
        slot.defense = new Defense("turret"); game.trapSlots.add(slot); update(.05);
        assertEquals(1180, game.artilleryShells.get(0).x);
    }

    @org.junit.jupiter.api.RepeatedTest(8)
    void cpuMovesOutOfTelegraphedBlast(org.junit.jupiter.api.RepetitionInfo repetition) throws Exception {
        var random = GameSession.class.getDeclaredField("random"); random.setAccessible(true);
        ((java.util.Random) random.get(game)).setSeed(repetition.getCurrentRepetition());
        player.human = false;
        game.artilleryShells.add(new ArtilleryShell(1020, 1900, player.x, player.y, 28));
        game.artilleryShells.get(0).remaining = 1.1;
        assertEquals(true, invoke("dodgeArtillery", new Class<?>[]{Player.class}, player));
        assertTrue(Math.hypot(player.moveX, player.moveY) > 0);
        artillery.hp = 0; game.queuedEnemies = 1;
        var timer = GameSession.class.getDeclaredField("spawnTimer"); timer.setAccessible(true);
        timer.setDouble(game, 100);
        for (int i = 0; i < 23; i++) game.update(.05);
        assertEquals(100, player.hp, "CPU should escape before the acid lands");
    }

    @Test void debugResourcesKeepTheNormalEnemySchedule() throws Exception {
        invoke("startMatch", new Class<?>[]{Player.class, boolean.class}, player, true);
        invoke("beginRound", new Class<?>[]{});
        assertEquals(1, game.round); assertEquals(6, game.queuedEnemies);
        invoke("updateSpawning", new Class<?>[]{double.class}, 8.1);
        assertEquals(1, game.enemies.size());
        assertEquals("grunt", game.enemies.get(0).type);
        assertEquals(100_000, player.credits);
        assertEquals(5, game.queuedEnemies);
        game.round = 2;
        var randomField = GameSession.class.getDeclaredField("random"); randomField.setAccessible(true);
        ((java.util.Random) randomField.get(game)).setSeed(123);
        boolean seen = false;
        for (int i = 0; i < 600; i++) {
            if (invoke("selectEnemyType", new Class<?>[]{SpawnPoint.class}, GameMap.SPAWN_POINTS.get(0))
                    .equals("artillery")) seen = true;
        }
        assertFalse(seen, "Debug resources must not unlock artillery early");
    }

    @Test void normalRestartClearsDebugEnemyUnlock() throws Exception {
        invoke("startMatch", new Class<?>[]{Player.class, boolean.class}, player, true);
        invoke("startMatch", new Class<?>[]{Player.class, boolean.class}, player, false);
        game.round = 1;
        for (int i = 0; i < 100; i++) {
            assertEquals("grunt", invoke("selectEnemyType", new Class<?>[]{SpawnPoint.class},
                    GameMap.SPAWN_POINTS.get(0)));
        }
    }
}
