package example;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Ownership and ammunition; cooldown and active attack state belong to Player. */
final class WeaponInventory {
    static final int MAX_WEAPONS = 3;
    private final Set<String> owned = new HashSet<>(Set.of("bat", "pistol"));
    private final Map<String, Integer> ammunition = new HashMap<>();
    private int silverAmmo;
    private final java.util.function.Supplier<String> job;
    WeaponInventory() { this(() -> JobRules.DEFAULT); }
    WeaponInventory(java.util.function.Supplier<String> job) { this.job = job; }
    int capacity(String id) { return WeaponCatalog.capacity(id) * JobRules.ammoCapacityMultiplier(job.get()); }
    void clampAmmoToCapacity() { ammunition.replaceAll((id, amount) -> Math.min(amount, capacity(id))); }
    int silverAmmo() { return silverAmmo; }
    boolean buySilverAmmo(int silver) {
        if (silver < SilverAmmoRules.COST || silverAmmo > Integer.MAX_VALUE - SilverAmmoRules.PACK_SIZE) return false;
        silverAmmo += SilverAmmoRules.PACK_SIZE;
        return true;
    }
    boolean addSilverAmmo(int amount) {
        if (amount <= 0 || silverAmmo > Integer.MAX_VALUE - amount) return false;
        silverAmmo += amount; return true;
    }
    void copyFrom(WeaponInventory source) {
        owned.clear(); owned.addAll(source.owned); ammunition.clear(); ammunition.putAll(source.ammunition); silverAmmo = source.silverAmmo;
    }
    boolean consumeSilverAmmo(String weapon) {
        if (silverAmmo <= 0 || !SilverAmmoRules.eligible(weapon)) return false;
        silverAmmo--;
        return true;
    }
    boolean owns(String id) {
        var definition = WeaponCatalog.find(id);
        return definition != null && owned.contains(id);
    }
    void setOwned(String id, boolean value) {
        var definition = WeaponCatalog.find(id);
        if (definition == null || id.equals("bat")) return;
        if (value) owned.add(id); else owned.remove(id);
    }
    int ammo(String id) { return ammunition.getOrDefault(id, 0); }
    void setAmmo(String id, int amount) {
        if (capacity(id) > 0) ammunition.put(id, Math.max(0, Math.min(amount, capacity(id))));
    }
    boolean consume(String id) {
        var definition = WeaponCatalog.find(id);
        if (definition == null || definition.meleeSlot() && !owns(id)) return false;
        if (!definition.usesAmmo()) return true;
        if (ammo(id) <= 0) return false;
        setAmmo(id, ammo(id) - 1);
        return true;
    }
    int weaponCount() {
        return (int) WeaponCatalog.ALL.stream()
                .filter(definition -> !definition.meleeSlot() && owns(definition.id())).count();
    }
    boolean canAcquire(String id) {
        return WeaponCatalog.find(id) != null && (WeaponCatalog.find(id).meleeSlot() || owns(id) || weaponCount() < MAX_WEAPONS);
    }
    boolean grant(String id) {
        if (!canAcquire(id)) return false;
        if (id.equals("plasmaBlade")) owned.remove("bat");
        setOwned(id, true);
        setAmmo(id, capacity(id));
        return true;
    }
    boolean canExchange(String incoming, String outgoing) {
        return WeaponCatalog.find(incoming) != null && !owns(incoming)
                && weaponCount() >= MAX_WEAPONS && outgoing != null && WeaponCatalog.find(outgoing) != null && !WeaponCatalog.find(outgoing).meleeSlot() && owns(outgoing);
    }
    boolean exchange(String incoming, String outgoing) {
        if (!canExchange(incoming, outgoing)) return false;
        owned.remove(outgoing);
        ammunition.remove(outgoing);
        return grant(incoming);
    }
    void clear() { owned.clear(); owned.addAll(Set.of("bat", "pistol")); ammunition.clear(); silverAmmo = 0; }
    void remove(String id) {
        if (id.equals("bat")) return;
        owned.remove(id);
        if (id.equals("plasmaBlade")) owned.add("bat");
        ammunition.remove(id);
    }
}
