package example;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
class AimControlRulesTest {
 @Test void breathingIsSmoothAndPeriodic(){assertEquals(1,AimControlRules.breath(0));assertEquals(1.35,AimControlRules.breath(.7),1e-12);assertEquals(.65,AimControlRules.breath(2.1),1e-12);for(double t:new double[]{1.4,2.8,4.2}){assertEquals(AimControlRules.breath(t-.00001),AimControlRules.breath(t+.00001),.0001);assertTrue(Math.abs((AimControlRules.breath(t+.00001)-AimControlRules.breath(t-.00001))/.00002)>.7);}}
 @Test void movementStopAndJumpPenalties(){var s=new AimControlRules.State();s.motion(JobRules.WALK_SPEED,false);assertEquals(2.25,AimControlRules.penalty(s));s.advance(.1);assertEquals(2.25,AimControlRules.penalty(s));s.motion(0,false);s.advance(.75);assertTrue(AimControlRules.penalty(s)<1.05);s.motion(0,true);assertTrue(AimControlRules.penalty(s)>1.8);}
 @Test void sprintIsWorseButBounded(){var s=new AimControlRules.State();s.motion(JobRules.WALK_SPEED*1.64,false);assertEquals(3.05,AimControlRules.penalty(s),1e-12);s.motion(1e99,false);assertEquals(3.25,AimControlRules.penalty(s));}
 @Test void smoothTrackingIsFreeAndBothAxisSnapsCostPrecision(){var s=new AimControlRules.State();s.look(0,-1,0);s.advance(.1);s.look(Math.sin(.02),-Math.cos(.02),0);assertEquals(0,s.turn);s.advance(.05);s.look(1,0,0);assertEquals(1.5,s.turn);s.advance(.66);assertTrue(s.turn<.08);var v=new AimControlRules.State();v.look(0,-1,0);v.advance(.05);v.look(0,-1,.6);assertEquals(1.5,v.turn);}
 @Test void packetFloodCannotRecoverPenalty(){var s=new AimControlRules.State();s.look(0,-1,0);s.look(1,0,0);for(int i=0;i<1000;i++)s.look(1,0,0);assertEquals(1.5,s.turn);assertEquals(0,s.elapsed);}
 @Test void invalidInputsCannotPoisonState(){var s=new AimControlRules.State();s.look(Double.NaN,1,0);s.look(0,0,0);s.look(1,0,Double.POSITIVE_INFINITY);s.look(1,0,2);s.advance(Double.NaN);s.motion(Double.POSITIVE_INFINITY,false);assertFalse(s.hasLook);assertEquals(0,s.elapsed);assertEquals(0,s.movement);}
 @Test void displayedTimeIsFiniteBoundedAndMonotonic(){var s=new AimControlRules.State();s.advance(10);assertTrue(s.validTime(9.8));assertTrue(s.validTime(10.06));assertFalse(s.validTime(9.79));assertFalse(s.validTime(10.061));assertFalse(s.validTime(Double.NaN));s.inputTime=10.;assertFalse(s.validTime(9.99));assertTrue(s.validTime(10.01));}
 @Test void deferredWeaponsRetainTheirExistingCones(){var s=new AimControlRules.State();s.movement=1;s.turn=1;s.elapsed=.7;for(String w:new String[]{"rocket","railgun","laserCannon","poisonGas","repulsor","bat","hook","flamethrower","plasmaBlade"}){assertFalse(AimControlRules.supported(w));assertEquals(ShotSpreadRules.radius(w),AimControlRules.radius(s,w,new SniperRules.State()));}}
 @Test void proneSniperPreservesSpecialBreathAndConcentration(){var s=new AimControlRules.State();var sniper=new SniperRules.State();sniper.start(()->.1);sniper.elapsed=2.1;assertEquals(SniperRules.radius(sniper,2.1),AimControlRules.radius(s,"sniper",sniper));sniper.elapsed=182.1;sniper.cycle=65;double before=sniper.elapsed;sniper.recovery=.9;AimControlRules.radius(s,"sniper",sniper);assertEquals(before,sniper.elapsed);}
 @Test void turningWidensEverySupportedWeaponIncludingProneSniper(){
  var s=new AimControlRules.State();var sniper=new SniperRules.State();
  for(String weapon:new String[]{"pistol","smg","rifle","revolver","lmg","shotgun","ricochet","freezeGun","sniper"}) {
   s.turn=0;double base=AimControlRules.radius(s,weapon,sniper);s.turn=1.5;
   assertEquals(base*3.25,AimControlRules.radius(s,weapon,sniper),1e-9,weapon);
  }
  sniper.start(()->.1);sniper.elapsed=2.1;s.turn=0;double base=AimControlRules.radius(s,"sniper",sniper);s.turn=1.5;
  assertEquals(base*3.25,AimControlRules.radius(s,"sniper",sniper),1e-9);
 }
 @Test void copyIsIndependent(){var s=new AimControlRules.State();s.motion(100,true);s.look(1,0,.2);s.inputTime=0.;var copy=s.copy();copy.advance(1);copy.motion(0,false);assertEquals(0,s.elapsed);assertTrue(s.airborne);assertEquals(100./JobRules.WALK_SPEED,s.speedRatio);assertTrue(copy.hasLook);assertEquals(s.inputTime,copy.inputTime);}
}
