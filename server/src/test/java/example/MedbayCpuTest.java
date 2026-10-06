package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class MedbayCpuTest {
    GameSession game;
    Player bot;
    Method bots;

    @BeforeEach void setup() throws Exception {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player recipient, String message) { }
        });
        Player host = game.connectPlayer("medbay-cpu");
        game.setRoomOwner(host);
        game.handleMessage(host, "START");
        game.players.forEach(p -> { p.human = true; p.hp = 100; });
        bot = game.players.get(1);
        bot.human = false; bot.hp = 50; bot.credits = 0;
        bot.botSpendCooldown = 0;
        bot.x = 900; bot.y = 1900;
        game.prepTime = 1000;
        game.unlockedAreas.add("recovery-room");
        bots = GameSession.class.getDeclaredMethod("updateBots", double.class);
        bots.setAccessible(true);
    }

    void decide() throws Exception { bots.invoke(game, .05); }

    @Test void pennilessCpuNavigatesToMedbayAndCompletesGradualRecovery() {
        double startX = bot.x;
        for (int tick = 0; tick < 600 && bot.hp < 100; tick++) {
            game.update(.05);
            assertTrue(GameMap.canOccupy(bot.x, bot.y, 5, game.unlockedAreas));
        }
        assertTrue(bot.x < startX);
        assertEquals(100, bot.hp);
        assertEquals(0, bot.credits);
        game.update(.05);
        assertFalse(bot.botSeekingMedbay);
    }

    @Test void waveRecoveryPersistsAboveStartThresholdButEndsAtNinety() throws Exception {
        game.phase = GamePhase.WAVE;
        bot.x = GameMap.MED_X; bot.y = GameMap.MED_Y;
        bot.botSpendCooldown = 3;
        decide();
        assertTrue(bot.botSeekingMedbay);
        bot.hp = 80; bot.medbayDamageDelay = 4;
        bot.botWanderX = 1;
        decide();
        assertTrue(bot.botSeekingMedbay);
        assertEquals(0, bot.moveX); assertEquals(0, bot.moveY);
        bot.hp = 90;
        decide();
        assertFalse(bot.botSeekingMedbay);
        bot.hp = 80;
        decide();
        assertFalse(bot.botSeekingMedbay, "minor damage should not start another trip");
    }

    @Test void dangerousStationDoesNotBecomeRecoveryDestination() throws Exception {
        game.phase = GamePhase.WAVE;
        Enemy threat = new Enemy(9901, "grunt", GameMap.SPAWN_POINTS.get(0), 500, 0, 0, 50);
        threat.x = GameMap.MED_X; threat.y = GameMap.MED_Y;
        game.enemies.add(threat);
        decide();
        assertTrue(Double.isNaN(bot.botPathTargetX)
                || bot.botPathTargetX != GameMap.MED_X || bot.botPathTargetY != GameMap.MED_Y);
        game.enemies.clear();
        game.artilleryShells.add(new ArtilleryShell(GameMap.MED_X, 1740, GameMap.MED_X, GameMap.MED_Y, 28));
        decide();
        assertTrue(Double.isNaN(bot.botPathTargetX)
                || bot.botPathTargetX != GameMap.MED_X || bot.botPathTargetY != GameMap.MED_Y);
    }

    @Test void criticalCpuUsesCarriedKitAndPreparationRestocksAtIndependentShop() throws Exception {
        bot.hp = 35; bot.medkits = 1;
        decide();
        assertEquals(95, bot.hp);
        assertEquals(0, bot.medkits);
        bot.hp = 100; bot.botSpendCooldown = 0;
        ShopUnit shop = GameMap.shopByItem("medkit");
        game.unlockedAreas.add("transit-hall");
        bot.x = shop.x(); bot.y = shop.y(); bot.credits = shop.cost();
        decide();
        assertEquals(1, bot.medkits);
        assertEquals(0, bot.credits);
    }

    @Test void woundedCpuOpensRecoveryRoomBeforeOtherRooms() throws Exception {
        game.unlockedAreas.remove("recovery-room");
        bot.x = 700; bot.y = 1860;
        bot.credits = game.unlockCost("recovery-room");
        decide();
        assertTrue(game.unlockedAreas.contains("recovery-room"));
        assertFalse(game.unlockedAreas.contains("entry-room"));
    }

    @Test void healingTakesPriorityOverUnlockingAndSpendingCooldown() throws Exception {
        bot.hp = 70; bot.credits = 100_000; bot.botSpendCooldown = 2;
        bot.x = GameMap.MED_X; bot.y = GameMap.MED_Y;
        decide();
        assertTrue(bot.botSeekingMedbay);
        assertEquals(0, bot.moveX); assertEquals(0, bot.moveY);
        assertFalse(game.unlockedAreas.contains("entry-room"));
        assertEquals(100_000, bot.credits);
    }

    @Test void threatenedCpuUsesKitWithoutWaitingForPassiveHealing() throws Exception {
        game.phase = GamePhase.WAVE;
        bot.hp = 55; bot.medkits = 1; bot.medbayDamageDelay = 5;
        Enemy threat = new Enemy(9902, "grunt", GameMap.SPAWN_POINTS.get(0), 500, 0, 0, 50);
        threat.x = bot.x + 60; threat.y = bot.y;
        game.enemies.add(threat);
        decide();
        assertEquals(100, bot.hp);
        assertEquals(0, bot.medkits);
        assertFalse(bot.botSeekingMedbay);
    }

    @Test void downAndRestartClearTheRecoveryGoal() throws Exception {
        bot.botSeekingMedbay = true;
        bot.down = true; bot.hp = 0;
        decide();
        assertFalse(bot.botSeekingMedbay);
        bot.botSeekingMedbay = true;
        game.phase = GamePhase.WON;
        game.players.forEach(p -> p.roomReady = true);
        game.handleMessage(game.players.get(0), "START");
        assertFalse(bot.botSeekingMedbay);
    }
}
