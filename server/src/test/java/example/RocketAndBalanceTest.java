package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class RocketAndBalanceTest {
    GameSession game;
    Player player;
    List<String> effects = new ArrayList<>();

    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { effects.add(message); }
            public void send(Player recipient, String message) { }
        });
        player = game.connectPlayer("rocket-test");
        game.setRoomOwner(player);
        game.handleMessage(player, "ROOM_READY:1");
        game.handleMessage(player, "START");
        game.players.forEach(p -> p.human = true);
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
    }

    Enemy enemy(int id, double x, double y) {
        Enemy enemy = new Enemy(id, "grunt", GameMap.SPAWN_POINTS.get(0), 2000, 0, 0, 100);
        enemy.x = x; enemy.y = y; game.enemies.add(enemy);
        return enemy;
    }

    @Test void sniperPiercesBeyondItsOldRangeAndRevolverStillHitsHarder() {
        player.x = 1020; player.y = 1140;
        player.ownsSniper = true; player.sniperAmmo = 2;
        Enemy near = enemy(1, 1020, 1820), far = enemy(2, 1020, 1940);
        game.handleMessage(player, "WEAPON:sniper");
        game.handleMessage(player, "FIRE:1020:1980:1");
        assertTrue(near.hp < 2000); assertTrue(far.hp < 2000);
        assertEquals(1, player.sniperAmmo);
        assertEquals(280, GameSession.weaponStats("sniper").damage());
        assertTrue(GameSession.weaponStats("revolver").damage() > GameSession.weaponStats("sniper").damage());
        assertEquals(240, GameSession.weaponAmmoCapacity("smg"));
    }

    @Test void rocketPurchaseRefillSnapshotAndRestartWork() throws Exception {
        ShopUnit shop = GameMap.shopByItem("rocket");
        player.x = shop.x(); player.y = shop.y(); player.credits = 2000;
        game.handleMessage(player, "WEAPON:rocket");
        assertEquals("pistol", player.weapon);
        game.handleMessage(player, "BUY:rocket");
        assertTrue(player.ownsRocket); assertEquals("rocket", player.weapon);
        assertEquals(12, player.rocketAmmo); assertEquals(600, player.credits);
        game.handleMessage(player, "BUY:rocket");
        assertEquals(600, player.credits);
        player.rocketAmmo = 0;
        game.handleMessage(player, "BUY:rocket");
        assertEquals(12, player.rocketAmmo); assertEquals(480, player.credits);
        ShopUnit ammo = GameMap.shopByItem("ammo");
        player.x = ammo.x(); player.y = ammo.y(); player.rocketAmmo = 1;
        game.handleMessage(player, "BUY:ammo");
        assertEquals(12, player.rocketAmmo); assertEquals(360, player.credits);
        var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertTrue(snapshot.path("players").get(0).path("ownsRocket").asBoolean());
        assertEquals(12, snapshot.path("players").get(0).path("rocketAmmo").asInt());
        assertEquals(140, snapshot.path("rules").path("weapons").path("rocket").path("blastRadius").asInt());
        game.phase = GamePhase.LOST;
        game.players.forEach(p -> p.roomReady = true);
        game.handleMessage(player, "START");
        assertFalse(player.ownsRocket); assertEquals(0, player.rocketAmmo);
    }

    @Test void rocketDetonatesOnFirstEnemyWithRadialFalloffAndConsumesOneRound() {
        player.x = 1020; player.y = 1900; player.ownsRocket = true; player.rocketAmmo = 2;
        Enemy direct = enemy(1, 1120, 1900), splash = enemy(2, 1120, 1960), outside = enemy(3, 1260, 1900);
        game.handleMessage(player, "WEAPON:rocket");
        game.handleMessage(player, "FIRE:1300:1900:1");
        assertTrue(direct.hp < splash.hp); assertTrue(splash.hp < 2000);
        assertEquals(2000, outside.hp); assertEquals(1, player.rocketAmmo);
        assertEquals(100, player.hp); // Explosions only damage enemies.
        assertTrue(effects.stream().anyMatch(m -> m.contains("\"effect\":\"explosion\"") && m.contains("1095.0")));
        assertTrue(effects.stream().noneMatch(m -> m.contains("\"headshot\":true")));
        game.handleMessage(player, "FIRE:1300:1900:1");
        assertEquals(1, player.rocketAmmo);
        player.cooldown = 0; player.rocketAmmo = 0; effects.clear();
        game.handleMessage(player, "FIRE:1300:1900:1");
        assertTrue(effects.isEmpty());
    }

    @Test void rocketExplodesAtAimPointAndWallsBlockBlast() {
        player.x = 1020; player.y = 1900; player.ownsRocket = true; player.rocketAmmo = 2;
        Enemy splash = enemy(1, 1120, 1970);
        game.handleMessage(player, "WEAPON:rocket");
        game.handleMessage(player, "FIRE:1120:1900:1");
        assertEquals(1700, splash.hp, 1e-6);
        assertTrue(effects.stream().anyMatch(m -> m.contains("\"effect\":\"explosion\"") && m.contains("1120.0")));
        game.enemies.clear(); effects.clear(); player.cooldown = 0; player.firing = false;
        player.x = 1020; player.y = 1580;
        Enemy behindWall = enemy(2, 1240, 1580);
        game.handleMessage(player, "FIRE:1340:1580:1");
        assertEquals(2000, behindWall.hp);
        assertTrue(effects.stream().anyMatch(m -> m.contains("\"effect\":\"explosion\"")));
    }
}
