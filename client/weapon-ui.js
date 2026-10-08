/* Weapon presentation is driven by the authoritative snapshot rules. */
const WeaponUI = Object.freeze({
    name(id, definitions) {
        return (definitions[id]?.name || id).toUpperCase();
    },
    owns(player, definition) {
        return (definition.capacity === 0 && player[definition.owned] === undefined) || Boolean(player[definition.owned]);
    },
    entries(player, definitions) {
        return Object.entries(definitions).filter(([, definition]) => this.owns(player, definition))
            .map(([id]) => ({ key: `weapon:${id}`, kind: "weapon", value: id,
                label: this.name(id, definitions) }));
    },
    ammo(player, id, definitions) {
        const definition = definitions[id];
        return definition?.capacity > 0 ? String(player[definition.ammo] ?? 0) : "∞";
    },
    silverAmmoLabel(player, id, definitions) {
        return definitions[id]?.silverAmmoEligible && player.silverAmmo > 0
            ? `銀弾 ${player.silverAmmo}` : "";
    },
    ownedAmmoWeapons(player, definitions) {
        return Object.values(definitions).filter(definition => definition.capacity > 0 && this.owns(player, definition));
    },
    ammoStock(player, definitions) {
        return Object.entries(definitions)
            .filter(([, definition]) => definition.capacity > 0 && this.owns(player, definition))
            .map(([id, definition]) => `${this.name(id, definitions)} ${player[definition.ammo] ?? 0} / ${definition.capacity}`)
            .join("\n");
    },
    atLimit(player, definitions, limit) {
        return Object.entries(definitions).filter(([id, definition]) => id !== "bat" && this.owns(player, definition)).length >= limit;
    },
});
if (typeof module !== "undefined") module.exports = WeaponUI;
