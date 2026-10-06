package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class MedbayTest {
    GameSession game;
    Player player;

    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player recipient, String message) { }
        });
        player = game.connectPlayer("medbay-test");
        game.setRoomOwner(player);
        game.handleMessage(player, "START");
        game.players.forEach(p -> p.human = true);
        game.prepTime = 1000;
        player.x = GameMap.MED_X;
        player.y = GameMap.MED_Y;
        player.hp = 40;
    }

    @Test void gradualRecoveryRequiresUnlockedRoomAndProximityAndCapsAtFullHp() {
        game.update(1);
        assertEquals(40, player.hp);
        game.unlockedAreas.add("recovery-room");
        game.update(.25);
        assertEquals(41, player.hp);
        game.update(.75);
        assertEquals(44, player.hp);
        player.x -= 100;
        game.update(1);
        assertEquals(44, player.hp);
        player.x = GameMap.MED_X;
        player.hp = 99;
        game.update(1);
        assertEquals(100, player.hp);
        player.down = true; player.hp = 0;
        game.update(1);
        assertEquals(0, player.hp);
    }

    @Test void repeatedDamageStopsRecoveryAndCooldownPersistsAfterLeaving() throws Exception {
        game.unlockedAreas.add("recovery-room");
        Method damage = GameSession.class.getDeclaredMethod("damagePlayer", Player.class, double.class);
        damage.setAccessible(true);
        damage.invoke(game, player, 10.0);
        game.update(4);
        assertEquals(30, player.hp);
        damage.invoke(game, player, 10.0);
        player.x = 1020; player.y = 1900;
        game.update(4);
        player.x = GameMap.MED_X; player.y = GameMap.MED_Y;
        game.update(1);
        assertEquals(20, player.hp);
        game.update(.5);
        assertEquals(22, player.hp);
    }

    @Test void kitsRequireSeparateUnlockedShopAndLegacyInstantHealDoesNothing() {
        player.credits = 1000;
        game.unlockedAreas.add("recovery-room");
        game.handleMessage(player, "BUY:medkit");
        game.handleMessage(player, "BUY:heal");
        assertEquals(0, player.medkits);
        assertEquals(40, player.hp);
        assertEquals(1000, player.credits);
        ShopUnit shop = GameMap.shopByItem("medkit");
        player.x = shop.x(); player.y = shop.y();
        game.handleMessage(player, "BUY:medkit");
        assertEquals(0, player.medkits);
        game.unlockedAreas.add("transit-hall");
        game.handleMessage(player, "BUY:medkit");
        assertEquals(1, player.medkits);
        assertEquals(880, player.credits);
        player.medkits = GameConfig.MEDKIT_CAPACITY;
        game.handleMessage(player, "BUY:medkit");
        assertEquals(880, player.credits);
    }

    @Test void fourTilePassageConnectsOutsideToRecoveryRoom() {
        Set<String> unlocked = Set.of("recovery-room");
        for (int row = 45; row <= 48; row++) {
            for (int column = 18; column <= 20; column++) {
                assertTrue(GameMap.canOccupy(column * 40 + 20, row * 40 + 20, 5, unlocked));
            }
        }
        assertFalse(GameMap.canOccupy(780, 1780, 5, unlocked));
        assertFalse(GameMap.canOccupy(780, 1980, 5, unlocked));
    }
}
