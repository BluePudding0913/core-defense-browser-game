"use strict";

// The targeting view uses snapshots; facility access and shots stay authoritative on the server.
window.TerminalUI = (() => {
    let panel, canvas, title, cooldown, current;
    function create() {
        panel = document.createElement("section");
        panel.id = "missile-panel";
        panel.tabIndex = -1;
        panel.setAttribute("aria-label", "ミサイル管制");
        panel.innerHTML = '<header><strong>MISSILE SYSTEM</strong><small class="missile-cooldown" hidden></small></header><canvas id="missile-map" aria-label="着弾地点をクリック"></canvas>';
        document.body.append(panel);
        canvas = panel.querySelector("canvas");
        title = panel.querySelector("strong");
        cooldown = panel.querySelector(".missile-cooldown");
        canvas.addEventListener("pointerdown", event => {
            if (!current || event.button != null && event.button !== 0) return;
            const rect = canvas.getBoundingClientRect();
            const ratio = Math.min(rect.width / canvas.width, rect.height / canvas.height);
            const x = (event.clientX - rect.left - (rect.width - canvas.width * ratio) / 2) / ratio;
            const y = (event.clientY - rect.top - (rect.height - canvas.height * ratio) / 2) / ratio;
            if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
            const broken = (current.map.breakerTerminals || []).find(breaker =>
                (current.state.trippedBreakers || []).includes(breaker.id)
                && Math.abs(x - breaker.x) <= 24 && Math.abs(y - breaker.y) <= 26);
            if (broken) { current.send(`MAP_REPAIR:${broken.id}`); return; }
            if (current.me.breakerControl || current.me.missileCooldown > 0) return;
            current.send(`MISSILE:${x.toFixed(1)}:${y.toFixed(1)}`);
        });
        panel.addEventListener("keydown", event => {
            event.stopPropagation();
            if (event.key === "Escape" || event.key.toLowerCase() === "r") {
                event.preventDefault();
                if (current && !event.repeat) current.send("COMPUTER");
            }
        });
    }
    function update(state, me, options) {
        if (!me?.missileControl || !["wave", "preparing"].includes(state?.phase)) {
            if (panel) panel.hidden = true;
            current = null; return;
        }
        if (!panel) create();
        const opening = panel.hidden || !current;
        panel.hidden = false;
        current = { ...options, me, state };
        if (opening) panel.focus({ preventScroll: true });
        const map = options.map;
        if (canvas.width !== map.world.width) canvas.width = map.world.width;
        if (canvas.height !== map.world.height) canvas.height = map.world.height;
        const readOnly = Boolean(me.breakerControl);
        if (title) title.textContent = readOnly ? "MAP" : "MISSILE SYSTEM";
        if (cooldown) {
            cooldown.hidden = readOnly || !(me.missileCooldown > 0);
            cooldown.textContent = me.missileCooldown > 0 ? `${me.missileCooldown.toFixed(1)}s` : "";
        }
        panel.setAttribute("aria-label", readOnly ? "ブレーカーマップ" : "ミサイル管制");
        canvas.setAttribute?.("aria-label", readOnly ? "ブレーカーの位置" : "着弾地点をクリック");
        const ctx = canvas.getContext("2d"), tiles = map.tileMap;
        ctx.fillStyle = "#07170d"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        const locked = new Set(map.areas.filter(area => !state.areas[area.id]).flatMap(area => area.tiles.map(tile => `${tile.column},${tile.row}`)));
        for (let row = 0; row < tiles.rows.length; row++) for (let col = 0; col < tiles.rows[row].length; col++) {
            if (tiles.legend[tiles.rows[row][col]].solid) continue;
            ctx.fillStyle = locked.has(`${col},${row}`) ? "#14261a" : "#376347";
            ctx.fillRect(col * tiles.tileSize, row * tiles.tileSize, tiles.tileSize, tiles.tileSize);
        }
        const dot = (entity, color, radius) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(entity.x, entity.y, radius, 0, 2 * Math.PI); ctx.fill(); };
        ctx.fillStyle = "#79d8ff";
        ctx.fillRect(state.core.x - 20, state.core.y - 20, 40, 40);
        state.enemies.forEach(enemy => dot(enemy, "#ff716f", 12));
        state.players.forEach(player => { dot(player, player.down ? "#777" : "#8fffb2", 14); if (player.drone?.active) dot(player.drone, "#8cdde9", 10); });
        const tripped = new Set(state.trippedBreakers || []);
        for (const breaker of map.breakerTerminals || []) {
            const broken = tripped.has(breaker.id);
            ctx.fillStyle = "#969da3";
            ctx.fillRect(breaker.x - 12, breaker.y - 14, 24, 28);
            ctx.strokeStyle = broken ? "#ffb347" : "#cbd0d4"; ctx.lineWidth = broken ? 4 : 2;
            ctx.strokeRect(breaker.x - 12, breaker.y - 14, 24, 28);
            ctx.font = "bold 18px sans-serif"; ctx.textAlign = "center";
            if (broken) { ctx.fillStyle = "#ffb347"; ctx.fillText("RESET", breaker.x, breaker.y - 24); }
        }
        for (const strike of state.missiles || []) {
            ctx.strokeStyle = "#f6de83"; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(strike.x, strike.y, strike.radius, 0, Math.PI * 2); ctx.stroke();
        }
    }
    return { update };
})();
