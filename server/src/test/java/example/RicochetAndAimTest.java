package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class RicochetAndAimTest {
    GameSession game;
    Player player;
    List<String> effects = new ArrayList<>(), direct = new ArrayList<>();

    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { effects.add(message); }
            public void send(Player recipient, String message) { direct.add(message); }
        });
        player = game.connectPlayer("bounce-test");
        game.setRoomOwner(player);
        game.handleMessage(player, "ROOM_READY:1");
        game.handleMessage(player, "START");
        game.players.forEach(p -> p.human = true);
        player.x = 1020; player.y = 1900;
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        effects.clear(); direct.clear();
    }

    Enemy enemy(double x, double y) {
        Enemy e = new Enemy(9800, "grunt", GameMap.SPAWN_POINTS.get(0), 2000, 0, 0, 0);
        e.x = x; e.y = y; game.enemies.add(e); return e;
    }

    @Test void reflectedBulletHitsEnemyBehindPlayerAndSpendsOneRound() {
        player.weapon = "ricochet"; player.ricochetAmmo = 1;
        Enemy behind = enemy(940, 1900);
        game.handleMessage(player, "FIRE:1200:1900:1");
        assertEquals(1928, behind.hp);
        assertEquals(0, player.ricochetAmmo);
        assertEquals(2, effects.stream().filter(m -> m.contains("\"effect\":\"hit\"") && m.contains("\"damage\":0.0")).count());
    }

    @Test void reflectionStopsAtEnemyAndNeverCrossesWall() {
        player.weapon = "ricochet"; player.ricochetAmmo = 2;
        Enemy blocked = enemy(1340, 1900);
        game.handleMessage(player, "FIRE:1500:1900:1");
        assertEquals(2000, blocked.hp);
        assertTrue(effects.stream().filter(m -> m.contains("\"effect\":\"hit\"")).count() <= 4);
    }

    @Test void wallFacesReflectAxesAndCornerReflectsBoth() {
        var horizontal = GameMap.rayWall(1020, 1900, 1, 0, 1000);
        assertTrue(horizontal.flipX()); assertFalse(horizontal.flipY());
        var vertical = GameMap.rayWall(1020, 1900, 0, 1, 1000);
        assertFalse(vertical.flipX()); assertTrue(vertical.flipY());
        var corner = GameMap.rayWall(1020, 1900, -Math.sqrt(.5), Math.sqrt(.5), 1000);
        assertTrue(corner.flipX()); assertTrue(corner.flipY());
    }

    @Test void ricochetStopsAfterTwoReflections() {
        player.weapon = "ricochet"; player.ricochetAmmo = 1;
        game.handleMessage(player, "FIRE:1200:1900:1");
        assertEquals(3, effects.stream().filter(m -> m.contains("\"effect\":\"hit\"")
                && m.contains("\"damage\":0.0")).count());
    }

    @Test void ordinaryGunsMissOffAxisAndPistolEmitsOneTrajectory() {
        for (String weapon : List.of("pistol", "smg", "rifle", "sniper", "revolver", "lmg")) {
            game.enemies.clear(); player.cooldown = 0; player.firing = false;
            player.weapon = weapon;
            player.smgAmmo = player.rifleAmmo = player.sniperAmmo = player.revolverAmmo = player.lmgAmmo = 10;
            Enemy offAxis = enemy(1120, 1928);
            game.handleMessage(player, "FIRE:1200:1900:1");
            assertEquals(2000, offAxis.hp, weapon);
        }
        game.enemies.clear(); effects.clear(); player.weapon = "pistol"; player.cooldown = 0; player.firing = false;
        Enemy aligned = enemy(1120, 1900);
        game.handleMessage(player, "FIRE:1200:1900:1");
        assertEquals(1974, aligned.hp);
        assertEquals(1, effects.stream().filter(m -> m.contains("\"effect\":\"hit\"") && m.contains("\"damage\":0.0")).count());
    }

    @Test void tinyEnemySurvivesNearMissesAndTakesDamageWhenAimedAt() {
        for (String weapon : List.of("pistol", "sniper", "ricochet")) {
            game.enemies.clear(); player.cooldown = 0; player.firing = false;
            player.weapon = weapon; player.sniperAmmo = player.ricochetAmmo = 10;
            Enemy tiny = new Enemy(9801, "tiny", GameMap.SPAWN_POINTS.get(0), 2000, 0, 0, 0);
            tiny.x = 1120; tiny.y = 1910; game.enemies.add(tiny);
            game.handleMessage(player, "FIRE:1200:1900:1");
            assertEquals(2000, tiny.hp, weapon + " near miss");
            player.cooldown = 0; player.firing = false;
            game.handleMessage(player, "FIRE:1120:1910:1");
            assertTrue(tiny.hp < 2000, weapon + " precise aim");
        }
    }

    @Test void enemyIdCannotOverrideAimAndSuccessfulRefillNotifiesClient() {
        Enemy offAxis = enemy(1020, 1800);
        player.aimX = 1200; player.aimY = 1900;
        game.handleMessage(player, "ATTACK:" + offAxis.id);
        assertEquals(2000, offAxis.hp);
        player.ownsRicochet = true; player.ricochetAmmo = 1; player.credits = 120;
        ShopUnit shop = GameMap.shopByItem("ricochet"); player.x = shop.x(); player.y = shop.y();
        game.handleMessage(player, "BUY:ricochet");
        assertEquals(240, player.ricochetAmmo);
        assertTrue(direct.contains("{\"type\":\"ammo-refilled\"}"));
        direct.clear(); game.handleMessage(player, "BUY:ricochet");
        assertFalse(direct.contains("{\"type\":\"ammo-refilled\"}"));
    }

    @Test void rocketShopIsSealedUntilItsLateRoomIsUnlocked() {
        game.unlockedAreas.remove("rocket-room");
        ShopUnit shop = GameMap.shopByItem("rocket"); player.x = shop.x(); player.y = shop.y(); player.credits = 2000;
        game.handleMessage(player, "BUY:rocket"); assertFalse(player.ownsRocket);
        game.unlockedAreas.add("rocket-room");
        game.handleMessage(player, "BUY:rocket"); assertTrue(player.ownsRocket);
        assertTrue(shop.y() < GameMap.shopByItem("revolver").y());
    }
}
