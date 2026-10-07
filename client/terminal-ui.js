"use strict";

// The targeting view uses snapshots; facility access and shots stay authoritative on the server.
window.TerminalUI = (() => {
    let panel, canvas, label, current;
    function create() {
        panel = document.createElement("section");
        panel.id = "missile-panel";
        panel.setAttribute("aria-label", "ミサイル管制");
        panel.innerHTML = '<header><strong>MISSILE · NIGHT VISION</strong><span></span><button type="button">RETURN</button></header><canvas id="missile-map" aria-label="着弾地点をクリック"></canvas>';
        document.body.append(panel);
        canvas = panel.querySelector("canvas"); label = panel.querySelector("span");
        panel.querySelector("button").onclick = () => current.send("COMPUTER");
        canvas.addEventListener("pointerdown", event => {
            if (!current || current.me.missileCooldown > 0) return;
            const rect = canvas.getBoundingClientRect();
            const ratio = Math.min(rect.width / canvas.width, rect.height / canvas.height);
            const x = (event.clientX - rect.left - (rect.width - canvas.width * ratio) / 2) / ratio;
            const y = (event.clientY - rect.top - (rect.height - canvas.height * ratio) / 2) / ratio;
            if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
            current.send(`MISSILE:${x.toFixed(1)}:${y.toFixed(1)}`);
        });
        panel.addEventListener("keydown", event => {
            event.stopPropagation();
            if (event.key === "Escape" || event.key.toLowerCase() === "r") { event.preventDefault(); current.send("COMPUTER"); }
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
        current = { ...options, me };
        if (opening) panel.querySelector("button").focus({ preventScroll: true });
        const map = options.map;
        if (canvas.width !== map.world.width) canvas.width = map.world.width;
        if (canvas.height !== map.world.height) canvas.height = map.world.height;
        label.textContent = me.missileCooldown > 0 ? `${me.missileCooldown.toFixed(1)}s` : "READY · CLICK TARGET";
        const ctx = canvas.getContext("2d"), tiles = map.tileMap;
        ctx.fillStyle = "#07170d"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        const locked = new Set(map.areas.filter(area => !state.areas[area.id]).flatMap(area => area.tiles.map(tile => `${tile.column},${tile.row}`)));
        for (let row = 0; row < tiles.rows.length; row++) for (let col = 0; col < tiles.rows[row].length; col++) {
            if (tiles.legend[tiles.rows[row][col]].solid) continue;
            ctx.fillStyle = locked.has(`${col},${row}`) ? "#14261a" : "#376347";
            ctx.fillRect(col * tiles.tileSize, row * tiles.tileSize, tiles.tileSize, tiles.tileSize);
        }
        const dot = (entity, color, radius) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(entity.x, entity.y, radius, 0, 2 * Math.PI); ctx.fill(); };
        dot(state.core, "#d4ffe2", 20);
        state.enemies.forEach(enemy => dot(enemy, "#ff716f", 12));
        state.players.forEach(player => { dot(player, player.down ? "#777" : "#8fffb2", 14); if (player.drone?.active) dot(player.drone, "#8cdde9", 10); });
        for (const strike of state.missiles || []) {
            ctx.strokeStyle = "#f6de83"; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(strike.x, strike.y, strike.radius, 0, Math.PI * 2); ctx.stroke();
        }
    }
    return { update };
})();
