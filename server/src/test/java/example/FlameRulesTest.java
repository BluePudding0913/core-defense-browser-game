package example;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class FlameRulesTest {
    @Test void coneWidensWithDistanceAndRejectsRearAndOutOfRangeTargets() {
        assertTrue(FlameRules.contains(180,70,5,0,0,1,0,220));
        assertFalse(FlameRules.contains(30,70,5,0,0,1,0,220));
        assertFalse(FlameRules.contains(180,110,5,0,0,1,0,220));
        assertFalse(FlameRules.contains(-10,0,5,0,0,1,0,220));
        assertFalse(FlameRules.contains(240,0,5,0,0,1,0,220));
    }
    @Test void verticalAndDiagonalConesUseTheSameGeometry() {
        assertTrue(FlameRules.contains(70,180,5,0,0,0,1,220));
        double diagonal=Math.sqrt(.5);
        assertTrue(FlameRules.contains(150,150,5,0,0,diagonal,diagonal,220));
        assertFalse(FlameRules.contains(150,-150,5,0,0,diagonal,diagonal,220));
    }
}
