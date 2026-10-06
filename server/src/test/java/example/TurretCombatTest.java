package example;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/** Exercises player placement and the real game loop, without calling updateDefenses directly. */
class TurretCombatTest {
    private final List<String> effects = new ArrayList<>();
    private final ObjectMapper mapper = new ObjectMapper();
    private GameSession game;
    private Player player;

    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { effects.add(message); }
            public void send(Player recipient, String message) { }
        });
        player = game.connectPlayer("turret-combat");
        game.setRoomOwner(player);
        game.handleMessage(player, "START");
        assertEquals(GamePhase.PREPARING, game.phase);
        // No player or CPU attacks may account for any damage in these tests.
        game.players.forEach(p -> { p.human = true; p.firing = false; });
        game.unlockedAreas.add("entry-room");
    }

    private TrapSlot craftAndPlace(String type) {
        return craftAndPlace(type, 1900);
    }

    private TrapSlot craftAndPlace(String type, double y) {
        player.wood = player.ore = player.copper = player.silver = 100;
        player.x = 1020; player.y = 1460;
        game.handleMessage(player, "CRAFT:" + type);
        assertEquals(1, player.buildItemCount(type), "Crafting must succeed");
        player.x = 1020; player.y = y;
        player.facingX = 1; player.facingY = 0;
        game.handleMessage(player, "EQUIP_BUILD:" + type);
        game.handleMessage(player, "PLACE_FRONT");
        assertEquals(0, player.buildItemCount(type), "Placement must consume the item");
        TrapSlot slot = game.trapSlots.stream().filter(s -> s.defense != null
                && s.defense.type.equals(type)).findFirst().orElseThrow();
        assertEquals(1060, slot.x);
        assertEquals(y, slot.y);
        return slot;
    }

    private void startWave() {
        game.handleMessage(player, "READY");
        game.update(.05);
        assertEquals(GamePhase.WAVE, game.phase);
        effects.clear();
    }

    private JsonNode enemySnapshot(int id) throws Exception {
        for (JsonNode enemy : mapper.readTree(SnapshotBuilder.build(game)).path("enemies")) {
            if (enemy.path("id").asInt() == id) return enemy;
        }
        return null;
    }

    @ParameterizedTest
    @ValueSource(strings = {"turret", "copperTurret", "silverTurret"})
    void placedTurretDamagesMovingEnemyRepeatsAndKillsInTheGameLoop(String type) throws Exception {
        TrapSlot slot = craftAndPlace(type);
        startWave();
        game.queuedEnemies = game.queuedBosses = 0;
        Enemy enemy = new Enemy(9000, "grunt", GameMap.SPAWN_POINTS.get(0), 250, 30, 0, 0);
        enemy.x = 1180; enemy.y = 1900;
        game.enemies.add(enemy);
        double damage = type.equals("silverTurret") ? 61.25 : type.equals("copperTurret") ? 35 : 17.5;

        game.update(.05);
        assertEquals(250 - damage, enemy.hp, 1e-9, "First shot must reduce actual HP");
        assertNotEquals(1180, enemy.x, "The target must also move in the normal game loop");
        assertEquals(enemy.hp, enemySnapshot(enemy.id).path("hp").asDouble(), .051,
                "Clients must receive the reduced HP");
        game.update(.05);
        assertEquals(250 - damage, enemy.hp, 1e-9, "Cooldown must prevent an immediate second hit");
        for (int tick = 0; tick < 16; tick++) game.update(.05);
        assertEquals(250 - 2 * damage, enemy.hp, 1e-9, "The next shot must also hit");

        for (int tick = 0; tick < 250 && enemy.hp > 0; tick++) game.update(.05);
        assertEquals(0, enemy.hp, "Turret fire alone must kill the enemy");
        assertFalse(game.enemies.contains(enemy));
        assertNull(enemySnapshot(enemy.id), "Dead enemies must disappear from client snapshots");
        assertNotNull(slot.defense);
        assertTrue(effects.stream().anyMatch(e -> e.contains("\"weapon\":\"turret\"")
                && e.contains("\"defeated\":true")));
    }

    @ParameterizedTest
    @MethodSource("naturalSpawnScenarios")
    void placedTurretHitsAndKillsNaturallySpawnedEnemies(String type, int seed) throws Exception {
        var randomField = GameSession.class.getDeclaredField("random");
        randomField.setAccessible(true);
        ((Random) randomField.get(game)).setSeed(seed);
        craftAndPlace(type);
        startWave();
        // Target priority may change as enemies move. Track every damaged spawn,
        // rather than requiring the first one hit to be the one that dies.
        List<Enemy> damaged = new ArrayList<>();
        Enemy killed = null;
        for (int tick = 0; tick < 700; tick++) {
            game.update(.05);
            for (Enemy enemy : game.enemies) {
                if (enemy.hp < enemy.maxHp && !damaged.contains(enemy)) damaged.add(enemy);
            }
            killed = damaged.stream().filter(e -> e.hp <= 0).findFirst().orElse(null);
            if (killed != null) break;
        }
        assertFalse(damaged.isEmpty(), "A real round-one spawn must take turret damage");
        assertNotNull(killed, "Turret fire alone must kill a naturally spawned enemy");
        assertEquals(0, killed.hp);
        assertFalse(game.enemies.contains(killed));
        assertTrue(effects.stream().anyMatch(e -> e.contains("\"weapon\":\"turret\"")
                && e.contains("\"defeated\":true")));
    }

    private static Stream<Arguments> naturalSpawnScenarios() {
        return Stream.of("turret", "copperTurret", "silverTurret")
                .flatMap(type -> IntStream.range(0, 30).mapToObj(seed -> Arguments.of(type, seed)));
    }

    @ParameterizedTest
    @ValueSource(strings = {"turret", "copperTurret", "silverTurret"})
    void indoorTurretSkipsWallBlockedEnemyAndHitsVisibleEnemy(String type) {
        TrapSlot slot = craftAndPlace(type, 1500);
        game.unlockedAreas.add("wood-room");
        startWave();
        game.queuedEnemies = game.queuedBosses = 0;
        Enemy hidden = new Enemy(9001, "grunt", GameMap.SPAWN_POINTS.get(0), 500, 0, 0, 0);
        hidden.x = 820; hidden.y = 1540;
        Enemy visible = new Enemy(9002, "grunt", GameMap.SPAWN_POINTS.get(0), 500, 0, 0, 0);
        visible.x = 1020; visible.y = 1380;
        game.enemies.addAll(List.of(hidden, visible));
        assertTrue(GameMap.canOccupy(hidden.x, hidden.y, 17, game.unlockedAreas));
        assertTrue(GameMap.canOccupy(visible.x, visible.y, 17, game.unlockedAreas));
        assertFalse(GameMap.hasClearLine(slot.x, slot.y, hidden.x, hidden.y));
        assertTrue(GameMap.hasClearLine(slot.x, slot.y, visible.x, visible.y));
        assertTrue(GameSupport.distance(hidden.x, hidden.y, game.coreX, game.coreY)
                < GameSupport.distance(visible.x, visible.y, game.coreX, game.coreY));

        game.update(.05);
        assertEquals(500, hidden.hp, "A higher-priority enemy behind a wall must not be hit");
        assertTrue(visible.hp < 500, "A blocked target must not prevent hitting a visible enemy");
    }

    @ParameterizedTest
    @ValueSource(strings = {"turret", "copperTurret", "silverTurret"})
    void indoorTurretStartsHittingWhenEnemyEntersItsRange(String type) {
        TrapSlot slot = craftAndPlace(type, 1500);
        startWave();
        game.queuedEnemies = game.queuedBosses = 0;
        double range = type.equals("silverTurret") ? 380 : 300;
        Enemy enemy = new Enemy(9003, "grunt", GameMap.SPAWN_POINTS.get(0), 500, 0, 0, 0);
        enemy.x = slot.x; enemy.y = slot.y + range + 1;
        game.enemies.add(enemy);
        assertTrue(GameMap.hasClearLine(slot.x, slot.y, enemy.x, enemy.y));
        game.update(.05);
        assertEquals(500, enemy.hp, "Enemy outside the range must not be hit");
        enemy.y -= 1;
        game.update(.05);
        assertTrue(enemy.hp < 500, "Enemy on the range boundary must be hit");
    }
}
