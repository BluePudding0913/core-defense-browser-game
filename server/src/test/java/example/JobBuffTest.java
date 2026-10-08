package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import com.fasterxml.jackson.databind.ObjectMapper;

class JobBuffTest {
    GameSession game;
    Player player;

    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player recipient, String message) { }
        });
        player = game.connectPlayer("job-buffs");
        game.setRoomOwner(player);
    }

    void start(String job) {
        game.handleMessage(player, "JOB:" + job);
        game.handleMessage(player, "START");
        game.players.clear(); game.players.add(player);
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        player.x = 1140; player.y = 1900; game.prepTime = 1000;
    }

    void heal(double dt) throws Exception {
        var method = GameSession.class.getDeclaredMethod("updateHealingAreas", double.class);
        method.setAccessible(true); method.invoke(game, dt);
    }

    @Test void healingAreaInstantlyRevivesAndClearsRescueProgressButRespectsItsBoundaryAndExpiry() throws Exception {
        start("healer"); game.handleMessage(player, "JOB_ABILITY");
        Player ally = new Player(1); ally.down = true; ally.hp = 0;
        ally.x = player.healX + 59; ally.y = player.healY;
        ally.moveX = 1; player.actionTarget = ally.id; player.actionProgress = 1.9;
        Player outside = new Player(2); outside.down = true; outside.hp = 0;
        outside.x = player.healX + 60; outside.y = player.healY;
        game.players.addAll(List.of(ally, outside));
        heal(.001);
        assertFalse(ally.down); assertEquals(45, ally.hp); assertEquals(0, ally.moveX);
        assertNull(player.actionTarget); assertEquals(0, player.actionProgress);
        assertTrue(outside.down); assertEquals(0, outside.hp);
        outside.x = player.healX; player.healRemaining = 0;
        heal(.001); assertTrue(outside.down);
        player.down = true; player.hp = 0; player.healRemaining = 1;
        heal(.001); assertFalse(player.down); assertEquals(45, player.hp);
    }

    @Test void attackerUsesDoubleCapacityForEveryAmmoWeaponAndConsumptionDoesNotLoseExtraAmmo() {
        for (var definition : WeaponCatalog.ALL) {
            Player attacker = new Player(1); attacker.job = "attacker";
            assertTrue(attacker.weapons.grant(definition.id()));
            int expected = definition.capacity() * 2;
            assertEquals(expected, attacker.weapons.capacity(definition.id()));
            assertEquals(expected, attacker.weapons.ammo(definition.id()));
            if (!definition.usesAmmo()) continue;
            assertTrue(attacker.weapons.consume(definition.id()));
            assertEquals(expected - 1, attacker.weapons.ammo(definition.id()));
            attacker.weapons.setAmmo(definition.id(), Integer.MAX_VALUE);
            assertEquals(expected, attacker.weapons.ammo(definition.id()));
        }
    }

    @Test void attackerPurchaseIndividualAndBulkRefillUseDoubleCapacityAndJobChangeClampsAmmo() throws Exception {
        start("attacker"); player.credits = 10000;
        ShopUnit shop = GameMap.shopByItem("shotgun"); player.x = shop.x(); player.y = shop.y();
        game.handleMessage(player, "BUY:shotgun");
        int capacity = WeaponCatalog.capacity("shotgun") * 2;
        assertEquals(capacity, player.weapons.ammo("shotgun"));
        player.weapons.setAmmo("shotgun", capacity - 1);
        game.handleMessage(player, "BUY:shotgun"); assertEquals(capacity, player.weapons.ammo("shotgun"));
        player.weapons.grant("smg"); player.weapons.setAmmo("smg", 1);
        player.weapons.setAmmo("shotgun", 1);
        ShopUnit ammo = GameMap.shopByItem("ammo"); player.x = ammo.x(); player.y = ammo.y();
        game.handleMessage(player, "BUY:ammo");
        assertEquals(capacity, player.weapons.ammo("shotgun"));
        assertEquals(WeaponCatalog.capacity("smg") * 2, player.weapons.ammo("smg"));
        var snapshot = new ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals(2, snapshot.path("players").get(0).path("ammoCapacityMultiplier").asInt());
        player.x = GameMap.JOB_STATION.x(); player.y = GameMap.JOB_STATION.y();
        game.handleMessage(player, "JOB:spy");
        assertEquals("spy", player.job);
        assertEquals(WeaponCatalog.capacity("shotgun"), player.weapons.ammo("shotgun"));
        assertEquals(WeaponCatalog.capacity("smg"), player.weapons.ammo("smg"));
        game.handleMessage(player, "JOB:attacker");
        assertEquals(WeaponCatalog.capacity("smg"), player.weapons.ammo("smg"), "Changing job does not grant ammo");
    }

    @Test void spyCanReplaceItsDecoyAfterHalfSecondButNotBefore() {
        start("spy"); game.handleMessage(player, "DECOY:1240:1900");
        Decoy first = game.decoys.get(0);
        game.update(.49); game.handleMessage(player, "DECOY:1240:1900");
        assertSame(first, game.decoys.get(0));
        game.update(.02); game.handleMessage(player, "DECOY:1240:1900");
        assertEquals(1, game.decoys.size()); assertNotSame(first, game.decoys.get(0));
        assertEquals(.5, player.decoyCooldown);
    }
}
