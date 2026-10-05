package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import org.junit.jupiter.api.Test;

class DownedCpuTest {
    @Test void cpuCrawlsToSurvivorAndStopsWithinReviveRange() throws Exception {
        GameSession game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
        game.players.forEach(player -> { player.down = true; player.hp = 0; player.human = true; });
        Player survivor = game.players.get(0);
        survivor.down = false; survivor.hp = 100;
        survivor.x = 1220; survivor.y = 1900;
        Player bot = game.players.get(1);
        bot.human = false; bot.x = 1020; bot.y = 1900;
        Method bots = GameSession.class.getDeclaredMethod("updateBots", double.class);
        Method move = GameSession.class.getDeclaredMethod("updatePlayers", double.class);
        bots.setAccessible(true); move.setAccessible(true);
        for (int tick = 0; tick < 160; tick++) {
            bots.invoke(game, .05); move.invoke(game, .05);
            assertTrue(GameMap.canOccupy(bot.x, bot.y, 5, game.unlockedAreas));
            assertFalse(bot.dashing);
        }
        assertTrue(bot.x > 1020);
        assertTrue(Math.hypot(bot.x - survivor.x, bot.y - survivor.y) <= 65);
        assertEquals(0, bot.moveX); assertEquals(0, bot.moveY);
        survivor.x = 1420;
        bots.invoke(game, .05);
        assertTrue(bot.moveX > 0, "CPU follows a survivor who moves away");
        survivor.down = true;
        bots.invoke(game, .05);
        assertEquals(0, bot.moveX); assertEquals(0, bot.moveY);
    }

    @Test void cpuNavigatesAroundWallsTowardASurvivor() throws Exception {
        GameSession game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        game.players.forEach(player -> { player.down = true; player.human = true; });
        Player survivor = game.players.get(0);
        survivor.down = false; survivor.x = GameMap.QUARRY_X; survivor.y = GameMap.QUARRY_Y;
        Player bot = game.players.get(1);
        bot.human = false; bot.x = 1020; bot.y = 1900;
        assertFalse(GameMap.hasClearLine(bot.x, bot.y, survivor.x, survivor.y));
        Method bots = GameSession.class.getDeclaredMethod("updateBots", double.class);
        Method move = GameSession.class.getDeclaredMethod("updatePlayers", double.class);
        bots.setAccessible(true); move.setAccessible(true);
        for (int tick = 0; tick < 2400; tick++) {
            bots.invoke(game, .05); move.invoke(game, .05);
            assertTrue(GameMap.canOccupy(bot.x, bot.y, 5, game.unlockedAreas));
        }
        assertTrue(Math.hypot(bot.x - survivor.x, bot.y - survivor.y) <= 65);
        assertTrue(GameMap.hasClearLine(bot.x, bot.y, survivor.x, survivor.y));
    }
}
