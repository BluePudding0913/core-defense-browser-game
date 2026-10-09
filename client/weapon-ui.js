/* Weapon presentation is driven by the authoritative snapshot rules. */
const WeaponUI = Object.freeze({
    name(id, definitions, player) {
        const level = player?.enchantments?.[id] || 0;
        return (definitions[id]?.name || id).toUpperCase() + (level > 0 ? ` +${level}` : "");
    },
    capacity(player, definition) {
        return (definition?.capacity ?? 0) * (player.ammoCapacityMultiplier ?? 1);
    },
    owns(player, definition) {
        return (definition.capacity === 0 && player[definition.owned] === undefined) || Boolean(player[definition.owned]);
    },
    entries(player, definitions) {
        return Object.entries(definitions).filter(([, definition]) => this.owns(player, definition))
            .map(([id]) => ({ key: `weapon:${id}`, kind: "weapon", value: id,
                label: this.name(id, definitions, player) }));
    },
    ammo(player, id, definitions) {
        const definition = definitions[id];
        return definition?.capacity > 0 ? String(player[definition.ammo] ?? 0) : "∞";
    },
    silverAmmoLabel(player, id, definitions) {
        return definitions[id]?.silverAmmoEligible && player.silverAmmo > 0
            ? `銀弾 ${player.silverAmmo}` : "";
    },
    cooldownLabel(cooldown, charge = 0, firing = 0) {
        if (charge > 0) return `CHARGE ${charge.toFixed(1)}s`;
        if (firing > 0) return `FIRE ${firing.toFixed(1)}s`;
        return cooldown > 0 ? `${Math.max(.1, cooldown).toFixed(1)}s` : "";
    },
    jobCooldowns(player) {
        if (player.down) return [];
        const timers = [];
        const add = (label, remaining) => {
            if (remaining > 0) timers.push({label, seconds: Math.max(.1, remaining).toFixed(1)});
        };
        const activeEffect = {
            tp: {label: "TP無敵", remaining: player.tpInvulnerableRemaining},
            healer: {label: "回復エリア", remaining: player.healRemaining},
            spy: {label: "偽装", remaining: player.spyRemaining}
        }[player.job];
        if (activeEffect?.remaining > 0) add(activeEffect.label, activeEffect.remaining);
        else add("ジョブ能力の再使用", player.jobCooldown);
        if (player.job === "spy") add("デコイ", player.decoyCooldown);
        add("TP移動", player.teleportCooldown);
        add("蘇生後の無敵", player.reviveInvulnerableRemaining);
        add("ミサイル", player.missileCooldown);
        return timers;
    },
    ownedAmmoWeapons(player, definitions) {
        return Object.values(definitions).filter(definition => definition.capacity > 0 && this.owns(player, definition));
    },
    ammoStock(player, definitions) {
        return Object.entries(definitions)
            .filter(([, definition]) => definition.capacity > 0 && this.owns(player, definition))
            .map(([id, definition]) => `${this.name(id, definitions, player)} ${player[definition.ammo] ?? 0} / ${this.capacity(player, definition)}`)
            .join("\n");
    },
    atLimit(player, definitions, limit) {
        return Object.entries(definitions).filter(([id, definition]) => id !== "bat" && this.owns(player, definition)).length >= limit;
    },
});
if (typeof module !== "undefined") module.exports = WeaponUI;
