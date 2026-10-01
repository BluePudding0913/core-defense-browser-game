"use strict";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const menu = document.querySelector("#menu");
const menuStatus = document.querySelector("#menu-status");
const startButton = document.querySelector("#start");
const nameInput = document.querySelector("#player-name");
const hud = document.querySelector("#hud");
const coreValue = document.querySelector("#core-value");
const coreMeter = document.querySelector("#core-meter");
const shieldRow = document.querySelector("#shield-row");
const shieldValue = document.querySelector("#shield-value");
const roundElement = document.querySelector("#round");
const phaseElement = document.querySelector("#phase");
const phaseDetail = document.querySelector("#phase-detail");
const creditsElement = document.querySelector("#credits");
const teamElement = document.querySelector("#team");
const noticeElement = document.querySelector("#notice");
const feedbackElement = document.querySelector("#feedback");
const weaponButton = document.querySelector("#weapon");
const dashButton = document.querySelector("#dash");
const staminaValue = document.querySelector("#stamina-value");
const staminaMeter = document.querySelector("#stamina-meter");
const readyButton = document.querySelector("#ready");
const actionMenu = document.querySelector("#action-menu");
const actionTitle = document.querySelector("#action-title");
const actionOptions = document.querySelector("#action-options");
const actionClose = document.querySelector("#action-close");

const WORLD = { width: 1800, height: 1200 };
const VIEW = { width: 900, height: 500 };
const CORE = { x: 900, y: 600 };
const ARMORY = { id: "armory", x: 790, y: 660 };
const MED = { id: "med", x: 1010, y: 660 };
const WALLS = [
    { x: 60, y: 80, width: 180, height: 420, label: "COLD STORAGE" },
    { x: 360, y: 80, width: 420, height: 420, label: "SPECIMEN LAB" },
    { x: 1020, y: 80, width: 420, height: 420, label: "SECURITY WING" },
    { x: 1560, y: 80, width: 180, height: 420, label: "REACTOR" },
    { x: 60, y: 700, width: 180, height: 420, label: "WASTE" },
    { x: 360, y: 700, width: 420, height: 420, label: "QUARANTINE" },
    { x: 1020, y: 700, width: 420, height: 420, label: "FABRICATION" },
    { x: 1560, y: 700, width: 180, height: 420, label: "UTILITIES" },
];
const AREAS = [
    { id: "depot", name: "BIO LAB", x: 380, y: 320, width: 400, height: 180, terminalX: 740, terminalY: 535, color: "#74bf68", detail: "生体研究区画 / 防衛スロット×2" },
    { id: "relay", name: "SECURITY LAB", x: 1020, y: 320, width: 400, height: 180, terminalX: 1060, terminalY: 535, color: "#4aaec7", detail: "保安研究区画 / 防衛スロット×2" },
    { id: "workshop", name: "FABRICATION LAB", x: 1020, y: 700, width: 400, height: 180, terminalX: 1060, terminalY: 665, color: "#b778d0", detail: "製造研究区画 / 防衛スロット×2" },
];
const SPAWN_POINTS = [
    { id: "north-airlock", name: "NORTH AIRLOCK", x: 900, y: 28 },
    { id: "reactor-duct", name: "REACTOR DUCT", x: 1500, y: 28 },
    { id: "east-loading", name: "LOADING BAY", x: 1772, y: 600 },
    { id: "service-vent", name: "SERVICE VENT", x: 1500, y: 1172 },
    { id: "south-lock", name: "QUARANTINE", x: 900, y: 1172 },
    { id: "waste-tunnel", name: "WASTE TUNNEL", x: 300, y: 1172 },
    { id: "west-access", name: "WEST ACCESS", x: 28, y: 600 },
    { id: "specimen-vent", name: "SPECIMEN VENT", x: 300, y: 28 },
];
const BUILD_INFO = {
    turret: { name: "AUTO TURRET", cost: 250, description: "自動射撃" },
    wire: { name: "BARBED WIRE", cost: 120, description: "敵を減速" },
    mine: { name: "MINE", cost: 100, description: "使い捨て範囲攻撃" },
    barricade: { name: "BARRICADE", cost: 160, description: "進行を遮断" },
};

let socket;
let myPlayerId;
let state;
let scale = 1;
let camera = { x: CORE.x, y: CORE.y };
let lastNoticeVersion = -1;
let lastCoreHp;
let coreHitStarted = 0;
let noticeTimer;
let feedbackTimer;
let joystick = null;
let pendingMove = null;
let tapPointer = null;
let dashPointer = null;
let dashKey = false;
let hitEffects = [];
const keys = new Set();
const smoothed = new Map();

function connect() {
    const host = window.location.hostname || "localhost";
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(`${protocol}://${host}:8887`);
    socket.addEventListener("open", () => {
        menuStatus.textContent = "接続しました。防衛を開始できます。";
        startButton.disabled = false;
    });
    socket.addEventListener("message", ({ data }) => {
        let message;
        try { message = JSON.parse(data); } catch { return; }
        if (message.type === "welcome") myPlayerId = message.playerId;
        if (message.type === "state") receiveState(message);
        if (message.type === "effect" && message.effect === "hit") {
            hitEffects.push({ ...message, started: performance.now() });
            if (hitEffects.length > 100) hitEffects.shift();
        }
        if (message.type === "feedback" || message.type === "error") showFeedback(message.message);
    });
    socket.addEventListener("close", () => {
        menu.classList.remove("hidden");
        hud.classList.add("hidden");
        closeActionMenu();
        menuStatus.textContent = "サーバーから切断されました。再接続します…";
        startButton.disabled = true;
        setTimeout(connect, 2000);
    });
    socket.addEventListener("error", () => {
        menuStatus.textContent = "接続できません。Javaサーバーを起動してください。";
    });
}

function send(message) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(message);
}

function receiveState(next) {
    if (lastCoreHp !== undefined && next.core.hp < lastCoreHp) coreHitStarted = performance.now();
    lastCoreHp = next.core.hp;
    state = next;
    if (next.noticeVersion !== lastNoticeVersion) {
        lastNoticeVersion = next.noticeVersion;
        showNotice(next.notice);
    }
    updateHud();
    if (["preparing", "wave"].includes(next.phase)) {
        menu.classList.add("hidden");
        hud.classList.remove("hidden");
    } else if (["won", "lost"].includes(next.phase)) {
        closeActionMenu();
        menu.classList.remove("hidden");
        hud.classList.remove("hidden");
        menuStatus.textContent = next.phase === "won" ? "防衛成功：CORE SECURED" : `防衛失敗：${next.notice}`;
        startButton.textContent = "もう一度プレイ";
        startButton.disabled = false;
    }
    if (!["preparing", "wave"].includes(next.phase)) closeActionMenu();
}

startButton.addEventListener("click", () => {
    send(`HELLO:${nameInput.value || "Player"}`);
    send("START");
});

weaponButton.addEventListener("click", () => {
    const me = getMe();
    if (!me) return;
    const weapons = ["pistol", "bat"];
    if (me.ownsShotgun) weapons.push("shotgun");
    if (me.ownsRifle) weapons.push("rifle");
    const next = weapons[(weapons.indexOf(me.weapon) + 1) % weapons.length];
    send(`WEAPON:${next}`);
});
dashButton.addEventListener("pointerdown", event => {
    event.preventDefault();
    dashPointer = event.pointerId;
    dashButton.setPointerCapture(event.pointerId);
    setDash(true);
});
dashButton.addEventListener("pointerup", event => {
    if (dashPointer === event.pointerId) { dashPointer = null; setDash(false); }
});
dashButton.addEventListener("pointercancel", event => {
    if (dashPointer === event.pointerId) { dashPointer = null; setDash(false); }
});
readyButton.addEventListener("click", () => send("READY"));
actionClose.addEventListener("click", closeActionMenu);
actionMenu.addEventListener("pointerdown", event => {
    if (event.target === actionMenu) closeActionMenu();
});

function updateHud() {
    if (!state) return;
    const core = state.core;
    coreValue.textContent = `${Math.ceil(core.hp)} / ${Math.ceil(core.maxHp)}`;
    coreMeter.style.width = `${Math.max(0, core.hp / core.maxHp * 100)}%`;
    coreMeter.style.background = core.hp / core.maxHp < .3 ? "#f05252" : "#5ee08a";
    shieldRow.classList.toggle("hidden", core.maxShield <= 0);
    shieldValue.textContent = `${Math.ceil(core.shield)} / ${Math.ceil(core.maxShield)}`;
    roundElement.textContent = `ROUND ${state.round} / ${state.maxRounds}`;
    phaseElement.textContent = state.phase === "preparing" ? "PREPARING" : state.phase === "wave" ? "DEFENDING" : state.phase.toUpperCase();
    phaseDetail.textContent = state.phase === "preparing"
        ? `00:${String(Math.ceil(state.prepTime)).padStart(2, "0")}`
        : `${state.enemies.length + state.queued} HOSTILES`;
    creditsElement.textContent = `${state.credits} CR`;
    readyButton.classList.toggle("hidden", state.phase !== "preparing");
    teamElement.innerHTML = state.players.map(player => `
        <div class="teammate ${player.down ? "down" : ""}">
            ${escapeHtml(player.name)}${player.human ? "" : " [CPU]"} ${player.down ? "DOWN" : ""}
            <div class="hp-line"><span style="width:${player.hp}%"></span></div>
        </div>`).join("");
    const me = getMe();
    if (me) {
        const ammo = me.weapon === "shotgun" ? ` ${me.shotgunAmmo}` : me.weapon === "rifle" ? ` ${me.rifleAmmo}` : " ∞";
        weaponButton.textContent = `${me.weapon.toUpperCase()}${ammo}`;
        weaponButton.style.opacity = String(Math.max(.38, 1 - me.cooldown));
        staminaValue.textContent = String(Math.ceil(me.stamina));
        staminaMeter.style.width = `${me.stamina}%`;
        staminaMeter.style.background = me.stamina < 28 ? "#ef6b62" : "#59cce7";
        dashButton.disabled = me.down || (me.stamina < 1 && !me.dashing);
        dashButton.classList.toggle("active", me.dashing);
    }
}

function setDash(active) {
    send(`DASH:${active ? 1 : 0}`);
    dashButton.classList.toggle("active", active);
}

function showNotice(text) {
    noticeElement.textContent = text;
    noticeElement.classList.add("show");
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => noticeElement.classList.remove("show"), 2800);
}

function showFeedback(text) {
    feedbackElement.textContent = text;
    feedbackElement.classList.add("show");
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => feedbackElement.classList.remove("show"), 1000);
}

function getMe() { return state?.players.find(player => player.id === myPlayerId); }

function openActionMenu(title, options) {
    actionTitle.textContent = title;
    actionOptions.replaceChildren();
    for (const option of options) {
        const button = document.createElement("button");
        button.disabled = Boolean(option.disabled);
        button.innerHTML = `${escapeHtml(option.label)}${option.detail ? `<small>${escapeHtml(option.detail)}</small>` : ""}`;
        if (option.command) button.addEventListener("click", () => { send(option.command); closeActionMenu(); });
        actionOptions.append(button);
    }
    actionMenu.classList.remove("hidden");
}

function closeActionMenu() { actionMenu.classList.add("hidden"); }

function openSlotMenu(slot) {
    if (slot.locked) {
        openActionMenu("AREA LOCKED", [{ label: "入口の解放端末を操作してください", disabled: true }]);
    } else if (!slot.defense) {
        openActionMenu(`BUILD — ${slot.id.toUpperCase()}`, Object.entries(BUILD_INFO).map(([type, info]) => ({
            label: info.name,
            detail: `${info.cost} CR / ${info.description}`,
            command: `BUILD:${slot.id}:${type}`,
            disabled: state.credits < info.cost,
        })));
    } else {
        const missing = slot.defense.maxHp - slot.defense.hp;
        const cost = Math.max(25, Math.ceil(missing * .45));
        openActionMenu(`${slot.defense.type.toUpperCase()} — HP ${Math.ceil(slot.defense.hp)}/${Math.ceil(slot.defense.maxHp)}`, [{
            label: "REPAIR",
            detail: slot.defense.hp >= slot.defense.maxHp ? "耐久値最大" : `${cost} CR`,
            command: `REPAIR:${slot.id}`,
            disabled: slot.defense.hp >= slot.defense.maxHp || state.credits < cost,
        }]);
    }
}

function openCoreMenu() {
    const core = state.core;
    const hpCost = 300 + Math.round((core.maxHp - 1000) * .6);
    const shieldCost = 350 + Math.round(core.maxShield * .8);
    const defenseCost = 450 + core.defense * 250;
    const regenCost = 500 + core.regen * 300;
    openActionMenu("CORE UPGRADES", [
        option("MAX HP +250", hpCost, "UPGRADE:hp"),
        option("SHIELD +180", shieldCost, "UPGRADE:shield"),
        option(`DEFENSE Lv.${core.defense + 1}`, defenseCost, "UPGRADE:defense", core.defense >= 4),
        option(`AUTO REPAIR Lv.${core.regen + 1}`, regenCost, "UPGRADE:regen", core.regen >= 4),
    ]);
}

function openArmoryMenu() {
    const me = getMe();
    openActionMenu("ARMORY", [
        option("SHOTGUN", 450, "BUY:shotgun", me.ownsShotgun, me.ownsShotgun ? "購入済み" : "範囲攻撃 / 30発"),
        option("RIFLE", 650, "BUY:rifle", me.ownsRifle, me.ownsRifle ? "購入済み" : "長射程 / 24発"),
        option("AMMO PACK", 100, "BUY:ammo", !me.ownsShotgun && !me.ownsRifle, "SG +16 / RF +12"),
    ]);
}

function openMedMenu() {
    const me = getMe();
    openActionMenu("MED BAY", [option("FULL HEAL", 80, "BUY:heal", me.hp >= 100, me.hp >= 100 ? "HP最大" : `HP ${Math.ceil(me.hp)} → 100`)]);
}

function openUnlockMenu(area) {
    const openCount = Object.values(state.areas).filter(Boolean).length;
    const cost = 350 + openCount * 100;
    const unlocked = state.areas[area.id];
    openActionMenu(area.name, [option("OPEN AREA", cost, `UNLOCK:${area.id}`, unlocked, unlocked ? "解放済み" : area.detail)]);
}

function option(label, cost, command, extraDisabled = false, customDetail = "") {
    return { label, detail: customDetail || `${cost} CR`, command, disabled: extraDisabled || state.credits < cost };
}

function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
}
window.addEventListener("resize", resize);
resize();

function worldFromScreen(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * canvas.width / rect.width;
    const py = (clientY - rect.top) * canvas.height / rect.height;
    return { x: camera.x + (px - canvas.width / 2) / scale, y: camera.y + (py - canvas.height / 2) / scale };
}

canvas.addEventListener("pointerdown", event => {
    canvas.setPointerCapture(event.pointerId);
    const inMovementArea = event.clientX < innerWidth * .42 && event.clientY > innerHeight * .42;
    const overTarget = isTappablePoint(worldFromScreen(event.clientX, event.clientY));
    if (inMovementArea && !overTarget) {
        const pointer = { id: event.pointerId, originX: event.clientX, originY: event.clientY, x: event.clientX, y: event.clientY, timer: null };
        pointer.timer = setTimeout(() => activateJoystick(pointer.id), 170);
        pendingMove = pointer;
    } else {
        tapPointer = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
    }
});

canvas.addEventListener("pointermove", event => {
    if (pendingMove?.id === event.pointerId) { pendingMove.x = event.clientX; pendingMove.y = event.clientY; }
    if (joystick?.id === event.pointerId) updateJoystick(event.clientX, event.clientY);
});

canvas.addEventListener("pointerup", event => {
    if (joystick?.id === event.pointerId) {
        joystick = null; sendMovement();
    } else if (pendingMove?.id === event.pointerId) {
        clearTimeout(pendingMove.timer); pendingMove = null; handleWorldTap(event.clientX, event.clientY, false);
    } else if (tapPointer?.id === event.pointerId) {
        const moved = Math.hypot(event.clientX - tapPointer.x, event.clientY - tapPointer.y);
        const held = performance.now() - tapPointer.time;
        if (moved < 18) handleWorldTap(event.clientX, event.clientY, held >= 450);
        tapPointer = null;
    }
});

canvas.addEventListener("pointercancel", event => {
    if (joystick?.id === event.pointerId) { joystick = null; sendMovement(); }
    if (pendingMove?.id === event.pointerId) { clearTimeout(pendingMove.timer); pendingMove = null; }
    if (tapPointer?.id === event.pointerId) tapPointer = null;
});

function activateJoystick(pointerId) {
    if (pendingMove?.id !== pointerId) return;
    const pointer = pendingMove;
    pendingMove = null;
    joystick = { id: pointer.id, originX: pointer.originX, originY: pointer.originY, x: pointer.x, y: pointer.y };
    updateJoystick(pointer.x, pointer.y);
}

function updateJoystick(clientX, clientY) {
    if (!joystick) return;
    const dx = clientX - joystick.originX;
    const dy = clientY - joystick.originY;
    const length = Math.hypot(dx, dy);
    const ratio = length > 58 ? 58 / length : 1;
    joystick.x = joystick.originX + dx * ratio;
    joystick.y = joystick.originY + dy * ratio;
    sendMovement();
}

let lastMove = "";
function sendMovement() {
    let x = 0, y = 0;
    if (joystick) { x = (joystick.x - joystick.originX) / 58; y = (joystick.y - joystick.originY) / 58; }
    if (keys.has("w") || keys.has("arrowup")) y -= 1;
    if (keys.has("s") || keys.has("arrowdown")) y += 1;
    if (keys.has("a") || keys.has("arrowleft")) x -= 1;
    if (keys.has("d") || keys.has("arrowright")) x += 1;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    const message = `MOVE:${x.toFixed(2)}:${y.toFixed(2)}`;
    if (message !== lastMove) { lastMove = message; send(message); }
}

window.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();
    if (key === "shift") {
        event.preventDefault();
        if (!dashKey) { dashKey = true; setDash(true); }
        return;
    }
    if (!["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) return;
    event.preventDefault(); keys.add(key); sendMovement();
});
window.addEventListener("keyup", event => {
    const key = event.key.toLowerCase();
    if (key === "shift") { dashKey = false; setDash(false); return; }
    keys.delete(key); sendMovement();
});
window.addEventListener("blur", () => {
    keys.clear(); joystick = null;
    dashKey = false; dashPointer = null; setDash(false);
    if (pendingMove) clearTimeout(pendingMove.timer);
    pendingMove = null; sendMovement();
});

function isTappablePoint(point) {
    if (!state) return false;
    if (state.enemies.some(enemy => enemy.hp > 0 && distance(point, enemy) < enemyRadius(enemy) + 18)) return true;
    if (state.players.some(player => player.down && player.id !== myPlayerId && distance(point, player) < 50)) return true;
    if (state.slots.some(slot => distance(point, slot) < 38)) return true;
    if (distance(point, CORE) < 72 || distance(point, ARMORY) < 48 || distance(point, MED) < 48) return true;
    return AREAS.some(area => distance(point, { x: area.terminalX, y: area.terminalY }) < 38);
}

function handleWorldTap(clientX, clientY, longPress) {
    if (!state || !getMe()) return;
    const point = worldFromScreen(clientX, clientY);
    const downed = nearestAt(state.players.filter(player => player.down && player.id !== myPlayerId), point);
    if (longPress && downed && distance(point, downed) < 50) { send(`INTERACT:${downed.id}`); return; }
    const enemy = nearestAt(state.enemies.filter(item => item.hp > 0), point);
    if (enemy && distance(point, enemy) < enemyRadius(enemy) + 18) { send(`ATTACK:${enemy.id}`); return; }
    if (downed && distance(point, downed) < 42) { send(`INTERACT:${downed.id}`); return; }
    const slot = nearestAt(state.slots, point);
    if (slot && distance(point, slot) < 40) { openSlotMenu(slot); return; }
    if (distance(point, ARMORY) < 50) { openArmoryMenu(); return; }
    if (distance(point, MED) < 50) { openMedMenu(); return; }
    const area = AREAS.slice().sort((a, b) => distance(point, { x: a.terminalX, y: a.terminalY }) - distance(point, { x: b.terminalX, y: b.terminalY }))[0];
    if (area && distance(point, { x: area.terminalX, y: area.terminalY }) < 40) { openUnlockMenu(area); return; }
    if (distance(point, CORE) < 76) openCoreMenu();
}

function nearestAt(items, point) {
    return items.slice().sort((a, b) => distance(point, a) - distance(point, b))[0];
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function animate() { requestAnimationFrame(animate); draw(); }

function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const me = getMe();
    if (me) {
        camera.x += (me.x - camera.x) * .12;
        camera.y += (me.y - camera.y) * .12;
        const halfW = canvas.width / scale / 2, halfH = canvas.height / scale / 2;
        camera.x = clamp(camera.x, halfW, WORLD.width - halfW);
        camera.y = clamp(camera.y, halfH, WORLD.height - halfH);
    }
    ctx.setTransform(scale, 0, 0, scale, canvas.width / 2 - camera.x * scale, canvas.height / 2 - camera.y * scale);
    drawWorld();
    if (state) {
        drawAreas();
        drawCore();
        drawShops();
        drawTrapSlots();
        drawEnemies();
        drawPlayers();
        drawHitEffects();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawJoystick();
}

function drawWorld() {
    ctx.fillStyle = "#0b1318"; ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.fillStyle = "#26373e";
    ctx.fillRect(780, 0, 240, WORLD.height);
    ctx.fillRect(0, 500, WORLD.width, 200);
    ctx.fillRect(240, 0, 120, WORLD.height);
    ctx.fillRect(1440, 0, 120, WORLD.height);

    ctx.strokeStyle = "#3e555e"; ctx.lineWidth = 2; ctx.setLineDash([18, 22]);
    for (const x of [300, 900, 1500]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.height); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(0, 600); ctx.lineTo(WORLD.width, 600); ctx.stroke();
    ctx.setLineDash([]);
    WALLS.forEach((wall, index) => drawBlock(wall, index));
    drawFacilityDetails();
    SPAWN_POINTS.forEach(drawSpawn);
    ctx.strokeStyle = "#465760"; ctx.lineWidth = 4; ctx.strokeRect(1, 1, WORLD.width - 2, WORLD.height - 2);
}

function drawFacilityDetails() {
    ctx.save();
    ctx.fillStyle = "#40535a";
    for (const x of [110, 430, 1190, 1630]) {
        ctx.fillRect(x, 535, 82, 9);
        ctx.fillRect(x + 28, 656, 82, 9);
    }
    for (const x of [300, 900, 1500]) {
        for (const y of [155, 355, 805, 1005]) {
            ctx.fillRect(x - 45, y, 90, 8);
        }
    }

    ctx.fillStyle = "#b89638";
    for (const [x, y, vertical] of [[300, 492, false], [900, 492, false], [1500, 492, false], [300, 700, false], [900, 700, false], [1500, 700, false]]) {
        for (let i = -42; i <= 42; i += 14) {
            if (vertical) ctx.fillRect(x, y + i, 6, 9);
            else ctx.fillRect(x + i, y, 8, 6);
        }
    }

    ctx.fillStyle = "#17242a"; ctx.strokeStyle = "#50666f"; ctx.lineWidth = 2;
    for (const [x, y] of [[690, 535], [1110, 655], [380, 655], [1420, 545]]) {
        ctx.fillRect(x - 20, y - 14, 40, 28); ctx.strokeRect(x - 20, y - 14, 40, 28);
    }
    ctx.restore();
}

function drawBlock(wall, index) {
    ctx.fillStyle = index % 2 ? "#101a20" : "#121e24";
    ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
    ctx.strokeStyle = "#40535c"; ctx.lineWidth = 6; ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
    ctx.fillStyle = "#203038";
    for (let y = wall.y + 55; y < wall.y + wall.height - 18; y += 62) {
        for (let x = wall.x + 24; x < wall.x + wall.width - 18; x += 68) ctx.fillRect(x, y, 38, 18);
    }
    ctx.fillStyle = "#78909a"; ctx.font = "800 10px ui-monospace, monospace"; ctx.textAlign = "center";
    ctx.fillText(wall.label, wall.x + wall.width / 2, wall.y + 25);
}

function drawSpawn(spawn) {
    const incoming = Boolean(state && state.phase === "wave" && state.activeSpawns.includes(spawn.id));
    const pulse = (Math.sin(performance.now() / 130) + 1) / 2;
    ctx.save();
    if (incoming) { ctx.shadowColor = "#ff4f58"; ctx.shadowBlur = 14 + pulse * 15; }
    ctx.fillStyle = incoming ? "#e23f49" : "#3a464b"; ctx.beginPath(); ctx.arc(spawn.x, spawn.y, incoming ? 25 + pulse * 3 : 17, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = incoming ? "#ffc0b8" : "#8c686b"; ctx.lineWidth = incoming ? 4 : 2; ctx.stroke();
    ctx.restore();
    ctx.fillStyle = incoming ? "#ffd1c9" : "#75858b"; ctx.font = "900 10px ui-monospace, monospace"; ctx.textAlign = "center";
    const labelY = spawn.y < 60 ? spawn.y + 43 : spawn.y > 1140 ? spawn.y - 34 : spawn.y - 31;
    ctx.fillText(incoming ? `BREACH: ${spawn.name}` : spawn.name, spawn.x, labelY);
}

function drawAreas() {
    for (const area of AREAS) {
        const unlocked = state.areas[area.id];
        ctx.save();
        ctx.fillStyle = unlocked ? "#22363d" : "#11191e";
        ctx.fillRect(area.x, area.y, area.width, area.height);
        ctx.strokeStyle = unlocked ? area.color : "#5f4b50";
        ctx.lineWidth = unlocked ? 5 : 3;
        ctx.strokeRect(area.x + 2, area.y + 2, area.width - 4, area.height - 4);

        if (unlocked) {
            ctx.globalAlpha = .32; ctx.strokeStyle = area.color; ctx.lineWidth = 1;
            for (let x = area.x + 25; x < area.x + area.width; x += 42) {
                ctx.beginPath(); ctx.moveTo(x, area.y + 12); ctx.lineTo(x, area.y + area.height - 12); ctx.stroke();
            }
            for (let y = area.y + 25; y < area.y + area.height; y += 42) {
                ctx.beginPath(); ctx.moveTo(area.x + 12, y); ctx.lineTo(area.x + area.width - 12, y); ctx.stroke();
            }
            ctx.globalAlpha = 1;
        } else {
            ctx.strokeStyle = "#4c353b"; ctx.lineWidth = 7;
            for (let x = area.x + 25; x < area.x + area.width; x += 48) {
                ctx.beginPath(); ctx.moveTo(x, area.y + 10); ctx.lineTo(x + 75, area.y + area.height - 10); ctx.stroke();
            }
        }

        ctx.fillStyle = unlocked ? "#dff9ff" : "#b4777d";
        ctx.font = "900 13px ui-monospace, monospace"; ctx.textAlign = "center";
        ctx.fillText(area.name, area.x + area.width / 2, area.y + 27);
        ctx.font = "800 10px ui-monospace, monospace";
        ctx.fillText(unlocked ? "AREA ONLINE" : "SEALED AREA", area.x + area.width / 2, area.y + 45);

        ctx.fillStyle = unlocked ? "#48c77a" : area.color;
        ctx.fillRect(area.terminalX - 15, area.terminalY - 15, 30, 30);
        ctx.strokeStyle = unlocked ? "#8af0ad" : "#ffe09a"; ctx.lineWidth = 2;
        ctx.strokeRect(area.terminalX - 18, area.terminalY - 18, 36, 36);
        ctx.fillStyle = "white"; ctx.font = "800 9px ui-monospace, monospace";
        ctx.fillText(unlocked ? "OPEN" : "UNLOCK", area.terminalX, area.terminalY - 24);
        ctx.restore();
    }
}

function drawCore() {
    const pulse = (Math.sin(performance.now() / 180) + 1) / 2;
    ctx.save();
    ctx.shadowColor = "#58d9ff"; ctx.shadowBlur = 18 + pulse * 10;
    ctx.fillStyle = "#153f50"; ctx.beginPath(); ctx.arc(CORE.x, CORE.y, 60, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#68dcff"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(CORE.x, CORE.y, 49, 0, Math.PI * 2); ctx.stroke();
    if (state.core.shield > 0) {
        ctx.strokeStyle = "#67aef7"; ctx.globalAlpha = .45 + pulse * .25; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.arc(CORE.x, CORE.y, 70 + pulse * 4, 0, Math.PI * 2); ctx.stroke();
    }
    const hitAge = performance.now() - coreHitStarted;
    if (hitAge < 350) {
        ctx.strokeStyle = "#ff4e58"; ctx.globalAlpha = 1 - hitAge / 350; ctx.lineWidth = 9;
        ctx.beginPath(); ctx.arc(CORE.x, CORE.y, 72 + hitAge / 12, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = "white"; ctx.font = "900 14px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText("CORE", CORE.x, CORE.y + 5);
    drawBar(CORE.x - 65, CORE.y + 79, 130, 8, state.core.hp / state.core.maxHp, "#58df88");
}

function drawShops() {
    drawStation(ARMORY, "ARMORY", "#e8b84d");
    drawStation(MED, "MED BAY", "#ed6680");
}

function drawStation(station, label, color) {
    ctx.fillStyle = color; ctx.fillRect(station.x - 24, station.y - 24, 48, 48);
    ctx.fillStyle = "#111a1f"; ctx.fillRect(station.x - 14, station.y - 14, 28, 28);
    ctx.fillStyle = "white"; ctx.font = "800 11px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(label, station.x, station.y + 40);
}

function drawTrapSlots() {
    for (const slot of state.slots) {
        if (slot.locked) {
            ctx.strokeStyle = "#73585c"; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
            ctx.strokeRect(slot.x - 25, slot.y - 25, 50, 50); ctx.setLineDash([]);
            ctx.fillStyle = "#9d6c72"; ctx.font = "800 9px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText("LOCKED", slot.x, slot.y + 4);
        } else if (!slot.defense) {
            ctx.strokeStyle = "#74868f"; ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
            ctx.beginPath(); ctx.arc(slot.x, slot.y, 25, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = "#9eacb2"; ctx.font = "800 9px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText("BUILD", slot.x, slot.y + 3);
        } else {
            drawDefense(slot);
        }
    }
}

function drawDefense(slot) {
    const defense = slot.defense;
    if (defense.type === "turret") {
        ctx.fillStyle = "#6ab9d5"; ctx.fillRect(slot.x - 18, slot.y - 18, 36, 36);
        ctx.strokeStyle = "#bcecff"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(slot.x, slot.y); ctx.lineTo(slot.x, slot.y - 29); ctx.stroke();
    } else if (defense.type === "wire") {
        ctx.strokeStyle = "#b5c2c7"; ctx.lineWidth = 3; ctx.beginPath();
        for (let i = -24; i <= 24; i += 8) { ctx.moveTo(slot.x + i, slot.y - 20); ctx.lineTo(slot.x + i + 10, slot.y + 20); }
        ctx.stroke();
    } else if (defense.type === "mine") {
        ctx.fillStyle = "#d45746"; ctx.beginPath(); ctx.arc(slot.x, slot.y, 17, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffd060"; ctx.beginPath(); ctx.arc(slot.x, slot.y, 5, 0, Math.PI * 2); ctx.fill();
    } else {
        ctx.fillStyle = "#a87443"; ctx.fillRect(slot.x - 30, slot.y - 12, 60, 24);
        ctx.strokeStyle = "#e2af74"; ctx.lineWidth = 3; ctx.strokeRect(slot.x - 30, slot.y - 12, 60, 24);
    }
    if (defense.type !== "mine") drawBar(slot.x - 25, slot.y + 29, 50, 4, defense.hp / defense.maxHp, "#67d88c");
}

function smoothEntity(prefix, entity) {
    const key = `${prefix}-${entity.id}`;
    const point = smoothed.get(key) || { x: entity.x, y: entity.y };
    point.x += (entity.x - point.x) * .32; point.y += (entity.y - point.y) * .32;
    smoothed.set(key, point); return point;
}

function enemyRadius(enemy) {
    return enemy.type === "boss" ? 42 : enemy.type === "brute" ? 28 : enemy.type === "runner" ? 16 : 21;
}

function drawEnemies() {
    const colors = { grunt: "#b9474e", runner: "#e9823d", brute: "#8d579e", boss: "#d62f57" };
    for (const enemy of state.enemies) {
        if (enemy.hp <= 0) continue;
        const p = smoothEntity("enemy", enemy), radius = enemyRadius(enemy);
        ctx.fillStyle = colors[enemy.type] || colors.grunt; ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = enemy.type === "boss" ? "#ffd36e" : "#f2b4ae"; ctx.lineWidth = enemy.type === "boss" ? 5 : 2; ctx.stroke();
        ctx.fillStyle = "#ffe2d9"; ctx.beginPath(); ctx.arc(p.x - radius * .3, p.y - 3, 3, 0, Math.PI * 2); ctx.arc(p.x + radius * .3, p.y - 3, 3, 0, Math.PI * 2); ctx.fill();
        drawBar(p.x - radius, p.y - radius - 11, radius * 2, 5, enemy.hp / enemy.maxHp, "#e45c58");
        if (enemy.type !== "grunt") { ctx.fillStyle = "white"; ctx.font = "800 9px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(enemy.type.toUpperCase(), p.x, p.y + radius + 15); }
    }
}

function drawPlayers() {
    const colors = ["#56b4e9", "#d486e8", "#70d58b", "#e6ae55"];
    for (const player of state.players) {
        const p = smoothEntity("player", player);
        const rescuers = state.players.filter(worker => worker.action === player.id);
        if (rescuers.length) drawReviveEffect(p.x, p.y, Math.max(...rescuers.map(worker => worker.actionProgress / 4)));
        if (player.dashing) {
            const pulse = (Math.sin(performance.now() / 55) + 1) / 2;
            ctx.save(); ctx.strokeStyle = "#76e5ff"; ctx.globalAlpha = .55 + pulse * .3; ctx.lineWidth = 5;
            ctx.beginPath(); ctx.arc(p.x, p.y, 29 + pulse * 7, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
        }
        ctx.save();
        if (player.down) { ctx.translate(p.x, p.y + 8); ctx.scale(1.35, .65); }
        else ctx.translate(p.x, p.y);
        ctx.fillStyle = colors[Number(player.id.at(-1)) - 1] || "#ddd";
        ctx.beginPath(); ctx.arc(0, 0, player.id === myPlayerId ? 24 : 20, 0, Math.PI * 2); ctx.fill();
        if (player.id === myPlayerId) { ctx.strokeStyle = "white"; ctx.lineWidth = 3; ctx.stroke(); }
        ctx.restore();
        ctx.textAlign = "center"; ctx.fillStyle = "white"; ctx.font = "800 11px system-ui";
        ctx.fillText(player.down ? `${player.name} — DOWN` : player.name, p.x, p.y - 31);
        drawBar(p.x - 24, p.y + 28, 48, 4, player.hp / 100, player.down ? "#d94b4b" : "#54d286");
        if (player.action) drawBar(p.x - 30, p.y + 37, 60, 5, player.actionProgress / 4, "#f0c052");
    }
    ctx.textAlign = "left";
}

function drawReviveEffect(x, y, progress) {
    const pulse = (Math.sin(performance.now() / 110) + 1) / 2;
    ctx.save(); ctx.strokeStyle = "#69ed9b"; ctx.lineWidth = 4; ctx.shadowColor = "#69ed9b"; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(x, y, 34 + pulse * 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); ctx.stroke(); ctx.restore();
    ctx.fillStyle = "#83f1aa"; ctx.font = "900 10px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(`REVIVING ${Math.round(progress * 100)}%`, x, y - 48);
}

function drawHitEffects() {
    const now = performance.now();
    hitEffects = hitEffects.filter(effect => now - effect.started < (effect.weapon === "mine" ? 650 : 420));
    for (const effect of hitEffects) {
        const duration = effect.weapon === "mine" ? 650 : 420;
        const progress = (now - effect.started) / duration;
        const alpha = 1 - progress;
        const color = effect.weapon === "mine" ? "#ff694f" : effect.weapon === "turret" ? "#65dfff" : effect.weapon === "bat" ? "#ff9f43" : "#ffe082";
        ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color;
        if (!["bat", "mine"].includes(effect.weapon) && progress < .55) {
            ctx.lineWidth = 4 * (1 - progress); ctx.beginPath(); ctx.moveTo(effect.fromX, effect.fromY); ctx.lineTo(effect.x, effect.y); ctx.stroke();
        }
        const radius = effect.weapon === "mine" ? 24 + progress * 100 : 8 + progress * (effect.defeated ? 42 : 25);
        ctx.lineWidth = effect.defeated ? 5 : 3; ctx.beginPath(); ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 6; i++) {
            const angle = i * Math.PI / 3, inner = radius * .5, outer = radius * .9 + 12;
            ctx.beginPath(); ctx.moveTo(effect.x + Math.cos(angle) * inner, effect.y + Math.sin(angle) * inner); ctx.lineTo(effect.x + Math.cos(angle) * outer, effect.y + Math.sin(angle) * outer); ctx.stroke();
        }
        ctx.fillStyle = "white"; ctx.font = "900 15px ui-monospace, monospace"; ctx.textAlign = "center";
        ctx.fillText(`-${Math.round(effect.damage)}`, effect.x, effect.y - 28 - progress * 25); ctx.restore();
    }
    ctx.textAlign = "left";
}

function drawBar(x, y, width, height, progress, color) {
    ctx.fillStyle = "#182024"; ctx.fillRect(x, y, width, height);
    ctx.fillStyle = color; ctx.fillRect(x, y, width * clamp(progress, 0, 1), height);
}

function drawJoystick() {
    if (!joystick) return;
    const dprX = canvas.width / innerWidth, dprY = canvas.height / innerHeight;
    ctx.globalAlpha = .6; ctx.strokeStyle = "#d8e2e5"; ctx.lineWidth = 3 * dprX;
    ctx.beginPath(); ctx.arc(joystick.originX * dprX, joystick.originY * dprY, 58 * dprX, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#d8e2e5"; ctx.beginPath(); ctx.arc(joystick.x * dprX, joystick.y * dprY, 23 * dprX, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[char]); }

connect();
animate();
