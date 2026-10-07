package example;

/** Quantity rules shared by inventory drops and capacity-limited pickups. */
final class InventoryDropRules {
    private InventoryDropRules() { }

    static int dropAmount(int available, int requested) {
        return Math.min(Math.max(0, available), Math.max(0, requested));
    }

    static int pickupAmount(int dropped, int held, int capacity) {
        return Math.min(Math.max(0, dropped), Math.max(0, capacity - held));
    }
}
