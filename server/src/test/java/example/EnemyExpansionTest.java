package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import com.fasterxml.jackson.databind.ObjectMapper;

class EnemyExpansionTest {
    GameSession game; Player player;
    @BeforeEach void setup() {
        game=new GameSession(new GameEventSink(){ public void broadcast(String s){} public void send(Player p,String s){} });
        player=game.connectPlayer("enemy-expansion");
        game.players.clear(); game.players.add(player); game.enemies.clear(); game.trapSlots.clear();
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        game.phase=GamePhase.WAVE; game.round=50;
        player.x=1220; player.y=1900; player.hp=100;
        game.coreX=980; game.coreY=1980;
    }
    void invoke(String name,double dt) throws Exception {
        var m=GameSession.class.getDeclaredMethod(name,double.class);m.setAccessible(true);m.invoke(game,dt);
    }
    Enemy enemy(String type) {
        Enemy e=new Enemy(9900,type,GameMap.SPAWN_POINTS.get(0),10000,0,40,0);
        e.x=1020;e.y=1900;e.specialCooldown=0;game.enemies.add(e);return e;
    }
    Enemy spawn(String type) throws Exception {
        var m=GameSession.class.getDeclaredMethod("spawnEnemy",String.class,SpawnPoint.class);
        m.setAccessible(true);m.invoke(game,type,GameMap.SPAWN_POINTS.get(0));return game.enemies.get(game.enemies.size()-1);
    }
    @Test void midRoundReliefAppliesOnlyFromTenThroughTwenty() {
        for(int round=1;round<=50;round++) {
            double tier = 1 + (round / 10) * .2;
            assertEquals(tier * (round >= 10 && round <= 20 ? .9 : 1),
                    EnemyTierRules.multiplier(round),1e-9,"Round " + round);
        }
    }
    @Test void spawnScalesHpAndDamageOnceAndKeepsSpeedAcrossDecade() throws Exception {
        game.round=9;Enemy before=spawn("grunt");
        assertEquals(224.5,before.maxHp);assertEquals(19,before.damage);
        game.round=10;Enemy after=spawn("grunt");
        assertEquals(255.96,after.maxHp,1e-9);assertEquals(21.6,after.damage,1e-9);
        assertEquals((58+10*1.5)*.5*GameMap.SPAWN_POINTS.get(0).speedMultiplier(),after.speed,1e-9);
        assertEquals(0,EnemyWaveRules.bossCount(49));assertEquals(1,EnemyWaveRules.bossCount(50));
    }
    @Test void midRoundStrengthReachesNormalAndSummonedEnemiesAndSnapshots() throws Exception {
        var spawn = GameSession.class.getDeclaredMethod("spawnEnemy",String.class,SpawnPoint.class,boolean.class);
        spawn.setAccessible(true);
        for(int round : new int[]{9,10,16,19,20,21}) for(boolean summoned : new boolean[]{false,true}) {
            game.round=round;game.enemies.clear();game.roundHumanCount=4;
            double strength = round==9 ? 1 : round<=19 ? 1.08 : round==20 ? 1.26 : 1.4;
            spawn.invoke(game,"grunt",GameMap.SPAWN_POINTS.get(0),summoned);
            spawn.invoke(game,"warden",GameMap.SPAWN_POINTS.get(0),summoned);
            Enemy grunt=game.enemies.get(0),warden=game.enemies.get(1);
            assertEquals((56+round*6.25)*2*strength,grunt.maxHp,1e-9);
            assertEquals((10+round)*strength,grunt.damage,1e-9);
            assertEquals(Math.round((1600+round*50)*13*strength/100)*100.,warden.maxHp,1e-9);
            assertEquals((38+round*.6)*strength,warden.damage,1e-9);
            assertEquals((140+round*3.5)*.5*GameMap.SPAWN_POINTS.get(0).speedMultiplier(),warden.speed,1e-9);
            assertEquals(grunt.maxHp,grunt.hp);assertEquals(warden.maxHp,warden.hp);
            var enemies=new ObjectMapper().readTree(SnapshotBuilder.build(game)).path("enemies");
            assertEquals(Math.round(grunt.maxHp*10)/10.,enemies.get(0).path("maxHp").asDouble(),1e-9);
            assertEquals(Math.round(warden.maxHp*10)/10.,enemies.get(1).path("maxHp").asDouble(),1e-9);
        }
    }
    @Test void everyTurretDealsHalfDamageToAllExistingBossesAndZeroToFinalBoss() throws Exception {
        for(String turret:List.of("turret","copperTurret","silverTurret","overclockSilver")) {
            for(String type:List.of("boss","warden","warlord","titan","explosionBoss","finalBoss","grunt","tiny")) {
                game.enemies.clear();game.trapSlots.clear();Enemy e=enemy(type);
                TrapSlot slot=new TrapSlot("turret","free",1140,1900,null);slot.defense=new Defense(turret);game.trapSlots.add(slot);
                double hp=slot.defense.hp;
                invoke("updateDefenses",.05);
                double base=42*(turret.equals("overclockSilver")?14:turret.equals("silverTurret")?3.5:turret.equals("copperTurret")?2:1);
                assertEquals(type.equals("finalBoss")||type.equals("tiny")?0:type.equals("grunt")?base:base*.5,e.maxHp-e.hp,1e-9,turret+" "+type);
                assertEquals(hp-4,slot.defense.hp,1e-9);
            }
        }
    }
    @Test void finalBossIsScheduledExactlyOnceAndBlocksVictoryUntilDefeated() throws Exception {
        game.round=49;
        var begin=GameSession.class.getDeclaredMethod("beginRound");begin.setAccessible(true);begin.invoke(game);
        assertEquals(50,game.round);assertEquals(1,game.queuedBosses);assertEquals("boss_assault",game.roundEvent);
        game.queuedEnemies=game.queuedTinyEnemies=0;invoke("updateSpawning",10);invoke("updateSpawning",10);
        assertEquals(1,game.enemies.size());Enemy boss=game.enemies.get(0);
        assertEquals("finalBoss",boss.type);assertTrue(boss.isBoss());assertEquals(140000,boss.maxHp);assertEquals(170,boss.damage);
        game.update(.05);assertEquals(GamePhase.WAVE,game.phase);
        game.combat.damageEnemy(boss,200000,null);
        game.update(.05);assertEquals(GamePhase.WON,game.phase);
    }
    @Test void finalBossSalvoAndPulseHaveWarningsAndCanBeDodged() throws Exception {
        Enemy boss=enemy("finalBoss");invoke("updateEnemies",.05);
        assertEquals(5,game.artilleryShells.size());assertTrue(game.artilleryShells.stream().allMatch(s->s.duration==1.2));
        player.x=1380;invoke("updateEnemies",1.2);assertEquals(100,player.hp);
        player.x=1120;boss.specialCooldown=0;invoke("updateEnemies",.05);
        assertEquals(1.2,boss.bossPulseRemaining);
        var snapshot=new ObjectMapper().readTree(SnapshotBuilder.build(game)).path("enemies").get(0);
        assertEquals(260,snapshot.path("pulseRadius").asDouble());assertEquals("PULSE_WARNING",snapshot.path("bossAction").asText());
        player.x=1380;invoke("updateEnemies",1.2);assertEquals(100,player.hp);assertEquals(0,boss.bossPulseRemaining);
        boss.specialCooldown=0;boss.nextSummon=true;player.x=1120;invoke("updateEnemies",.05);
        boss.hp=0;invoke("updateEnemies",2);assertEquals(100,player.hp,"Death cancels untriggered pulse");
    }
    @Test void finalBossPulseHitsOnceAndFreezingPausesWarning() throws Exception {
        Enemy boss=enemy("finalBoss");boss.nextSummon=true;player.x=1120;
        invoke("updateEnemies",.05);boss.frozenRemaining=1;invoke("updateEnemies",.5);invoke("updateEnemies",.5);
        assertEquals(1.2,boss.bossPulseRemaining);assertEquals(100,player.hp);
        invoke("updateEnemies",1.2);assertEquals(68,player.hp,1e-9);
        invoke("updateEnemies",.05);assertEquals(68,player.hp,1e-9);
    }
    @Test void eliteArtilleryFiresFiveFixedGreenShellsAndRespectsCooldown() throws Exception {
        Enemy elite=enemy("artilleryElite");invoke("updateEnemies",.05);
        assertEquals(5,game.artilleryShells.size());
        assertEquals(5,game.artilleryShells.stream().map(s->s.y).distinct().count());
        assertTrue(game.artilleryShells.stream().allMatch(s->s.x==1220&&s.duration==1.5));
        invoke("updateEnemies",.05);assertEquals(5,game.artilleryShells.size());
        player.x=1380;elite.hp=0;invoke("updateEnemies",1.5);
        assertTrue(game.artilleryShells.isEmpty());assertEquals(100,player.hp);
    }
    @Test void poisonerLeavesSmallPersistentCloudAndDodgingAvoidsDamage() throws Exception {
        Enemy poisoner=enemy("poisoner");invoke("updateEnemies",.05);
        assertEquals(1,game.enemyPoisonClouds.size());invoke("updateEnemies",.05);assertEquals(1,game.enemyPoisonClouds.size());
        var snapshot=new ObjectMapper().readTree(SnapshotBuilder.build(game)).path("poisonClouds").get(0);
        assertEquals(55,snapshot.path("radius").asDouble());assertTrue(snapshot.path("hostile").asBoolean());
        poisoner.hp=0;game.queuedEnemies=1;var timer=GameSession.class.getDeclaredField("spawnTimer");timer.setAccessible(true);timer.setDouble(game,100);
        game.update(.49);assertEquals(100,player.hp);game.update(.01);assertEquals(92,player.hp);
        player.x+=100;game.update(.5);assertEquals(92,player.hp);
        game.update(3);assertTrue(game.enemyPoisonClouds.isEmpty());
    }
    @Test void mixedFriendlyAndHostileGasSnapshotAndResetStayValid() throws Exception {
        game.poisonClouds.add(new PoisonGasRules.Cloud(player.id,1020,1900,10));
        game.enemyPoisonClouds.add(new EnemyPoisonSystem.Cloud(1220,1900,8));
        game.enemyPoisonClouds.add(new EnemyPoisonSystem.Cloud(1240,1900,8));
        assertEquals(3,new ObjectMapper().readTree(SnapshotBuilder.build(game)).path("poisonClouds").size());
        var reset=GameSession.class.getDeclaredMethod("resetWorld");reset.setAccessible(true);reset.invoke(game);
        assertTrue(game.enemyPoisonClouds.isEmpty());
    }
    @Test void poisonCannotDamageAcrossWallsOrDownedPlayersAndCleansUpBeforeRoundEnd() throws Exception {
        player.x=892;player.y=492;
        assertFalse(GameMap.hasClearLine(860,450,player.x,player.y));
        assertTrue(GameSupport.distance(860,450,player.x,player.y)<EnemyPoisonSystem.RADIUS);
        game.enemyPoisonClouds.add(new EnemyPoisonSystem.Cloud(860,450,8));
        game.queuedEnemies=1;
        var timer=GameSession.class.getDeclaredField("spawnTimer");timer.setAccessible(true);timer.setDouble(game,100);
        game.update(.5);assertEquals(100,player.hp);
        player.x=860;player.y=450;player.down=true;
        game.update(.5);assertEquals(100,player.hp);
        game.phase=GamePhase.WAVE;player.down=false;player.hp=100;
        game.enemyPoisonClouds.clear();game.enemyPoisonClouds.add(new EnemyPoisonSystem.Cloud(860,450,8));
        game.queuedEnemies=0;
        game.update(.5);assertEquals(92,player.hp);assertEquals(GamePhase.WAVE,game.phase);
        player.x=1220;player.y=1900;game.update(3.5);
        assertTrue(game.enemyPoisonClouds.isEmpty());assertEquals(GamePhase.WON,game.phase);
    }
    @Test void poisonEmissionIsBoundedAndCpuPolicyRejectsUnreachableEscapes() {
        Enemy e=enemy("poisoner");
        var world=new EnemyPoisonSystem.World() {
            public List<Player> players() {return game.players;}
            public java.util.Set<String> unlocked() {return game.unlockedAreas;}
            public void damage(Player p,double amount) {p.hp-=amount;}
        };
        for(int i=0;i<100;i++) {e.specialCooldown=0;EnemyPoisonSystem.emit(e,.05,game.enemyPoisonClouds,world);}
        assertEquals(24,game.enemyPoisonClouds.size());
        assertNull(BotCombatRules.poisonEscape(player.x,player.y,game.enemyPoisonClouds,(x,y)->false));
        player.human=false;EnemyPoisonSystem.update(game.enemyPoisonClouds,.5,world);
        assertEquals(100-24*8,player.hp,1e-9,"CPU is evaluated by the same poison geometry");
    }
    @Test void cpuEscapesPoisonUsingTheSameDamageArea() throws Exception {
        player.human=false;game.enemyPoisonClouds.add(new EnemyPoisonSystem.Cloud(player.x,player.y,8));
        var dodge=GameSession.class.getDeclaredMethod("dodgeEnemyPoison",Player.class);dodge.setAccessible(true);
        assertEquals(true,dodge.invoke(game,player));assertTrue(Math.hypot(player.moveX,player.moveY)>.9);
    }
}
