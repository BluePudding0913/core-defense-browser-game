package example;

import java.util.Set;

/** Exact swept square-body collision against room-local wall/locked-tile occupancy. */
final class EnemyTravel {
    private final int columns = GameMap.WORLD_W / GameMap.TILE_SIZE;
    private final int rows = GameMap.WORLD_H / GameMap.TILE_SIZE;
    private final boolean[] blocked = new boolean[columns * rows];
    private Set<String> areas;

    boolean canTravel(double fromX, double fromY, double toX, double toY, double radius, Set<String> unlocked) {
        if (!Double.isFinite(fromX) || !Double.isFinite(fromY) || !Double.isFinite(toX)
                || !Double.isFinite(toY) || !Double.isFinite(radius) || radius < 0) return false;
        double minX = Math.min(fromX, toX) - radius, maxX = Math.max(fromX, toX) + radius;
        double minY = Math.min(fromY, toY) - radius, maxY = Math.max(fromY, toY) + radius;
        if (minX < 0 || minY < 0 || maxX > GameMap.WORLD_W || maxY > GameMap.WORLD_H) return false;
        if (!unlocked.equals(areas)) {
            areas = Set.copyOf(unlocked);
            for (int row = 0; row < rows; row++) {
                for (int col = 0; col < columns; col++) {
                    blocked[row * columns + col] = !GameMap.canOccupy((col + .5) * GameMap.TILE_SIZE,
                            (row + .5) * GameMap.TILE_SIZE, 0, areas);
                }
            }
        }
        int size = GameMap.TILE_SIZE;
        for (int row = Math.max(0, (int) Math.floor(minY / size)); row <= Math.min(rows - 1, (int) Math.floor(maxY / size)); row++) {
            for (int col = Math.max(0, (int) Math.floor(minX / size)); col <= Math.min(columns - 1, (int) Math.floor(maxX / size)); col++) {
                if (blocked[row * columns + col] && crossesInterior(fromX, fromY, toX, toY,
                        col * size - radius, row * size - radius,
                        (col + 1) * size + radius, (row + 1) * size + radius)) return false;
            }
        }
        return true;
    }

    private static boolean crossesInterior(double x, double y, double toX, double toY,
            double left, double top, double right, double bottom) {
        double dx = toX - x, dy = toY - y;
        double enter = 0, exit = 1;
        if (dx == 0) {
            if (x <= left || x >= right) return false;
        } else {
            double a = (left - x) / dx, b = (right - x) / dx;
            enter = Math.max(enter, Math.min(a, b));
            exit = Math.min(exit, Math.max(a, b));
        }
        if (dy == 0) {
            if (y <= top || y >= bottom) return false;
        } else {
            double a = (top - y) / dy, b = (bottom - y) / dy;
            enter = Math.max(enter, Math.min(a, b));
            exit = Math.min(exit, Math.max(a, b));
        }
        // Merely touching an edge/corner is permitted, as in GameMap.canOccupy.
        return enter < exit && exit > 0 && enter < 1;
    }
}
