package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import org.junit.jupiter.api.Test;

class RoundPreparationBalanceTest {
    private GameSession game() {
        return new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
    }

    private void invoke(GameSession game, String name, Class<?>[] types, Object... args) throws Exception {
        Method method = GameSession.class.getDeclaredMethod(name, types);
        method.setAccessible(true);
        method.invoke(game, args);
    }

    @Test void preparationUsesUpcomingRoundIncludingEveryBoundaryAndBonus() throws Exception {
        GameSession game = game();
        Player host = game.connectPlayer("prep");
        game.setRoomOwner(host);
        game.handleMessage(host, "START");
        game.players.forEach(p -> p.human = true);
        assertEquals(10, game.prepTime);
        for (int[] step : new int[][]{{2,10},{4,10},{5,30},{9,30},{10,60},{19,60},
                {20,120},{29,120},{30,180},{39,180},{40,240},{50,240}}) {
            game.round = step[0] - 1;
            game.nextPrepBonusSeconds = 60;
            invoke(game, "finishRound", new Class<?>[]{});
            assertEquals(step[1] + 60, game.prepTime, "Preparing for R" + step[0]);
            assertEquals(0, game.nextPrepBonusSeconds);
            game.update(step[1] + 59);
            assertTrue(game.enemies.isEmpty());
            assertEquals(GamePhase.PREPARING, game.phase);
            game.update(1);
            assertEquals(step[0], game.round);
            assertEquals(GamePhase.WAVE, game.phase);
            assertTrue(game.enemies.isEmpty());
        }
    }

    @Test void laterRoundsPayMoreForSameEnemyAndRoundClear() throws Exception {
        GameSession game = game();
        Player player = game.connectPlayer("gold");
        for (int[] step : new int[][]{{10,35,48},{20,70,156},{30,105,324},{40,140,552}}) {
            game.round = step[0];
            game.enemies.clear();
            invoke(game, "spawnEnemy", new Class<?>[]{String.class, SpawnPoint.class},
                    "grunt", GameMap.SPAWN_POINTS.get(0));
            assertEquals(1, game.enemies.size());
            Enemy enemy = game.enemies.get(0);
            assertEquals(step[1], enemy.reward);
            player.credits = 0;
            game.combat.damageEnemy(enemy, enemy.maxHp, player);
            assertEquals(step[1], player.credits);
            invoke(game, "finishRound", new Class<?>[]{});
            assertEquals(step[1] + step[2], player.credits);
        }
    }

    @Test void newMedbaysHealOnlyAfterTheirRoomsOpenAndReserveBuildingSpace() throws Exception {
        GameSession game = game();
        Player host = game.connectPlayer("med");
        game.setRoomOwner(host);
        game.handleMessage(host, "START");
        game.players.forEach(p -> p.human = true);
        assertEquals(3, GameMap.MEDBAYS.size());
        for (String id : new String[]{"med-infirmary", "med-security"}) {
            Station station = GameMap.MEDBAYS.stream().filter(s -> s.id().equals(id)).findFirst().orElseThrow();
            String room = id.equals("med-infirmary") ? "armory-wing" : "security-hall";
            assertTrue(GameMap.areaById(room).contains(station.x(), station.y()));
            host.x = station.x(); host.y = station.y(); host.hp = 40;
            assertFalse(game.isMedbayHealing(host));
            game.unlockedAreas.add(room);
            assertTrue(game.isMedbayHealing(host));
            game.update(.5);
            assertEquals(90, host.hp);
            assertFalse(GameMap.canPlaceDefense(station.x(), station.y(), game.unlockedAreas));
        }
        assertTrue(GameMap.clientMapMessage().contains("med-infirmary"));
    }
}
