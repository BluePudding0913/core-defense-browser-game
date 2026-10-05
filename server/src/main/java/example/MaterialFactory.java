package example;

/** One deployed quarry. Carried machines are interchangeable inventory items. */
final class MaterialFactory {
    final String id;
    final ShopUnit shop;
    final String resource;
    final double interval;
    final double x;
    final double y;
    double elapsed;

    MaterialFactory(String id, ShopUnit shop, MapPoint point) {
        this.id = id;
        this.shop = shop;
        x = point.x();
        y = point.y();
        resource = shop.item().replace("Factory", "");
        interval = switch (resource) {
            case "wood", "ore" -> 5;
            case "copper" -> 8;
            case "silver" -> 12;
            default -> throw new IllegalArgumentException("Unknown factory resource: " + resource);
        };
    }

    int produce(double dt) {
        elapsed += dt;
        int produced = (int) (elapsed / interval);
        elapsed %= interval;
        return produced;
    }
}
