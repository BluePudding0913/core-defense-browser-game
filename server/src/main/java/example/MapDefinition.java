package example;

import java.util.List;
import java.util.Map;

record WorldSize(int width, int height) { }

record MapPoint(double x, double y) { }

record Station(String id, double x, double y) { }

record Stations(Station armory, Station medBay, Station woodcutter, Station quarry,
        Station workbench) { }

record TileType(String name, boolean solid, boolean buildable, String color) { }

/** Full rectangular grid: every symbol, including floor, occupies one cell. */
record TileMapDefinition(int tileSize, Map<String, TileType> legend, List<String> rows) {
    AreaTile cellAt(double x, double y) {
        return new AreaTile((int) Math.floor(x / tileSize), (int) Math.floor(y / tileSize));
    }

    MapPoint center(AreaTile cell) {
        return new MapPoint((cell.column() + .5) * tileSize, (cell.row() + .5) * tileSize);
    }

    TileType typeAt(int column, int row) {
        if (row < 0 || row >= rows.size()) return null;
        String cells = rows.get(row);
        if (column < 0 || column >= cells.length()) return null;
        return legend.get(String.valueOf(cells.charAt(column)));
    }
}

record AreaTile(int column, int row) { }

record StartingArea(String name, List<AreaTile> tiles, double labelX, double labelY) { }

record UnlockArea(String id, String name, List<AreaTile> tiles,
        double terminalX, double terminalY, double labelX, double labelY,
        String color, String detail) {
    boolean contains(double x, double y) {
        return tiles.contains(GameMap.TILE_MAP.cellAt(x, y));
    }

    boolean overlaps(double x, double y, double radius) {
        if (radius == 0) return contains(x, y);
        return tiles.stream().anyMatch(tile ->
                x + radius > tile.column() * GameMap.TILE_SIZE
                && x - radius < (tile.column() + 1) * GameMap.TILE_SIZE
                && y + radius > tile.row() * GameMap.TILE_SIZE
                && y - radius < (tile.row() + 1) * GameMap.TILE_SIZE);
    }
}

record SpawnPoint(String id, String name, double x, double y, String lane,
        String enemyBias, double speedMultiplier, String targetPriority,
        List<MapPoint> route) { }

record TrapSlotDefinition(String id, String lane, double x, double y, String requiredArea) { }

record ResourceNodeDefinition(String id, String type, double x, double y, String requiredArea) { }

record ShopUnit(String id, String item, String label, double x, double y, int cost,
        String detail) { }

record BreakerTerminal(String id, String label, double x, double y, String requiredArea) { }

record WorkbenchUnit(String id, double x, double y, String requiredArea) { }

record PrepConsole(String id, double x, double y, String requiredArea, int cost,
        int seconds) { }

record MapDefinition(int version, WorldSize world, MapPoint core, Stations stations,
        TileMapDefinition tileMap, List<UnlockArea> areas, List<SpawnPoint> spawnPoints,
        List<TrapSlotDefinition> trapSlots, List<ResourceNodeDefinition> resourceNodes,
        List<ShopUnit> shopUnits, List<WorkbenchUnit> workbenchUnits,
        PrepConsole prepConsole, List<BreakerTerminal> breakerTerminals,
        List<Station> medBayUnits, StartingArea startingArea, WorkbenchUnit missileComputer, WorkbenchUnit jobStation) { }

