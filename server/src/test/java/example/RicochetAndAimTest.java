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

    @Test void hitNotificationIdentifiesOnlyTheDamagedEnemy() throws Exception {
        Enemy hit = enemy(1120, 1900);
        Enemy neighbor = new Enemy(9801, "grunt", GameMap.SPAWN_POINTS.get(0), 2000, 0, 0, 0);
        neighbor.x = 1120; neighbor.y = 1930; game.enemies.add(neighbor);
        game.handleMessage(player, "FIRE:1200:1900:1");
        assertEquals(1974, hit.hp);
        assertEquals(2000, neighbor.hp);
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        int trajectories = 0, impacts = 0;
        for (String effect : effects) {
            var message = mapper.readTree(effect);
            if (!message.path("effect").asText().equals("hit")) continue;
            assertTrue(message.has("enemyId"));
            if (message.path("damage").asDouble() > 0) {
                impacts++;
                assertEquals(hit.id, message.path("enemyId").asInt());
            } else {
                trajectories++;
                assertTrue(message.path("enemyId").isNull());
            }
        }
        assertEquals(1, impacts);
        assertEquals(1, trajectories);
    }

    @Test void reflectedBulletHitsEnemyBehindPlayerAndSpendsOneRound() {
        player.weapon = "ricochet"; player.weapons.setAmmo("ricochet", 1);
        Enemy behind = enemy(950, 1900);
        game.handleMessage(player, "FIRE:1200:1900:1");
        assertEquals(1970, behind.hp);
        assertEquals(0, player.weapons.ammo("ricochet"));
        assertEquals(2, effects.stream().filter(m -> m.contains("\"effect\":\"hit\"") && m.contains("\"damage\":0.0")).count());
    }

    @Test void reflectionStopsAtEnemyAndNeverCrossesWall() {
        player.weapon = "ricochet"; player.weapons.setAmmo("ricochet", 2);
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
        player.weapon = "ricochet"; player.weapons.setAmmo("ricochet", 1);
        player.x = 1200; player.y = 1980;
        game.handleMessage(player, "FIRE:1200:1980:1");
        assertEquals(3, effects.stream().filter(m -> m.contains("\"effect\":\"hit\"")
                && m.contains("\"damage\":0.0")).count());
    }

    @Test void reflectedBulletCannotHitBeyondTotalRange() throws Exception {
        player.weapon = "ricochet"; player.weapons.setAmmo("ricochet", 1);
        Enemy beyondRange = enemy(930, 1900);
        game.handleMessage(player, "FIRE:1200:1900:1");
        assertEquals(2000, beyondRange.hp);
        assertEquals(0, player.weapons.ammo("ricochet"));
        assertEquals(WeaponCatalog.stats("ricochet").cooldown(), player.cooldown);
        var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals(600, snapshot.path("rules").path("weapons").path("ricochet").path("range").asDouble());
    }

    @Test void ordinaryGunsMissOffAxisAndPistolEmitsOneTrajectory() {
        for (String weapon : List.of("pistol", "smg", "rifle", "sniper", "revolver", "lmg")) {
            game.enemies.clear(); player.cooldown = 0; player.firing = false;
            player.weapon = weapon;
            player.weapons.setAmmo("smg", 10); player.weapons.setAmmo("rifle", 10); player.weapons.setAmmo("sniper", 10); player.weapons.setAmmo("revolver", 10); player.weapons.setAmmo("lmg", 10);
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
            player.weapon = weapon; player.weapons.setAmmo("sniper", 10); player.weapons.setAmmo("ricochet", 10);
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
        player.weapons.setOwned("ricochet", true); player.weapons.setAmmo("ricochet", 1); player.credits = 120;
        ShopUnit shop = GameMap.shopByItem("ricochet"); player.x = shop.x(); player.y = shop.y();
        game.handleMessage(player, "BUY:ricochet");
        assertEquals(240, player.weapons.ammo("ricochet"));
        assertTrue(direct.contains("{\"type\":\"ammo-refilled\"}"));
        direct.clear(); game.handleMessage(player, "BUY:ricochet");
        assertFalse(direct.contains("{\"type\":\"ammo-refilled\"}"));
    }

    @Test void rocketShopIsSealedUntilItsLateRoomIsUnlocked() {
        game.unlockedAreas.remove("heavy-arms-area");
        ShopUnit shop = GameMap.shopByItem("rocket"); player.x = shop.x(); player.y = shop.y(); player.credits = 12600;
        game.handleMessage(player, "BUY:rocket"); assertFalse(player.weapons.owns("rocket"));
        game.unlockedAreas.add("heavy-arms-area");
        game.handleMessage(player, "BUY:rocket"); assertTrue(player.weapons.owns("rocket"));
        assertTrue(shop.y() > GameMap.shopByItem("sniper").y());
    }
}
