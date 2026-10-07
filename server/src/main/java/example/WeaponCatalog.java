package example;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Authoritative weapon definitions, also published to the browser through rules. */
final class WeaponCatalog {
    enum AttackMode { RAY, MELEE, SPREAD, RICOCHET, ROCKET, BEAM }
    record WeaponStats(double range, double damage, double cooldown, double knockback, double width) { }
    record Definition(String id, int capacity, AttackMode mode, boolean piercing, WeaponStats stats) {
        boolean usesAmmo() { return capacity > 0; }
        int pellets() { return mode == AttackMode.SPREAD ? GameConfig.SHOTGUN_PELLETS : 1; }
        int maxTargets() { return piercing || mode == AttackMode.BEAM ? -1 : mode == AttackMode.SPREAD ? GameConfig.SHOTGUN_MAX_TARGETS : 1; }
        double blastRadius() { return mode == AttackMode.ROCKET ? GameConfig.ROCKET_BLAST_RADIUS : 0; }
        String ownedField() { return "owns" + Character.toUpperCase(id.charAt(0)) + id.substring(1); }
        String ammoField() { return id + "Ammo"; }
    }
    static final List<Definition> ALL = List.of(
            new Definition("bat", 0, AttackMode.MELEE, false, new WeaponStats(96, 20, 1, 115, 26)),
            new Definition("pistol", 0, AttackMode.RAY, false, new WeaponStats(5 * GameMap.TILE_SIZE, 26, .38, 0, 2)),
            new Definition("shotgun", 50, AttackMode.SPREAD, false, new WeaponStats(220, 24, 1.25, 45, 2)),
            new Definition("smg", 240, AttackMode.RAY, false, new WeaponStats(270, 18, .14, 0, 2)),
            new Definition("rifle", 30, AttackMode.RAY, false, new WeaponStats(430, 120, 1.15, 0, 2)),
            new Definition("sniper", 15, AttackMode.RAY, true, new WeaponStats(2400, 280, 1.8, 0, 2)),
            new Definition("ricochet", 240, AttackMode.RICOCHET, false, new WeaponStats(600, 30, .30, 0, 2)),
            new Definition("revolver", 30, AttackMode.RAY, true, new WeaponStats(360, 320, 1.6, 10, 2)),
            new Definition("railgun", 8, AttackMode.BEAM, false, new WeaponStats(2400, 3000, 2, 0, GameMap.TILE_SIZE / 2.0)),
            new Definition("rocket", 8, AttackMode.ROCKET, false, new WeaponStats(1200, 3000, 5, 100, 2)),
            new Definition("lmg", 600, AttackMode.RAY, false, new WeaponStats(360, 18, .18, 0, 2)));
    private static final Map<String, Definition> BY_ID = ALL.stream()
            .collect(Collectors.toUnmodifiableMap(Definition::id, Function.identity()));
    static Definition find(String id) { return BY_ID.get(id); }
    static int capacity(String id) { var definition = find(id); return definition == null ? 0 : definition.capacity(); }
    static WeaponStats stats(String id) { var definition = find(id); return (definition == null ? find("pistol") : definition).stats(); }
    private WeaponCatalog() { }
}
