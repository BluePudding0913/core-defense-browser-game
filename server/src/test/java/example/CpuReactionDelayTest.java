package example;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.Method;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class CpuReactionDelayTest {
    GameSession game;
    Player bot;
    Method updateBots;

    @BeforeEach void setup() throws Exception {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
        game.phase = GamePhase.WAVE;
        game.players.forEach(player -> player.human = true);
        bot = game.players.get(1);
        bot.human = false;
        bot.x = 1020;
        bot.y = 1900;
        bot.credits = 0;
        updateBots = GameSession.class.getDeclaredMethod("updateBots", double.class);
        updateBots.setAccessible(true);
    }

    Enemy target(int id) {
        Enemy enemy = new Enemy(id, "grunt", GameMap.SPAWN_POINTS.get(0), 500, 0, 0, 0);
        enemy.x = bot.x + 100;
        enemy.y = bot.y;
        game.enemies.add(enemy);
        return enemy;
    }

    void tick() throws Exception {
        updateBots.invoke(game, .05);
    }

    void assertDelayedShot() throws Exception {
        for (int i = 0; i < 29; i++) {
            tick();
            assertEquals(0, bot.cooldown, "No shot before 1.5 seconds");
        }
        tick();
        assertTrue(bot.cooldown > 0, "First shot at 1.5 seconds");
    }

    @Test void allCpuSlotsWaitOneAndAHalfSecondsBeforeFiring() throws Exception {
        for (int slot = 1; slot <= 4; slot++) {
            setup();
            bot = game.players.get(slot - 1);
            game.players.forEach(player -> player.human = true);
            bot.human = false;
            bot.x = 1020; bot.y = 1900; bot.credits = 0;
            target(1);
            assertDelayedShot();
            bot.cooldown = 0;
            tick();
            assertTrue(bot.cooldown > 0, "Continued fire uses weapon cooldown without another reaction delay");
        }
    }

    @Test void rescuingCpuAlsoWaitsBeforeFiring() throws Exception {
        Player downed = game.players.get(0);
        downed.down = true;
        downed.x = bot.x; downed.y = bot.y;
        target(1);
        assertDelayedShot();
    }

    @Test void replacementEnemyRequiresAFreshDelay() throws Exception {
        Enemy first = target(1);
        for (int i = 0; i < 6; i++) tick();
        first.hp = 0;
        target(2);
        assertDelayedShot();
    }

    @Test void losingAllTargetsResetsTheDelay() throws Exception {
        Enemy enemy = target(1);
        for (int i = 0; i < 6; i++) tick();
        game.enemies.clear();
        tick();
        game.enemies.add(enemy);
        assertDelayedShot();
    }
}
