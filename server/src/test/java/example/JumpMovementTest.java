package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class JumpMovementTest {
    GameSession game; Player player; List<String> messages=new ArrayList<>();
    @BeforeEach void setup() {
        game=new GameSession(new GameEventSink(){public void broadcast(String s){messages.add(s);}public void send(Player p,String s){}});
        player=game.connectPlayer("jump-test");game.setRoomOwner(player);game.handleMessage(player,"START:DEBUG");
        game.players.forEach(p->p.human=true);game.enemies.clear();game.trapSlots.clear();
        player.x=GameMap.CORE_X-80;player.y=GameMap.CORE_Y;
    }
    void tick(double duration) {for(int n=0;n<Math.round(duration/.01);n++)game.update(.01);}
    TrapSlot block(String type) {var slot=new TrapSlot("jump-obstacle","free",player.x+40,player.y,null);slot.defense=new Defense(type);game.trapSlots.add(slot);return slot;}
    @Test void gravityAndLandingAreStableAcrossFrameSizes() {
        for(double dt:new double[]{.01,.02,.05}) {
            double h=0,v=JumpRules.SPEED,max=0;
            for(double t=0;t<1.1;t+=dt){var m=JumpRules.advance(h,v,dt,0,130);h=m.height();v=m.velocity();max=Math.max(max,h);}
            assertEquals(0,h);assertEquals(0,v);assertEquals(30.625,max,.1);
        }
    }
    @Test void ceilingAndObstacleSupportStopVerticalMovement() {
        var m=JumpRules.advance(30,140,.05,24,64);assertEquals(32,m.height());assertEquals(0,m.velocity());
        m=JumpRules.advance(25,-40,.05,24,130);assertEquals(24,m.height());assertEquals(0,m.velocity());
    }
    @Test void repeatedJumpCannotRestartAnAirborneJump() {
        game.handleMessage(player,"JUMP");tick(.15);double v=player.jumpVelocity;
        game.handleMessage(player,"JUMP");assertEquals(v,player.jumpVelocity);assertTrue(player.jumpHeight>0);
        tick(1);assertEquals(0,player.jumpHeight);assertEquals(0,player.jumpVelocity);
    }
    @Test void movementBlockedOnGroundCanCrossAllLowBlockTypesWhenJumping() {
        for(String type:new String[]{"block","barricade","copperBarricade","silverBarricade"}) {
            game.trapSlots.clear();player.jumpHeight=0;player.jumpVelocity=0;player.x=GameMap.CORE_X-80;player.y=GameMap.CORE_Y;
            var slot=block(type);game.handleMessage(player,"MOVE:1:0");tick(.2);assertTrue(player.x<slot.x-18);
            game.handleMessage(player,"JUMP");tick(.65);assertTrue(player.x>slot.x+23,type);tick(.5);assertEquals(0,player.jumpHeight);
        }
    }
    @Test void landsOnBlockAndFallsAfterWalkingOff() {
        var slot=block("barricade");player.x=slot.x;player.jumpHeight=30;player.jumpVelocity=-10;tick(.3);
        assertEquals(24,player.jumpHeight);assertEquals(0,player.jumpVelocity);
        game.handleMessage(player,"MOVE:1:0");tick(.7);assertEquals(0,player.jumpHeight);
    }
    @Test void jumpingNeverIgnoresSolidTerrainOrLockedAreas() {
        player.jumpHeight=30;player.jumpVelocity=0;
        for(int r=1;r<GameMap.TILE_MAP.rows().size()-1;r++)for(int c=1;c<GameMap.TILE_MAP.rows().get(r).length()-1;c++) {
            var floor=GameMap.TILE_MAP.typeAt(c,r);var wall=GameMap.TILE_MAP.typeAt(c+1,r);
            double x=(c+.5)*40,y=(r+.5)*40;
            if(floor!=null&&!floor.solid()&&wall!=null&&wall.solid()&&GameMap.canOccupy(x,y,5,game.unlockedAreas)) {
                player.x=x;player.y=y;game.handleMessage(player,"MOVE:1:0");tick(.5);
                assertTrue(player.x<(c+1)*40);return;
            }
        }
        fail("No test boundary found");
    }
    @Test void downCarryingCoreAndControlScreensRejectJump() {
        player.down=true;game.handleMessage(player,"JUMP");assertEquals(0,player.jumpVelocity);
        player.down=false;player.movingCore=true;game.handleMessage(player,"JUMP");assertEquals(0,player.jumpVelocity);
        player.movingCore=false;player.missileControl=true;game.handleMessage(player,"JUMP");assertEquals(0,player.jumpVelocity);
    }
    @Test void jumpHeightIsCopiedAndPublishedAndChangesShotHeight() throws Exception {
        game.handleMessage(player,"JUMP");tick(.2);assertEquals(player.jumpHeight,player.gameplayCopy().jumpHeight);
        var json=new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertTrue(json.path("players").get(0).has("jumpHeight"));
        messages.clear();game.handleMessage(player,"FIRE:"+(player.x+100)+":"+player.y+":1:0");
        var hit=messages.stream().filter(s->s.contains("fromHeight")).findFirst().orElseThrow();
        assertEquals(26+player.jumpHeight,new com.fasterxml.jackson.databind.ObjectMapper().readTree(hit).path("fromHeight").asDouble(),.001);
    }
    @Test void airborneAllyGeometryUsesTheirActualHeight() {
        var ray=new FpsHitRules.Ray(0,0,26,1,0,0,200);
        assertNotNull(FpsHitRules.ally(ray,100,0,false,0,0));
        assertNull(FpsHitRules.ally(ray,100,0,false,0,30));
    }
}


