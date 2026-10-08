/* Weapon presentation is driven by the authoritative snapshot rules. */
const WeaponUI = Object.freeze({
    owns(player, definition) {
        return (definition.capacity === 0 && player[definition.owned] === undefined) || Boolean(player[definition.owned]);
    },
    entries(player, definitions) {
        return Object.entries(definitions).filter(([, definition]) => this.owns(player, definition))
            .map(([id, definition]) => ({ key: `weapon:${id}`, kind: "weapon", value: id,
                label: (definition.name || id).toUpperCase() }));
    },
    ammo(player, id, definitions) {
        const definition = definitions[id];
        return definition?.capacity > 0 ? String(player[definition.ammo] ?? 0) : "∞";
    },
    ownedAmmoWeapons(player, definitions) {
        return Object.values(definitions).filter(definition => definition.capacity > 0 && this.owns(player, definition));
    },
    atLimit(player, definitions, limit) {
        return Object.entries(definitions).filter(([id, definition]) => id !== "bat" && this.owns(player, definition)).length >= limit;
    },
});
if (typeof module !== "undefined") module.exports = WeaponUI;
