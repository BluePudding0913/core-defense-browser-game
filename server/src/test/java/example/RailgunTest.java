package example;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class RailgunTest {
    GameSession game;
    Player player;

    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player recipient, String message) { }
        });
        player = game.connectPlayer("railgun-test");
        game.setRoomOwner(player);
        game.handleMessage(player, "ROOM_READY:1");
        game.handleMessage(player, "START");
        game.players.forEach(p -> p.human = true);
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        player.x = 1020; player.y = 1140;
        player.weapons.setOwned("railgun", true); player.weapons.setAmmo("railgun", 8);
        game.handleMessage(player, "WEAPON:railgun");
    }

    Enemy enemy(int id, String type, double x, double y) {
        Enemy e = new Enemy(id, type, GameMap.SPAWN_POINTS.get(0), 20000, 0, 0, 100);
        e.x = x; e.y = y; game.enemies.add(e); return e;
    }

    void advance(double seconds) {
        int steps = (int) Math.round(seconds / .05);
        for (int i = 0; i < steps; i++) game.update(.05);
    }

    void fire() { game.handleMessage(player, "FIRE:1020:1980:1"); }

    @Test void chargesThenDealsNineThousandToEveryEnemyWithoutShieldReduction() {
        Enemy near = enemy(1, "grunt", 1020, 1540);
        Enemy far = enemy(2, "shield", 1020, 1780);
        far.facingX = 0; far.facingY = -1;
        fire(); advance(1.15);
        assertEquals(8, player.weapons.ammo("railgun"));
        assertEquals(20000, near.hp);
        advance(.05);
        assertEquals(7, player.weapons.ammo("railgun"));
        assertEquals(3, player.railgunRemaining, .00001);
        advance(3);
        assertEquals(11000, near.hp, .001);
        assertEquals(11000, far.hp, .001);
        assertEquals(0, player.railgunRemaining);
        assertEquals(2, player.cooldown, .001);
        advance(2);
        assertEquals(7, player.weapons.ammo("railgun"));
        advance(1.2);
        assertEquals(6, player.weapons.ammo("railgun"));
    }

    @Test void releaseCancelsChargeForFreeAndBeamWithCooldown() {
        fire(); advance(.5);
        game.handleMessage(player, "FIRE:1020:1980:0");
        assertEquals(0, player.railgunCharge); assertEquals(8, player.weapons.ammo("railgun"));
        fire(); advance(1.2); advance(.5);
        game.handleMessage(player, "FIRE:1020:1980:0");
        assertEquals(0, player.railgunRemaining); assertEquals(7, player.weapons.ammo("railgun"));
        assertEquals(2, player.cooldown);
    }

    @Test void directionStaysFixedBeamFollowsMovementAndNewEnemiesTakeOnlyExposureDamage() {
        fire(); advance(1.2);
        game.handleMessage(player, "FIRE:1980:1140:1");
        assertEquals(0, player.railgunDx, .001); assertEquals(1, player.railgunDy, .001);
        player.moveX = 1; player.dashHeld = true;
        double x = player.x; advance(.1);
        assertEquals(x + 155 * .3 * .1, player.x, .001);
        assertFalse(player.dashing);
        player.moveX = 0;
        Enemy entrant = enemy(1, "grunt", player.x, 1540);
        advance(.5);
        assertEquals(18500, entrant.hp, .001);
        game.handleMessage(player, "WEAPON:pistol");
        assertEquals(0, player.railgunRemaining);
        game.handleMessage(player, "WEAPON:railgun");
        assertEquals(2, player.cooldown);
    }

    @Test void wallBlocksDamageAndDeathStopsBeam() {
        player.x = 220; player.y = 860;
        Enemy blocked = enemy(1, "grunt", 500, 860);
        game.handleMessage(player, "FIRE:820:860:1"); advance(1.7);
        assertEquals(20000, blocked.hp);
        player.down = true; advance(.05);
        assertEquals(0, player.railgunRemaining);
    }

    @Test void purchaseRefillSnapshotAndReset() throws Exception {
        player.weapons.setOwned("railgun", false); player.equipWeapon("pistol");
        ShopUnit shop = GameMap.shopByItem("railgun");
        player.x = shop.x(); player.y = shop.y(); player.credits = 19999;
        game.handleMessage(player, "BUY:railgun"); assertFalse(player.weapons.owns("railgun"));
        player.credits = 20000; game.handleMessage(player, "BUY:railgun");
        assertTrue(player.weapons.owns("railgun")); assertEquals(0, player.credits);
        assertEquals("railgun", player.weapon); assertEquals(8, player.weapons.ammo("railgun"));
        player.weapons.setAmmo("railgun", 0); player.credits = 120;
        game.handleMessage(player, "BUY:railgun");
        assertEquals(8, player.weapons.ammo("railgun")); assertEquals(0, player.credits);
        ShopUnit ammo = GameMap.shopByItem("ammo");
        player.x = ammo.x(); player.y = ammo.y(); player.credits = 1000; player.weapons.setAmmo("railgun", 0);
        game.handleMessage(player, "BUY:ammo"); assertEquals(8, player.weapons.ammo("railgun"));
        var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals(20000, snapshot.path("rules").path("weapons").path("railgun").path("price").asInt());
        assertTrue(snapshot.path("players").get(0).path("ownsRailgun").asBoolean());
        game.phase = GamePhase.LOST;
        game.players.forEach(p -> p.roomReady = true);
        game.handleMessage(player, "START");
        assertFalse(player.weapons.owns("railgun")); assertEquals(0, player.weapons.ammo("railgun"));
        assertEquals(0, player.railgunRemaining); assertEquals(0, player.cooldown);
    }
}
