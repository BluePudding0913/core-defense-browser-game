package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.Test;

class EnemySpatialIndexTest {
    static Enemy enemy(int id, String type, double x, double y) {
        Enemy enemy = new Enemy(id, type, GameMap.SPAWN_POINTS.get(0), 1000, 0, 0, 0);
        enemy.moveTo(x, y);
        return enemy;
    }

    @Test void randomizedQueriesPreserveEveryOldBroadPhaseHitAndWorldOrder() {
        Random random = new Random(1234);
        String[] types = {"grunt", "tiny", "carrier", "finalBoss", "shield", "bomber"};
        for (int size : new int[]{80, 120, 160, 240, 320}) {
            EnemySpatialIndex index = new EnemySpatialIndex(size);
            for (int i = 0; i < 500; i++) {
                Enemy enemy = enemy(i, types[i % types.length], random.nextDouble() * 2080, random.nextDouble() * 2080);
                double angle = random.nextDouble() * Math.PI * 2;
                enemy.facingX = Math.cos(angle); enemy.facingY = Math.sin(angle);
                index.add(enemy);
            }
            for (int shot = 0; shot < 2000; shot++) {
                if (shot % 10 == 0) index.get(random.nextInt(index.size())).moveTo(random.nextDouble() * 2080, random.nextDouble() * 2080);
                double ox = random.nextDouble() * 2200 - 60, oy = random.nextDouble() * 2200 - 60;
                double angle = random.nextDouble() * Math.PI * 2;
                double dx = Math.cos(angle), dy = Math.sin(angle), range = random.nextDouble() * 3000;
                var weapon = new WeaponCatalog.WeaponStats(range, 0, 0, 0, random.nextDouble() * 32);
                List<Enemy> expected = index.stream().filter(e -> CombatSystem.isInsideAttack(e, ox, oy, dx, dy, weapon, range)).toList();
                List<Enemy> candidates = index.rayCandidates(ox, oy, dx, dy, range, weapon.width());
                List<Enemy> actual = candidates.stream().filter(e -> CombatSystem.isInsideAttack(e, ox, oy, dx, dy, weapon, range))
                        .sorted(java.util.Comparator.comparingInt(index::orderOf)).toList();
                assertEquals(expected, actual, "size=" + size + ", shot=" + shot + ", ray=" + List.of(ox, oy, dx, dy, range, weapon.width())
                        + ", missing=" + expected.stream().filter(e -> !actual.contains(e)).map(e -> e.type + ":" + e.x + ":" + e.y + ":" + e.facingX + ":" + e.facingY).toList());
                assertEquals(candidates.size(), candidates.stream().distinct().count(), "No duplicates at cell boundaries");
                if (shot % 4 == 0) {
                    var ray = new FpsHitRules.Ray(ox, oy, random.nextDouble() * 100, dx, dy, random.nextDouble() - .5, range);
                    for (Enemy enemy : index) {
                        var hit = FpsHitRules.enemy(ray, enemy.x, enemy.y, CombatSystem.enemyRadius(enemy), enemy.facingX, enemy.facingY, weapon.width());
                        if (hit != null) assertTrue(candidates.contains(enemy), "3D body including start-inside intersections");
                    }
                }
            }
        }
    }

    @Test void edgesZeroLengthWideShotsAndBagsNeverDisappear() {
        var index = new EnemySpatialIndex();
        index.add(enemy(1, "tiny", 160, 160));
        index.add(enemy(2, "finalBoss", 213, 160));
        var carrier = enemy(3, "carrier", 190, 165);
        carrier.facingX = 1; carrier.facingY = 0; index.add(carrier);
        double[][] shots = {{160, 0, 0, 1, 160, 0}, {0, 160, 1, 0, 160, 0},
                {160, 160, 1, 0, 0, 0}, {0, 128, 1, 0, 400, 32},
                {320, 320, -Math.sqrt(.5), -Math.sqrt(.5), 400, 2}, {164, 0, 0, 1, 2080, 2}};
        for (double[] s : shots) {
            var weapon = new WeaponCatalog.WeaponStats(s[4], 0, 0, 0, s[5]);
            assertEquals(index.stream().filter(e -> CombatSystem.isInsideAttack(e, s[0], s[1], s[2], s[3], weapon, s[4])).toList(),
                    index.rayCandidates(s[0], s[1], s[2], s[3], s[4], s[5]).stream()
                            .filter(e -> CombatSystem.isInsideAttack(e, s[0], s[1], s[2], s[3], weapon, s[4]))
                            .sorted(java.util.Comparator.comparingInt(index::orderOf)).toList());
        }
    }

    @Test void movementSpawnRemovalResetAndReplacementUpdateImmediately() {
        var index = new EnemySpatialIndex();
        Enemy a = enemy(1, "grunt", 50, 50), b = enemy(2, "grunt", 1000, 1000);
        index.add(a); index.add(b);
        assertEquals(List.of(a), index.rayCandidates(0, 50, 1, 0, 100, 2));
        a.moveTo(1000, 1000); b.moveTo(50, 50);
        assertEquals(List.of(b), index.rayCandidates(0, 50, 1, 0, 100, 2));
        index.removeIf(e -> e == b);
        assertTrue(index.rayCandidates(0, 50, 1, 0, 100, 2).isEmpty());
        b.moveTo(50, 50); index.add(0, b);
        a.moveTo(50, 50);
        assertEquals(List.of(b, a), index.rayCandidates(0, 50, 1, 0, 100, 2).stream().sorted(java.util.Comparator.comparingInt(index::orderOf)).toList());
        Enemy c = enemy(3, "grunt", 50, 50);
        index.set(0, c);
        b.moveTo(50, 50); // Removed enemies no longer affect the index.
        assertEquals(List.of(c, a), index.rayCandidates(0, 50, 1, 0, 100, 2).stream().sorted(java.util.Comparator.comparingInt(index::orderOf)).toList());
        index.clear(); a.moveTo(50, 50);
        assertTrue(index.rayCandidates(0, 50, 1, 0, 100, 2).isEmpty());
        index.add(a);
        assertEquals(List.of(a), index.rayCandidates(0, 50, 1, 0, 100, 2));
    }

    @Test void distantEnemiesAreExcludedBeforeExactHitTests() {
        var index = new EnemySpatialIndex();
        Enemy near = enemy(0, "grunt", 100, 100); index.add(near);
        for (int i = 1; i <= 1000; i++) index.add(enemy(i, "grunt", 1000 + i % 20, 1000));
        assertEquals(List.of(near), index.rayCandidates(0, 100, 1, 0, 200, 2));
    }

    @Test void legacyBagEntryNearOriginIsKeptEvenForWideAngledShots() {
        var index = new EnemySpatialIndex(80);
        Enemy carrier = enemy(1, "carrier", 1159.6612880284802, 504.3074925193024);
        carrier.facingX = -.910216223733802; carrier.facingY = .41413334332286905;
        index.add(carrier);
        double ox = 1237.9255147643703, oy = 481.4917440763886;
        double dx = .8338616124126327, dy = .5519735603673461, range = 406.21648501916195, width = 28.398525586623897;
        assertTrue(SpecialEnemyRules.hitsBag(carrier, ox, oy, dx, dy, range, width));
        assertTrue(index.rayCandidates(ox, oy, dx, dy, range, width).contains(carrier));
    }

    @Test void crossingSmallPopulationThresholdRebuildsFromCurrentPositions() {
        var index = new EnemySpatialIndex();
        for (int i = 0; i < 64; i++) index.add(enemy(i, "grunt", 1000, 1000));
        Enemy moving = index.get(0);
        moving.moveTo(50, 50); // No buckets needed below the production threshold.
        index.add(enemy(64, "grunt", 1000, 1000));
        assertEquals(List.of(moving), index.rayCandidates(0, 50, 1, 0, 100, 2));
        index.remove(64);
        moving.moveTo(1500, 1500);
        index.add(enemy(65, "grunt", 1000, 1000));
        assertTrue(index.rayCandidates(0, 50, 1, 0, 100, 2).isEmpty());
        assertTrue(index.rayCandidates(1400, 1500, 1, 0, 200, 2).contains(moving));
    }
}
