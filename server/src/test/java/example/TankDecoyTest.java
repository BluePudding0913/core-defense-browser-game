package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import com.fasterxml.jackson.databind.ObjectMapper;

class TankDecoyTest {
    GameSession game;
    Player player;
    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player recipient, String message) { }
        });
        player = game.connectPlayer("roles"); game.setRoomOwner(player);
    }
    void start(String job) {
        game.handleMessage(player, "JOB:" + job); game.handleMessage(player, "START");
        game.players.clear(); game.players.add(player); game.trapSlots.clear();
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        player.x = 1140; player.y = 1900; game.prepTime = 1000;
    }
    Object call(String name, Class<?>[] types, Object... args) throws Exception {
        Method method = GameSession.class.getDeclaredMethod(name, types);
        method.setAccessible(true); return method.invoke(game, args);
    }
    Enemy enemy(String type, double x) {
        Enemy enemy = new Enemy(1, type, GameMap.SPAWN_POINTS.get(0), 500, 60, 20, 0);
        enemy.x = x; enemy.y = 1900; game.enemies.add(enemy); return enemy;
    }
    @Test void tankStartsAt200AndBothRecoveryPathsReachItsCap() throws Exception {
        start("tank"); assertEquals(200, player.hp);
        player.hp = 180; player.medkits = 2; game.handleMessage(player, "USE:medkit");
        assertEquals(200, player.hp); assertEquals(1, player.medkits);
        game.handleMessage(player, "USE:medkit"); assertEquals(1, player.medkits);
        player.x = GameMap.MED_X; player.y = GameMap.MED_Y; player.hp = 199;
        call("updateMedbay", new Class<?>[]{double.class}, 1.0); assertEquals(200, player.hp);
        var snapshot = new ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals(200, snapshot.get("players").get(0).get("maxHp").asDouble());
        player.x = GameMap.JOB_STATION.x(); player.y = GameMap.JOB_STATION.y();
        game.handleMessage(player, "JOB:healer"); assertEquals(100, player.hp);
    }
    @Test void healerAreaRecoversTankAbove100AndCapsAt200() throws Exception {
        start("tank"); player.hp = 195;
        Player healer = new Player(1); healer.healX = player.x; healer.healY = player.y;
        healer.healRemaining = JobRules.HEAL_DURATION; game.players.add(healer);
        call("updateHealingAreas", new Class<?>[]{double.class}, 2.0);
        assertEquals(200, player.hp);
        player.down = true; player.hp = 0;
        call("updateHealingAreas", new Class<?>[]{double.class}, 1.0);
        assertEquals(45, player.hp); assertFalse(player.down);
    }

    @Test void auraIncludesTankDoesNotStackAndStopsOnDownRangeOrWall() throws Exception {
        start("tank"); Player ally = new Player(1); ally.x = player.x + 50; ally.y = player.y; ally.hp = 100;
        game.players.add(ally);
        call("damagePlayer", new Class<?>[]{Player.class, double.class}, ally, 20.0); assertEquals(85, ally.hp);
        call("damagePlayer", new Class<?>[]{Player.class, double.class}, player, 20.0); assertEquals(185, player.hp);
        ally.job = "tank";
        assertTrue(JobRules.protectedByTank(ally, game.players, (a, b) -> true));
        ally.job = "healer"; player.down = true;
        assertFalse(JobRules.protectedByTank(ally, game.players, (a, b) -> true));
        player.down = false; ally.x = player.x + JobRules.TANK_AURA_RADIUS + 1;
        assertFalse(JobRules.protectedByTank(ally, game.players, (a, b) -> true));
        ally.x = player.x + 50;
        assertFalse(JobRules.protectedByTank(ally, game.players, (a, b) -> false));
    }
    @Test void tankWinsOverCloserAllyButNotOutsidePerceptionRange() {
        start("tank"); Enemy enemy = enemy("grunt", 1200);
        Player ally = new Player(1); ally.x = 1190; ally.y = 1900; game.players.add(ally);
        EnemyNavigation navigation = new EnemyNavigation(); navigation.prepare(game.coreX, game.coreY, game.unlockedAreas);
        assertSame(player, navigation.visiblePlayer(enemy, game.players, .1));
        player.x = 700; enemy.perceptionTimer = 0;
        assertSame(ally, navigation.visiblePlayer(enemy, game.players, .1));
    }
    @Test void tankTakesPriorityOverHostileDroneForMeleeAndArtillery() throws Exception {
        start("tank"); player.x = 1220;
        Player operator = new Player(1); operator.x = 1240; operator.y = 1900;
        operator.drone = new Drone(); operator.drone.active = true;
        operator.drone.x = 1040; operator.drone.y = 1900; operator.drone.attackers.add(1);
        game.players.add(operator);
        Enemy melee = enemy("grunt", 1020);
        call("updateEnemies", new Class<?>[]{double.class}, .1);
        assertEquals(DroneRules.HP, operator.drone.hp); assertSame(player, melee.visiblePlayer);
        game.enemies.clear(); Enemy artillery = enemy("artillery", 1020);
        assertEquals(true, call("updateArtillery", new Class<?>[]{Enemy.class, double.class}, artillery, .1));
        assertEquals(player.x, game.artilleryShells.get(0).x);
        player.down = true; artillery.specialCooldown = 0; operator.drone.x = 1200;
        call("updateArtillery", new Class<?>[]{Enemy.class, double.class}, artillery, .1);
        assertEquals(operator.drone.x, game.artilleryShells.get(1).x);
    }

    @Test void wallOnlyConsumesCooldownOnValidPlacementCannotBeRecoveredAndExpires() throws Exception {
        start("tank"); player.facingX = 1; player.facingY = 0;
        game.handleMessage(player, "JOB_ABILITY"); assertTrue(game.trapSlots.isEmpty());
        game.handleMessage(player, "TANK_WALL"); assertEquals(2, game.trapSlots.size());
        TrapSlot wall = game.trapSlots.get(0); assertEquals("barricade", wall.defense.type);
        for (TrapSlot segment : game.trapSlots) {
            assertEquals(10000, segment.defense.hp);
            assertEquals(10000, segment.defense.maxHp);
            assertEquals(player.id, segment.ownerId);
            assertEquals(20, segment.temporaryRemaining);
        }
        var slots = new ObjectMapper().readTree(SnapshotBuilder.build(game)).get("slots");
        assertEquals(2, slots.size());
        assertEquals(10000, slots.get(0).get("defense").get("maxHp").asDouble());
        assertEquals(JobRules.TANK_WALL_COOLDOWN, player.jobCooldown);
        call("removeDefense", new Class<?>[]{Player.class, String.class}, player, wall.id);
        assertEquals(2, game.trapSlots.size()); assertEquals(0, player.barricadeItems);
        game.handleMessage(player, "TANK_WALL"); assertEquals(2, game.trapSlots.size());
        player.jobCooldown = 0; game.handleMessage(player, "TANK_WALL");
        assertEquals(0, player.jobCooldown); assertEquals(2, game.trapSlots.size());
        call("updateJobEquipment", new Class<?>[]{double.class}, 15.0);
        assertEquals(2, game.trapSlots.size());
        call("updateJobEquipment", new Class<?>[]{double.class}, 5.0);
        assertTrue(game.trapSlots.isEmpty());
    }

    @Test void cursorPositionSelectsWallAxisEvenWhenPlayerFacesAnotherDirection() {
        start("tank"); player.facingX = -1; player.facingY = 0;
        game.handleMessage(player, "TANK_WALL:1180:1700");
        assertEquals(2, game.trapSlots.size());
        assertEquals(game.trapSlots.get(0).y, game.trapSlots.get(1).y);
        assertTrue(game.trapSlots.get(0).y < player.y);
        game.trapSlots.clear(); player.jobCooldown = 0;
        game.handleMessage(player, "TANK_WALL:1340:1940");
        assertEquals(2, game.trapSlots.size());
        assertEquals(game.trapSlots.get(0).x, game.trapSlots.get(1).x);
        assertTrue(game.trapSlots.get(0).x > player.x);
        game.trapSlots.clear(); player.jobCooldown = 0;
        game.handleMessage(player, "TANK_WALL:1140:1900");
        game.handleMessage(player, "TANK_WALL:NaN:1900");
        assertTrue(game.trapSlots.isEmpty()); assertEquals(0, player.jobCooldown);
    }

    @Test void temporaryWallsStayNoninteractiveUntilTheirLastFractionOfASecond() throws Exception {
        start("tank"); game.handleMessage(player, "TANK_WALL:1340:1900");
        var wall = game.trapSlots.get(0); wall.defense.hp = 100; wall.temporaryRemaining = .01;
        player.wood = 10;
        game.handleMessage(player, "CARRY_NEAREST:" + wall.id);
        game.handleMessage(player, "REPAIR:" + wall.id);
        assertEquals(2, game.trapSlots.size()); assertEquals(100, wall.defense.hp); assertEquals(10, player.wood);
        var slots = new ObjectMapper().readTree(SnapshotBuilder.build(game)).path("slots");
        assertTrue(slots.get(0).path("temporary").asBoolean());
        assertEquals(0, slots.get(0).path("temporaryRemaining").asDouble());
    }

    @Test void wallFootprintStaysAdjacentAndPerpendicularIncludingDiagonalAim() {
        for (MapPoint facing : List.of(new MapPoint(1, 0), new MapPoint(-1, 0),
                new MapPoint(0, 1), new MapPoint(0, -1), new MapPoint(.6, .8))) {
            var candidates = JobRules.tankWallPlacements(1140, 1900, facing.x(), facing.y());
            MapPoint origin = GameMap.snapToTile(1140, 1900);
            for (var points : candidates) {
                MapPoint front = points.get(0), side = points.get(1);
                assertEquals(GameMap.TILE_SIZE, GameSupport.distance(front.x(), front.y(), side.x(), side.y()));
                assertEquals(GameMap.TILE_SIZE, GameSupport.distance(origin.x(), origin.y(), front.x(), front.y()));
                assertEquals(0, (front.x() - origin.x()) * (side.x() - front.x())
                        + (front.y() - origin.y()) * (side.y() - front.y()), 1e-9);
            }
        }
    }

    @Test void wallTriesOtherSideAndNeverPlacesPartialWallWhenBothSidesAreOccupied() {
        start("tank"); player.facingX = 1; player.facingY = 0;
        var candidates = JobRules.tankWallPlacements(player.x, player.y, 1, 0);
        Player ally = new Player(1);
        ally.x = candidates.get(0).get(1).x(); ally.y = candidates.get(0).get(1).y();
        game.players.add(ally);
        game.handleMessage(player, "TANK_WALL");
        assertEquals(2, game.trapSlots.size());
        assertEquals(candidates.get(1).get(1).y(), game.trapSlots.get(1).y);
        game.trapSlots.clear(); player.jobCooldown = 0;
        Player other = new Player(2);
        other.x = candidates.get(1).get(1).x(); other.y = candidates.get(1).get(1).y();
        game.players.add(other);
        game.handleMessage(player, "TANK_WALL");
        assertTrue(game.trapSlots.isEmpty());
        assertEquals(0, player.jobCooldown);
    }

    @Test void destroyingOneWallSegmentKeepsOtherUntilExpiry() throws Exception {
        start("tank"); player.facingX = 1; player.facingY = 0;
        game.handleMessage(player, "TANK_WALL");
        TrapSlot survivor = game.trapSlots.get(1);
        game.trapSlots.get(0).defense.hp = 0;
        call("updateJobEquipment", new Class<?>[]{double.class}, 1.0);
        assertEquals(List.of(survivor), game.trapSlots);
        assertEquals(19, survivor.temporaryRemaining);
        call("updateJobEquipment", new Class<?>[]{double.class}, 19.0);
        assertTrue(game.trapSlots.isEmpty());
        assertEquals(1200, new Defense("barricade").maxHp);
    }
    @Test void decoyLaunchPreservesDisguiseAndAttractsMeleeAndArtillery() throws Exception {
        start("spy"); game.handleMessage(player, "JOB_ABILITY");
        game.handleMessage(player, "DECOY:1400:1900"); assertEquals(1, game.decoys.size());
        assertEquals(.5, player.decoyCooldown);
        assertEquals(JobRules.SPY_DURATION, player.spyRemaining);
        game.handleMessage(player, "DECOY:1400:1900"); assertEquals(1, game.decoys.size());
        Decoy decoy = game.decoys.get(0);
        call("updateJobEquipment", new Class<?>[]{double.class}, .1); assertEquals(1190, decoy.x);
        Enemy melee = enemy("grunt", 1200);
        call("updateEnemies", new Class<?>[]{double.class}, .1); assertEquals(25, decoy.hp); assertEquals(100, player.hp);
        game.enemies.clear(); Enemy artillery = enemy("artillery", 1020);
        assertTrue(GameMap.hasClearLine(artillery.x, artillery.y, decoy.x, decoy.y));
        assertEquals(true, call("updateArtillery", new Class<?>[]{Enemy.class, double.class}, artillery, .1));
        assertEquals(decoy.x, game.artilleryShells.get(0).x);
        call("updateArtilleryShells", new Class<?>[]{double.class}, 100.0); assertTrue(decoy.hp <= 0);
        call("updateJobEquipment", new Class<?>[]{double.class}, .1); assertTrue(game.decoys.isEmpty());
    }
    @Test void decoyMovementStopsAtObstaclesAndDeadOrExpiredDecoysCannotAttract() {
        start("spy"); Decoy decoy = new Decoy(player, new MapPoint(1, 0));
        DecoyRules.advance(decoy, 1, (x, y) -> x <= 1160);
        assertEquals(1160, decoy.x); assertEquals(0, decoy.travelRemaining);
        Enemy enemy = enemy("grunt", 1200);
        assertSame(decoy, DecoyRules.target(enemy, List.of(decoy), (x, y) -> true));
        assertNull(DecoyRules.target(enemy, List.of(decoy), (x, y) -> false));
        decoy.hp = 0; assertNull(DecoyRules.target(enemy, List.of(decoy), (x, y) -> true));
        decoy.hp = 45; decoy.remaining = 0; assertNull(DecoyRules.target(enemy, List.of(decoy), (x, y) -> true));
    }
    @Test void decoyUsesClickedDirectionAndCanLaunchAgainAfterHalfSecond() {
        start("spy");
        game.handleMessage(player, "DECOY:1240:2000");
        Decoy original = game.decoys.get(0);
        DecoyRules.advance(original, .1, (x, y) -> true);
        assertEquals(1140 + 50 / Math.sqrt(2), original.x, 1e-6);
        assertEquals(1900 + 50 / Math.sqrt(2), original.y, 1e-6);
        player.decoyCooldown = .01;
        game.handleMessage(player, "DECOY:1040:1900"); assertSame(original, game.decoys.get(0));
        player.decoyCooldown = 0;
        game.handleMessage(player, "DECOY:1040:1900");
        assertNotSame(original, game.decoys.get(0)); assertEquals(.5, player.decoyCooldown);
        DecoyRules.advance(game.decoys.get(0), .1, (x, y) -> true);
        assertEquals(1090, game.decoys.get(0).x); assertEquals(1900, game.decoys.get(0).y);
    }
    @Test void invalidDecoyLaunchesDoNotConsumeCooldown() {
        start("spy");
        for (String command : List.of("DECOY:NaN:1900", "DECOY:Infinity:1900", "DECOY:1140:1900")) {
            game.handleMessage(player, command); assertTrue(game.decoys.isEmpty()); assertEquals(0, player.decoyCooldown);
        }
        player.down = true; game.handleMessage(player, "DECOY:1400:1900"); assertTrue(game.decoys.isEmpty());
        player.down = false; player.job = "healer"; game.handleMessage(player, "DECOY:1400:1900"); assertTrue(game.decoys.isEmpty());
    }
}
