/* Weapon presentation is driven by the authoritative snapshot rules. */
const WeaponUI = Object.freeze({
    name(id, definitions) {
        return (definitions[id]?.name || id).toUpperCase();
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
    cooldownLabel(cooldown, charge = 0, firing = 0) {
        if (charge > 0) return `CHARGE ${charge.toFixed(1)}s`;
        if (firing > 0) return `FIRE ${firing.toFixed(1)}s`;
        return cooldown > 0 ? `${Math.max(.1, cooldown).toFixed(1)}s` : "";
    },
    jobCooldownLabel(player) {
        if (player.down) return "";
        const timers = [];
        const seconds = value => `${Math.max(.1, value).toFixed(1)}s`;
        if (player.tpInvulnerableRemaining > 0) timers.push(`INVINCIBLE ${seconds(player.tpInvulnerableRemaining)}`);
        const jobTimer = player.jobCooldown;
        if (jobTimer > 0) timers.push(seconds(jobTimer));
        if (player.job === "spy" && player.decoyCooldown > 0) timers.push(`DECOY ${seconds(player.decoyCooldown)}`);
        if (player.teleportCooldown > 0) timers.push(`TP ${seconds(player.teleportCooldown)}`);
        return timers.join(" · ");
    },
    ownedAmmoWeapons(player, definitions) {
        return Object.values(definitions).filter(definition => definition.capacity > 0 && this.owns(player, definition));
    },
    ammoStock(player, definitions) {
        return Object.entries(definitions)
            .filter(([, definition]) => definition.capacity > 0 && this.owns(player, definition))
            .map(([id, definition]) => `${this.name(id, definitions)} ${player[definition.ammo] ?? 0} / ${this.capacity(player, definition)}`)
            .join("\n");
    },
    atLimit(player, definitions, limit) {
        return Object.entries(definitions).filter(([id, definition]) => id !== "bat" && this.owns(player, definition)).length >= limit;
    },
});
if (typeof module !== "undefined") module.exports = WeaponUI;
