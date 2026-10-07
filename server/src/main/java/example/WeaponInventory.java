package example;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Ownership and ammunition; cooldown and active attack state belong to Player. */
final class WeaponInventory {
    static final int MAX_WEAPONS = 3;
    private final Set<String> owned = new HashSet<>(Set.of("pistol"));
    private final Map<String, Integer> ammunition = new HashMap<>();
    boolean owns(String id) {
        var definition = WeaponCatalog.find(id);
        return definition != null && (id.equals("bat") || owned.contains(id));
    }
    void setOwned(String id, boolean value) {
        var definition = WeaponCatalog.find(id);
        if (definition == null || id.equals("bat")) return;
        if (value) owned.add(id); else owned.remove(id);
    }
    int ammo(String id) { return ammunition.getOrDefault(id, 0); }
    void setAmmo(String id, int amount) {
        if (WeaponCatalog.capacity(id) > 0) ammunition.put(id, Math.max(0, Math.min(amount, WeaponCatalog.capacity(id))));
    }
    boolean consume(String id) {
        var definition = WeaponCatalog.find(id);
        if (definition == null) return false;
        if (!definition.usesAmmo()) return true;
        if (ammo(id) <= 0) return false;
        setAmmo(id, ammo(id) - 1);
        return true;
    }
    int weaponCount() {
        return (int) WeaponCatalog.ALL.stream()
                .filter(definition -> !definition.id().equals("bat") && owns(definition.id())).count();
    }
    boolean canAcquire(String id) {
        return WeaponCatalog.find(id) != null && (owns(id) || weaponCount() < MAX_WEAPONS);
    }
    boolean grant(String id) {
        if (!canAcquire(id)) return false;
        setOwned(id, true);
        setAmmo(id, WeaponCatalog.capacity(id));
        return true;
    }
    boolean canExchange(String incoming, String outgoing) {
        return WeaponCatalog.find(incoming) != null && !owns(incoming)
                && weaponCount() >= MAX_WEAPONS && outgoing != null && !"bat".equals(outgoing) && owns(outgoing);
    }
    boolean exchange(String incoming, String outgoing) {
        if (!canExchange(incoming, outgoing)) return false;
        owned.remove(outgoing);
        ammunition.remove(outgoing);
        return grant(incoming);
    }
    void clear() { owned.clear(); owned.add("pistol"); ammunition.clear(); }
}
