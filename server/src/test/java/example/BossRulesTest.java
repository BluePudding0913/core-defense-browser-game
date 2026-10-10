package example;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class BossRulesTest {
    @Test void titanAndWarlordFollowTheExistingWardenPhaseBoundaries() {
        for (String type : new String[]{"titan", "warlord"}) {
            for (double hp : new double[]{1000, 601, 600, 301, 300, 1}) {
                assertEquals(WardenRules.phase(hp, 1000), BossRules.phase(type, hp, 1000));
            }
            assertEquals(1, BossRules.attackRate(type, 601, 1000));
            assertEquals(1.5, BossRules.attackRate(type, 600, 1000));
            assertEquals(1.5, BossRules.attackRate(type, 301, 1000));
            assertEquals(2, BossRules.attackRate(type, 300, 1000));
            assertEquals(1, BossRules.movementMultiplier(type, 601, 1000));
            assertEquals(1.2, BossRules.movementMultiplier(type, 600, 1000));
            assertEquals(1.5, BossRules.movementMultiplier(type, 300, 1000));
        }
    }
    @Test void otherEnemiesDoNotGainTheNewAttackTempo() {
        for (String type : new String[]{"grunt", "boss", "warden", "explosionBoss"}) {
            assertEquals(1, BossRules.attackRate(type, 1, 1000));
            assertEquals(1, BossRules.movementMultiplier(type, 1, 1000));
        }
    }
}
