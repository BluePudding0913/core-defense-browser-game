package example;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class ZombieHitRulesTest {
    final double r=21;
    FpsHitRules.Ray horizontal(double side,double height) {
        return new FpsHitRules.Ray(-100,side,height,1,0,0,200);
    }
    FpsHitRules.Hit hit(FpsHitRules.Ray ray,double width) {
        return FpsHitRules.zombie(ray,0,0,r,0,1,width);
    }
    @Test void headIsASeparateSmallVolumeRatherThanAHeightBand() {
        var head=hit(horizontal(r*.085,r*1.43),2);
        assertNotNull(head);assertTrue(head.headshot());
        assertNull(hit(horizontal(8,r*1.43),2));
        assertNull(hit(horizontal(0,r*1.7),2));
        var chest=hit(horizontal(0,26),2);
        assertNotNull(chest);assertFalse(chest.headshot());
        assertFalse(hit(horizontal(3,26),2).headshot());
    }
    @Test void weaponWidthCannotTurnANearHeadMissIntoHs() {
        var wide=hit(horizontal(7,r*1.43),20);
        assertNotNull(wide);assertFalse(wide.headshot());
        assertNull(hit(horizontal(7,r*1.43),2));
    }
    @Test void nearerTorsoBlocksHeadWhileDownwardHeadFirstRayIsHs() {
        // Both rays pass through the same head center; the first passes through the torso first.
        var fromBelow=new FpsHitRules.Ray(-6,r*.085,0,1,0,r*1.43/6,100);
        var fromAbove=new FpsHitRules.Ray(-6,r*.085,60,1,0,(r*1.43-60)/6,100);
        assertFalse(hit(fromBelow,0).headshot());
        assertTrue(hit(fromAbove,0).headshot());
    }
    @Test void headOffsetFollowsAllFourFacingDirectionsAndNormalizesFacing() {
        for(var facing:new double[][]{{0,1},{1,0},{0,-1},{-1,0},{6,8},{0,0}}) {
            double len=Math.hypot(facing[0],facing[1]);
            double fx=len>0?facing[0]/len:0,fy=len>0?facing[1]/len:1;
            double hx=fx*r*.085,hy=fy*r*.085;
            var ray=new FpsHitRules.Ray(hx-100*fy,hy+100*fx,r*1.43,fy,-fx,0,200);
            var head=FpsHitRules.zombie(ray,0,0,r,facing[0],facing[1],0);
            assertNotNull(head);assertTrue(head.headshot());
            var shortRay=new FpsHitRules.Ray(ray.x(),ray.y(),ray.height(),ray.dx(),ray.dy(),0,90);
            assertNull(FpsHitRules.zombie(shortRay,0,0,r,facing[0],facing[1],0));
        }
    }
    @Test void rayStartingInBodyCannotSkipToHead() {
        var inside=new FpsHitRules.Ray(0,0,r*.66,1,0,2,100);
        var hit=hit(inside,0);assertNotNull(hit);assertFalse(hit.headshot());assertEquals(0,hit.distance());
        assertNull(hit(new FpsHitRules.Ray(100,0,r*1.43,1,0,0,200),0));
    }
}
