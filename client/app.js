"use strict";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const menu = document.querySelector("#menu");
const menuStatus = document.querySelector("#menu-status");
const startButton = document.querySelector("#start");
const nameInput = document.querySelector("#player-name");
const hud = document.querySelector("#hud");
const roundElement = document.querySelector("#round");
const phaseElement = document.querySelector("#phase");
const phaseDetail = document.querySelector("#phase-detail");
const teamElement = document.querySelector("#team");
const selfVitals = document.querySelector("#self-vitals");
const healthHeart = document.querySelector("#health-heart");
const selfCredits = document.querySelector("#self-credits");
const noticeElement = document.querySelector("#notice");
const feedbackElement = document.querySelector("#feedback");
const interactButton = document.querySelector("#interact");
const interactLabel = interactButton.querySelector("small");
const weaponButton = document.querySelector("#weapon");
const weaponName = document.querySelector("#weapon-name");
const weaponAmmo = document.querySelector("#weapon-ammo");
const weaponCooldown = document.querySelector("#weapon-cooldown");
const weaponIcon = document.querySelector("#weapon-icon");
const actionMenu = document.querySelector("#action-menu");
const actionTitle = document.querySelector("#action-title");
const actionOptions = document.querySelector("#action-options");
const actionClose = document.querySelector("#action-close");
const inventoryMenu = document.querySelector("#inventory-menu");
const inventoryItems = document.querySelector("#inventory-items");
const roundIntro = document.querySelector("#round-intro");
const howToMenu = document.querySelector("#how-to-menu");
const howToStart = document.querySelector("#how-to-start");
const howToInventory = document.querySelector("#how-to-inventory");
const howToClose = document.querySelector("#how-to-close");
const URL_PARAMETERS = new URLSearchParams(window.location.search);
const DEBUG_MODE = URL_PARAMETERS.get("debug") === "1";

const VIEW = { width: 900, height: 500 };
let WORLD = { width: 1, height: 1 };
let CORE = { x: 0, y: 0 };
let ARMORY = { id: "armory", x: 0, y: 0 };
let MED = { id: "med", x: 0, y: 0 };
let WOODCUTTER = { id: "woodcutter", x: 0, y: 0 };
let QUARRY = { id: "quarry", x: 0, y: 0 };
let WORKBENCH = { id: "workbench", x: 0, y: 0 };
let TILE_MAP = { tileSize: 40, legend: {}, rows: [] };
let AREAS = [];
let SPAWN_POINTS = [];
let SHOP_UNITS = [];
let BREAKER_TERMINALS = [];
const BUILD_INFO = {
    block: { name: "BLOCK", wood: 4, ore: 0, description: "通路を塞ぐ基本ブロック" },
    turret: { name: "AUTO TURRET", wood: 4, ore: 8, description: "範囲内の敵を自動射撃" },
    wire: { name: "BARBED WIRE", wood: 2, ore: 4, description: "通過する敵を減速" },
    mine: { name: "MINE", wood: 1, ore: 5, description: "接近した敵へ範囲ダメージ" },
    barricade: { name: "BARRICADE", wood: 6, ore: 2, description: "高耐久の進路妨害" },
};
const WEAPON_FIELDS = Object.freeze({
    shotgun: { owned: "ownsShotgun", ammo: "shotgunAmmo" },
    smg: { owned: "ownsSmg", ammo: "smgAmmo" },
    rifle: { owned: "ownsRifle", ammo: "rifleAmmo" },
    sniper: { owned: "ownsSniper", ammo: "sniperAmmo" },
});
const INTERACTION_RANGE = Object.freeze({
    shop: 70,
    medBay: 95,
    core: 95,
    trapSlot: 100,
    areaTerminal: 100,
    resource: 110,
    workbench: 110,
    breaker: 95,
});

let socket;
let myPlayerId;
let state;
let scale = 1;
let camera = { x: 0, y: 0 };
let lastNoticeVersion = -1;
let lastCoreHp;
let coreHitStarted = 0;
let feedbackTimer;
let roundIntroTimer;
let connectionAttemptTimer;
let previousRound = 0;
let previousPhase = "lobby";
const noticeEntries = [];
let joystick = null;
let pendingMove = null;
let firingPointer = null;
let activeMenuAccess = null;
let dashKey = false;
let hitEffects = [];
let predictedLocal = null;
let localMove = { x: 0, y: 0 };
let localFacing = { x: 0, y: -1 };
let dashRequested = false;
let lastFrameAt = performance.now();
let mapReady = false;
let resolveMapReady;
const mapReadyPromise = new Promise(resolve => { resolveMapReady = resolve; });
const keys = new Set();
const smoothed = new Map();
const SESSION_STORAGE_KEY = "core-defense-session";
const clientSessionId = loadClientSessionId();
let nextInputSequence = 1;
let lastAcknowledgedInput = 0;
let pendingInputs = [];

function loadClientSessionId() {
    const create = () => globalThis.crypto?.randomUUID?.()
        || `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    try {
        let value = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (!/^[A-Za-z0-9_-]{16,128}$/.test(value || "")) {
            value = create();
            sessionStorage.setItem(SESSION_STORAGE_KEY, value);
        }
        return value;
    } catch {
        return create();
    }
}

function applyMap(map) {
    validateMap(map);

    WORLD = { width: map.world.width, height: map.world.height };
    CORE = { ...map.core };
    ARMORY = { ...map.stations.armory };
    MED = { ...map.stations.medBay };
    WOODCUTTER = { ...map.stations.woodcutter };
    QUARRY = { ...map.stations.quarry };
    WORKBENCH = { ...map.stations.workbench };
    TILE_MAP = {
        tileSize: map.tileMap.tileSize,
        legend: { ...map.tileMap.legend },
        rows: [...map.tileMap.rows],
    };
    AREAS = map.areas.map(area => ({ ...area }));
    SPAWN_POINTS = map.spawnPoints.map(spawn => ({ ...spawn }));
    SHOP_UNITS = map.shopUnits.map(shop => ({ ...shop }));
    BREAKER_TERMINALS = (map.breakerTerminals || []).map(breaker => ({ ...breaker }));
    camera = { x: CORE.x, y: CORE.y };
    if (!mapReady) {
        mapReady = true;
        resolveMapReady();
    }
}

function validateMap(map) {
    if (map?.version !== 4) throw new Error(`未対応のマップバージョン: ${map?.version}`);
    if (!isPositiveNumber(map.world?.width) || !isPositiveNumber(map.world?.height)) {
        throw new Error("マップの幅と高さが不正です");
    }
    if (!isPoint(map.core) || !isPoint(map.stations?.armory) || !isPoint(map.stations?.medBay)
            || !isPoint(map.stations?.woodcutter) || !isPoint(map.stations?.quarry)
            || !isPoint(map.stations?.workbench)) {
        throw new Error("COREまたは施設の座標が不正です");
    }
    for (const [name, values] of [["areas", map.areas],
        ["spawnPoints", map.spawnPoints], ["trapSlots", map.trapSlots],
        ["resourceNodes", map.resourceNodes], ["shopUnits", map.shopUnits]]) {
        if (!Array.isArray(values)) throw new Error(`${name}が配列ではありません`);
    }
    const tiles = map.tileMap;
    if (!Number.isInteger(tiles?.tileSize) || tiles.tileSize <= 0
            || !Array.isArray(tiles.rows) || typeof tiles.legend !== "object") {
        throw new Error("タイルマップ定義が不正です");
    }
    const columns = map.world.width / tiles.tileSize;
    const rows = map.world.height / tiles.tileSize;
    if (!Number.isInteger(columns) || tiles.rows.length !== rows
            || tiles.rows.some(row => typeof row !== "string" || row.length !== columns
                || [...row].some(symbol => !tiles.legend[symbol]))) {
        throw new Error("タイルマップの行数、列数、または記号が不正です");
    }
    if (map.spawnPoints.length === 0) throw new Error("侵入口がありません");
    requireUniqueIds(map.areas, "areas");
    requireUniqueIds(map.spawnPoints, "spawnPoints");
    requireUniqueIds(map.trapSlots, "trapSlots");
    requireUniqueIds(map.resourceNodes, "resourceNodes");
    requireUniqueIds(map.shopUnits, "shopUnits");
    for (const spawn of map.spawnPoints) {
        if (!Array.isArray(spawn.route) || spawn.route.length === 0 || !spawn.route.every(isPoint)) {
            throw new Error(`侵入口${spawn.id}の経路が不正です`);
        }
        if (!Number.isFinite(spawn.speedMultiplier) || spawn.speedMultiplier <= 0) {
            throw new Error(`侵入口${spawn.id}の速度補正が不正です`);
        }
        if (!["balanced", "runner", "brute"].includes(spawn.enemyBias)
                || !["core", "players", "defenses"].includes(spawn.targetPriority)) {
            throw new Error(`侵入口${spawn.id}の特性が不正です`);
        }
    }
    const areaIds = new Set(map.areas.map(area => area.id));
    for (const slot of map.trapSlots) {
        if (slot.requiredArea != null && !areaIds.has(slot.requiredArea)) {
            throw new Error(`防衛スロット${slot.id}の解放エリアが存在しません`);
        }
    }
}

function requireUniqueIds(values, name) {
    const ids = new Set();
    for (const value of values) {
        if (typeof value?.id !== "string" || !value.id || ids.has(value.id)) {
            throw new Error(`${name}に空または重複したIDがあります`);
        }
        ids.add(value.id);
    }
}

function isPoint(value) {
    return Number.isFinite(value?.x) && Number.isFinite(value?.y);
}

function isPositiveNumber(value) {
    return Number.isFinite(value) && value > 0;
}

function connect() {
    const host = window.location.hostname || "localhost";
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const serverPort = URL_PARAMETERS.get("serverPort") || "8887";
    menuStatus.textContent = mapReady
        ? "ゲームサーバーに再接続しています…"
        : "ゲームサーバーに接続しています…";
    socket = new WebSocket(`${protocol}://${host}:${serverPort}/?session=${encodeURIComponent(clientSessionId)}`);
    const connectingSocket = socket;
    clearTimeout(connectionAttemptTimer);
    connectionAttemptTimer = setTimeout(() => {
        if (socket === connectingSocket && connectingSocket.readyState === WebSocket.CONNECTING) {
            menuStatus.textContent = "ゲームサーバーに接続できません。公開されたWSSサーバーが必要です。";
        }
    }, 6000);
    socket.addEventListener("open", () => {
        clearTimeout(connectionAttemptTimer);
        if (mapReady) {
            menuStatus.textContent = "接続しました。防衛を開始できます。";
            startButton.disabled = false;
        } else {
            menuStatus.textContent = "ゲームサーバーからマップデータを受信しています…";
        }
    });
    socket.addEventListener("message", ({ data }) => {
        let message;
        try { message = JSON.parse(data); } catch { return; }
        if (message.type === "map") {
            try {
                applyMap(message.map);
                menuStatus.textContent = "接続しました。防衛を開始できます。";
                startButton.disabled = false;
            } catch (error) {
                console.error(error);
                menuStatus.textContent = "サーバーのマップデータが不正です。サーバーを再ビルドしてください。";
                startButton.disabled = true;
            }
            return;
        }
        if (message.type === "welcome") {
            myPlayerId = message.playerId;
            acknowledgeInputs(message.ackInput);
            nextInputSequence = Math.max(nextInputSequence, lastAcknowledgedInput + 1);
            lastMove = "";
            sendMovement(true);
        }
        if (message.type === "state") receiveState(message);
        if (message.type === "log") receiveLog(message.version, message.message);
        if (message.type === "effect" && ["hit", "core-pulse", "pickup"].includes(message.effect)) {
            hitEffects.push({ ...message, started: performance.now() });
            if (hitEffects.length > 100) hitEffects.shift();
        }
        if (message.type === "feedback" || message.type === "error") showFeedback(message.message);
    });
    socket.addEventListener("close", () => {
        clearTimeout(connectionAttemptTimer);
        predictedLocal = null;
        localMove = { x: 0, y: 0 };
        dashRequested = false;
        pendingInputs = [];
        lastMove = "";
        menu.classList.remove("hidden");
        hud.classList.add("hidden");
        closeActionMenu();
        menuStatus.textContent = "サーバーから切断されました。再接続します…";
        startButton.disabled = true;
        setTimeout(connect, 2000);
    });
    socket.addEventListener("error", () => {
        clearTimeout(connectionAttemptTimer);
        menuStatus.textContent = "接続できません。Javaサーバーを起動してください。";
    });
}

function send(message) {
    if (socket?.readyState !== WebSocket.OPEN) return;
    const sequence = nextInputSequence++;
    socket.send(`INPUT:${sequence}:${message}`);
    pendingInputs.push({ sequence, kind: message.split(":", 1)[0] });
    if (pendingInputs.length > 128) pendingInputs.shift();
}

function acknowledgeInputs(value) {
    if (!Number.isSafeInteger(value) || value <= lastAcknowledgedInput) return;
    lastAcknowledgedInput = value;
    pendingInputs = pendingInputs.filter(input => input.sequence > value);
}

function receiveState(next) {
    const beginsRound = next.phase === "wave"
        && (previousPhase !== "wave" || next.round !== previousRound);
    if (lastCoreHp !== undefined && next.core.hp < lastCoreHp) coreHitStarted = performance.now();
    lastCoreHp = next.core.hp;
    state = next;
    CORE.x = next.core.x;
    CORE.y = next.core.y;
    if (beginsRound) showRoundIntro(next.round);
    previousRound = next.round;
    previousPhase = next.phase;
    reconcileLocalPrediction(next);
    if (activeMenuAccess
            && !canUseNearby(activeMenuAccess.target, activeMenuAccess.range, false)) {
        closeActionMenu();
    }
    receiveLog(next.noticeVersion, next.notice);
    updateHud();
    if (["preparing", "wave"].includes(next.phase)) {
        menu.classList.add("hidden");
        hud.classList.remove("hidden");
    } else if (["won", "lost"].includes(next.phase)) {
        closeActionMenu();
        inventoryMenu.classList.add("hidden");
        menu.classList.remove("hidden");
        hud.classList.remove("hidden");
        menuStatus.textContent = next.phase === "won" ? "防衛成功：CORE SECURED" : `防衛失敗：${next.notice}`;
        startButton.textContent = "もう一度プレイ";
        startButton.disabled = false;
    }
    if (!["preparing", "wave"].includes(next.phase)) closeActionMenu();
}

function showRoundIntro(round) {
    roundIntro.textContent = `ROUND ${round}`;
    roundIntro.classList.remove("show");
    void roundIntro.offsetWidth;
    roundIntro.classList.add("show");
    clearTimeout(roundIntroTimer);
    roundIntroTimer = setTimeout(() => roundIntro.classList.remove("show"), 2400);
}

startButton.addEventListener("click", () => {
    send(`HELLO:${nameInput.value || "Player"}`);
    send("START");
});

function equipmentEntries(me) {
    const entries = [
        { key: "weapon:pistol", kind: "weapon", value: "pistol", label: "PISTOL" },
        { key: "weapon:bat", kind: "weapon", value: "bat", label: "BAT" },
    ];
    if (me.ownsShotgun) entries.push({ key: "weapon:shotgun", kind: "weapon", value: "shotgun", label: "SHOTGUN" });
    if (me.ownsSmg) entries.push({ key: "weapon:smg", kind: "weapon", value: "smg", label: "SMG" });
    if (me.ownsRifle) entries.push({ key: "weapon:rifle", kind: "weapon", value: "rifle", label: "RIFLE" });
    if (me.ownsSniper) entries.push({ key: "weapon:sniper", kind: "weapon", value: "sniper", label: "SNIPER" });
    for (const [type, info] of Object.entries(BUILD_INFO)) {
        if ((me.buildItems?.[type] || 0) > 0) entries.push({ key: `build:${type}`, kind: "build", value: type, label: info.name });
    }
    if (me.movingCore) entries.push({ key: "core", kind: "core", value: "core", label: "CORE" });
    return entries;
}

function selectEquipment(entry) {
    const me = getMe();
    if (me?.movingCore && entry.kind === "weapon") {
        showFeedback("CORE運搬中は武器を使用できません");
        return;
    }
    if (entry.kind === "weapon") send(`WEAPON:${entry.value}`);
    else if (entry.kind === "build") send(`EQUIP_BUILD:${entry.value}`);
}

function cycleEquipment(direction = 1) {
    const me = getMe();
    if (!me) return;
    if (me.movingCore) return;
    const entries = equipmentEntries(me);
    const selectedKey = me.movingCore ? "core"
        : me.selectedBuild ? `build:${me.selectedBuild}` : `weapon:${me.weapon}`;
    const current = Math.max(0, entries.findIndex(entry => entry.key === selectedKey));
    selectEquipment(entries[(current + direction + entries.length) % entries.length]);
}

weaponButton.addEventListener("click", () => cycleEquipment(1));
interactButton.addEventListener("click", toggleNearestInteraction);
window.addEventListener("wheel", event => {
    if (!state || !["preparing", "wave"].includes(state.phase)) return;
    event.preventDefault();
    cycleEquipment(event.deltaY > 0 ? 1 : -1);
}, { passive: false });
actionClose.addEventListener("click", closeActionMenu);
actionMenu.addEventListener("pointerdown", event => {
    if (event.target === actionMenu) closeActionMenu();
});
inventoryMenu.addEventListener("pointerdown", event => {
    if (event.target === inventoryMenu) inventoryMenu.classList.add("hidden");
});
howToStart.addEventListener("click", openHowTo);
howToInventory.addEventListener("click", openHowTo);
howToClose.addEventListener("click", closeHowTo);
howToMenu.addEventListener("pointerdown", event => {
    if (event.target === howToMenu) closeHowTo();
});

function openHowTo() {
    howToMenu.classList.remove("hidden");
}

function closeHowTo() {
    howToMenu.classList.add("hidden");
}

function updateHud() {
    if (!state) return;
    roundElement.textContent = `ROUND ${state.round}`;
    phaseElement.textContent = "";
    phaseElement.classList.add("hidden");
    const prepSeconds = Math.max(0, Math.ceil(state.prepTime));
    const blackoutStatus = state.blackoutActive
        ? ` / BREAKER:${(state.trippedBreakers || []).length}` : "";
    phaseDetail.textContent = state.phase === "preparing"
        ? `next round in ${Math.floor(prepSeconds / 60)}:${String(prepSeconds % 60).padStart(2, "0")}`
        : state.phase === "wave" ? `ENEMY:${state.enemies.length + state.queued}${blackoutStatus}` : "";
    const me = getMe();
    teamElement.innerHTML = state.players.filter(player => player.id !== myPlayerId).map(player => `
        <div class="teammate ${player.down ? "down" : player.hp <= 30 ? "low" : ""} ${player.id === myPlayerId ? "self" : ""}">
            <div class="teammate-label">
                <span>${player.id === myPlayerId ? "YOU" : player.human ? escapeHtml(player.name) : `CPU${player.id.at(-1)}`}</span>
                <span class="player-stats">${player.down ? "DOWN" : ""}<b>${player.credits}g</b></span>
            </div>
            <div class="hp-line"><span style="width:${player.hp}%"></span></div>
        </div>`).join("");
    selfVitals.classList.toggle("hidden", !me);
    if (me) {
        const health = clamp(me.hp, 0, 100);
        healthHeart.style.setProperty("--health", `${health}%`);
        healthHeart.setAttribute("aria-label", `体力 ${Math.ceil(health)}%`);
        selfCredits.textContent = `${me.credits}g`;
        const ammo = ammoForWeapon(me, me.weapon);
        const cooldownMax = Math.max(.01, me.cooldownMax || me.cooldown || .01);
        const cooldownProgress = 1 - Math.min(1, me.cooldown / cooldownMax);
        weaponName.textContent = me.weapon.toUpperCase();
        weaponAmmo.textContent = ammo;
        weaponIcon.className = `weapon-icon ${me.weapon}`;
        weaponCooldown.textContent = me.cooldown > 0 ? `${me.cooldown.toFixed(1)}s` : "READY";
        weaponButton.style.setProperty("--cooldown-progress", `${cooldownProgress * 100}%`);
        weaponButton.classList.toggle("cooling", me.cooldown > 0);
        weaponButton.classList.toggle("locked", me.movingCore);
        weaponButton.disabled = me.movingCore;
        updateInventory(me);
        const placing = Boolean(placementSelection(me));
        interactLabel.textContent = placing ? "PLACE" : "INTERACT";
        interactButton.classList.toggle("hidden", !placing && !findNearestInteraction());
    }
}

function updateInventory(me) {
    const entries = equipmentEntries(me);
    const selectedKey = me.movingCore ? "core"
        : me.selectedBuild ? `build:${me.selectedBuild}` : `weapon:${me.weapon}`;
    const equipment = entries.map(entry => {
        const amount = entry.kind === "build" ? `×${me.buildItems[entry.value]}`
            : entry.kind === "core" ? ""
                : WEAPON_FIELDS[entry.value] ? `${ammoForWeapon(me, entry.value)} AMMO` : "WEAPON";
        return `<button type="button" data-key="${entry.key}" class="${selectedKey === entry.key ? "selected" : ""}">
            <strong>${entry.label}</strong><span>${amount}</span>
        </button>`;
    }).join("");
    inventoryItems.innerHTML = `
        <div class="inventory-section"><h3>EQUIPMENT</h3><div class="inventory-grid">${equipment}</div></div>
        <div class="inventory-section"><h3>MATERIALS</h3><div class="inventory-grid materials-grid">
            <div class="inventory-resource"><strong>WOOD</strong><span>×${me.wood}</span></div>
            <div class="inventory-resource"><strong>ORE</strong><span>×${me.ore}</span></div>
        </div></div>`;
    inventoryItems.querySelectorAll("button").forEach(button => button.addEventListener("click", () => {
        const entry = entries.find(candidate => candidate.key === button.dataset.key);
        if (entry) selectEquipment(entry);
    }));
}

function toggleInventory() {
    if (!inventoryMenu.classList.contains("hidden")) {
        inventoryMenu.classList.add("hidden");
        return;
    }
    closeActionMenu();
    inventoryMenu.classList.remove("hidden");
}

function setDash(active) {
    dashRequested = active;
    send(`DASH:${active ? 1 : 0}`);
}

function showNotice(text) {
    const entry = {
        id: `${Date.now()}-${Math.random()}`,
        text: String(text),
        danger: String(text).includes("ダウンしました"),
    };
    const previousPositions = new Map([...noticeElement.children]
        .map(element => [element.dataset.logId, element.getBoundingClientRect().top]));
    noticeEntries.push(entry);
    const element = document.createElement("div");
    element.className = `log-entry${entry.danger ? " danger" : ""}`;
    element.dataset.logId = entry.id;
    element.innerHTML = `<p>${escapeHtml(entry.text)}</p>`;
    noticeElement.append(element);
    while (noticeEntries.length > 6) {
        const removed = noticeEntries.shift();
        noticeElement.querySelector(`[data-log-id="${CSS.escape(removed.id)}"]`)?.remove();
    }
    for (const existing of noticeElement.children) {
        const oldTop = previousPositions.get(existing.dataset.logId);
        if (oldTop === undefined) continue;
        const delta = oldTop - existing.getBoundingClientRect().top;
        if (Math.abs(delta) > .5) {
            existing.animate([
                { transform: `translateY(${delta}px)` },
                { transform: "translateY(0)" },
            ], { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" });
        }
    }
    element.animate([
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "translateY(0)" },
    ], { duration: 220, easing: "ease-out" });
    element.animate([
        { opacity: 1, offset: 0 },
        { opacity: 1, offset: .62 },
        { opacity: 0, offset: 1 },
    ], { duration: 15600, easing: "linear", fill: "forwards" });
    setTimeout(() => {
        const index = noticeEntries.findIndex(item => item.id === entry.id);
        if (index >= 0) noticeEntries.splice(index, 1);
        element.remove();
    }, 15600);
}

function receiveLog(version, text) {
    if (!Number.isFinite(version) || version <= lastNoticeVersion || typeof text !== "string") return;
    lastNoticeVersion = version;
    showNotice(text);
}

function showFeedback(text) {
    feedbackElement.textContent = text;
    feedbackElement.classList.add("show");
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => feedbackElement.classList.remove("show"), 1000);
}

function getMe() { return state?.players.find(player => player.id === myPlayerId); }

function ammoForWeapon(player, weapon) {
    const field = WEAPON_FIELDS[weapon]?.ammo;
    return field ? String(player[field] ?? 0) : "∞";
}

function reconcileLocalPrediction(snapshot) {
    const serverMe = snapshot.players.find(player => player.id === myPlayerId);
    if (!serverMe) return;
    acknowledgeInputs(serverMe.ackInput);
    if (!predictedLocal) {
        predictedLocal = { x: serverMe.x, y: serverMe.y, stamina: serverMe.stamina, dashing: serverMe.dashing, exhausted: false };
        localFacing = { x: serverMe.facingX, y: serverMe.facingY };
        return;
    }
    const errorX = serverMe.x - predictedLocal.x;
    const errorY = serverMe.y - predictedLocal.y;
    const error = Math.hypot(errorX, errorY);
    if (error > 120 || !["preparing", "wave"].includes(snapshot.phase)) {
        predictedLocal.x = serverMe.x;
        predictedLocal.y = serverMe.y;
    } else {
        const waitingForMovement = pendingInputs.some(input => input.kind === "MOVE" || input.kind === "DASH");
        const moving = Math.hypot(localMove.x, localMove.y) > .12;
        const correction = waitingForMovement ? .14 : moving ? .38 : .72;
        predictedLocal.x += errorX * correction;
        predictedLocal.y += errorY * correction;
    }
    predictedLocal.stamina += (serverMe.stamina - predictedLocal.stamina) * .4;
    if (Math.hypot(localMove.x, localMove.y) <= .12) {
        localFacing = { x: serverMe.facingX, y: serverMe.facingY };
    }
    if (serverMe.stamina >= 28) predictedLocal.exhausted = false;
    if (serverMe.stamina <= 0) predictedLocal.exhausted = true;
}

function openActionMenu(title, options, layout = "default") {
    actionTitle.textContent = title;
    actionMenu.classList.toggle("single-action", layout === "single");
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

function openNearbyActionMenu(title, options, target, range, layout = "default") {
    if (!canUseNearby(target, range, true)) return;
    activeMenuAccess = { target: { x: target.x, y: target.y }, range };
    openActionMenu(title, options, layout);
}

function canUseNearby(target, range, showReason) {
    const me = getMe();
    if (!me || !state || !["preparing", "wave"].includes(state.phase)) return false;
    if (me.down) {
        if (showReason) showFeedback("ダウン中は利用できません");
        return false;
    }
    if (distance(me, target) > range) {
        if (showReason) showFeedback("もっと近づいてください");
        return false;
    }
    return true;
}

function closeActionMenu() {
    activeMenuAccess = null;
    actionMenu.classList.add("hidden");
    actionMenu.classList.remove("single-action");
}

function openSlotMenu(slot) {
    if (slot.locked) {
        openNearbyActionMenu("AREA LOCKED", [{ label: "入口の解放端末を操作してください", disabled: true }],
            slot, INTERACTION_RANGE.trapSlot);
    } else if (!slot.defense) {
        openNearbyActionMenu("EMPTY TILE", [{
            label: "CRAFT FIRST",
            detail: "作業台でクラフトし、正面の色付きタイルへRで設置",
            disabled: true,
        }], slot, INTERACTION_RANGE.trapSlot);
    } else {
        const missing = slot.defense.maxHp - slot.defense.hp;
        const metal = ["turret", "wire", "mine"].includes(slot.defense.type);
        const me = getMe();
        openNearbyActionMenu(`${slot.defense.type.toUpperCase()} — HP ${Math.ceil(slot.defense.hp)}/${Math.ceil(slot.defense.maxHp)}`, [{
            label: "REPAIR",
            detail: slot.defense.hp >= slot.defense.maxHp ? "耐久値最大" : `${metal ? "ORE" : "WOOD"} 1`,
            command: `REPAIR:${slot.id}`,
            disabled: slot.defense.hp >= slot.defense.maxHp || (metal ? me.ore : me.wood) < 1,
        }, {
            label: "PICK UP",
            detail: "撤去してインベントリへ戻す",
            command: `REMOVE:${slot.id}`,
        }], slot, INTERACTION_RANGE.trapSlot);
    }
}

function snapToTile(point) {
    const size = TILE_MAP.tileSize;
    return {
        x: (Math.floor(point.x / size) + .5) * size,
        y: (Math.floor(point.y / size) + .5) * size,
    };
}

function canBuildAt(point, forCore = false) {
    const size = TILE_MAP.tileSize;
    const column = Math.floor(point.x / size), row = Math.floor(point.y / size);
    const symbol = TILE_MAP.rows[row]?.[column];
    if (!symbol || !TILE_MAP.legend[symbol]?.buildable) return false;
    if (AREAS.some(area => !state.areas[area.id]
            && point.x >= area.x && point.x <= area.x + area.width
            && point.y >= area.y && point.y <= area.y + area.height)) return false;
    if (!forCore && distance(point, state.core) < 90) return false;
    if (distance(point, ARMORY) < 70 || distance(point, MED) < 70
            || distance(point, WOODCUTTER) < 70 || distance(point, QUARRY) < 70
            || distance(point, WORKBENCH) < 70) return false;
    if (SHOP_UNITS.some(shop => distance(point, shop) < 55)) return false;
    if (BREAKER_TERMINALS.some(breaker => distance(point, breaker) < 55)) return false;
    if ((state.resources || []).some(node => distance(point, node) < 36)) return false;
    if (SPAWN_POINTS.some(spawn => distance(point, spawn) < 80)) return false;
    if (state.slots.some(slot => (forCore ? slot.defense : true) && distance(point, slot) < 36)) return false;
    return !state.players.some(player => distance(point, player) < (player.id === myPlayerId ? 30 : 48))
        && !state.enemies.some(enemy => enemy.hp > 0 && distance(point, enemy) < 48);
}

function openCoreMenu() {
    const core = state.core;
    const me = getMe();
    const hpCost = 300 + Math.round((core.maxHp - 1000) * .6);
    const shieldCost = 350 + Math.round(core.maxShield * .8);
    const defenseCost = 450 + core.defense * 250;
    const regenCost = 500 + core.regen * 300;
    openNearbyActionMenu("CORE UPGRADES", [
        option("MAX HP +250", hpCost, "UPGRADE:hp"),
        option("SHIELD +180", shieldCost, "UPGRADE:shield"),
        option(`DEFENSE Lv.${core.defense + 1}`, defenseCost, "UPGRADE:defense", core.defense >= 4),
        option(`AUTO REPAIR Lv.${core.regen + 1}`, regenCost, "UPGRADE:regen", core.regen >= 4),
        {
            label: "PREP TIME +3:00",
            detail: "30G",
            command: "EXTEND_PREP",
            disabled: state.phase !== "preparing" || !me || me.credits < 30,
        },
        { label: "MOVE CORE", detail: "運搬後、正面の色付きタイルへRで設置", command: "EQUIP_CORE" },
    ], CORE, INTERACTION_RANGE.core);
}

function openShopPurchase(shop) {
    const me = getMe();
    const weaponFields = WEAPON_FIELDS[shop.item];
    const alreadyOwned = Boolean(weaponFields && me[weaponFields.owned]);
    const unavailable = shop.item === "ammo"
        && !Object.values(WEAPON_FIELDS).some(fields => me[fields.owned]);
    openNearbyActionMenu(shop.label, [{
        label: alreadyOwned ? "OWNED" : unavailable ? "LOCKED" : "BUY",
        detail: `${shop.cost}G`,
        command: `BUY:${shop.item}`,
        disabled: alreadyOwned || unavailable || me.credits < shop.cost,
    }], shop, INTERACTION_RANGE.shop, "single");
}

function openWoodcutterMenu() {
    const me = getMe();
    openNearbyActionMenu("WOODCUTTER", [{
        label: "COLLECT WOOD",
        detail: me.gatherCooldown > 0 ? `再採取まで ${me.gatherCooldown.toFixed(1)}秒` : "WOOD +4 / クラフト素材",
        command: "GATHER:wood",
        disabled: me.gatherCooldown > 0,
    }], WOODCUTTER, INTERACTION_RANGE.resource);
}

function openQuarryMenu() {
    const me = getMe();
    openNearbyActionMenu("QUARRY", [{
        label: "COLLECT ORE",
        detail: me.gatherCooldown > 0 ? `再採取まで ${me.gatherCooldown.toFixed(1)}秒` : "ORE +3 / クラフト素材",
        command: "GATHER:ore",
        disabled: me.gatherCooldown > 0,
    }], QUARRY, INTERACTION_RANGE.resource);
}

function openWorkbenchMenu() {
    const me = getMe();
    openNearbyActionMenu("WORKBENCH", Object.entries(BUILD_INFO).map(([type, info]) => ({
        label: info.name,
        detail: `${info.description} — WOOD ${info.wood} / ORE ${info.ore}`,
        command: `CRAFT:${type}`,
        disabled: me.wood < info.wood || me.ore < info.ore,
    })), WORKBENCH, INTERACTION_RANGE.workbench);
}

function openMedMenu() {
    const me = getMe();
    openNearbyActionMenu("MED BAY", [option("FULL HEAL", 80, "BUY:heal", me.hp >= 100, me.hp >= 100 ? "HP最大" : `HP ${Math.ceil(me.hp)} → 100`)],
        MED, INTERACTION_RANGE.medBay);
}

function openUnlockMenu(area) {
    const openCount = Object.values(state.areas).filter(Boolean).length;
    const cost = 350 + openCount * 100;
    const unlocked = state.areas[area.id];
    openNearbyActionMenu(area.name, [{
        label: unlocked ? "OPENED" : "OPEN",
        detail: `${cost}G`,
        command: `UNLOCK:${area.id}`,
        disabled: unlocked || !getMe() || getMe().credits < cost,
    }], { x: area.terminalX, y: area.terminalY }, INTERACTION_RANGE.areaTerminal, "single");
}

function option(label, cost, command, extraDisabled = false, customDetail = "") {
    const me = getMe();
    return { label, detail: customDetail || `${cost}g`, command,
        disabled: extraDisabled || !me || me.credits < cost };
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
    if (!state || !getMe()) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    const inMovementArea = event.pointerType !== "mouse"
        && event.clientX < innerWidth * .42 && event.clientY > innerHeight * .42;
    if (inMovementArea) {
        const pointer = { id: event.pointerId, originX: event.clientX, originY: event.clientY, x: event.clientX, y: event.clientY, timer: null };
        pointer.timer = setTimeout(() => activateJoystick(pointer.id), 170);
        pendingMove = pointer;
    } else {
        startFiring(event.pointerId, event.clientX, event.clientY);
    }
});

canvas.addEventListener("pointermove", event => {
    if (pendingMove?.id === event.pointerId) { pendingMove.x = event.clientX; pendingMove.y = event.clientY; }
    if (joystick?.id === event.pointerId) updateJoystick(event.clientX, event.clientY);
    if (firingPointer?.id === event.pointerId) updateFiringAim(event.clientX, event.clientY);
});

canvas.addEventListener("pointerup", event => {
    if (joystick?.id === event.pointerId) {
        joystick = null; sendMovement();
    } else if (pendingMove?.id === event.pointerId) {
        clearTimeout(pendingMove.timer); pendingMove = null;
        fireOnce(event.clientX, event.clientY);
    } else if (firingPointer?.id === event.pointerId) {
        stopFiring(event.clientX, event.clientY);
    }
});

canvas.addEventListener("pointercancel", event => {
    if (joystick?.id === event.pointerId) { joystick = null; sendMovement(); }
    if (pendingMove?.id === event.pointerId) { clearTimeout(pendingMove.timer); pendingMove = null; }
    if (firingPointer?.id === event.pointerId) stopFiring(event.clientX, event.clientY);
});
canvas.addEventListener("contextmenu", event => event.preventDefault());

function startFiring(pointerId, clientX, clientY) {
    if (getMe()?.movingCore) {
        showFeedback("CORE運搬中は武器を使用できません");
        return;
    }
    const point = worldFromScreen(clientX, clientY);
    firingPointer = { id: pointerId, clientX, clientY, lastAimSent: performance.now() };
    send(`FIRE:${point.x.toFixed(1)}:${point.y.toFixed(1)}:1`);
}

function updateFiringAim(clientX, clientY) {
    if (!firingPointer) return;
    if (getMe()?.movingCore) {
        firingPointer = null;
        return;
    }
    firingPointer.clientX = clientX;
    firingPointer.clientY = clientY;
    if (performance.now() - firingPointer.lastAimSent < 70) return;
    const point = worldFromScreen(clientX, clientY);
    firingPointer.lastAimSent = performance.now();
    send(`FIRE:${point.x.toFixed(1)}:${point.y.toFixed(1)}:1`);
}

function stopFiring(clientX, clientY) {
    const point = worldFromScreen(clientX, clientY);
    send(`FIRE:${point.x.toFixed(1)}:${point.y.toFixed(1)}:0`);
    firingPointer = null;
}

function fireOnce(clientX, clientY) {
    if (getMe()?.movingCore) {
        showFeedback("CORE運搬中は武器を使用できません");
        return;
    }
    const point = worldFromScreen(clientX, clientY);
    send(`FIRE:${point.x.toFixed(1)}:${point.y.toFixed(1)}:1`);
    send(`FIRE:${point.x.toFixed(1)}:${point.y.toFixed(1)}:0`);
}

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
function sendMovement(force = false) {
    let x = 0, y = 0;
    if (joystick) { x = (joystick.x - joystick.originX) / 58; y = (joystick.y - joystick.originY) / 58; }
    if (keys.has("w") || keys.has("arrowup")) y -= 1;
    if (keys.has("s") || keys.has("arrowdown")) y += 1;
    if (keys.has("a") || keys.has("arrowleft")) x -= 1;
    if (keys.has("d") || keys.has("arrowright")) x += 1;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    localMove.x = Number(x.toFixed(2));
    localMove.y = Number(y.toFixed(2));
    if (length > .12) localFacing = quantizeFacing(localMove.x, localMove.y);
    const message = `MOVE:${localMove.x.toFixed(2)}:${localMove.y.toFixed(2)}`;
    if (force || message !== lastMove) { lastMove = message; send(message); }
}

function isTypingTarget(target) {
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
        || target?.isContentEditable;
}

window.addEventListener("keydown", event => {
    if (isTypingTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (!howToMenu.classList.contains("hidden")) {
        if (["escape", "e"].includes(key)) closeHowTo();
        event.preventDefault();
        return;
    }
    if (key === "e") {
        event.preventDefault();
        if (!event.repeat) toggleInventory();
        return;
    }
    if (key === "r") {
        event.preventDefault();
        if (!event.repeat) toggleNearestInteraction();
        return;
    }
    if (key === "shift") {
        event.preventDefault();
        if (!dashKey) { dashKey = true; setDash(true); }
        return;
    }
    if (!["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) return;
    event.preventDefault(); keys.add(key); sendMovement();
});
window.addEventListener("keyup", event => {
    if (isTypingTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === "shift") { dashKey = false; setDash(false); return; }
    keys.delete(key); sendMovement();
});
window.addEventListener("blur", () => {
    keys.clear(); joystick = null;
    dashKey = false; setDash(false);
    if (pendingMove) clearTimeout(pendingMove.timer);
    pendingMove = null;
    if (firingPointer) stopFiring(firingPointer.clientX, firingPointer.clientY);
    sendMovement();
});

function findNearestInteraction() {
    const me = getMe();
    if (!me || me.down || !state || !["preparing", "wave"].includes(state.phase)) return null;
    const choices = [];
    const add = (kind, target, range, label, action) => {
        const separation = distance(me, target);
        if (separation <= range) choices.push({ kind, target, label, action, separation });
    };
    state.players.filter(player => player.down && player.id !== myPlayerId)
        .forEach(player => add("revive", player, 78, "REVIVE", () => send(`INTERACT:${player.id}`)));
    state.slots.filter(slot => slot.defense)
        .forEach(slot => add("defense", slot, INTERACTION_RANGE.trapSlot, "MANAGE", () => openSlotMenu(slot)));
    SHOP_UNITS.forEach(shop => add("shop", shop, INTERACTION_RANGE.shop,
        shop.label, () => openShopPurchase(shop)));
    add("med", MED, INTERACTION_RANGE.medBay, "MED BAY", openMedMenu);
    add("craft", WORKBENCH, INTERACTION_RANGE.workbench, "CRAFT", openWorkbenchMenu);
    add("core", state.core, INTERACTION_RANGE.core, "CORE", openCoreMenu);
    if (state.blackoutActive) {
        const tripped = new Set(state.trippedBreakers || []);
        BREAKER_TERMINALS
            .filter(breaker => tripped.has(breaker.id)
                && (!breaker.requiredArea || state.areas[breaker.requiredArea]))
            .forEach(breaker => add("breaker", breaker, INTERACTION_RANGE.breaker,
                "RESET", () => send(`BREAKER:${breaker.id}`)));
    }
    for (const area of AREAS) {
        if (state.areas[area.id]) continue;
        const terminal = { x: area.terminalX, y: area.terminalY };
        add("area", terminal, INTERACTION_RANGE.areaTerminal, "UNLOCK", () => openUnlockMenu(area));
    }
    return choices.sort((a, b) => a.separation - b.separation)[0] || null;
}

function useNearestInteraction() {
    const interaction = findNearestInteraction();
    if (!interaction) {
        showFeedback("操作できる物体の近くに移動してください");
        return;
    }
    interaction.action();
}

function toggleNearestInteraction() {
    if (!actionMenu.classList.contains("hidden")) {
        closeActionMenu();
        return;
    }
    inventoryMenu.classList.add("hidden");
    if (placeSelectedInFront()) return;
    useNearestInteraction();
}

function placementSelection(player) {
    if (!player || player.down) return null;
    if (player.movingCore) return { forCore: true, type: "core" };
    const type = player.selectedBuild;
    if (type && (player.buildItems?.[type] || 0) > 0) return { forCore: false, type };
    return null;
}

function quantizeFacing(x, y) {
    let facingX = Math.abs(x) >= .38 ? Math.sign(x) : 0;
    let facingY = Math.abs(y) >= .38 ? Math.sign(y) : 0;
    if (facingX === 0 && facingY === 0) {
        if (Math.abs(x) >= Math.abs(y)) facingX = x >= 0 ? 1 : -1;
        else facingY = y >= 0 ? 1 : -1;
    }
    return { x: facingX, y: facingY };
}

function frontPlacementTile(player) {
    const origin = snapToTile(player);
    const facing = player.id === myPlayerId ? localFacing
        : {
            x: Number.isFinite(player.facingX) ? player.facingX : 0,
            y: Number.isFinite(player.facingY) ? player.facingY : -1,
        };
    return {
        x: origin.x + facing.x * TILE_MAP.tileSize,
        y: origin.y + facing.y * TILE_MAP.tileSize,
    };
}

function placeSelectedInFront() {
    const me = getMe();
    const selection = placementSelection(me);
    if (!selection) return false;
    const point = frontPlacementTile(me);
    if (!canBuildAt(point, selection.forCore)) {
        showFeedback(selection.forCore ? "目の前にはCOREを置けません" : "目の前には配置できません");
        return true;
    }
    send("PLACE_FRONT");
    return true;
}

function nearestAt(items, point) {
    return items.slice().sort((a, b) => distance(point, a) - distance(point, b))[0];
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function updateLocalPrediction(dt) {
    const serverMe = getMe();
    if (!predictedLocal || !serverMe || !["preparing", "wave"].includes(state.phase)) return;
    const input = Math.hypot(localMove.x, localMove.y);
    if (predictedLocal.exhausted && predictedLocal.stamina >= 28) predictedLocal.exhausted = false;
    predictedLocal.dashing = !serverMe.down && !serverMe.movingCore
        && dashRequested && !predictedLocal.exhausted && input > .12 && predictedLocal.stamina > 0;
    if (predictedLocal.dashing) {
        predictedLocal.stamina = Math.max(0, predictedLocal.stamina - 38 * dt);
        if (predictedLocal.stamina <= 0) {
            predictedLocal.exhausted = true;
            predictedLocal.dashing = false;
        }
    } else {
        predictedLocal.stamina = Math.min(100, predictedLocal.stamina + 24 * dt);
    }

    const speed = serverMe.down ? 45 : serverMe.movingCore ? 82 : predictedLocal.dashing ? 265 : 155;
    const nextX = clamp(predictedLocal.x + localMove.x * speed * dt, 25, WORLD.width - 25);
    const nextY = clamp(predictedLocal.y + localMove.y * speed * dt, 25, WORLD.height - 25);
    if (canPredictOccupy(nextX, predictedLocal.y, 5)) predictedLocal.x = nextX;
    if (canPredictOccupy(predictedLocal.x, nextY, 5)) predictedLocal.y = nextY;
}

function canPredictOccupy(x, y, radius) {
    if (x - radius < 0 || y - radius < 0 || x + radius > WORLD.width || y + radius > WORLD.height) return false;
    for (const area of AREAS) {
        const overlaps = x + radius > area.x && x - radius < area.x + area.width
            && y + radius > area.y && y - radius < area.y + area.height;
        if (overlaps && !state.areas[area.id]) return false;
    }
    const size = TILE_MAP.tileSize;
    const minColumn = Math.floor((x - radius) / size);
    const maxColumn = Math.floor((x + radius) / size);
    const minRow = Math.floor((y - radius) / size);
    const maxRow = Math.floor((y + radius) / size);
    for (let row = minRow; row <= maxRow; row++) {
        for (let column = minColumn; column <= maxColumn; column++) {
            const symbol = TILE_MAP.rows[row]?.[column];
            if (!symbol || TILE_MAP.legend[symbol]?.solid) return false;
        }
    }
    if (state.slots.some(slot => slot.defense && ["block", "barricade"].includes(slot.defense.type)
            && Math.hypot(x - slot.x, y - slot.y) < radius + 18)) return false;
    return true;
}

function animate(now = performance.now()) {
    const dt = Math.min(.05, Math.max(0, (now - lastFrameAt) / 1000));
    lastFrameAt = now;
    updateLocalPrediction(dt);
    draw();
    requestAnimationFrame(animate);
}

function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const me = getMe();
    const cameraTarget = predictedLocal || me;
    if (cameraTarget) {
        camera.x += (cameraTarget.x - camera.x) * .12;
        camera.y += (cameraTarget.y - camera.y) * .12;
        const halfW = canvas.width / scale / 2, halfH = canvas.height / scale / 2;
        camera.x = clamp(camera.x, halfW, WORLD.width - halfW);
        camera.y = clamp(camera.y, halfH, WORLD.height - halfH);
    }
    ctx.setTransform(scale, 0, 0, scale, canvas.width / 2 - camera.x * scale, canvas.height / 2 - camera.y * scale);
    drawWorld();
    if (state) {
        drawAreas();
        drawBreakers();
        drawPlacementPreview();
        drawCore();
        drawShops();
        drawResources();
        drawTrapSlots();
        drawEnemies();
        drawPlayers();
        drawInteractionPrompt();
        drawHitEffects();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (state?.phase === "wave" && state.blackoutActive) drawBlackout();
    drawJoystick();
}

function drawBlackout() {
    const me = predictedLocal || getMe();
    if (!me) return;
    const x = (me.x - camera.x) * scale + canvas.width / 2;
    const y = (me.y - camera.y) * scale + canvas.height / 2;
    const remaining = (state.trippedBreakers || []).length;
    const total = Math.max(1, state.blackoutBreakerTotal || remaining);
    const severity = remaining / total;
    const flicker = Math.sin(performance.now() / 83) * 5;
    const lightRadius = 235 + (1 - severity) * 110 + flicker;
    const edgeDarkness = Math.round(54 + severity * 34);
    const light = ctx.createRadialGradient(x, y, 55, x, y, lightRadius);
    light.addColorStop(0, "rgb(1 5 8 / 0%)");
    light.addColorStop(.48, "rgb(1 5 8 / 20%)");
    light.addColorStop(1, `rgb(1 5 8 / ${edgeDarkness}%)`);
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawWorld() {
    ctx.imageSmoothingEnabled = false;
    const size = TILE_MAP.tileSize;
    const viewWidth = canvas.width / scale;
    const viewHeight = canvas.height / scale;
    const minColumn = clamp(Math.floor((camera.x - viewWidth / 2) / size) - 1, 0, TILE_MAP.rows[0].length - 1);
    const maxColumn = clamp(Math.ceil((camera.x + viewWidth / 2) / size) + 1, 0, TILE_MAP.rows[0].length - 1);
    const minRow = clamp(Math.floor((camera.y - viewHeight / 2) / size) - 1, 0, TILE_MAP.rows.length - 1);
    const maxRow = clamp(Math.ceil((camera.y + viewHeight / 2) / size) + 1, 0, TILE_MAP.rows.length - 1);
    ctx.fillStyle = "#080808";
    ctx.fillRect(camera.x - viewWidth / 2 - size, camera.y - viewHeight / 2 - size,
        viewWidth + size * 2, viewHeight + size * 2);
    for (let row = minRow; row <= maxRow; row++) {
        for (let column = minColumn; column <= maxColumn; column++) {
            const symbol = TILE_MAP.rows[row][column];
            const tile = TILE_MAP.legend[symbol];
            const x = column * size, y = row * size;
            ctx.fillStyle = tile.color;
            ctx.fillRect(x, y, size, size);
            if (!tile.solid) {
                ctx.strokeStyle = "rgb(0 0 0 / 5%)";
                ctx.lineWidth = 1;
                ctx.strokeRect(x + .5, y + .5, size - 1, size - 1);
            }
        }
    }
    if (DEBUG_MODE) SPAWN_POINTS.forEach(drawDebugSpawn);
    ctx.strokeStyle = "#5f5f5f"; ctx.lineWidth = 3; ctx.strokeRect(1, 1, WORLD.width - 2, WORLD.height - 2);
}

function drawDebugSpawn(spawn) {
    const incoming = Boolean(state && state.phase === "wave" && state.activeSpawns.includes(spawn.id));
    const failed = incoming && state.roundEvent === "door_failure" && state.failedSpawn === spawn.id;
    const pulse = (Math.sin(performance.now() / 130) + 1) / 2;
    ctx.save();
    ctx.strokeStyle = failed ? "#d8d8d8" : incoming ? "#ffffff" : "#707070";
    ctx.lineWidth = incoming ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(spawn.x, spawn.y);
    for (const point of spawn.route) ctx.lineTo(point.x, point.y);
    ctx.stroke();
    if (incoming) { ctx.shadowColor = "white"; ctx.shadowBlur = 9 + pulse * 8; }
    ctx.fillStyle = incoming ? "#f2f2f2" : "#555"; ctx.beginPath(); ctx.arc(spawn.x, spawn.y, incoming ? 18 + pulse * 2 : 12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    ctx.fillStyle = incoming ? "#fff" : "#888"; ctx.font = "900 10px ui-monospace, monospace"; ctx.textAlign = "center";
    const labelY = spawn.y < 60 ? spawn.y + 43 : spawn.y > WORLD.height - 60 ? spawn.y - 34 : spawn.y - 31;
    ctx.fillText(failed ? `DEBUG FAILED: ${spawn.name}` : incoming ? `DEBUG ACTIVE: ${spawn.name}` : `DEBUG: ${spawn.name}`, spawn.x, labelY);
}

function drawAreas() {
    for (const area of AREAS) {
        const unlocked = state.areas[area.id];
        ctx.save();
        if (!unlocked) {
            ctx.fillStyle = "rgb(7 8 9 / 72%)";
            ctx.fillRect(area.x, area.y, area.width, area.height);
        }
        ctx.fillStyle = unlocked ? "rgb(255 255 255 / 72%)" : "#ffffff";
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 5;
        ctx.font = "900 13px ui-monospace, monospace"; ctx.textAlign = "center";
        ctx.fillText(area.name, area.labelX, area.labelY);
        ctx.shadowBlur = 0;

        if (!unlocked) {
            ctx.fillStyle = "#d8d8d8";
            ctx.fillRect(area.terminalX - 15, area.terminalY - 15, 30, 30);
            ctx.strokeStyle = "#79d8ff"; ctx.lineWidth = 2;
            ctx.strokeRect(area.terminalX - 18, area.terminalY - 18, 36, 36);
            ctx.fillStyle = "white"; ctx.font = "800 9px ui-monospace, monospace";
            ctx.fillText("UNLOCK", area.terminalX, area.terminalY - 24);
        }
        ctx.restore();
    }
}

function drawBreakers() {
    const tripped = new Set(state.trippedBreakers || []);
    for (const breaker of BREAKER_TERMINALS) {
        if (breaker.requiredArea && !state.areas[breaker.requiredArea]) continue;
        const needsReset = state.blackoutActive && tripped.has(breaker.id);
        const pulse = (Math.sin(performance.now() / 130) + 1) / 2;
        ctx.save();
        ctx.fillStyle = needsReset ? "#ff5964" : "#8b8b8b";
        ctx.strokeStyle = needsReset ? "#fff" : "#d8d8d8";
        ctx.lineWidth = 2;
        if (needsReset) {
            ctx.shadowColor = "#ff5964";
            ctx.shadowBlur = 10 + pulse * 8;
        }
        ctx.fillRect(breaker.x - 10, breaker.y - 14, 20, 28);
        ctx.strokeRect(breaker.x - 10, breaker.y - 14, 20, 28);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(breaker.x, breaker.y - 7);
        ctx.lineTo(breaker.x, breaker.y + 6);
        ctx.stroke();
        if (needsReset) {
            ctx.fillStyle = "#ff5964";
            ctx.font = "900 9px ui-monospace, monospace";
            ctx.textAlign = "center";
            ctx.fillText("RESET", breaker.x, breaker.y - 22);
        }
        ctx.restore();
    }
}

function drawPlacementPreview() {
    const me = getMe();
    const selection = placementSelection(me);
    if (!selection) return;
    const point = frontPlacementTile(me);
    const valid = canBuildAt(point, selection.forCore);
    const size = TILE_MAP.tileSize;
    ctx.save();
    ctx.fillStyle = valid ? "rgb(121 216 255 / 38%)" : "rgb(255 89 100 / 32%)";
    ctx.fillRect(point.x - size / 2 + 2, point.y - size / 2 + 2, size - 4, size - 4);
    ctx.strokeStyle = valid ? "#79d8ff" : "#ff5964";
    ctx.lineWidth = 3;
    ctx.strokeRect(point.x - size / 2 + 2, point.y - size / 2 + 2, size - 4, size - 4);
    ctx.fillStyle = valid ? "#111" : "#fff";
    ctx.font = "950 9px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(valid ? "R PLACE" : "BLOCKED", point.x, point.y + 3);
    ctx.restore();
}

function drawCore() {
    const core = state.core;
    const carrier = state.players.find(player => player.movingCore);
    let x = core.x;
    let y = core.y;
    let size = 38;
    let carrierY = y;
    if (carrier) {
        const carrierPosition = carrier.id === myPlayerId && predictedLocal
            ? predictedLocal : smoothEntity("player", carrier);
        x = carrierPosition.x;
        y = carrierPosition.y - 22;
        carrierY = carrierPosition.y;
        size = 26;
    }
    const ratio = clamp(core.hp / Math.max(1, core.maxHp), 0, 1);
    ctx.save();
    if (carrier) {
        ctx.strokeStyle = "rgb(255 255 255 / 62%)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 9, y + size / 2);
        ctx.lineTo(x - 5, carrierY - 4);
        ctx.moveTo(x + 9, y + size / 2);
        ctx.lineTo(x + 5, carrierY - 4);
        ctx.stroke();
    }
    ctx.fillStyle = "#666";
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    ctx.fillStyle = "#79d8ff";
    ctx.fillRect(x - size / 2, y + size / 2 - size * ratio, size, size * ratio);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
    if (core.shield > 0) {
        ctx.strokeStyle = "#70bfff";
        ctx.globalAlpha = .8;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - size / 2 - 5, y - size / 2 - 5, size + 10, size + 10);
    }
    const hitAge = performance.now() - coreHitStarted;
    if (hitAge < 350) {
        ctx.strokeStyle = "#ff4e58"; ctx.globalAlpha = 1 - hitAge / 350; ctx.lineWidth = 9;
        const hitSize = 48 + hitAge / 8;
        ctx.strokeRect(x - hitSize / 2, y - hitSize / 2, hitSize, hitSize);
    }
    ctx.restore();
    if (!carrier) {
        ctx.fillStyle = "white"; ctx.font = "900 8px ui-monospace, monospace"; ctx.textAlign = "center";
        ctx.fillText("CORE", x, y + 3);
    }
}

function drawShops() {
    SHOP_UNITS.filter(isUnlockedPoint)
        .forEach(shop => drawStation(shop, shop.label, "#d8d8d8", "#111"));
    if (isUnlockedPoint(MED)) drawStation(MED, "MED BAY", "#ff5964");
    if (isUnlockedPoint(WOODCUTTER)) drawStation(WOODCUTTER, "WOODCUTTER", "#a8a8a8");
    if (isUnlockedPoint(QUARRY)) drawStation(QUARRY, "QUARRY", "#808080");
    if (isUnlockedPoint(WORKBENCH)) drawStation(WORKBENCH, "WORKBENCH", "#79d8ff");
}

function isUnlockedPoint(point) {
    const area = AREAS.find(candidate => point.x >= candidate.x
        && point.x <= candidate.x + candidate.width
        && point.y >= candidate.y && point.y <= candidate.y + candidate.height);
    return !area || state.areas[area.id];
}

function drawStation(station, label, color, labelColor = "#111") {
    ctx.fillStyle = color; ctx.fillRect(station.x - 20, station.y - 20, 40, 40);
    ctx.fillStyle = "#111"; ctx.fillRect(station.x - 11, station.y - 11, 22, 22);
    ctx.fillStyle = labelColor; ctx.font = "900 9px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(label, station.x, station.y + 31);
}

function drawResources() {
    if (state.areas["transit-hall"]) {
        for (const type of ["wood", "ore"]) {
            const pocket = (state.resources || []).filter(node =>
                node.id.startsWith(`early-${type}-`));
            if (!pocket.length) continue;
            const centerX = pocket.reduce((sum, node) => sum + node.x, 0) / pocket.length;
            const labelY = type === "wood"
                ? Math.min(...pocket.map(node => node.y)) - 35
                : Math.max(...pocket.map(node => node.y)) + 47;
            ctx.fillStyle = "#a8a8a8";
            ctx.font = "900 11px ui-monospace, monospace";
            ctx.textAlign = "center";
            ctx.fillText(`${type.toUpperCase()} ROOM`, centerX, labelY);
        }
    }
    for (const node of state.resources || []) {
        if (!node.available) continue;
        const bob = Math.sin(performance.now() / 260 + node.x * .01) * 3;
        ctx.save();
        ctx.translate(node.x, node.y + bob);
        ctx.fillStyle = node.type === "wood" ? "#b0b0b0" : "#777";
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1.5;
        if (node.type === "wood") {
            ctx.fillRect(-8, -6, 16, 12);
            ctx.strokeRect(-8, -6, 16, 12);
        } else {
            ctx.beginPath();
            ctx.moveTo(0, -10); ctx.lineTo(10, -2); ctx.lineTo(6, 9);
            ctx.lineTo(-7, 8); ctx.lineTo(-10, -3); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
    }
}

function drawTrapSlots() {
    for (const slot of state.slots) {
        if (!slot.locked && slot.defense) drawDefense(slot);
    }
}

function drawDefense(slot) {
    const defense = slot.defense;
    if (defense.type === "block") {
        ctx.fillStyle = "#666"; ctx.fillRect(slot.x - 18, slot.y - 18, 36, 36);
        ctx.fillStyle = "#929292"; ctx.fillRect(slot.x - 14, slot.y - 14, 28, 7);
        ctx.fillStyle = "#444"; ctx.fillRect(slot.x - 14, slot.y - 3, 10, 13);
        ctx.strokeStyle = "#bbb"; ctx.lineWidth = 2; ctx.strokeRect(slot.x - 18, slot.y - 18, 36, 36);
    } else if (defense.type === "turret") {
        ctx.fillStyle = "#79d8ff"; ctx.fillRect(slot.x - 18, slot.y - 18, 36, 36);
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(slot.x, slot.y); ctx.lineTo(slot.x, slot.y - 29); ctx.stroke();
    } else if (defense.type === "wire") {
        ctx.strokeStyle = "#b8b8b8"; ctx.lineWidth = 3; ctx.beginPath();
        for (let i = -24; i <= 24; i += 8) { ctx.moveTo(slot.x + i, slot.y - 20); ctx.lineTo(slot.x + i + 10, slot.y + 20); }
        ctx.stroke();
    } else if (defense.type === "mine") {
        ctx.fillStyle = "#ff5964"; ctx.beginPath(); ctx.arc(slot.x, slot.y, 17, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(slot.x, slot.y, 5, 0, Math.PI * 2); ctx.fill();
    } else {
        ctx.fillStyle = "#666"; ctx.fillRect(slot.x - 30, slot.y - 12, 60, 24);
        ctx.strokeStyle = "#bbb"; ctx.lineWidth = 3; ctx.strokeRect(slot.x - 30, slot.y - 12, 60, 24);
    }
    if (defense.type !== "mine") drawBar(slot.x - 25, slot.y + 29, 50, 4, defense.hp / defense.maxHp, "#fff");
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
    const colors = { grunt: "#707070", runner: "#999", brute: "#505050", boss: "#2f2f2f" };
    for (const enemy of state.enemies) {
        if (enemy.hp <= 0) continue;
        const p = smoothEntity("enemy", enemy), radius = enemyRadius(enemy);
        const recentHit = hitEffects.find(effect => effect.effect === "hit" && effect.damage > 0
            && performance.now() - effect.started < 260
            && Math.hypot(effect.x - p.x, effect.y - p.y) < radius + 18);
        if (recentHit) {
            ctx.save();
            ctx.globalAlpha = 1 - (performance.now() - recentHit.started) / 260;
            ctx.fillStyle = "#ff3b48";
            ctx.shadowColor = "#ff3b48";
            ctx.shadowBlur = 24;
            ctx.beginPath(); ctx.arc(p.x, p.y, radius + 7, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
        ctx.fillStyle = colors[enemy.type] || colors.grunt; ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = enemy.type === "boss" ? "#fff" : "#c8c8c8"; ctx.lineWidth = enemy.type === "boss" ? 5 : 2; ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(p.x - radius * .3, p.y - 3, 3, 0, Math.PI * 2); ctx.arc(p.x + radius * .3, p.y - 3, 3, 0, Math.PI * 2); ctx.fill();
        if (enemy.type !== "grunt") { ctx.fillStyle = "white"; ctx.font = "800 9px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(enemy.type.toUpperCase(), p.x, p.y + radius + 15); }
    }
}

function drawPlayers() {
    for (const player of state.players) {
        const isLocal = player.id === myPlayerId && predictedLocal;
        const p = isLocal ? predictedLocal : smoothEntity("player", player);
        const rescuers = state.players.filter(worker => worker.action === player.id);
        if (rescuers.length) drawReviveEffect(p.x, p.y, Math.max(...rescuers.map(worker => worker.actionProgress / 4)));
        ctx.save();
        if (player.down) { ctx.translate(p.x, p.y + 8); ctx.scale(1.35, .65); }
        else ctx.translate(p.x, p.y);
        ctx.fillStyle = player.down ? "#ff5964" : player.id === myPlayerId ? "#79d8ff" : "#d8d8d8";
        const playerSize = 10;
        ctx.fillRect(-playerSize / 2, -playerSize / 2, playerSize, playerSize);
        if (player.id === myPlayerId) { ctx.strokeStyle = "white"; ctx.lineWidth = 1.5; ctx.strokeRect(-playerSize / 2, -playerSize / 2, playerSize, playerSize); }
        ctx.restore();
        if (player.id === myPlayerId) drawLocalWeaponCooldown(p.x, p.y, player);
        ctx.textAlign = "center"; ctx.fillStyle = "#a8a8a8"; ctx.font = "800 11px system-ui";
        ctx.fillText(player.down ? `${player.name} — DOWN` : player.name, p.x, p.y - 14);
        if (player.action) drawBar(p.x - 30, p.y + 37, 60, 5, player.actionProgress / 4, "#79d8ff");
    }
    ctx.textAlign = "left";
}

function drawInteractionPrompt() {
    const interaction = findNearestInteraction();
    if (!interaction || !actionMenu.classList.contains("hidden")) return;
    const x = interaction.target.x;
    const y = interaction.target.y - 34;
    ctx.save();
    ctx.fillStyle = "white";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#111";
    ctx.font = "900 10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("R", x, y + 1);
    ctx.restore();
}

function drawLocalWeaponCooldown(x, y, player) {
    if (player.down || player.cooldown <= 0) return;
    const duration = Math.max(.01, player.cooldownMax || player.cooldown);
    const progress = 1 - Math.min(1, player.cooldown / duration);
    ctx.save();
    ctx.fillStyle = "rgb(5 12 16 / 72%)";
    ctx.fillRect(x - 20, y - 42, 40, 4);
    ctx.fillStyle = "rgb(255 255 255 / 82%)";
    ctx.fillRect(x - 20, y - 42, 40 * progress, 4);
    ctx.restore();
}

function drawReviveEffect(x, y, progress) {
    const pulse = (Math.sin(performance.now() / 110) + 1) / 2;
    ctx.save(); ctx.strokeStyle = "#79d8ff"; ctx.lineWidth = 4; ctx.shadowColor = "#79d8ff"; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(x, y, 34 + pulse * 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); ctx.stroke(); ctx.restore();
    ctx.fillStyle = "#79d8ff"; ctx.font = "900 10px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(`REVIVING ${Math.round(progress * 100)}%`, x, y - 48);
}

function drawHitEffects() {
    const now = performance.now();
    hitEffects = hitEffects.filter(effect => now - effect.started
        < (effect.effect === "core-pulse" || effect.effect === "pickup" || effect.credits > 0 ? 900 : 360));
    for (const effect of hitEffects) {
        if (effect.effect === "core-pulse") {
            const progress = (now - effect.started) / 900;
            ctx.save();
            ctx.globalAlpha = 1 - progress;
            ctx.strokeStyle = "#79d8ff";
            ctx.shadowColor = "#79d8ff";
            ctx.shadowBlur = 22;
            ctx.lineWidth = 12 * (1 - progress) + 2;
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, 65 + progress * 210, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            continue;
        }
        if (effect.effect === "pickup") {
            const progress = (now - effect.started) / 900;
            ctx.save();
            ctx.globalAlpha = 1 - progress;
            ctx.fillStyle = "white";
            ctx.font = "900 11px ui-monospace, monospace";
            ctx.textAlign = "center";
            ctx.fillText(effect.resource === "wood" ? "+WOOD" : "+ORE",
                effect.x, effect.y - 18 - progress * 22);
            ctx.restore();
            continue;
        }
        const age = now - effect.started;
        if (age < 360) {
            const progress = age / 360;
            ctx.save(); ctx.globalAlpha = 1 - progress; ctx.strokeStyle = "#ff5964";
            if (!["bat", "mine"].includes(effect.weapon) && progress < .55) {
                ctx.lineWidth = 1.35;
                ctx.beginPath(); ctx.moveTo(effect.fromX, effect.fromY); ctx.lineTo(effect.x, effect.y); ctx.stroke();
            }
            ctx.restore();
        }
        if (effect.credits > 0 && age < 900) {
            const progress = age / 900;
            ctx.save();
            ctx.globalAlpha = 1 - progress;
            ctx.fillStyle = "#79d8ff";
            ctx.shadowColor = "#79d8ff";
            ctx.shadowBlur = 8;
            ctx.font = "950 13px ui-monospace, monospace";
            ctx.textAlign = "center";
            ctx.fillText(`+${effect.credits}g`, effect.x, effect.y - 24 - progress * 24);
            ctx.restore();
        }
    }
    ctx.textAlign = "left";
}

function drawBar(x, y, width, height, progress, color) {
    ctx.fillStyle = "#181818"; ctx.fillRect(x, y, width, height);
    ctx.fillStyle = color; ctx.fillRect(x, y, width * clamp(progress, 0, 1), height);
}

function drawJoystick() {
    if (!joystick) return;
    const dprX = canvas.width / innerWidth, dprY = canvas.height / innerHeight;
    ctx.globalAlpha = .6; ctx.strokeStyle = "#ddd"; ctx.lineWidth = 3 * dprX;
    ctx.beginPath(); ctx.arc(joystick.originX * dprX, joystick.originY * dprY, 58 * dprX, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#ddd"; ctx.beginPath(); ctx.arc(joystick.x * dprX, joystick.y * dprY, 23 * dprX, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[char]); }

async function initialize() {
    menuStatus.textContent = "ゲームサーバーに接続しています…";
    connect();
    await mapReadyPromise;
    animate();
}

initialize();
