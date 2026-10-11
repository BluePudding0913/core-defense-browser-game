package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.ArrayList;
import java.util.List;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class SniperCombatTest {
    GameSession game;Player player;final List<String> messages=new ArrayList<>();
    @BeforeEach void setup() {
        game=new GameSession(new GameEventSink(){public void broadcast(String s){messages.add(s);}public void send(Player p,String s){messages.add(s);}});
        player=game.connectPlayer("sniper-test");game.setRoomOwner(player);game.handleMessage(player,"START:DEBUG");
        game.players.forEach(p->p.human=true);game.enemies.clear();game.trapSlots.clear();
        player.x=GameMap.CORE_X-80;player.y=GameMap.CORE_Y;player.weapons.grant("sniper");player.equipWeapon("sniper");
        messages.clear();
    }
    void prone(){game.handleMessage(player,"SNIPER:1");assertFalse(player.sniper.fixed);game.update(.8);assertTrue(player.sniper.fixed);}
    void precision() {player.sniper.elapsed=2.1;player.sniper.precision=true;player.sniper.nextPrecision=false;}
    void fire(String time,double pitch) {game.handleMessage(player,"FIRE:"+(player.x+200)+":"+player.y+":1:"+pitch+":"+time);}
    @Test void stanceRequiresStationaryGroundedSniperAndNeverRestartsOnRepeatedInput() {
        player.moveX=1;game.handleMessage(player,"SNIPER:1");assertFalse(player.sniper.fixed);
        player.moveX=0;player.jumpVelocity=1;game.handleMessage(player,"SNIPER:1");assertFalse(player.sniper.fixed);
        player.jumpVelocity=0;prone();game.update(.1);double elapsed=player.sniper.elapsed;
        game.handleMessage(player,"SNIPER:1");assertEquals(elapsed,player.sniper.elapsed);
        double x=player.x;game.update(.1);assertEquals(x,player.x);
        game.handleMessage(player,"SNIPER_LOOK:0.6:0.8:0.1");assertEquals(.6,player.sniper.facingX,1e-9);
        game.handleMessage(player,"MOVE:1:0");assertTrue(player.sniper.fixed);game.update(.1);assertEquals(x,player.x);
        game.handleMessage(player,"SNIPER:0");game.handleMessage(player,"MOVE:1:0");game.update(.1);assertTrue(player.x>x);
    }
    @Test void stanceRequiresAnUninterruptedHoldAndCancelDoesNotReleaseAnAlreadyFixedStance() {
        game.handleMessage(player,"SNIPER:1");game.update(.4);assertFalse(player.sniper.fixed);assertTrue(player.sniper.deploying);
        game.handleMessage(player,"SNIPER_CANCEL");game.update(.5);assertFalse(player.sniper.fixed);assertFalse(player.sniper.deploying);
        game.handleMessage(player,"SNIPER:1");game.update(.4);game.handleMessage(player,"SNIPER:1");game.update(.4);assertTrue(player.sniper.fixed);
        game.handleMessage(player,"SNIPER_CANCEL");assertTrue(player.sniper.fixed);
        game.handleMessage(player,"SNIPER:0");game.handleMessage(player,"SNIPER:1");game.update(.4);game.handleMessage(player,"MOVE:1:0");game.update(.5);assertFalse(player.sniper.fixed);
    }
    @Test void jumpWeaponSelectionDisconnectAndDownRemoveTheStance() {
        prone();game.handleMessage(player,"JUMP");assertFalse(player.sniper.fixed);assertTrue(player.jumpVelocity>0);
        player.jumpVelocity=player.jumpHeight=0;prone();player.equipWeapon("pistol");assertFalse(player.sniper.fixed);
        player.equipWeapon("sniper");prone();player.down=true;game.update(.01);assertFalse(player.sniper.fixed);
        player.down=false;prone();game.disconnectPlayer(player);assertFalse(player.sniper.fixed);
    }
    @Test void shotUsesProneHeightServerScatterAmmoAndRecoveryWithoutChangingManualAim() throws Exception {
        prone();precision();int ammo=player.weapons.ammo("sniper");
        var e=new Enemy(9901,"grunt",GameMap.SPAWN_POINTS.get(0),2000,0,0,0);e.x=player.x+100;e.y=player.y;game.enemies.add(e);
        double pitch=Math.atan2(26-SniperRules.EYE_HEIGHT,100);fire("2.1",pitch);
        assertEquals(ammo-1,player.weapons.ammo("sniper"));assertEquals(3.6,player.cooldown);assertTrue(player.sniper.fixed);
        assertEquals(.9,player.sniper.recovery);assertEquals(pitch,player.aimPitch);
        var mapper=new ObjectMapper();var trace=mapper.readTree(messages.stream().filter(s->s.contains("\"effect\":\"hit\"")&&s.contains("\"damage\":0")).findFirst().orElseThrow());
        assertEquals(6.2,trace.path("fromHeight").asDouble(),.001);assertTrue(e.hp<2000);
        var state=mapper.readTree(SnapshotBuilder.build(game)).path("players").get(player.slot-1).path("sniper");
        assertTrue(state.path("fixed").asBoolean());assertEquals(2.1,state.path("elapsed").asDouble());assertTrue(state.path("precision").asBoolean());
        int remaining=player.weapons.ammo("sniper");fire("2.1",pitch);assertEquals(remaining,player.weapons.ammo("sniper"));
    }
    @Test void fixedStanceBoostsBodyAndHeadDamageAndConsumesOneRoundWithoutResettingConcentration() throws Exception {
        player.job="healer";CombatTestRandom.center(game);
        for(boolean fixed:new boolean[]{false,true}) for(boolean head:new boolean[]{false,true}) {
            player.firing=false;player.cooldown=0;player.sniper.stop();if(fixed){prone();precision();}
            game.enemies.clear();messages.clear();
            var e=new Enemy(9950,"grunt",GameMap.SPAWN_POINTS.get(0),5000,0,0,0);e.x=player.x+100;e.y=player.y;game.enemies.add(e);
            double x=e.x,y=e.y,height=16;
            if(head){y+=e.facingY*21*.085;x+=e.facingX*21*.085;height=21*1.43;}
            double pitch=Math.atan2(height-(fixed?SniperRules.EYE_HEIGHT:26),Math.hypot(x-player.x,y-player.y));
            int ammo=player.weapons.ammo("sniper");double elapsed=player.sniper.elapsed;
            game.handleMessage(player,"FIRE:"+x+":"+y+":1:"+pitch+(fixed?":2.1":""));
            double expected=280*(1+100.0/2400)*(fixed?1.25:1)*(head?2:1);
            assertEquals(expected,5000-e.hp,1e-6,"Fixed="+fixed+", head="+head);
            assertEquals(ammo-1,player.weapons.ammo("sniper"));assertEquals(3.6,player.cooldown);
            assertEquals(elapsed,player.sniper.elapsed);assertEquals(fixed,player.sniper.fixed);
            var impact=new ObjectMapper().readTree(messages.stream().filter(m->m.contains("\"enemyId\":9950")).findFirst().orElseThrow());
            assertEquals(head,impact.path("headshot").asBoolean());
        }
    }
    @Test void falseOldAndFutureTimesCannotBuyPrecisionOrSpendAmmo() {
        prone();precision();int ammo=player.weapons.ammo("sniper");
        for(String value:List.of("0","1.8","2.17","NaN","Infinity")){fire(value,0);assertEquals(ammo,player.weapons.ammo("sniper"));assertEquals(0,player.cooldown);}
        fire("2.0",0);assertEquals(ammo-1,player.weapons.ammo("sniper"));
    }
    @Test void actualRayHasFloorAndCeilingImpactsRatherThanPassingThroughThem() throws Exception {
        var mapper=new ObjectMapper();prone();precision();fire("2.1",-.5);
        var trace=mapper.readTree(messages.stream().filter(s->s.contains("\"effect\":\"hit\"")).findFirst().orElseThrow());
        assertEquals(0,trace.path("hitHeight").asDouble(),.001);
        messages.clear();player.firing=false;player.cooldown=0;fire("2.1",1.1);
        trace=mapper.readTree(messages.stream().filter(m->m.contains("\"effect\":\"hit\"")).findFirst().orElseThrow());
        assertEquals(GameMap.ceilingHeight(player.x,player.y),trace.path("hitHeight").asDouble(),.001);
    }
    @Test void releasingTheTriggerAlwaysStopsFireEvenWithAStaleBreathTime() {
        prone();precision();fire("2.1",0);assertTrue(player.firing);
        game.handleMessage(player,"FIRE:"+(player.x+200)+":"+player.y+":0:0:0");
        assertFalse(player.firing);assertNull(player.sniper.inputTime);
    }
    @Test void firingNeverResetsConcentrationTime() {
        prone();player.sniper.advance(90,()->.8);double elapsed=player.sniper.elapsed;
        fire(Double.toString(elapsed),0);assertEquals(elapsed,player.sniper.elapsed);
        assertEquals(.675,SniperRules.stability(player.sniper.elapsed),1e-9);
        player.firing=false;game.update(1);assertEquals(elapsed+1,player.sniper.elapsed,1e-9);
        assertTrue(SniperRules.stability(player.sniper.elapsed)<.675);assertTrue(player.sniper.fixed);
    }
    @Test void pistolSamplesItsConeAndSecondaryFireCannotBorrowTheProneBonus() throws Exception {
        player.equipWeapon("pistol");game.handleMessage(player,"FIRE:"+(player.x+200)+":"+player.y+":1:0");
        var trace=new ObjectMapper().readTree(messages.stream().filter(s->s.contains("\"effect\":\"hit\"")).findFirst().orElseThrow());
        double distance=Math.hypot(trace.path("x").asDouble()-player.x,trace.path("y").asDouble()-player.y);
        assertTrue(Math.hypot(trace.path("y").asDouble()-player.y,trace.path("hitHeight").asDouble()-26)<=distance*ShotSpreadRules.slope("pistol")+.01);
        player.firing=false;player.equipWeapon("sniper");player.job="attacker";prone();int ammo=player.weapons.ammo("sniper");
        game.handleMessage(player,"SECONDARY_FIRE:"+(player.x+200)+":"+player.y+":1:0");assertEquals(ammo,player.weapons.ammo("sniper"));assertTrue(player.sniper.fixed);
    }
    @Test void sniperStopsAtSecondEnemyForStandingProneAndSecondaryShots() throws Exception {
        CombatTestRandom.center(game);
        for(int mode=0;mode<3;mode++) {
            player.sniper.stop();player.firing=player.secondaryFiring=false;player.cooldown=player.secondaryCooldown=0;
            player.job="healer";player.equipWeapon("sniper");if(mode==1){prone();precision();}
            if(mode==2){player.job="attacker";player.equipWeapon("pistol");player.equipSecondaryWeapon("sniper");}
            game.enemies.clear();messages.clear();
            var victims=new java.util.ArrayList<Enemy>();
            for(int i=0;i<3;i++){var e=new Enemy(9960+i,"grunt",GameMap.SPAWN_POINTS.get(0),5000,0,0,0);e.x=player.x+100+i*50;e.y=player.y;victims.add(e);}
            game.enemies.add(victims.get(2));game.enemies.add(victims.get(0));game.enemies.add(victims.get(1));
            double pitch=Math.atan2(16-(mode==1?SniperRules.EYE_HEIGHT:26),100);int ammo=player.weapons.ammo("sniper");
            game.handleMessage(player,(mode==2?"SECONDARY_FIRE:":"FIRE:")+(player.x+200)+":"+player.y+":1:"+pitch+(mode==1?":2.1":""));
            assertTrue(victims.get(0).hp<5000);assertTrue(victims.get(1).hp<5000);assertEquals(5000,victims.get(2).hp);
            assertEquals(ammo-1,player.weapons.ammo("sniper"));assertEquals(3.6,mode==2?player.secondaryCooldown:player.cooldown);
            var trace=new ObjectMapper().readTree(messages.stream().filter(m->m.contains("\"effect\":\"hit\"")&&m.contains("\"damage\":0")).findFirst().orElseThrow());
            assertTrue(trace.path("x").asDouble()>victims.get(0).x);assertTrue(trace.path("x").asDouble()<victims.get(1).x);
            assertFalse(messages.stream().anyMatch(m->m.contains("\"enemyId\":9962")));
        }
    }
    @Test void allSniperUsersAndSnapshotsShareTheMapDiagonalRange() throws Exception {
        double range=Math.hypot(GameMap.WORLD_W,GameMap.WORLD_H);
        assertTrue(range>2400);assertEquals(range,WeaponCatalog.stats("sniper").range());
        assertEquals(range,WeaponCatalog.find("sniper").stats().range());
        var snapshot=new ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals(range,snapshot.path("rules").path("weapons").path("sniper").path("range").asDouble());
        assertEquals(2,snapshot.path("rules").path("weapons").path("sniper").path("maxTargets").asInt());
        assertEquals(3.6,snapshot.path("rules").path("weapons").path("sniper").path("cooldown").asDouble());
        assertEquals(2400,WeaponCatalog.stats("railgun").range());
    }
    @Test void standingProneAndSecondarySniperShotsStopAtTheSameWall() throws Exception {
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        player.x=1020;player.y=1900;CombatTestRandom.center(game);
        double expected=GameMap.distanceToWall(player.x,player.y,1,0,WeaponCatalog.stats("sniper").range(),game.unlockedAreas);
        assertTrue(expected>0);int initialAmmo=player.weapons.ammo("sniper");
        for(int mode=0;mode<3;mode++) {
            player.firing=player.secondaryFiring=false;player.cooldown=player.secondaryCooldown=0;messages.clear();
            if(mode==1)player.sniper.start(()->.8);
            if(mode==2){player.sniper.stop();player.job="attacker";player.equipWeapon("pistol");player.equipSecondaryWeapon("sniper");}
            game.handleMessage(player,(mode==2?"SECONDARY_FIRE:":"FIRE:")+(player.x+200)+":"+player.y+":1:0");
            var trace=new ObjectMapper().readTree(messages.stream().filter(m->m.contains("\"effect\":\"hit\"")).findFirst().orElseThrow());
            assertEquals(player.x+expected,trace.path("x").asDouble(),1e-8);assertEquals(player.y,trace.path("y").asDouble(),1e-8);
            assertEquals(initialAmmo-mode-1,player.weapons.ammo("sniper"));
        }
    }

}
