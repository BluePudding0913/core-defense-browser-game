package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.*;
import com.fasterxml.jackson.databind.ObjectMapper;

class EnemyProjectileSystemTest {
    GameSession game; Player player;
    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String s) { }
            public void send(Player p, String s) { }
        });
        player = game.connectPlayer("new-enemies"); game.setRoomOwner(player);
        game.handleMessage(player, "START"); game.phase = GamePhase.WAVE;
        game.players.forEach(p -> { p.human = true; p.down = p != player; p.healRemaining = 0; });
        player.x = 1020; player.y = 1900;
        game.enemies.clear(); game.trapSlots.clear();
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
    }
    Enemy enemy(String type, double x, double y) {
        var e = new Enemy(game.enemies.size()+1, type, GameMap.SPAWN_POINTS.get(0), 1000, 0, 30, 30);
        e.x=x; e.y=y; game.enemies.add(e); return e;
    }
    void updateEnemies(double dt) throws Exception {
        var method=GameSession.class.getDeclaredMethod("updateEnemies",double.class);
        method.setAccessible(true); method.invoke(game,dt);
    }
    EnemyProjectileSystem.World world() {
        return new EnemyProjectileSystem.World() {
            public List<Player> players(){return game.players;}
            public List<TrapSlot> slots(){return game.trapSlots;}
            public Set<String> unlocked(){return game.unlockedAreas;}
            public void damage(Player p,double amount){p.hp-=amount;}
        };
    }
    @Test void blackoutRequiresNearbyVisiblePlayerAndRemainsUntilKilled() throws Exception {
        var e=enemy("blackout",1400,1900); updateEnemies(0); assertFalse(e.powerCut);
        e.x=1180; updateEnemies(0); assertTrue(e.powerCut);
        player.x=800; updateEnemies(0); assertTrue(EnemyProjectileSystem.activeBlackout(game.enemies));
        var state=new ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertTrue(state.path("blackoutActive").asBoolean()); assertTrue(state.path("enemies").get(0).path("powerCut").asBoolean());
        e.hp=0; assertFalse(EnemyProjectileSystem.activeBlackout(game.enemies));
        assertFalse(new ObjectMapper().readTree(SnapshotBuilder.build(game)).path("blackoutActive").asBoolean());
    }
    @Test void wallsAndDisguisePreventPowerCut() throws Exception {
        player.x=1020;player.y=1580;
        var e=enemy("blackout",1240,1580);updateEnemies(0);assertFalse(e.powerCut);
        e.x=1100;e.y=1900;player.y=1900;player.job="spy";player.spyRemaining=8;
        updateEnemies(0);assertFalse(e.powerCut);
    }
    @Test void multipleDisruptorsAndOrdinaryBreakersHaveIndependentLifetimes() throws Exception {
        var a=enemy("blackout",1100,1900);var b=enemy("blackout",1180,1900);
        updateEnemies(0);a.hp=0;assertTrue(EnemyProjectileSystem.activeBlackout(game.enemies));
        b.hp=0;game.blackoutActive=true;game.trippedBreakers.add(GameMap.BREAKER_TERMINALS.get(0).id());
        assertTrue(new ObjectMapper().readTree(SnapshotBuilder.build(game)).path("blackoutActive").asBoolean());
        assertFalse(EnemyProjectileSystem.activeBlackout(game.enemies));
    }
    @Test void seekerLaunchesVisibleMissileThatTurnsWithoutInstantDamage() throws Exception {
        var e=enemy("seeker",1220,1900);updateEnemies(.05);
        assertEquals(100,player.hp);assertEquals(1,game.enemyProjectiles.size());
        var shot=game.enemyProjectiles.get(0);double initialAngle=shot.angle;
        player.y=1980;EnemyProjectileSystem.update(game.enemyProjectiles,.2,world());
        assertNotEquals(initialAngle,shot.angle);assertTrue(shot.x<1220);
        assertEquals(1,new ObjectMapper().readTree(SnapshotBuilder.build(game)).path("projectiles").size());
        updateEnemies(.1);assertEquals(1,game.enemyProjectiles.size(),"Cooldown prevents immediate repeat");
    }
    @Test void homingMissileDamagesOnContactAndStopsAtBarricade() {
        var e=enemy("seeker",1120,1900);
        game.enemyProjectiles.add(new EnemyProjectileSystem.Shot(0,e,player));
        EnemyProjectileSystem.update(game.enemyProjectiles,1,world());
        assertEquals(70,player.hp);assertTrue(game.enemyProjectiles.isEmpty());
        player.hp=100;
        var slot=new TrapSlot("wall","free",1060,1900,null);slot.defense=new Defense("barricade");game.trapSlots.add(slot);
        double hp=slot.defense.hp;game.enemyProjectiles.add(new EnemyProjectileSystem.Shot(1,e,player));
        EnemyProjectileSystem.update(game.enemyProjectiles,1,world());
        assertEquals(hp-30,slot.defense.hp);assertEquals(100,player.hp);assertTrue(game.enemyProjectiles.isEmpty());
    }
    @Test void missileCannotTurnSharplyEvenWhenTargetMovesBehindIt() {
        var e=enemy("seeker",1220,1900);
        var shot=new EnemyProjectileSystem.Shot(0,e,player);
        game.enemyProjectiles.add(shot);
        double initial=shot.angle;
        player.x=1400; player.y=1980;
        EnemyProjectileSystem.update(game.enemyProjectiles,.2,world());
        double turned=Math.abs(Math.atan2(Math.sin(shot.angle-initial),Math.cos(shot.angle-initial)));
        assertEquals(.16,turned,1e-9,"Turn is limited to .8 radians per second");
        assertTrue(shot.x<1220,"Missile keeps flying forward instead of making an abrupt U-turn");
    }
    @Test void missileCannotCrossWallsAndExpiresWithoutTarget() {
        player.x=1020;player.y=1580;var e=enemy("seeker",1240,1580);
        game.enemyProjectiles.add(new EnemyProjectileSystem.Shot(0,e,player));
        EnemyProjectileSystem.update(game.enemyProjectiles,3,world());
        assertTrue(game.enemyProjectiles.isEmpty());assertEquals(100,player.hp);
        e.x=1100;e.y=1900;player.x=1020;player.y=1900;player.down=true;
        game.enemyProjectiles.add(new EnemyProjectileSystem.Shot(1,e,player));
        EnemyProjectileSystem.update(game.enemyProjectiles,6,world());assertTrue(game.enemyProjectiles.isEmpty());
    }
    @Test void rocketHitsEnemyThatMovesIntoFlightAndKeepsRocketUpgradeAfterWeaponSwitch() throws Exception {
        player.job="scout";player.weapons.grant("rocket");player.equipWeapon("rocket");
        player.enchantments.put("rocket",2);
        var e=enemy("grunt",1300,1980);game.combat.attackAt(player,1300,1900);
        assertEquals(1000,e.hp);assertEquals(1,game.combat.rockets.size());
        game.combat.updateRockets(.05);assertEquals(1000,e.hp);
        player.equipWeapon("pistol");e.x=1120;e.y=1900;
        game.combat.updateRockets(1);assertEquals(0,e.hp);assertTrue(game.combat.rockets.isEmpty());
    }
    @Test void backupRequiresConsoleRangeUnlockedRoomAndPreparation() {
        player.job="hacker";player.credits=200000;game.phase=GamePhase.PREPARING;
        game.handleMessage(player,"HACKER_BACKUP");assertNull(game.backup);assertEquals(200000,player.credits);
        player.x=GameMap.BACKUP_TERMINAL.x();player.y=GameMap.BACKUP_TERMINAL.y();
        game.unlockedAreas.remove("command-room");game.handleMessage(player,"HACKER_BACKUP");assertNull(game.backup);
        game.unlockedAreas.add("command-room");game.handleMessage(player,"HACKER_BACKUP");assertNotNull(game.backup);assertEquals(100000,player.credits);
        assertFalse(GameMap.WORKBENCH_UNITS.contains(GameMap.BACKUP_TERMINAL));
        assertTrue(GameMap.areaById("command-room").contains(player.x,player.y));
    }
    @Test void defeatAutomaticallyRestoresAfterFrozenEffectWithoutInput() {
        game.phase=GamePhase.PREPARING;game.prepTime=120;player.job="hacker";player.credits=200000;
        player.x=100;player.y=100;game.handleMessage(player,"HACKER_BACKUP");
        assertNotNull(game.backup);game.phase=GamePhase.WAVE;game.queuedEnemies=1;
        game.coreHp=0;game.update(.05);assertEquals(GamePhase.LOST,game.phase);assertEquals(6,game.rewindRemaining);
        assertTrue(SnapshotBuilder.build(game).contains("\"rewindDuration\":6.0"));
        assertTrue(SnapshotBuilder.build(game).contains("\"rewindRemaining\":0.0"));
        double elapsed=game.elapsedSeconds;game.update(1);assertEquals(elapsed,game.elapsedSeconds);
        assertEquals(6,game.rewindRemaining);assertEquals(.5,game.rewindDelayRemaining);
        assertTrue(SnapshotBuilder.build(game).contains("\"rewindRemaining\":0.0"));
        game.update(.5);assertEquals(0,game.rewindDelayRemaining);
        assertTrue(SnapshotBuilder.build(game).contains("\"rewindRemaining\":6.0"));
        game.update(1);
        game.handleMessage(player,"START");assertEquals(GamePhase.LOST,game.phase);
        game.update(4);assertEquals(GamePhase.LOST,game.phase);assertEquals(1,game.rewindRemaining);
        game.update(1);assertEquals(GamePhase.PREPARING,game.phase);assertTrue(game.coreHp>0);assertTrue(game.backupUsed);
        assertEquals(1,game.rewindVersion);assertEquals(120,game.prepTime);
        assertTrue(game.enemyProjectiles.isEmpty());assertTrue(game.combat.rockets.isEmpty());
    }
    @Test void newEnemyTypesJoinTheSpawnPoolAtTheirStartingRounds() throws Exception {
        var select=GameSession.class.getDeclaredMethod("selectEnemyType",SpawnPoint.class);select.setAccessible(true);
        for (int round : new int[]{9,10,13,14,40}) {
            game.round=round;int blackout=0,seeker=0;
            for(int i=0;i<5000;i++){String type=(String)select.invoke(game,GameMap.SPAWN_POINTS.get(0));
                if(type.equals("blackout"))blackout++;if(type.equals("seeker"))seeker++;}
            assertEquals(round>=14,blackout>0);assertEquals(round>=10,seeker>0);
        }
    }
    @Test void downingSpyEndsDisguiseAndStartsFullCooldown() throws Exception {
        player.job="spy";player.spyRemaining=6;player.jobCooldown=0;
        var damage=GameSession.class.getDeclaredMethod("damagePlayer",Player.class,double.class);damage.setAccessible(true);
        damage.invoke(game,player,200);assertTrue(player.down);assertEquals(0,player.spyRemaining);assertEquals(15,player.jobCooldown);
    }
    @Test void totalPartyDownAlsoTriggersAutomaticRestore() {
        game.phase=GamePhase.PREPARING;player.job="hacker";player.credits=100000;player.x=100;player.y=100;
        game.handleMessage(player,"HACKER_BACKUP");assertNotNull(game.backup);
        game.phase=GamePhase.WAVE;game.queuedEnemies=1;
        game.players.forEach(p->p.down=true);game.update(.05);
        assertEquals(6,game.rewindRemaining);game.update(1.5);assertEquals(6,game.rewindRemaining);game.update(6);
        assertEquals(GamePhase.PREPARING,game.phase);assertFalse(player.down);
    }
}

