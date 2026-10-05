package example;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/** Manual microbenchmark; does not start a server or measure concurrent room capacity. */
public final class PathfindingProbe {
    private static volatile int consumed;

    public static void main(String[] args) throws Exception {
        Locale.setDefault(Locale.ROOT);
        GameSession game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
        Method find = GameSession.class.getDeclaredMethod("findPath", double.class,
                double.class, double.class, double.class, double.class, boolean.class);
        find.setAccessible(true);
        System.out.println("Java=" + System.getProperty("java.version"));
        System.out.println("Grid=" + GameMap.WORLD_W / GameMap.TILE_SIZE + "x"
                + GameMap.WORLD_H / GameMap.TILE_SIZE);
        for (boolean unlocked : new boolean[] {false, true}) {
            game.unlockedAreas.clear();
            if (unlocked) GameMap.AREAS.forEach(area -> game.unlockedAreas.add(area.id()));
            MapPoint start = null;
            MapPoint end = null;
            outer: for (int row = 0; row < GameMap.WORLD_H / GameMap.TILE_SIZE; row++) {
                for (int col = 0; col < GameMap.WORLD_W / GameMap.TILE_SIZE - 1; col++) {
                    double x = (col + .5) * GameMap.TILE_SIZE;
                    double y = (row + .5) * GameMap.TILE_SIZE;
                    if (GameMap.canOccupy(x, y, 17, game.unlockedAreas)
                            && GameMap.canOccupy(x + GameMap.TILE_SIZE, y, 17, game.unlockedAreas)) {
                        start = new MapPoint(x, y);
                        end = new MapPoint(x + GameMap.TILE_SIZE, y);
                        break outer;
                    }
                }
            }
            if (start == null) throw new IllegalStateException("No adjacent floor tiles");
            MapPoint from = start, to = end;
            System.out.println("unlocked=" + unlocked + " from=" + from + " to=" + to);
            for (int batch : new int[] {1, 100}) {
                measure("adjacent-path batch=" + batch, () -> {
                    for (int i = 0; i < batch; i++) {
                        List<?> path = (List<?>) find.invoke(game, from.x(), from.y(),
                                to.x(), to.y(), 17.0, false);
                        consumed = path.size();
                    }
                });
            }
        }
        measure("snapshot lobby enemies=0", () -> consumed =
                SnapshotBuilder.build(game, "probe", 0, GameConfig.PLAYER_COUNT).length());
        System.out.println("Snapshot characters=" + consumed);
    }

    private static void measure(String label, CheckedAction action) throws Exception {
        for (int i = 0; i < 100; i++) action.run();
        long[] samples = new long[200];
        for (int i = 0; i < samples.length; i++) {
            long start = System.nanoTime();
            action.run();
            samples[i] = System.nanoTime() - start;
        }
        Arrays.sort(samples);
        System.out.printf("%s median=%.3fms p95=%.3fms max=%.3fms%n", label,
                samples[99] / 1e6, samples[189] / 1e6, samples[199] / 1e6);
    }

    @FunctionalInterface
    private interface CheckedAction { void run() throws Exception; }
}
