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

    @Test void openingPressureRisesGraduallyAndRejoinsTheNormalCurve() throws Exception {
        int[] populations = {9, 12, 15, 18, 19, 20, 23, 27, 31, 35, 39, 42};
        for (int round = 1; round <= populations.length; round++) {
            game.round = round - 1;
            invoke("beginRound", new Class<?>[]{});
            assertEquals(populations[round - 1], game.queuedEnemies, "Round " + round);
            assertEquals(populations[round - 1] + game.queuedBosses, game.roundEnemyTotal);
            if (round == 6 || round == 7) {
                invoke("updateSpawning", new Class<?>[]{double.class}, 10.);
                var timer = GameSession.class.getDeclaredField("spawnTimer");
                timer.setAccessible(true);
                assertEquals(round == 6 ? 1.04 : .995, timer.getDouble(game), .00001);
            }
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
