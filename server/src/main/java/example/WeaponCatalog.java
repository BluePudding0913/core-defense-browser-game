package example;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Authoritative weapon definitions, also published to the browser through rules. */
final class WeaponCatalog {
    enum AttackMode { RAY, MELEE, SPREAD, RICOCHET, ROCKET, BEAM, FLAME, HOOK, GAS, PUSH }
    record WeaponStats(double range, double damage, double cooldown, double knockback, double width) { }
    record Definition(String id, int capacity, AttackMode mode, boolean piercing, WeaponStats stats, double goldMultiplier) {
        boolean gachaOnly() { return GachaRules.POOL.contains(id); }
        boolean usesAmmo() { return capacity > 0; }
        int pellets() { return mode == AttackMode.SPREAD ? GameConfig.SHOTGUN_PELLETS : 1; }
        int maxTargets() { return piercing || mode == AttackMode.BEAM ? -1 : mode == AttackMode.SPREAD ? GameConfig.SHOTGUN_MAX_TARGETS : 1; }
        double blastRadius() { return mode == AttackMode.ROCKET ? GameConfig.ROCKET_BLAST_RADIUS : mode == AttackMode.GAS ? PoisonGasRules.RADIUS : 0; }
        String ownedField() { return "owns" + Character.toUpperCase(id.charAt(0)) + id.substring(1); }
        String ammoField() { return id + "Ammo"; }
    }
    static final List<Definition> ALL = List.of(
            new Definition("bat", 0, AttackMode.MELEE, false, new WeaponStats(96, 20, 1, 115, 26), 1.5),
            new Definition("pistol", 0, AttackMode.RAY, false, new WeaponStats(200, 26, .38, 0, 2), 1),
            new Definition("shotgun", 50, AttackMode.SPREAD, false, new WeaponStats(220, 24, 1.25, 45, 2), 1.2),
            new Definition("smg", 240, AttackMode.RAY, false, new WeaponStats(270, 18, .14, 0, 2), 1),
            new Definition("rifle", 30, AttackMode.RAY, false, new WeaponStats(430, 120, 1.15, 0, 2), 1),
            new Definition("sniper", 15, AttackMode.RAY, true, new WeaponStats(2400, 280, 1.8, 0, 2), .85),
            new Definition("ricochet", 240, AttackMode.RICOCHET, false, new WeaponStats(600, 30, .30, 0, 2), .9),
            new Definition("revolver", 30, AttackMode.RAY, true, new WeaponStats(360, 320, 1.6, 10, 2), .95),
            new Definition("railgun", 2, AttackMode.BEAM, false, new WeaponStats(2400, 3000, 2, 0, 20), .55),
            new Definition("rocket", 8, AttackMode.ROCKET, false, new WeaponStats(1200, 3000, 5, 100, 2), .6),
            new Definition("flamethrower", 400, AttackMode.FLAME, true, new WeaponStats(220, 60, .1, 0, 32), .7),
            new Definition("lmg", 600, AttackMode.RAY, false, new WeaponStats(360, 18, .18, 0, 2), .9),
            new Definition("hook", 0, AttackMode.HOOK, false, new WeaponStats(HookSystem.RANGE, 0, .2, 0, 2), 0),
            new Definition("laserCannon", 30, AttackMode.RAY, true, new WeaponStats(1000, 650, 1.4, 0, 10), .65),
            new Definition("poisonGas", 12, AttackMode.GAS, true, new WeaponStats(600, 90, 2.5, 0, 0), .65),
            new Definition("repulsor", 0, AttackMode.PUSH, true, new WeaponStats(320, 0, .1, 18, 0), 0));
    private static final Map<String, Definition> BY_ID = ALL.stream()
            .collect(Collectors.toUnmodifiableMap(Definition::id, Function.identity()));
    static Definition find(String id) { return BY_ID.get(id); }
    static int capacity(String id) { var definition = find(id); return definition == null ? 0 : definition.capacity(); }
    static WeaponStats stats(String id) { var definition = find(id); return (definition == null ? find("pistol") : definition).stats(); }
    private WeaponCatalog() { }
}
