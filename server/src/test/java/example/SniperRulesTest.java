package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.Random;
import org.junit.jupiter.api.Test;

class SniperRulesTest {
    @Test void randomCyclesHaveAdvanceCueWithoutChangingBoundaryRadius() {
        var random=new Random(49);var s=new SniperRules.State();s.start(random::nextDouble);
        int special=0;boolean expected=s.precision;
        for(int i=0;i<100000;i++) {
            assertEquals(expected,s.precision);
            s.elapsed=i*SniperRules.PERIOD+.7;
            assertEquals((s.nextPrecision?59.74:58)*SniperRules.stability(s.elapsed),SniperRules.radius(s,s.elapsed),1e-6);
            s.elapsed=i*SniperRules.PERIOD+2.1;
            assertEquals((s.precision?3.5:16)*SniperRules.stability(s.elapsed),SniperRules.radius(s,s.elapsed),1e-6);
            if(s.precision)special++;
            expected=s.nextPrecision;s.advance(.7+1e-7,random::nextDouble);
            assertEquals(38*SniperRules.stability(s.elapsed),SniperRules.radius(s,s.elapsed),1e-5);
        }
        assertEquals(.2,special/100000.0,.005);
    }
    @Test void breathingKeepsMovingThroughTheMiddleAndConcentrationShrinksLinearlyWithTime() {
        var s=new SniperRules.State();s.start(()->.1);s.elapsed=100;
        for(double t:new double[]{1.4,2.8,4.2}) {
            double speed=(SniperRules.radius(s,t+.0001)-SniperRules.radius(s,t-.0001))/.0002;
            assertTrue(Math.abs(speed)>40,"No mid-breath pause");
        }
        assertEquals(1,SniperRules.stability(0));assertEquals(.675,SniperRules.stability(90),1e-9);assertEquals(.35,SniperRules.stability(180),1e-9);
        assertEquals(.35,SniperRules.stability(1000),1e-9);
        s.elapsed=90;s.stop();assertEquals(0,s.elapsed);assertEquals(1,SniperRules.stability(s.elapsed));
    }
    @Test void scatterIsUniformInTheSightDiskEvenWhenLookingUpAndTurning() {
        var random=new Random(88);double yaw=.7,pitch=.8,dx=Math.cos(yaw),dy=Math.sin(yaw),sum=0,meanX=0,meanY=0;
        double scale=58*SniperRules.PIXEL_SLOPE;
        for(int i=0;i<50000;i++) {
            var q=SniperRules.scatter(dx,dy,pitch,58,random::nextDouble);
            double x=q.dx()*Math.cos(q.pitch()),y=q.dy()*Math.cos(q.pitch()),z=Math.sin(q.pitch());
            double forward=(x*dx+y*dy)*Math.cos(pitch)+z*Math.sin(pitch);
            double right=(-x*dy+y*dx)/forward;
            double up=(-(x*dx+y*dy)*Math.sin(pitch)+z*Math.cos(pitch))/forward;
            double r2=(right*right+up*up)/(scale*scale);assertTrue(r2<=1.0000001);
            sum+=r2;meanX+=right/scale;meanY+=up/scale;
        }
        assertEquals(.5,sum/50000,.006);assertEquals(0,meanX/50000,.01);assertEquals(0,meanY/50000,.01);
    }
    @Test void timestampsAreBoundedMonotonicAndCanCoverPreviousCycle() {
        var s=new SniperRules.State();s.start(()->.1);s.elapsed=2.9;s.cycle=1;s.previousPrecision=true;s.precision=false;
        assertTrue(s.validTime(2.75));assertFalse(s.validTime(2.69));assertFalse(s.validTime(3.0));
        assertFalse(s.validTime(Double.NaN));assertFalse(s.validTime(Double.POSITIVE_INFINITY));
        s.inputTime=2.80;assertFalse(s.validTime(2.75));assertTrue(s.validTime(2.85));
        assertTrue(SniperRules.radius(s,2.75)<SniperRules.radius(s,2.9));
    }
    @Test void copiesDoNotShareMutableStateAndChangingStanceCannotClearShotRecovery() {
        var p=new Player(1);p.sniper.start(()->.1);p.sniper.recovery=.9;
        var copy=p.gameplayCopy();copy.sniper.stop();assertTrue(p.sniper.fixed);assertFalse(copy.sniper.fixed);
        p.sniper.stop();assertEquals(.9,p.sniper.recovery);p.sniper.start(()->.1);
        assertTrue(SniperRules.radius(p.sniper,0)>100);p.sniper.advance(.9,()->.9);assertEquals(0,p.sniper.recovery);
    }
    @Test void proneBodiesMissOverheadRaysAndRemainHittableNearTheFloor() {
        var overhead=new FpsHitRules.Ray(0,0,26,1,0,0,200);
        assertNull(FpsHitRules.proneAlly(overhead,100,0,0,0,1,0));
        var low=new FpsHitRules.Ray(0,0,6.2,1,0,0,200);
        assertNotNull(FpsHitRules.proneAlly(low,100,0,0,0,1,0));
    }
}
