package example;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class BreakerMapTest {
    @Test void repairFromBothMapTypesRequiresAnAccessibleHackerControlSourceAndUnlockedTarget() {
        var game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
        var player = game.connectPlayer("remote-repair");
        game.phase = GamePhase.PREPARING; game.prepTime = 1000;
        game.players.forEach(other -> other.human = true);
        var source = GameMap.BREAKER_TERMINALS.get(0);
        var target = GameMap.BREAKER_TERMINALS.stream().filter(b -> !b.id().equals(source.id()) && b.requiredArea() != null).findFirst().orElseThrow();
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        player.job = "hacker"; player.x = source.x(); player.y = source.y();
        game.blackoutActive = true; game.trippedBreakers.add(target.id());
        game.handleMessage(player, "MAP_REPAIR:" + target.id());
        assertTrue(game.trippedBreakers.contains(target.id()), "no map open");
        game.handleMessage(player, "BREAKER_MAP:" + source.id());
        game.unlockedAreas.remove(target.requiredArea());
        game.handleMessage(player, "MAP_REPAIR:" + target.id());
        assertTrue(game.trippedBreakers.contains(target.id()), "locked target");
        game.unlockedAreas.add(target.requiredArea());
        player.x = 1020; player.y = 1900;
        game.handleMessage(player, "MAP_REPAIR:" + target.id());
        assertTrue(game.trippedBreakers.contains(target.id()), "no longer near the map source");
        player.x = source.x(); player.y = source.y(); player.down = true;
        game.handleMessage(player, "MAP_REPAIR:" + target.id());
        assertTrue(game.trippedBreakers.contains(target.id()), "downed hacker");
        player.down = false;
        game.handleMessage(player, "MAP_REPAIR:" + target.id());
        assertFalse(game.blackoutActive); assertTrue(player.missileControl); assertTrue(game.missiles.isEmpty());
        game.handleMessage(player, "COMPUTER");
        player.x = GameMap.MISSILE_COMPUTER.x(); player.y = GameMap.MISSILE_COMPUTER.y();
        game.handleMessage(player, "COMPUTER");
        game.blackoutActive = true; game.trippedBreakers.add(target.id()); player.missileCooldown = 10;
        game.handleMessage(player, "MAP_REPAIR:" + target.id());
        assertFalse(game.blackoutActive); assertTrue(player.missileControl);
        assertEquals(10, player.missileCooldown); assertTrue(game.missiles.isEmpty());
    }

    @Test void controlledDroneRepairsFromItsPositionAndRejectsRemoteLockedOrOccludedBreakers() {
        var game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
        var player = game.connectPlayer("drone-breaker");
        game.phase = GamePhase.PREPARING;
        player.job = "drone"; player.x = 1020; player.y = 1900;
        player.drone = new Drone(); player.drone.active = player.drone.controlled = true;
        var breaker = GameMap.BREAKER_TERMINALS.stream().filter(unit -> unit.requiredArea() != null).findFirst().orElseThrow();
        player.drone.x = breaker.x(); player.drone.y = breaker.y();
        game.blackoutActive = true; game.trippedBreakers.add(breaker.id());
        game.handleMessage(player, "BREAKER:" + breaker.id());
        assertTrue(game.trippedBreakers.contains(breaker.id()), "locked area");
        game.unlockedAreas.add(breaker.requiredArea());
        player.drone.x = player.x; player.drone.y = player.y;
        game.handleMessage(player, "BREAKER:" + breaker.id());
        assertTrue(game.trippedBreakers.contains(breaker.id()), "remote drone");
        player.drone.x = breaker.x(); player.drone.y = breaker.y(); player.down = true;
        game.handleMessage(player, "BREAKER:" + breaker.id());
        assertTrue(game.trippedBreakers.contains(breaker.id()), "downed operator");
        player.down = false;
        game.handleMessage(player, "BREAKER:" + breaker.id());
        assertFalse(game.blackoutActive); assertFalse(game.trippedBreakers.contains(breaker.id()));
        assertTrue(player.drone.controlled, "repair keeps the drone view");
        assertEquals(1020, player.x); assertEquals(1900, player.y);
        assertTrue(DroneRules.canInteract(95, true));
        assertFalse(DroneRules.canInteract(95.01, true));
        assertFalse(DroneRules.canInteract(30, false));
    }

    @Test void onlyNearbyUnlockedHackerCanOpenAndMapNeverLaunchesMissiles() throws Exception {
        var game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
        var player = game.connectPlayer("breaker-map");
        game.setRoomOwner(player); game.handleMessage(player, "JOB:hacker"); game.handleMessage(player, "START");
        game.players.forEach(other -> other.human = true);
        var breaker = GameMap.BREAKER_TERMINALS.stream().filter(unit -> unit.requiredArea() != null).findFirst().orElseThrow();
        player.x = breaker.x(); player.y = breaker.y();
        game.handleMessage(player, "BREAKER_MAP:" + breaker.id()); assertFalse(player.missileControl);
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        player.job = "healer";
        game.handleMessage(player, "BREAKER_MAP:" + breaker.id()); assertFalse(player.missileControl);
        player.job = "hacker"; player.down = true;
        game.handleMessage(player, "BREAKER_MAP:" + breaker.id()); assertFalse(player.missileControl);
        player.down = false; player.x = 1020; player.y = 1900;
        game.handleMessage(player, "BREAKER_MAP:" + breaker.id()); assertFalse(player.missileControl);
        player.x = breaker.x(); player.y = breaker.y(); player.moveX = 1; player.firing = true;
        game.blackoutActive = true; game.trippedBreakers.add(breaker.id());
        game.handleMessage(player, "BREAKER_MAP:" + breaker.id());
        assertTrue(player.missileControl); assertEquals(breaker.id(), player.breakerControl);
        assertEquals(0, player.moveX); assertFalse(player.firing);
        game.update(.05); assertTrue(player.missileControl);
        var snapshot = new ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals(breaker.id(), snapshot.path("players").get(0).path("breakerControl").asText());
        assertTrue(snapshot.path("trippedBreakers").toString().contains(breaker.id()));
        game.handleMessage(player, "MISSILE:1020:1900"); assertTrue(game.missiles.isEmpty());
        // Reject even a forged missile request after relocation to the missile console.
        player.x = GameMap.MISSILE_COMPUTER.x(); player.y = GameMap.MISSILE_COMPUTER.y();
        game.handleMessage(player, "MISSILE:1020:1900"); assertTrue(game.missiles.isEmpty());
        assertEquals(0, player.missileCooldown);
        game.update(.05); assertFalse(player.missileControl); assertNull(player.breakerControl);
        game.handleMessage(player, "COMPUTER"); assertTrue(player.missileControl); assertNull(player.breakerControl);
        game.handleMessage(player, "MISSILE:1020:1900"); assertEquals(1, game.missiles.size());
        game.handleMessage(player, "COMPUTER"); assertFalse(player.missileControl);
        player.x = breaker.x(); player.y = breaker.y();
        game.handleMessage(player, "BREAKER_MAP:" + breaker.id());
        game.handleMessage(player, "COMPUTER"); assertFalse(player.missileControl); assertNull(player.breakerControl);
        game.handleMessage(player, "BREAKER:" + breaker.id()); assertFalse(game.trippedBreakers.contains(breaker.id()));
    }
}
