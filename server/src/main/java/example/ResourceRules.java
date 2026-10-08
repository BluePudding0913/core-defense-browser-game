package example;

final class ResourceRules {
    private ResourceRules() {}

    static double respawnSeconds(String type, String requiredArea, String id) {
        if ("wood".equals(type)) return 6;
        if ("ore-room".equals(requiredArea)) return 3;
        // Preserve material supply while each pickup awards a single piece.
        double supplyRate = switch (type) {
            case "ore" -> 3;
            case "copper" -> 2;
            default -> 1;
        };
        return (7 + Math.floorMod(id.hashCode(), 5)) / supplyRate;
    }
}
