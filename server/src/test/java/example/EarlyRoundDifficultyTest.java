package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import java.util.Random;
import org.junit.jupiter.api.Test;

class EarlyRoundDifficultyTest {
    private final GameSession game = new GameSession(new GameEventSink() {
        public void broadcast(String message) { }
        public void send(Player player, String message) { }
    });

    private Object invoke(String name, Class<?>[] types, Object... args) throws Exception {
        Method method = GameSession.class.getDeclaredMethod(name, types);
        method.setAccessible(true);
        return method.invoke(game, args);
    }

    @Test void openingPressureRisesGraduallyWithTwentyPercentFewerEnemies() throws Exception {
        int[] populations = {5, 6, 8, 10, 12, 15, 18, 20, 22, 25, 26, 29};
        for (int round = 1; round <= populations.length; round++) {
            game.round = round - 1;
            invoke("beginRound", new Class<?>[]{});
            assertEquals(populations[round - 1], game.queuedEnemies, "Round " + round);
            assertEquals(populations[round - 1] + game.queuedBosses, game.roundEnemyTotal);
            if (round <= 11) {
                game.roundEvent = "none";
                invoke("updateSpawning", new Class<?>[]{double.class}, 10.);
                var timer = GameSession.class.getDeclaredField("spawnTimer");
                timer.setAccessible(true);
                int[] previousPopulations = {6, 8, 10, 12, 15, 19, 23, 25, 28, 31, 33};
                assertEquals(Math.max(.7, 1.15 - round * .045
                        + (6 + round * 3 - previousPopulations[round - 1]) * .04), timer.getDouble(game), .00001);
            }
        }
    }

    @Test void doorFailuresKeepBreathingRoomThroughRoundTwentyFive() throws Exception {
        var timer = GameSession.class.getDeclaredField("spawnTimer");
        timer.setAccessible(true);
        for (int round : new int[]{5, 9, 13, 17, 21, 25}) {
            game.round = round - 1;
            invoke("beginRound", new Class<?>[]{});
            game.roundEvent = "door_failure";
            for (int spawn = 0; spawn < 10; spawn++) {
                invoke("updateSpawning", new Class<?>[]{double.class}, 10.);
                assertTrue(timer.getDouble(game) >= .7, "Door failure at R" + round);
            }
        }
    }

    @Test void reliefLastsThroughRoundTwentyFiveAndTapersWithoutAPopulationSpike() throws Exception {
        int previous = 29;
        for (int round = 13; round <= 39; round++) {
            game.round = round - 1;
            invoke("beginRound", new Class<?>[]{});
            int population = game.queuedEnemies;
            assertTrue(population >= previous && population - previous <= 5, "R" + round);
            if (round == 20) assertEquals(45, population);
            if (round == 25) assertEquals(55, population);
            if (round == 30) assertEquals(71, population);
            if (round >= 35) assertEquals(Math.round((6 + round * 3) * .8), population);
            game.roundEvent = "none";
            invoke("updateSpawning", new Class<?>[]{double.class}, 10.);
            var timer = GameSession.class.getDeclaredField("spawnTimer");
            timer.setAccessible(true);
            if (round <= 25) assertTrue(timer.getDouble(game) >= .7, "Breathing room at R" + round);
            if (round > 25 && round < 35) {
                assertEquals(.28 + .42 * (35 - round) / 10., timer.getDouble(game), .00001);
            }
            if (round >= 35) assertEquals(.28, timer.getDouble(game), .00001);
            previous = population;
        }
    }

    @Test void shieldEncounterStartsSmallAndGrowsToItsUsualShare() throws Exception {
        var field = GameSession.class.getDeclaredField("random");
        field.setAccessible(true);
        Random random = (Random) field.get(game);
        for (int round = 6; round <= 9; round++) {
            game.round = round;
            random.setSeed(42);
            int shields = 0;
            for (int sample = 0; sample < 10000; sample++) {
                if (invoke("selectEnemyType", new Class<?>[]{SpawnPoint.class},
                        GameMap.SPAWN_POINTS.get(0)).equals("shield")) shields++;
            }
            double expectedShare = round == 6 ? 0 : .04 + (round - 7) * .03;
            assertEquals(expectedShare, shields / 10000., .01, "Round " + round);
        }
    }
}
