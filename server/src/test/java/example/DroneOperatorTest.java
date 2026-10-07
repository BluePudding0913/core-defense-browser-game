package example;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class DroneOperatorTest {
    GameSession game;
    Player player;
    List<String> messages = new ArrayList<>();

    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { messages.add(message); }
            public void send(Player recipient, String message) { messages.add(message); }
        });
        player = game.connectPlayer("drone-test");
        game.setRoomOwner(player);
        game.handleMessage(player, "JOB:drone");
        game.handleMessage(player, "START");
        game.players.clear(); game.players.add(player);
        game.trapSlots.clear();
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        player.x = 1140; player.y = 1900;
        game.prepTime = 1000;
    }

    void call(String name, double dt) throws Exception {
        Method method = GameSession.class.getDeclaredMethod(name, double.class);
        method.setAccessible(true); method.invoke(game, dt);
    }

    Enemy enemy(int id, String type, double x) {
        Enemy e = new Enemy(id, type, GameMap.SPAWN_POINTS.get(0), 100, 30, 20, 100);
        e.x = x; e.y = 1900;
        game.enemies.add(e);
        return e;
    }

    void launch() {
        if (player.drone != null && player.drone.active) {
            player.drone.x = player.x; player.drone.y = player.y;
            game.handleMessage(player, "DRONE_RECOVER");
        } else {
            game.handleMessage(player, "EQUIP_BUILD:drone");
            game.handleMessage(player, "PLACE_FRONT");
        }
    }

    @Test void selectionPersistsAcrossReconnectAndRestartResetsDrone() {
        assertEquals("drone", player.job);
        launch(); Drone original = player.drone;
        game.disconnectPlayer(player);
        assertTrue(original.active); assertFalse(original.controlled);
        assertSame(player, game.connectPlayer("drone-test"));
        assertEquals("drone", player.job);
        assertSame(original, player.drone);
        game.phase = GamePhase.LOST;
        game.handleMessage(player, "START");
        assertEquals("drone", player.job);
        assertNull(player.drone);
    }

    @Test void flightMovesDroneOnlyAndIgnoresEquipmentButRespectsWalls() throws Exception {
        launch();
        TrapSlot block = new TrapSlot("test", "test", 1161, 1900, null);
        block.defense = new Defense("block"); game.trapSlots.add(block);
        game.handleMessage(player, "MOVE:1:0");
        game.handleMessage(player, "DASH:1");
        call("updatePlayers", .1);
        assertEquals(1140, player.x); assertEquals(1161, player.drone.x);
        assertEquals(100, player.stamina); assertFalse(player.dashing);
        assertEquals(0, player.facingX);
        player.drone.x = 7; player.drone.y = 7;
        call("updatePlayers", .1);
        assertEquals(7, player.drone.x);
        launch(); assertFalse(player.drone.active);
        assertEquals(0, player.moveX);
    }

    @Test void bulletsHitOnlyFirstEnemyAndGiveHostilityAndRewardsWithoutBodyAmmo() {
        Enemy hit = enemy(1, "runner", 1200), behind = enemy(2, "runner", 1250);
        launch(); player.cooldown = 5;
        game.handleMessage(player, "FIRE:1400:1900:1");
        assertEquals(74, hit.hp); assertEquals(100, behind.hp);
        assertEquals(13, player.credits);
        assertSame(player, DroneRules.target(hit, game.players));
        assertNull(DroneRules.target(behind, game.players));
        game.handleMessage(player, "ATTACK");
        assertEquals(74, hit.hp, "drone cooldown prevents duplicate shots");
        game.update(.4);
        assertEquals(48, hit.hp, "held fire uses drone cooldown even when body weapon is cooling");
    }

    @Test void missesRangeAndWallsDoNotCreateHostility() {
        Enemy far = enemy(1, "runner", 1440), offRay = enemy(2, "runner", 1200);
        offRay.y = 1940;
        launch(); game.handleMessage(player, "FIRE:1500:1900:1");
        assertEquals(100, far.hp); assertEquals(100, offRay.hp);
        assertTrue(player.drone.attackers.isEmpty());
        assertNull(DroneRules.hit(game.enemies, 7, 7, 1, 0, 2000));
    }

    @Test void onlyProvokedEnemyDamagesDroneAndRecallKeepsDamage() throws Exception {
        Enemy hostile = enemy(1, "runner", 1200);
        launch(); player.drone.x = 1210;
        call("updateEnemies", .05);
        assertEquals(60, player.drone.hp);
        hostile.attackCooldown = 0; player.drone.attackers.add(hostile.id);
        call("updateEnemies", .05);
        assertEquals(40, player.drone.hp); assertEquals(100, player.hp);
        launch(); assertNull(DroneRules.target(hostile, game.players));
        launch(); assertEquals(40, player.drone.hp);
        assertTrue(player.drone.attackers.isEmpty());
    }

    @Test void provokedEnemyFollowsDroneRatherThanNearbyOperator() throws Exception {
        Enemy e = enemy(1, "hunter", 1200);
        launch(); player.drone.x = 1300; player.drone.attackers.add(e.id);
        call("updateEnemies", .1);
        assertTrue(e.x > 1200);
        launch(); assertNull(DroneRules.target(e, game.players));
    }

    @Test void operatorCanBeDownedWhilePilotingAndActionsCannotProtectThem() throws Exception {
        Enemy e = enemy(1, "hunter", 1150);
        e.faceToward(player.x, player.y);
        player.hp = 10;
        launch(); player.drone.x = 1300;
        call("updateEnemies", .05);
        assertTrue(player.down); assertEquals(0, player.hp);
        assertTrue(player.drone.active); assertFalse(player.drone.controlled); assertFalse(player.firing);
        game.handleMessage(player, "DRONE_RECOVER"); assertTrue(player.drone.active);
    }

    @Test void brokenDroneRequiresMaterialsAndConsumesExactlyOnce() throws Exception {
        Enemy e = enemy(1, "runner", 1300);
        launch(); player.drone.x = 1300; player.drone.hp = 1; player.drone.attackers.add(e.id);
        call("updateEnemies", .05);
        assertEquals(0, player.drone.hp); assertFalse(player.drone.active);
        player.ore = DroneRules.REPAIR_ORE; player.copper = DroneRules.REPAIR_COPPER - 1;
        launch(); assertFalse(player.drone.active); assertEquals(DroneRules.REPAIR_ORE, player.ore);
        player.copper++; launch();
        assertTrue(player.drone.active); assertEquals(60, player.drone.hp);
        assertEquals(0, player.ore); assertEquals(0, player.copper);
        launch(); launch(); assertEquals(0, player.ore); assertEquals(60, player.drone.hp);
    }

    @Test void artilleryAimsAtProvokedDroneAndOnlyItsShellsDamageIt() throws Exception {
        Enemy e = enemy(1, "artillery", 1020);
        launch(); player.drone.x = 1260; player.drone.attackers.add(e.id);
        call("updateEnemies", .01);
        assertEquals(1, game.artilleryShells.size());
        assertEquals(1260, game.artilleryShells.get(0).x);
        assertEquals(e.id, game.artilleryShells.get(0).enemyId);
        player.x = 1600; e.hp = 0;
        call("updateEnemies", 2);
        assertEquals(0, player.drone.hp);
        player.ore = 5; player.copper = 2; launch();
        game.artilleryShells.add(new ArtilleryShell(1020, 1900, player.drone.x, player.drone.y, 60, 99));
        call("updateEnemies", 2);
        assertEquals(60, player.drone.hp);
    }

    @Test void activeDroneDoesNotReviveAlliesAndCannotUseFacilities() throws Exception {
        Player ally = new Player(2); ally.down = true; ally.x = 1140; ally.y = 1900;
        game.players.add(ally);
        player.medkits = 1; player.hp = 50;
        launch();
        game.handleMessage(player, "USE:medkit");
        game.handleMessage(player, "TELEPORT");
        game.handleMessage(player, "EQUIP_BUILD:block");
        call("updateRevives", 5);
        assertTrue(ally.down); assertNull(player.actionTarget);
        assertEquals(50, player.hp); assertEquals(1, player.medkits); assertNull(player.selectedBuild);
    }

    @Test void snapshotContainsDroneAndAuthoritativeRepairCost() throws Exception {
        launch();
        var snapshot = new ObjectMapper().readTree(SnapshotBuilder.build(game));
        var p = snapshot.get("players").get(0);
        assertEquals("drone", p.get("job").asText());
        assertTrue(p.get("drone").get("active").asBoolean());
        assertEquals(60, p.get("drone").get("hp").asDouble());
        assertEquals(DroneRules.REPAIR_ORE, p.get("droneRepairOre").asInt());
        assertEquals(DroneRules.REPAIR_COPPER, p.get("droneRepairCopper").asInt());
    }

    @Test void enemyDoesNotGetStuckOnEquipmentWhenFollowingDrone() throws Exception {
        Enemy e = enemy(1, "runner", 1200);
        TrapSlot block = new TrapSlot("test", "test", 1220, 1900, null);
        block.defense = new Defense("block"); game.trapSlots.add(block);
        launch(); player.drone.x = 1300; player.drone.attackers.add(e.id);
        call("updateEnemies", .1);
        assertEquals(300, block.defense.hp);
        assertEquals(60, player.drone.hp);
    }

    @Test void matchEndAllowsJobSelectionAndRestartWhileDroneWasActive() {
        launch(); game.phase = GamePhase.WON;
        game.handleMessage(player, "JOB:healer");
        assertEquals("healer", player.job); assertNull(player.drone);
        game.handleMessage(player, "JOB:drone");
        game.handleMessage(player, "START");
        assertEquals(GamePhase.PREPARING, game.phase);
        launch(); game.phase = GamePhase.LOST; game.update(.05);
        assertFalse(player.drone.active);
        game.handleMessage(player, "START");
        assertNull(player.drone); assertEquals(GamePhase.PREPARING, game.phase);
    }

    @Test void bomberBlastDamagesOnlyDronesThatProvokedIt() throws Exception {
        Enemy e = enemy(1, "bomber", 1300);
        launch(); player.drone.x = 1300;
        game.combat.damageEnemy(e, 200, null);
        assertEquals(60, player.drone.hp);
        Enemy second = enemy(2, "bomber", 1300); second.hp = 1;
        player.drone.attackers.add(second.id);
        game.combat.damageEnemy(second, 200, player);
        assertEquals(40, player.drone.hp);
    }

    @Test void explosionBossFollowsProvokedDroneAndBlastDestroysIt() throws Exception {
        Enemy e = enemy(1, "explosionBoss", 1200);
        launch(); player.drone.x = 1300; player.drone.attackers.add(e.id);
        call("updateEnemies", .1);
        assertTrue(e.x > 1200);
        player.x = 1600; e.fuse = .01;
        call("updateEnemies", .02);
        assertEquals(0, player.drone.hp); assertFalse(player.drone.active);
    }
}
