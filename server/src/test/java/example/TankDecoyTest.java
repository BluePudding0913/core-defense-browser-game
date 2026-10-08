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
    @Test void tankStartsAt150AndBothRecoveryPathsReachItsCap() throws Exception {
        start("tank"); assertEquals(150, player.hp);
        player.hp = 130; player.medkits = 2; game.handleMessage(player, "USE:medkit");
        assertEquals(150, player.hp); assertEquals(1, player.medkits);
        game.handleMessage(player, "USE:medkit"); assertEquals(1, player.medkits);
        player.x = GameMap.MED_X; player.y = GameMap.MED_Y; player.hp = 149;
        call("updateMedbay", new Class<?>[]{double.class}, 1.0); assertEquals(150, player.hp);
        var snapshot = new ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals(150, snapshot.get("players").get(0).get("maxHp").asDouble());
        player.x = GameMap.JOB_STATION.x(); player.y = GameMap.JOB_STATION.y();
        game.handleMessage(player, "JOB:healer"); assertEquals(100, player.hp);
    }
    @Test void healerAreaRecoversTankAbove100AndCapsAt150() throws Exception {
        start("tank"); player.hp = 145;
        Player healer = new Player(1); healer.healX = player.x; healer.healY = player.y;
        healer.healRemaining = JobRules.HEAL_DURATION; game.players.add(healer);
        call("updateHealingAreas", new Class<?>[]{double.class}, 2.0);
        assertEquals(150, player.hp);
        player.down = true; player.hp = 0;
        call("updateHealingAreas", new Class<?>[]{double.class}, 1.0);
        assertEquals(45, player.hp); assertFalse(player.down);
    }

    @Test void auraIncludesTankDoesNotStackAndStopsOnDownRangeOrWall() throws Exception {
        start("tank"); Player ally = new Player(1); ally.x = player.x + 50; ally.y = player.y; ally.hp = 100;
        game.players.add(ally);
        call("damagePlayer", new Class<?>[]{Player.class, double.class}, ally, 20.0); assertEquals(85, ally.hp);
        call("damagePlayer", new Class<?>[]{Player.class, double.class}, player, 20.0); assertEquals(135, player.hp);
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
        game.handleMessage(player, "JOB_ABILITY"); assertEquals(1, game.trapSlots.size());
        TrapSlot wall = game.trapSlots.get(0); assertEquals("barricade", wall.defense.type);
        assertEquals(JobRules.TANK_WALL_COOLDOWN, player.jobCooldown);
        call("removeDefense", new Class<?>[]{Player.class, String.class}, player, wall.id);
        assertEquals(1, game.trapSlots.size()); assertEquals(0, player.barricadeItems);
        game.handleMessage(player, "JOB_ABILITY"); assertEquals(1, game.trapSlots.size());
        player.jobCooldown = 0; game.handleMessage(player, "JOB_ABILITY");
        assertEquals(0, player.jobCooldown); assertEquals(1, game.trapSlots.size());
        call("updateJobEquipment", new Class<?>[]{double.class}, JobRules.TANK_WALL_DURATION);
        assertTrue(game.trapSlots.isEmpty());
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
