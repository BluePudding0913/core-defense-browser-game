package example;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Ownership and ammunition; cooldown and active attack state belong to Player. */
final class WeaponInventory {
    private final Set<String> owned = new HashSet<>();
    private final Map<String, Integer> ammunition = new HashMap<>();
    boolean owns(String id) {
        var definition = WeaponCatalog.find(id);
        return definition != null && (!definition.usesAmmo() || owned.contains(id));
    }
    void setOwned(String id, boolean value) {
        var definition = WeaponCatalog.find(id);
        if (definition == null || !definition.usesAmmo()) return;
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
    void grant(String id) { setOwned(id, true); setAmmo(id, WeaponCatalog.capacity(id)); }
    void clear() { owned.clear(); ammunition.clear(); }
}
