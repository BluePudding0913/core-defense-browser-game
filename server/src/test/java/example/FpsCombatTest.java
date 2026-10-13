package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.ArrayList;
import java.util.List;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class FpsCombatTest {
    GameSession game; Player player; final List<String> messages=new ArrayList<>();
    @BeforeEach void setup() {
        game=new GameSession(new GameEventSink(){public void broadcast(String text){messages.add(text);}public void send(Player p,String text){}});
        CombatTestRandom.center(game);
        player=game.connectPlayer("fps-test");game.setRoomOwner(player);game.handleMessage(player,"START:DEBUG");game.handleMessage(player,"READY");game.update(.05);
        game.enemies.clear();game.players.forEach(p->p.human=true);
        player.job="healer";player.x=GameMap.CORE_X-40;player.y=GameMap.CORE_Y;player.cooldown=0;
        messages.clear();
    }
    Enemy enemy(int id,String type,double distance) {
        var e=new Enemy(id,type,GameMap.SPAWN_POINTS.get(0),500,0,0,0);e.x=player.x+distance;e.y=player.y;game.enemies.add(e);return e;
    }
    void shoot(double pitch) {game.handleMessage(player,"FIRE:"+(player.x+150)+":"+player.y+":1:"+pitch);}
    void shootHead(Enemy e) {
        double r=CombatSystem.enemyRadius(e),x=e.x+e.facingX*r*.25,y=e.y+e.facingY*r*.25;
        game.handleMessage(player,"FIRE:"+x+":"+y+":1:"+Math.atan2(r*1.39-26,Math.hypot(x-player.x,y-player.y)));
    }
    JsonNode impact(int id) throws Exception {
        return new ObjectMapper().readTree(messages.stream().filter(s->s.contains("\"enemyId\":"+id)).findFirst().orElseThrow());
    }
    @Test void fpsHeadshotUsesHeightAndPublishesTheActualImpactPointAndReward() throws Exception {
        var e=enemy(9100,"grunt",100);int gold=player.credits;shootHead(e);
        assertEquals(448,e.hp,.001);assertEquals(gold+3,player.credits);assertEquals(.38,player.cooldown,.001);
        var hit=impact(e.id);assertTrue(hit.path("headshot").asBoolean());assertTrue(hit.path("hitHeight").asDouble()>27.4);
        assertTrue(hit.path("x").asDouble()<e.x);assertEquals(player.y+(hit.path("x").asDouble()-player.x)/100*e.facingY*21*.25,hit.path("y").asDouble(),.06);
        assertEquals(26,hit.path("fromHeight").asDouble());
    }
    @Test void oldHeightBandIsNowTorsoAndAHeadSideMissDoesNotAwardHs() throws Exception {
        var e=enemy(9150,"grunt",100);int gold=player.credits;shoot(0);
        assertEquals(474,e.hp,.001);assertEquals(gold,player.credits);
        assertFalse(impact(e.id).path("headshot").asBoolean());
        player.cooldown=0;player.firing=false;messages.clear();
        game.handleMessage(player,"FIRE:"+e.x+":"+(e.y+8)+":1:0.04");
        assertEquals(474,e.hp,.001);assertTrue(messages.stream().noneMatch(m->m.contains("\"enemyId\":"+e.id)));
    }
    @Test void aimingAtTorsoDealsNormalDamageAndAimingOverOrUnderMisses() throws Exception {
        for(double pitch:new double[]{-.14,.5,-.5}) {
            var e=enemy(9200,"grunt",100);player.cooldown=0;player.firing=false;messages.clear();shoot(pitch);
            assertEquals(pitch==-.14?474:500,e.hp,.001);
            if(pitch==-.14)assertFalse(impact(e.id).path("headshot").asBoolean());
            else assertTrue(messages.stream().noneMatch(s->s.contains("\"enemyId\":"+e.id)));
            assertEquals(.38,player.cooldown,.001,"Missing still spends the firing cooldown");game.enemies.clear();
        }
    }
    @Test void aMissedNearBodyDoesNotBlockAFarEnemy() {
        var small=enemy(9300,"tiny",50);var far=enemy(9301,"grunt",110);shootHead(far);
        assertEquals(500,small.hp);assertEquals(448,far.hp,.001);
    }
    @Test void anOffsetTorsoHitDoesNotBecomeAHeadshot() throws Exception {
        var e=enemy(9400,"grunt",100);
        game.handleMessage(player,"FIRE:"+e.x+":"+(e.y-4)+":1:-0.14");
        assertEquals(474,e.hp,.001);assertFalse(impact(e.id).path("headshot").asBoolean());
    }
    @Test void invalidPitchDoesNotSpendAmmoOrChangeTheLastValidAim() {
        player.weapons.grant("smg");player.equipWeapon("smg");player.aimPitch=.1;int ammo=player.weapons.ammo("smg");
        for(String pitch:List.of("NaN","Infinity","1.21","-1.21"))game.handleMessage(player,"FIRE:"+(player.x+100)+":"+player.y+":1:"+pitch);
        assertEquals(ammo,player.weapons.ammo("smg"));assertEquals(0,player.cooldown);assertFalse(player.firing);assertEquals(.1,player.aimPitch);
    }
    @Test void secondaryHandHasIndependentHeightAmmoAndCooldownState() throws Exception {
        player.job="attacker";player.weapons.grant("smg");player.secondaryWeapon="smg";player.aimPitch=-.3;
        var e=enemy(9500,"grunt",100);int ammo=player.weapons.ammo("smg");
        game.handleMessage(player,"SECONDARY_FIRE:"+(e.x+e.facingX*21*.25)+":"+(e.y+e.facingY*21*.25)+":1:0.04");
        assertEquals(446,e.hp,.001);assertTrue(impact(e.id).path("headshot").asBoolean());
        assertEquals(ammo-1,player.weapons.ammo("smg"));assertEquals(0,player.cooldown);assertEquals(.14,player.secondaryCooldown,.001);
        assertEquals(-.3,player.aimPitch);assertEquals(.04,player.secondaryAimPitch);
    }
    @Test void heightOmittedKeepsLegacyCpuAndTwoDimensionalShots() throws Exception {
        var e=enemy(9600,"grunt",100);game.handleMessage(player,"FIRE:"+e.x+":"+e.y+":1");
        assertEquals(474,e.hp,.001);assertNull(player.aimPitch);assertFalse(impact(e.id).has("hitHeight"));
    }
    @Test void decoySnapshotIdentifiesEachOwnerAndDirection() throws Exception {
        player.job="spy";game.handleMessage(player,"DECOY:"+(player.x+100)+":"+player.y);
        var snapshot=new ObjectMapper().readTree(SnapshotBuilder.build(game));var decoy=snapshot.path("decoys").get(0);
        assertNotNull(decoy);assertEquals(player.id,decoy.path("ownerId").asText());assertEquals(1,decoy.path("facingX").asDouble());assertEquals(0,decoy.path("facingY").asDouble());
    }
    @Test void aHeightMissStillSpendsOneRoundAndPiercingChecksEachBodySeparately() throws Exception {
        // Isolate height/piercing from the separately verified random sniper cone.
        var randomField=GameSession.class.getDeclaredField("random");randomField.setAccessible(true);
        randomField.set(game,new java.util.Random(){@Override public double nextDouble(){return 0;}});
        player.weapons.grant("smg");player.equipWeapon("smg");var near=enemy(9700,"grunt",100);int ammo=player.weapons.ammo("smg");shoot(.5);
        assertEquals(500,near.hp);assertEquals(ammo-1,player.weapons.ammo("smg"));assertEquals(.14,player.cooldown,.001);
        game.enemies.clear();player.firing=false;player.weapons.grant("sniper");player.equipWeapon("sniper");player.cooldown=0;
        var tiny=enemy(9701,"tiny",50);var head=enemy(9702,"grunt",100);var torso=enemy(9703,"brute",150);shootHead(head);
        assertEquals(500,tiny.hp);assertEquals(0,head.hp);assertEquals(202.5,torso.hp,.001,"Existing sniper distance bonus applies to a normal torso hit");
    }
    @Test void continuousRailBeamCannotDamageABodyBelowItsRay() throws Exception {
        player.weapons.grant("railgun");player.equipWeapon("railgun");var e=enemy(9800,"grunt",100);shoot(.8);
        game.combat.updateRailgun(player,GameConfig.RAILGUN_CHARGE+.2);
        assertEquals(500,e.hp);assertEquals(1,player.weapons.ammo("railgun"));
        assertTrue(player.railgunRemaining>0);player.aimPitch=0.0;game.combat.updateRailgun(player,.1);assertEquals(500,e.hp,"Beam pitch remains fixed with its horizontal direction");
        var snapshot=new ObjectMapper().readTree(SnapshotBuilder.build(game));assertEquals(.8,snapshot.path("players").get(player.slot-1).path("railgunPitch").asDouble());
    }
    @Test void sequencedInputCarriesPitchAndCpuTakeoverClearsIt() {
        var e=enemy(9900,"grunt",100);
        game.handleMessage(player,"INPUT:7:FIRE:"+(e.x+e.facingX*21*.25)+":"+(e.y+e.facingY*21*.25)+":1:0.04");
        assertEquals(448,e.hp);assertEquals(7,player.lastProcessedInput);assertEquals(.04,player.aimPitch);
        game.disconnectPlayer(player,true);assertNull(player.aimPitch);assertNull(player.secondaryAimPitch);
    }

    @Test void newEnemiesUseTheirVisibleSizeForFpsBodyHitsAndOverheadMisses() throws Exception {
        for (String type : List.of("finalBoss", "poisoner", "artilleryElite")) {
            game.enemies.clear();var e=enemy(9800,type,100);
            double radius=CombatSystem.enemyRadius(e);
            player.cooldown=0;player.firing=false;shoot(Math.atan2(radius*.8-26,100));
            assertEquals(474,e.hp,.001,type+" can be shot in the visible body, including turret-immune final boss");
            player.cooldown=0;player.firing=false;shoot(.9);
            assertEquals(474,e.hp,.001,type+" is not hit above its visible body");
        }
    }
}
