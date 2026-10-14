package example;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Random;

/** Optional deterministic workload; run after test-compile, never a timing assertion. */
public final class ShotGridBenchmark {
    private static volatile long sink;
    private static final int TICKS = 240, SHOTS = 12;
    private static final double[] RANGES = {200, 200, 220, 270, 270, 360, 360, 430, 600, 600, 1000, 2942};
    private static final List<MapPoint> FLOORS = floors();
    record Shot(double x, double y, double dx, double dy, WeaponCatalog.WeaponStats weapon) { }
    record Result(double ms, double candidates) { }

    public static void main(String[] args) {
        // Separate trials/medians reduce warm-up and GC noise. This measures candidate
        // lookup + old broad-phase + movement, excluding walls and detailed 3D tests.
        for (int i = 0; i < 20; i++) {
            run(0, 512, i % 2 == 0);
            run(80, 512, i % 2 == 0);
            run(160, 512, i % 2 == 0);
            run(320, 512, i % 2 == 0);
        }
        for (boolean clustered : new boolean[]{false, true}) {
            for (int count : new int[]{32, 128, 512, 2048}) {
                System.out.println((clustered ? "clustered" : "dispersed") + " enemies=" + count);
                for (int size : new int[]{0, 80, 120, 160, 240, 320}) {
                    for (int warmup = 0; warmup < 3; warmup++) run(size, count, clustered);
                    double[] times = new double[7]; Result result = null;
                    for (int trial = 0; trial < times.length; trial++) {
                        result = run(size, count, clustered); times[trial] = result.ms;
                    }
                    Arrays.sort(times);
                    System.out.printf("  cell=%3d median=%7.2fms candidates/shot=%7.1f%n", size, times[3], result.candidates);
                }
            }
        }
    }
    private static Result run(int size, int count, boolean clustered) {
        Random random = new Random(418);
        List<Enemy> enemies = size == 0 ? new ArrayList<>() : new EnemySpatialIndex(size);
        List<MapPoint> floors = FLOORS;
        for (int i = 0; i < count; i++) {
            MapPoint p = floors.get(random.nextInt(floors.size()));
            double x = clustered ? 800 + random.nextDouble() * 480 : p.x();
            double y = clustered ? 1780 + random.nextDouble() * 240 : p.y();
            enemies.add(EnemySpatialIndexTest.enemy(i, i % 12 == 0 ? "carrier" : i % 20 == 0 ? "finalBoss" : "grunt", x, y));
        }
        List<Shot> shots = new ArrayList<>();
        for (int i = 0; i < TICKS * SHOTS; i++) {
            MapPoint p = floors.get(random.nextInt(floors.size()));
            double x = clustered ? 800 + random.nextDouble() * 480 : p.x();
            double y = clustered ? 1780 + random.nextDouble() * 240 : p.y();
            double angle = random.nextDouble() * 2 * Math.PI;
            shots.add(new Shot(x, y, Math.cos(angle), Math.sin(angle), new WeaponCatalog.WeaponStats(RANGES[i % RANGES.length], 0, 0, 0, i % 12 == 0 ? 20 : 2)));
        }
        long candidates = 0, hits = 0, start = System.nanoTime();
        for (int tick = 0; tick < TICKS; tick++) {
            for (Enemy enemy : enemies) {
                // Oscillating movement crosses boundaries without drifting out of the layout.
                double step = tick % 40 < 20 ? 1.5 : -1.5;
                enemy.moveTo(enemy.x + step, enemy.y + step * .5);
            }
            for (int i = 0; i < SHOTS; i++) {
                Shot shot = shots.get(tick * SHOTS + i);
                List<Enemy> selected = enemies instanceof EnemySpatialIndex index && index.size() >= EnemySpatialIndex.MIN_INDEXED_ENEMIES
                        ? index.rayCandidates(shot.x, shot.y, shot.dx, shot.dy, shot.weapon.range(), shot.weapon.width()) : enemies;
                candidates += selected.size();
                for (Enemy enemy : selected)
                    if (CombatSystem.isInsideAttack(enemy, shot.x, shot.y, shot.dx, shot.dy, shot.weapon, shot.weapon.range())) hits++;
            }
        }
        double ms = (System.nanoTime() - start) / 1e6;
        sink = hits;
        return new Result(ms, candidates / (double) shots.size());
    }
    private static List<MapPoint> floors() {
        var areas = GameMap.AREAS.stream().map(UnlockArea::id).collect(java.util.stream.Collectors.toSet());
        List<MapPoint> floors = new ArrayList<>();
        for (int y = 20; y < GameMap.WORLD_H; y += 40)
            for (int x = 20; x < GameMap.WORLD_W; x += 40)
                if (GameMap.canOccupy(x, y, 3, areas)) floors.add(new MapPoint(x, y));
        return floors;
    }
}
