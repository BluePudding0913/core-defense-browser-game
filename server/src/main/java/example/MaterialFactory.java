package example;

/** A shared, portable machine purchased once per game. */
final class MaterialFactory {
    static final int CAPACITY = 20;
    final ShopUnit shop;
    final String resource;
    final double interval;
    boolean purchased;
    boolean placed;
    double x;
    double y;
    String carriedBy;
    int stock;
    double elapsed;

    MaterialFactory(ShopUnit shop) {
        this.shop = shop;
        resource = shop.item().replace("Factory", "");
        interval = switch (resource) {
            case "wood", "ore" -> 5;
            case "copper" -> 8;
            case "silver" -> 12;
            default -> throw new IllegalArgumentException("Unknown factory resource: " + resource);
        };
    }

    void produce(double dt) {
        if (!purchased || !placed || stock >= CAPACITY) return;
        elapsed += dt;
        while (elapsed >= interval && stock < CAPACITY) {
            elapsed -= interval;
            stock++;
        }
        if (stock == CAPACITY) elapsed = 0;
    }
}
