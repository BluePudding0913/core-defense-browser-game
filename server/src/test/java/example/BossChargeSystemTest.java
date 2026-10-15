package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import org.junit.jupiter.api.Test;

class BossChargeSystemTest {
    Enemy boss() {
        return new Enemy(1, "boss", GameMap.SPAWN_POINTS.get(0), 10000, 84, 48, 100);
    }
    final BossChargeSystem.World world = new BossChargeSystem.World() {
        public List<Player> players() { return List.of(); }
        public List<TrapSlot> slots() { return List.of(); }
        public boolean canOccupy(double x, double y) { return true; }
        public boolean visible(Enemy e, Player p) { return true; }
        public void hit(Player p, double damage) { fail("Unexpected impact"); }
        public void hit(TrapSlot s, double damage) { fail("Unexpected impact"); }
    };

    @Test void chargeMovesContinuouslyAtReducedSpeedAndHonorsSlow() {
        for (double slow : new double[]{1, .4}) {
            Enemy e = boss(); e.chargeDx = 1; e.chargeRemaining = BossChargeSystem.DURATION;
            e.slow = slow;
            double start = e.x;
            for (int i = 0; i < 22; i++) {
                double previous = e.x;
                assertTrue(BossChargeSystem.update(e, .05, world));
                assertEquals(13 * slow, e.x - previous, 1e-6);
            }
            assertEquals(286 * slow, e.x - start, 1e-6);
            assertEquals(0, e.chargeRemaining, 1e-9);
        }
    }

    @Test void chargeInvalidatesPreChargePerceptionBeforeResumingPursuit() {
        Enemy e = boss(); e.chargeDx = 1; e.chargeRemaining = .05;
        e.perceptionTimer = .4;
        BossChargeSystem.update(e, .05, world);
        assertEquals(0, e.perceptionTimer);
    }
}
