package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class MineDamageTest {
    @Test void mineDeals450ToNearbyEnemiesAndIsConsumedOnce() throws Exception {
        List<String> effects = new ArrayList<>();
        GameSession game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { effects.add(message); }
            public void send(Player player, String message) { }
        });
        game.trapSlots.clear();
        TrapSlot mine = new TrapSlot("test-mine", "free", 1020, 1900, null);
        mine.defense = new Defense("mine"); game.trapSlots.add(mine);
        for (int offset : new int[]{30, 100, 130}) {
            Enemy enemy = new Enemy(offset, "grunt", GameMap.SPAWN_POINTS.get(0), 1000, 0, 0, 0);
            enemy.x = mine.x + offset; enemy.y = mine.y; game.enemies.add(enemy);
        }
        Method update = GameSession.class.getDeclaredMethod("updateDefenses", double.class);
        update.setAccessible(true); update.invoke(game, .05);
        assertEquals(550, game.enemies.get(0).hp);
        assertEquals(550, game.enemies.get(1).hp);
        assertEquals(1000, game.enemies.get(2).hp);
        assertNull(mine.defense);
        update.invoke(game, .05);
        assertEquals(550, game.enemies.get(0).hp);
        assertTrue(effects.stream().anyMatch(effect -> effect.contains("\"weapon\":\"mine\"")
                && effect.contains("\"damage\":450")));
    }
}
