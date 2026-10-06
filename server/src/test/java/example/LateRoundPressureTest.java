package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class LateRoundPressureTest {
    GameSession game;

    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
    }

    void beginRound(int round) throws Exception {
        game.round = round - 1;
        game.enemies.clear();
        Method method = GameSession.class.getDeclaredMethod("beginRound");
        method.setAccessible(true);
        method.invoke(game);
    }

    void spawnTick(double dt) throws Exception {
        Method method = GameSession.class.getDeclaredMethod("updateSpawning", double.class);
        method.setAccessible(true);
        method.invoke(game, dt);
    }

    @Test void populationGrowsFromRoundFortyAndSnapshotsIncludeTheWholeBudget() throws Exception {
        Map<Integer, Integer> populations = Map.of(39, 123, 40, 252, 41, 284, 42, 317, 43, 351, 45, 423, 50, 624);
        for (var entry : populations.entrySet()) {
            beginRound(entry.getKey());
            assertEquals(entry.getValue().intValue(), game.queuedEnemies, "R" + entry.getKey());
            int bosses = entry.getKey() == 40 ? 20 : entry.getKey() == 45 ? 1 : 0;
            assertEquals(bosses, game.queuedBosses);
            var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game));
            assertEquals(entry.getValue() + bosses, snapshot.path("queued").asInt());
        }
        beginRound(44); assertEquals(22, game.queuedBosses);
        beginRound(48); assertEquals(24, game.queuedBosses);
        beginRound(36); assertEquals(9, game.queuedBosses);
    }

    @Test void burstsGrowGraduallyAndKeepTheirSpawnCooldown() throws Exception {
        Map<Integer, Integer> batches = Map.of(39, 1, 40, 2, 42, 2, 43, 3, 45, 3, 46, 4, 48, 4, 49, 5, 50, 5);
        for (var entry : batches.entrySet()) {
            beginRound(entry.getKey());
            int initialPopulation = game.queuedEnemies;
            int swarm = game.queuedTinyEnemies;
            spawnTick(.05);
            assertEquals(swarm + entry.getValue(), game.enemies.size(), "R" + entry.getKey());
            assertEquals(initialPopulation - swarm - entry.getValue(), game.queuedEnemies);
            if (!game.roundEvent.equals("door_failure")) {
                assertEquals(entry.getValue().longValue(), game.enemies.stream().filter(e -> !e.type.equals("tiny"))
                        .map(e -> e.spawnId).distinct().count());
            }
            spawnTick(.05);
            assertEquals(swarm + entry.getValue(), game.enemies.size(), "Must wait between bursts");
            spawnTick(.24);
            assertEquals(swarm + entry.getValue() * 2, game.enemies.size());
        }
    }

    @Test void tinySwarmsAppearTogetherOnlyOnSelectedLateRounds() throws Exception {
        Map<Integer, Integer> swarms = Map.of(40, 48, 43, 60, 46, 72, 49, 84);
        for (int round = 1; round <= 50; round++) {
            beginRound(round);
            int expected = swarms.getOrDefault(round, 0);
            assertEquals(expected, game.queuedTinyEnemies, "R" + round);
            spawnTick(10);
            assertEquals(expected, game.enemies.stream().filter(e -> e.type.equals("tiny")).count(), "R" + round);
            assertEquals(0, game.queuedTinyEnemies, "Entire swarm must spawn in one tick");
            if (expected > 0) assertTrue(game.enemies.stream().filter(e -> e.type.equals("tiny"))
                    .map(e -> e.spawnId).distinct().count() > 1);
            while (game.queuedEnemies > 0 || game.queuedBosses > 0) spawnTick(.3);
            assertEquals(expected, game.enemies.stream().filter(e -> e.type.equals("tiny")).count(),
                    "No additional tiny enemies during R" + round);
        }
    }

    @Test void completeWavesSpawnEveryQueuedEnemyAndDoNotOverrunTheFinalBurst() throws Exception {
        for (int round : new int[]{40, 42, 43, 50}) {
            beginRound(round);
            int regulars = game.queuedEnemies, bosses = game.queuedBosses;
            int ticks = 0;
            while ((game.queuedEnemies > 0 || game.queuedBosses > 0) && ticks++ < 1000) spawnTick(.3);
            assertEquals(0, game.queuedEnemies);
            assertEquals(0, game.queuedBosses);
            assertEquals(regulars + bosses, game.enemies.size());
            assertEquals(bosses, game.enemies.stream().filter(Enemy::isBoss).count());
            assertTrue(game.enemies.stream().filter(Enemy::isBoss).allMatch(e -> e.type.equals("titan")));
            spawnTick(10);
            assertEquals(regulars + bosses, game.enemies.size(), "Empty queue must stop spawning");
        }
    }
}
