package example;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class FpsHitRulesTest {
    private FpsHitRules.Ray ray(double height, double slope) { return new FpsHitRules.Ray(0, 0, height, 1, 0, slope, 200); }
    @Test void bodyAndHeadDependOnTheActualHeightOfTheIntersection() {
        var head = FpsHitRules.enemy(ray(26, 0), 100, 0, 21, 0, 1, 2);
        assertNotNull(head);assertTrue(head.headshot());assertEquals(26, head.height());
        var body = FpsHitRules.enemy(ray(26, -.14), 100, 0, 21, 0, 1, 2);
        assertNotNull(body);assertFalse(body.headshot());assertTrue(body.height() < 21);
        assertNull(FpsHitRules.enemy(ray(26, .5), 100, 0, 21, 0, 1, 2));
        assertNull(FpsHitRules.enemy(ray(26, -.5), 100, 0, 21, 0, 1, 2));
    }
    @Test void everyEnemySizeHasItsOwnBodyAndUpperHeadRegion() {
        for(double radius : new double[]{3,9,16,18,20,21,22,24,26,28,30,32,42,44,48}) {
            var torso=FpsHitRules.enemy(ray(radius*.8,0),100,0,radius,.6,.8,0);
            var head=FpsHitRules.enemy(ray(radius*1.3,0),100,0,radius,.6,.8,0);
            assertNotNull(torso);assertFalse(torso.headshot());assertNotNull(head);assertTrue(head.headshot());
            assertNull(FpsHitRules.enemy(ray(radius*1.7,0),100,0,radius,.6,.8,0));
        }
    }
    @Test void rayMustActuallyIntersectTheBodyWithinRange() {
        assertNull(FpsHitRules.enemy(ray(26,0),100,40,21,0,1,2));
        assertNull(FpsHitRules.enemy(ray(26,0),-100,0,21,0,1,2));
        assertNull(FpsHitRules.enemy(ray(26,0),300,0,21,0,1,2));
        assertNull(FpsHitRules.enemy(ray(26,0),60,0,3,0,1,2));
        assertNotNull(FpsHitRules.enemy(ray(26,0),120,0,21,0,1,2));
    }
    @Test void friendlyBodiesAlsoHaveHeightAndPitchMustBeFiniteAndLimited() {
        assertNotNull(FpsHitRules.ally(ray(16,0),100,0,false,2));
        assertNull(FpsHitRules.ally(ray(40,0),100,0,false,2));
        assertNull(FpsHitRules.ally(ray(26,0),100,0,true,2));
        assertTrue(FpsHitRules.validPitch(1.2));assertTrue(FpsHitRules.validPitch(-1.2));
        for(double value:new double[]{1.21,-1.21,Double.NaN,Double.POSITIVE_INFINITY})assertFalse(FpsHitRules.validPitch(value));
    }
}
