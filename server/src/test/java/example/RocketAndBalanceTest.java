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
        return enemy(id, x, y, 2000);
    }

    Enemy enemy(int id, double x, double y, double hp) {
        Enemy enemy = new Enemy(id, "grunt", GameMap.SPAWN_POINTS.get(0), hp, 0, 0, 100);
        enemy.x = x; enemy.y = y; game.enemies.add(enemy);
        return enemy;
    }

    @Test void heavyArmsUnlockAndPurchaseRequireTheirFullPrices() throws Exception {
        game.unlockedAreas.remove("heavy-arms-area");
        UnlockArea area = GameMap.areaById("heavy-arms-area");
        player.x = 220; player.y = 620;
        player.credits = 11_999;
        game.handleMessage(player, "UNLOCK:heavy-arms-area");
        assertFalse(game.unlockedAreas.contains(area.id()));
        assertEquals(11_999, player.credits);
        game.unlockedAreas.remove("sniper-room");
        player.credits = 12_000;
        game.handleMessage(player, "UNLOCK:heavy-arms-area");
        assertFalse(game.unlockedAreas.contains(area.id()), "Sniper room must open first");
        game.unlockedAreas.add("sniper-room");
        game.handleMessage(player, "UNLOCK:heavy-arms-area");
        assertTrue(game.unlockedAreas.contains(area.id()));
        assertEquals(0, player.credits);

        ShopUnit shop = GameMap.shopByItem("rocket");
        player.x = shop.x(); player.y = shop.y(); player.credits = 11_999;
        game.handleMessage(player, "BUY:rocket");
        assertFalse(player.weapons.owns("rocket"));
        assertEquals(11_999, player.credits);
        player.credits = 12_000;
        game.handleMessage(player, "BUY:rocket");
        assertTrue(player.weapons.owns("rocket"));
        assertEquals(0, player.credits);
        var rules = new com.fasterxml.jackson.databind.ObjectMapper()
                .readTree(SnapshotBuilder.build(game)).path("rules");
        assertEquals(12_000, rules.path("areaUnlockCosts").path(area.id()).asInt());
        assertEquals(game.unlockCost(), rules.path("areaUnlockCosts").path("entry-room").asInt());
    }

    @Test void sideRoomUnlockChargesItsOwnPriceAfterAllOtherAreasOpen() {
        UnlockArea area = GameMap.areaById("wood-room");
        game.unlockedAreas.remove(area.id());
        player.x = area.terminalX(); player.y = area.terminalY();
        player.credits = 199;
        game.handleMessage(player, "UNLOCK:" + area.id());
        assertFalse(game.unlockedAreas.contains(area.id()));
        assertEquals(199, player.credits);
        player.credits = 200;
        game.handleMessage(player, "UNLOCK:" + area.id());
        assertTrue(game.unlockedAreas.contains(area.id()));
        assertEquals(0, player.credits);
    }

    @Test void terminalPricesStayFixedRegardlessOfOtherUnlocks() throws Exception {
        var areaIds = GameMap.AREAS.stream().map(UnlockArea::id).collect(java.util.stream.Collectors.toSet());
        assertEquals(areaIds, GameConfig.AREA_UNLOCK_COSTS.keySet());
        game.unlockedAreas.clear();
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        var before = mapper.readTree(SnapshotBuilder.build(game)).path("rules").path("areaUnlockCosts");
        game.unlockedAreas.addAll(areaIds);
        var after = mapper.readTree(SnapshotBuilder.build(game)).path("rules").path("areaUnlockCosts");
        assertEquals(before, after);
        for (String id : areaIds) {
            assertEquals(GameConfig.AREA_UNLOCK_COSTS.get(id).intValue(), after.path(id).asInt(), id);
            assertTrue(game.unlockCost(id) > 0, id);
        }
        assertTrue(game.unlockCost("forest") >= game.unlockCost("armory-wing") * 2);
        assertTrue(game.unlockCost("security-hall") >= game.unlockCost("mine") * 2);
        assertTrue(game.unlockCost("heavy-arms-area") >= game.unlockCost("sniper-room") * 4);
    }
    @Test void sniperPiercesBeyondItsOldRangeAndRevolverStillHitsHarder() {
        player.x = 1020; player.y = 1140;
        player.weapons.setOwned("sniper", true); player.weapons.setAmmo("sniper", 2);
        Enemy near = enemy(1, 1020, 1820), far = enemy(2, 1020, 1940);
        game.handleMessage(player, "WEAPON:sniper");
        game.handleMessage(player, "FIRE:1020:1980:1");
        assertTrue(near.hp < 2000); assertTrue(far.hp < 2000);
        assertEquals(1, player.weapons.ammo("sniper"));
        assertEquals(280, GameSession.weaponStats("sniper").damage());
        assertTrue(GameSession.weaponStats("revolver").damage() > GameSession.weaponStats("sniper").damage());
        assertEquals(240, GameSession.weaponAmmoCapacity("smg"));
        assertEquals(1200, new Defense("barricade").maxHp);
    }

    @Test void rocketPurchaseRefillSnapshotAndRestartWork() throws Exception {
        ShopUnit shop = GameMap.shopByItem("rocket");
        player.x = shop.x(); player.y = shop.y(); player.credits = 12600;
        game.handleMessage(player, "WEAPON:rocket");
        assertEquals("pistol", player.weapon);
        game.handleMessage(player, "BUY:rocket");
        assertTrue(player.weapons.owns("rocket")); assertEquals("rocket", player.weapon);
        assertEquals(8, player.weapons.ammo("rocket")); assertEquals(600, player.credits);
        game.handleMessage(player, "BUY:rocket");
        assertEquals(600, player.credits);
        player.weapons.setAmmo("rocket", 0);
        game.handleMessage(player, "BUY:rocket");
        assertEquals(8, player.weapons.ammo("rocket")); assertEquals(480, player.credits);
        ShopUnit ammo = GameMap.shopByItem("ammo");
        player.x = ammo.x(); player.y = ammo.y(); player.weapons.setAmmo("rocket", 1);
        player.credits = 1000;
        game.handleMessage(player, "BUY:ammo");
        assertEquals(8, player.weapons.ammo("rocket")); assertEquals(500, player.credits);
        var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertTrue(snapshot.path("players").get(0).path("ownsRocket").asBoolean());
        assertEquals(8, snapshot.path("players").get(0).path("rocketAmmo").asInt());
        assertEquals(200, snapshot.path("rules").path("weapons").path("rocket").path("blastRadius").asInt());
        game.phase = GamePhase.LOST;
        game.players.forEach(p -> p.roomReady = true);
        game.handleMessage(player, "START");
        assertFalse(player.weapons.owns("rocket")); assertEquals(0, player.weapons.ammo("rocket"));
    }

    @Test void rocketDetonatesOnFirstEnemyWithRadialFalloffAndConsumesOneRound() {
        player.x = 1020; player.y = 1900; player.weapons.setOwned("rocket", true); player.weapons.setAmmo("rocket", 2);
        Enemy direct = enemy(1, 1120, 1900, 4000), splash = enemy(2, 1120, 1960, 4000), outside = enemy(3, 1340, 1900);
        game.handleMessage(player, "WEAPON:rocket");
        game.handleMessage(player, "FIRE:1300:1900:1");
        assertTrue(direct.hp < splash.hp); assertTrue(splash.hp < 4000);
        assertEquals(2000, outside.hp); assertEquals(1, player.weapons.ammo("rocket"));
        assertEquals(100, player.hp); // Explosions only damage enemies.
        assertEquals(5, player.cooldown);
        assertTrue(effects.stream().anyMatch(m -> m.contains("\"effect\":\"explosion\"") && m.contains("1097.0")));
        assertTrue(effects.stream().noneMatch(m -> m.contains("\"headshot\":true")));
        game.handleMessage(player, "FIRE:1300:1900:1");
        assertEquals(1, player.weapons.ammo("rocket"));
        player.cooldown = 0; player.weapons.setAmmo("rocket", 0); effects.clear();
        game.handleMessage(player, "FIRE:1300:1900:1");
        assertTrue(effects.isEmpty());
    }

    @Test void rocketExplodesAtAimPointAndWallsBlockBlast() {
        player.x = 1020; player.y = 1900; player.weapons.setOwned("rocket", true); player.weapons.setAmmo("rocket", 2);
        Enemy splash = enemy(1, 1120, 1970, 4000);
        game.handleMessage(player, "WEAPON:rocket");
        game.handleMessage(player, "FIRE:1120:1900:1");
        assertEquals(1525, splash.hp, 1e-6);
        assertTrue(effects.stream().anyMatch(m -> m.contains("\"effect\":\"explosion\"") && m.contains("1120.0")));
        game.enemies.clear(); effects.clear(); player.cooldown = 0; player.firing = false;
        player.x = 1020; player.y = 1580;
        Enemy behindWall = enemy(2, 1240, 1580);
        game.handleMessage(player, "FIRE:1340:1580:1");
        assertEquals(2000, behindWall.hp);
        assertTrue(effects.stream().anyMatch(m -> m.contains("\"effect\":\"explosion\"")));
    }
}
