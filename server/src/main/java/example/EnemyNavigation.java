package example;

import java.util.Arrays;
import java.util.List;
import java.util.Set;

/** Shared CORE distance field and bounded, local enemy steering. No session ownership. */
final class EnemyNavigation {
    private final int columns = GameMap.WORLD_W / GameMap.TILE_SIZE;
    private final int rows = GameMap.WORLD_H / GameMap.TILE_SIZE;
    private final int[] distances = new int[columns * rows];
    private final int[] queue = new int[distances.length];
    private final boolean[] passable = new boolean[distances.length];
    private final EnemyTravel travel = new EnemyTravel();
    private Set<String> areas;
    private double coreX = Double.NaN, coreY = Double.NaN;
    private int goalCell = -1;
    int generation;

    void prepare(double x, double y, Set<String> unlocked) {
        boolean mapChanged = !unlocked.equals(areas);
        int goal = cellAt(x, y);
        coreX = x;
        coreY = y;
        // A carried CORE can move each tick; the field depends only on its tile.
        if (!mapChanged && goal == goalCell) return;
        if (mapChanged) {
            areas = Set.copyOf(unlocked);
            for (int cell = 0; cell < passable.length; cell++) {
                passable[cell] = GameMap.canOccupy(centerX(cell), centerY(cell), 17, areas);
            }
        }
        goalCell = goal;
        generation++;
        Arrays.fill(distances, -1);
        if (goal < 0 || !passable[goal]) return;
        int head = 0, tail = 0;
        queue[tail++] = goal;
        distances[goal] = 0;
        while (head < tail) {
            int cell = queue[head++];
            for (int direction = 0; direction < 4; direction++) {
                int next = neighbor(cell, direction);
                if (next < 0 || !passable[next] || distances[next] >= 0) continue;
                distances[next] = distances[cell] + 1;
                queue[tail++] = next;
            }
        }
    }

    MapPoint coreTarget(Enemy enemy, double dt) {
        enemy.navigationTimer -= dt;
        if (enemy.navigationGeneration == generation && enemy.navigationTarget != null
                && enemy.navigationTimer > 0
                && GameSupport.distance(enemy.x, enemy.y, enemy.navigationTarget.x(), enemy.navigationTarget.y()) > 8) {
            return enemy.navigationTarget;
        }
        enemy.navigationGeneration = generation;
        enemy.navigationTimer = .45 + Math.floorMod(enemy.id, 7) * .04;
        double x = coreX, y = coreY;
        if (GameSupport.distance(enemy.x, enemy.y, x, y) > 520
                || !travel.canTravel(enemy.x, enemy.y, x, y, 17, areas)) {
            int cell = cellAt(enemy.x, enemy.y);
            if (cell < 0) return new MapPoint(enemy.x, enemy.y);
            x = centerX(cell);
            y = centerY(cell);
            // At most six local steps. Equal shortest routes differ across enemies/time.
            int choice = enemy.id + (int) Math.round(enemy.wanderX * 3 + enemy.wanderY);
            for (int step = 0; step < 6; step++) {
                int next = -1;
                for (int offset = 0; offset < 4; offset++) {
                    int candidate = neighbor(cell, Math.floorMod(choice + offset, 4));
                    if (candidate >= 0 && distances[candidate] >= 0
                            && distances[candidate] < distances[cell]) {
                        next = candidate;
                        break;
                    }
                }
                if (next < 0 || !travel.canTravel(enemy.x, enemy.y,
                        centerX(next), centerY(next), 17, areas)) break;
                cell = next;
                x = centerX(cell);
                y = centerY(cell);
            }
            // Small lateral variation only where the entire body can safely pass.
            double variedX = x + enemy.wanderX * .6, variedY = y + enemy.wanderY * .6;
            if (travel.canTravel(enemy.x, enemy.y, variedX, variedY, 17, areas)) {
                x = variedX;
                y = variedY;
            }
        } else if (GameSupport.distance(enemy.x, enemy.y, x, y) > 100) {
            double length = GameSupport.distance(enemy.x, enemy.y, x, y);
            double lateral = enemy.wanderX * .6;
            double variedX = x - (y - enemy.y) / length * lateral;
            double variedY = y + (x - enemy.x) / length * lateral;
            if (travel.canTravel(enemy.x, enemy.y, variedX, variedY, 17, areas)) {
                x = variedX;
                y = variedY;
            }
        }
        enemy.navigationTarget = new MapPoint(x, y);
        return enemy.navigationTarget;
    }

    Player visiblePlayer(Enemy enemy, List<Player> players, double dt) {
        enemy.perceptionTimer -= dt;
        if (enemy.perceptionTimer <= 0) {
            enemy.perceptionTimer = .3 + Math.floorMod(enemy.id, 5) * .05;
            double range = switch (enemy.targetPriority) {
                case "players" -> 440;
                case "defenses" -> 220;
                default -> 340;
            };
            Player target = null;
            double best = range;
            for (Player player : players) {
                if (player.down || JobRules.concealedFrom(player, enemy)) continue;
                double distance = GameSupport.distance(enemy.x, enemy.y, player.x, player.y);
                if (distance <= best && GameMap.hasClearLine(enemy.x, enemy.y, player.x, player.y)) {
                    best = distance;
                    target = player;
                }
            }
            enemy.visiblePlayer = target;
            if (target != null) {
                enemy.visiblePlayerX = target.x;
                enemy.visiblePlayerY = target.y;
                double length = GameSupport.distance(enemy.x, enemy.y, target.x, target.y);
                if (length > 60) {
                    double lateral = enemy.wanderX * .6;
                    double x = target.x - (target.y - enemy.y) / length * lateral;
                    double y = target.y + (target.x - enemy.x) / length * lateral;
                    if (areas != null && travel.canTravel(enemy.x, enemy.y, x, y, 17, areas)) {
                        enemy.visiblePlayerX = x;
                        enemy.visiblePlayerY = y;
                    }
                }
            }
        }
        Player target = enemy.visiblePlayer;
        return target != null && !target.down && !JobRules.concealedFrom(target, enemy)
                && players.contains(target) ? target : null;
    }

    private int cellAt(double x, double y) {
        int col = (int) Math.floor(x / GameMap.TILE_SIZE), row = (int) Math.floor(y / GameMap.TILE_SIZE);
        return col < 0 || row < 0 || col >= columns || row >= rows ? -1 : row * columns + col;
    }

    private int neighbor(int cell, int direction) {
        int col = cell % columns, row = cell / columns;
        return switch (direction) {
            case 0 -> row > 0 ? cell - columns : -1;
            case 1 -> col + 1 < columns ? cell + 1 : -1;
            case 2 -> row + 1 < rows ? cell + columns : -1;
            default -> col > 0 ? cell - 1 : -1;
        };
    }

    private double centerX(int cell) { return (cell % columns + .5) * GameMap.TILE_SIZE; }
    private double centerY(int cell) { return (cell / columns + .5) * GameMap.TILE_SIZE; }
}
