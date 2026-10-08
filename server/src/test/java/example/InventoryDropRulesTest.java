package example;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class InventoryDropRulesTest {
    @Test void dropCannotExceedInventoryOrUseNegativeAmounts() {
        assertEquals(1, InventoryDropRules.dropAmount(3, 1));
        assertEquals(3, InventoryDropRules.dropAmount(3, Integer.MAX_VALUE));
        assertEquals(0, InventoryDropRules.dropAmount(3, -1));
        assertEquals(0, InventoryDropRules.dropAmount(0, 1));
    }

    @Test void pickupLeavesExcessAndRespectsFullInventory() {
        assertEquals(1, InventoryDropRules.pickupAmount(3, 4, 5));
        assertEquals(0, InventoryDropRules.pickupAmount(3, 5, 5));
        assertEquals(3, InventoryDropRules.pickupAmount(3, 0, 5));
    }
}
