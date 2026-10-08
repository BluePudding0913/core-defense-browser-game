package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import org.junit.jupiter.api.Test;

class DroneRulesTest {
    @Test void recoveryRequiresRangeAndClearLineAndHeavyGunsCannotBeMounted() {
        assertTrue(DroneRules.canRecover(45, true));
        assertFalse(DroneRules.canRecover(45.01, true));
        assertFalse(DroneRules.canRecover(20, false));
        for (String weapon : List.of("pistol", "shotgun", "smg", "rifle", "sniper", "ricochet", "revolver"))
            assertTrue(DroneRules.mountable(weapon), weapon);
        for (String weapon : List.of("bat", "rocket", "railgun", "lmg", "unknown"))
            assertFalse(DroneRules.mountable(weapon), weapon);
    }
    @Test void repairChecksBothMaterialsAtBoundary() {
        assertFalse(DroneRules.canRepair(4, 2));
        assertFalse(DroneRules.canRepair(5, 1));
        assertTrue(DroneRules.canRepair(5, 2));
        assertTrue(DroneRules.canRepair(100, 100));
    }

    @Test void targetRequiresHostilityAndActiveLivingOperatorAndSelectsNearest() {
        Enemy e = new Enemy(1, "runner", GameMap.SPAWN_POINTS.get(0), 100, 30, 20, 10);
        e.x = 1140; e.y = 1900;
        Player a = new Player(1), b = new Player(2);
        for (Player p : List.of(a, b)) {
            p.drone = new Drone(); p.drone.active = true;
            p.drone.x = e.x + p.slot * 20; p.drone.y = e.y;
        }
        assertNull(DroneRules.target(e, List.of(a, b)));
        a.drone.attackers.add(e.id); b.drone.attackers.add(e.id);
        assertSame(a, DroneRules.target(e, List.of(a, b)));
        a.down = true; assertSame(a, DroneRules.target(e, List.of(a, b)));
        a.drone.active = false; assertSame(b, DroneRules.target(e, List.of(a, b)));
        b.drone.active = false; assertNull(DroneRules.target(e, List.of(a, b)));
    }
}
