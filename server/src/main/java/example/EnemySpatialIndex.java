package example;

import java.util.AbstractList;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.RandomAccess;
import java.util.function.Predicate;

/** Session-owned enemy list with conservative horizontal bounds for shot candidates. */
final class EnemySpatialIndex extends AbstractList<Enemy> implements RandomAccess {
    static final int CELL_SIZE = 80; // Two 40-unit map tiles; see docs/shot-grid.md.
    static final int MIN_INDEXED_ENEMIES = 65;
    private final int cellSize;
    private final List<Entry> entries = new ArrayList<>();
    private final Map<Long, Cell> cells = new HashMap<>();
    private long queryVersion;
    private boolean indexed;

    static final class Entry {
        final EnemySpatialIndex owner;
        final Enemy enemy;
        final double radius;
        final List<Membership> memberships = new ArrayList<>(4);
        int order, minX, maxX, minY, maxY;
        long queryVersion;
        Entry(EnemySpatialIndex owner, Enemy enemy, int order) {
            this.owner = owner; this.enemy = enemy; this.order = order;
            // Include the bag independent of facing/release state. Its old entry rule
            // is conservative near the origin, so its bound uses sqrt(2) * radius.
            this.radius = enemy.type.equals("carrier")
                    ? Math.max(CombatSystem.enemyRadius(enemy), SpecialEnemyRules.BAG_OFFSET + Math.sqrt(2) * SpecialEnemyRules.BAG_RADIUS)
                    : CombatSystem.enemyRadius(enemy);
        }
    }
    private static final class Cell {
        final long key;
        final List<Membership> members = new ArrayList<>();
        Cell(long key) { this.key = key; }
    }
    private static final class Membership {
        final Entry entry;
        final Cell cell;
        int slot;
        Membership(Entry entry, Cell cell, int slot) { this.entry = entry; this.cell = cell; this.slot = slot; }
    }

    EnemySpatialIndex() { this(CELL_SIZE); }
    EnemySpatialIndex(int cellSize) {
        if (cellSize <= 0) throw new IllegalArgumentException("cellSize");
        this.cellSize = cellSize;
    }
    @Override public int size() { return entries.size(); }
    @Override public Enemy get(int index) { return entries.get(index).enemy; }
    @Override public void add(int index, Enemy enemy) {
        if (index < 0 || index > size()) throw new IndexOutOfBoundsException(index);
        if (enemy.spatialEntry != null) throw new IllegalArgumentException("Enemy already registered");
        Entry entry = new Entry(this, enemy, index);
        entries.add(index, entry);
        for (int i = index + 1; i < size(); i++) entries.get(i).order = i;
        enemy.spatialEntry = entry;
        if (indexed) { bounds(entry); attach(entry); }
        else if (size() >= MIN_INDEXED_ENEMIES) ensureIndexed();
        modCount++;
    }
    @Override public Enemy remove(int index) {
        Entry entry = entries.remove(index);
        if (indexed) detach(entry);
        entry.enemy.spatialEntry = null;
        for (int i = index; i < size(); i++) entries.get(i).order = i;
        if (size() < MIN_INDEXED_ENEMIES) discardIndex();
        modCount++;
        return entry.enemy;
    }
    @Override public Enemy set(int index, Enemy enemy) {
        Enemy previous = get(index);
        if (previous == enemy) return previous;
        if (enemy.spatialEntry != null) throw new IllegalArgumentException("Enemy already registered");
        remove(index);
        add(index, enemy);
        return previous;
    }
    @Override public void clear() {
        for (Entry entry : entries) entry.enemy.spatialEntry = null;
        entries.clear(); cells.clear(); indexed = false; modCount++;
    }
    @Override public boolean removeIf(Predicate<? super Enemy> predicate) {
        // Compact once; AbstractList's default would shift the survivors for every death.
        List<Entry> removed = new ArrayList<>();
        for (Entry entry : entries) if (predicate.test(entry.enemy)) removed.add(entry);
        if (removed.isEmpty()) return false;
        for (Entry entry : removed) {
            if (indexed) detach(entry);
            entry.enemy.spatialEntry = null;
        }
        entries.removeIf(entry -> entry.enemy.spatialEntry == null);
        for (int i = 0; i < size(); i++) entries.get(i).order = i;
        if (size() < MIN_INDEXED_ENEMIES) discardIndex();
        modCount++;
        return true;
    }

    void moved(Entry entry) {
        if (!indexed) return;
        int minX = entry.minX, maxX = entry.maxX, minY = entry.minY, maxY = entry.maxY;
        bounds(entry);
        if (entry.minX == minX && entry.maxX == maxX && entry.minY == minY && entry.maxY == maxY) return;
        detach(entry);
        attach(entry);
    }

    /** Visits only rows/cells touched by the finite segment, expanded by weapon width. */
    List<Enemy> rayCandidates(double ox, double oy, double dx, double dy, double range, double width) {
        ensureIndexed();
        // The legacy bag rule clamps a behind-origin entry to zero after checking
        // projection/perpendicular separately. Keep that conservative corner too.
        width *= Math.sqrt(2);
        double endY = oy + dy * range;
        int firstRow = cell(Math.min(oy, endY) - width), lastRow = cell(Math.max(oy, endY) + width);
        long version = ++queryVersion;
        List<Enemy> found = new ArrayList<>();
        for (int row = firstRow; row <= lastRow; row++) {
            double from = 0, to = range;
            if (dy != 0) {
                double a = (row * (double) cellSize - width - oy) / dy;
                double b = ((row + 1.0) * cellSize + width - oy) / dy;
                from = Math.max(from, Math.min(a, b));
                to = Math.min(to, Math.max(a, b));
                if (from > to) continue;
            }
            double x1 = ox + dx * from, x2 = ox + dx * to;
            int firstColumn = cell(Math.min(x1, x2) - width), lastColumn = cell(Math.max(x1, x2) + width);
            for (int column = firstColumn; column <= lastColumn; column++) {
                Cell bucket = cells.get(key(column, row));
                if (bucket == null) continue;
                for (Membership membership : bucket.members) {
                    Entry entry = membership.entry;
                    if (entry.queryVersion != version) {
                        entry.queryVersion = version;
                        found.add(entry.enemy);
                    }
                }
            }
        }
        return found;
    }

    int orderOf(Enemy enemy) { return enemy.spatialEntry.order; }

    /** Conservative range candidates in world-list order, shared by defense rules. */
    List<Enemy> nearbyCandidates(double x, double y, double radius) {
        if (size() < MIN_INDEXED_ENEMIES) return this;
        ensureIndexed();
        long version = ++queryVersion;
        List<Enemy> found = new ArrayList<>();
        int minX = cell(x - radius), maxX = cell(x + radius);
        int minY = cell(y - radius), maxY = cell(y + radius);
        for (int row = minY; row <= maxY; row++) for (int column = minX; column <= maxX; column++) {
            Cell bucket = cells.get(key(column, row));
            if (bucket == null) continue;
            for (Membership membership : bucket.members) {
                Entry entry = membership.entry;
                if (entry.queryVersion != version) {
                    entry.queryVersion = version;
                    found.add(entry.enemy);
                }
            }
        }
        found.sort(java.util.Comparator.comparingInt(this::orderOf));
        return found;
    }

    private void ensureIndexed() {
        if (indexed) return;
        for (Entry entry : entries) { bounds(entry); attach(entry); }
        indexed = true;
    }
    private void discardIndex() {
        if (!indexed) return;
        cells.clear();
        for (Entry entry : entries) entry.memberships.clear();
        indexed = false;
    }

    private void bounds(Entry entry) {
        Enemy enemy = entry.enemy;
        double radius = entry.radius;
        entry.minX = cell(enemy.x - radius); entry.maxX = cell(enemy.x + radius);
        entry.minY = cell(enemy.y - radius); entry.maxY = cell(enemy.y + radius);
    }
    private int cell(double position) { return (int) Math.floor(position / cellSize); }
    private static long key(int x, int y) { return ((long) x << 32) ^ (y & 0xffffffffL); }
    private void attach(Entry entry) {
        for (int y = entry.minY; y <= entry.maxY; y++) {
            for (int x = entry.minX; x <= entry.maxX; x++) {
                Cell cell = cells.computeIfAbsent(key(x, y), Cell::new);
                Membership membership = new Membership(entry, cell, cell.members.size());
                cell.members.add(membership);
                entry.memberships.add(membership);
            }
        }
    }
    private void detach(Entry entry) {
        // Swap removal is constant-time even when thousands share a bucket.
        for (Membership membership : entry.memberships) {
            Cell cell = membership.cell;
            Membership last = cell.members.remove(cell.members.size() - 1);
            if (last != membership) {
                cell.members.set(membership.slot, last);
                last.slot = membership.slot;
            }
            if (cell.members.isEmpty()) cells.remove(cell.key);
        }
        entry.memberships.clear();
    }
}
