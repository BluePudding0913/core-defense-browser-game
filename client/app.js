"use strict";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const menu = document.querySelector("#menu");
const menuStatus = document.querySelector("#menu-status");
const startButton = document.querySelector("#start");
const nameInput = document.querySelector("#player-name");
const roomBrowser = document.querySelector("#room-browser");
const roomLobby = document.querySelector("#room-lobby");
const roomList = document.querySelector("#room-list");
const roomMembers = document.querySelector("#room-members");
const roomCode = document.querySelector("#room-code");
const roomOwner = document.querySelector("#room-owner");
const createRoomButton = document.querySelector("#create-room");
const joinRoomsButton = document.querySelector("#join-rooms");
let creatingRoom = false;
const refreshRoomsButton = document.querySelector("#refresh-rooms");
const readyRoomButton = document.querySelector("#ready-room");
const leaveRoomButton = document.querySelector("#leave-room");
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
const slotPopup = document.querySelector("#slot-popup");
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
let WORKBENCHES = [];
let TILE_MAP = { tileSize: 40, legend: {}, rows: [] };
let AREAS = [];
let SPAWN_POINTS = [];
let SHOP_UNITS = [];
let BREAKER_TERMINALS = [];
let PREP_CONSOLE = null;
const BUILD_INFO = {
    block: { name: "BLOCK", wood: 4, ore: 0, description: "通路を塞ぐ基本ブロック" },
    turret: { name: "AUTO TURRET", wood: 4, ore: 8, description: "範囲内の敵を自動射撃" },
    wire: { name: "BARBED WIRE", wood: 2, ore: 4, description: "通過する敵を減速" },
    mine: { name: "MINE", wood: 1, ore: 5, description: "接近した敵へ範囲ダメージ" },
    barricade: { name: "BARRICADE", wood: 6, ore: 2, description: "高耐久の進路妨害" },
};
const WEAPON_FIELDS = Object.freeze({
    dualPistol: { owned: "ownsDualPistol", ammo: "dualPistolAmmo", capacity: 60 },
    shotgun: { owned: "ownsShotgun", ammo: "shotgunAmmo", capacity: 30 },
    smg: { owned: "ownsSmg", ammo: "smgAmmo", capacity: 90 },
    rifle: { owned: "ownsRifle", ammo: "rifleAmmo", capacity: 24 },
    sniper: { owned: "ownsSniper", ammo: "sniperAmmo", capacity: 16 },
    revolver: { owned: "ownsRevolver", ammo: "revolverAmmo", capacity: 36 },
    lmg: { owned: "ownsLmg", ammo: "lmgAmmo", capacity: 150 },
});
const WEAPON_AMMO_REFILL_COST = 120;
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
let connectionTarget = { mode: "directory", roomId: null };
let reconnectTimer;
let myPlayerId;
let state;
let scale = 1;
let camera = { x: 0, y: 0 };
let lastNoticeVersion = -1;
let lastCoreHp;
let coreHitStarted = 0;
let feedbackTimer;
let roundIntroTimer;
let slotPopupTimer;
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
    floorOrigin = { ...map.core };
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
    BREAKER_TERMINALS = map.breakerTerminals.map(breaker => ({ ...breaker }));
    WORKBENCHES = map.workbenchUnits.map(workbench => ({ ...workbench }));
    PREP_CONSOLE = { ...map.prepConsole };
    camera = { x: CORE.x, y: CORE.y };
    if (!mapReady) {
        mapReady = true;
        resolveMapReady();
    }
}

function validateMap(map) {
    if (map?.version !== 5) throw new Error(`未対応のマップバージョン: ${map?.version}`);
    if (!isPositiveNumber(map.world?.width) || !isPositiveNumber(map.world?.height)) {
        throw new Error("マップの幅と高さが不正です");
    }
    if (!isPoint(map.core) || !isPoint(map.stations?.armory) || !isPoint(map.stations?.medBay)
            || !isPoint(map.stations?.woodcutter) || !isPoint(map.stations?.quarry)
            || !isPoint(map.stations?.workbench) || !isPoint(map.prepConsole)) {
        throw new Error("COREまたは施設の座標が不正です");
    }
    for (const [name, values] of [["areas", map.areas],
        ["spawnPoints", map.spawnPoints], ["trapSlots", map.trapSlots],
        ["resourceNodes", map.resourceNodes], ["shopUnits", map.shopUnits],
        ["workbenchUnits", map.workbenchUnits], ["breakerTerminals", map.breakerTerminals]]) {
        if (!Array.isArray(values) || values.some(value => !value || typeof value !== "object")) {
            throw new Error(`${name}の配列または要素が不正です`);
        }
    }
    const tiles = map.tileMap;
    if (!Number.isInteger(tiles?.tileSize) || tiles.tileSize <= 0
            || !Array.isArray(tiles.rows) || !tiles.legend || typeof tiles.legend !== "object") {
        throw new Error("タイルマップ定義が不正です");
    }
    const columns = map.world.width / tiles.tileSize;
    const rows = map.world.height / tiles.tileSize;
    if (!Number.isInteger(columns) || !Number.isInteger(rows) || tiles.rows.length !== rows
            || tiles.rows.some(row => typeof row !== "string" || row.length !== columns
                || [...row].some(symbol => !tiles.legend[symbol]))) {
        throw new Error("タイルマップの行数、列数、または記号が不正です");
    }
    if (map.spawnPoints.length === 0) throw new Error("侵入口がありません");
    requireUniqueIds(map.areas, "areas");
    validateAreaTiles(map.areas, tiles);
    requireUniqueIds(map.spawnPoints, "spawnPoints");
    requireUniqueIds(map.trapSlots, "trapSlots");
    requireUniqueIds(map.resourceNodes, "resourceNodes");
    requireUniqueIds(map.shopUnits, "shopUnits");
    requireUniqueIds(map.workbenchUnits, "workbenchUnits");
    requireUniqueIds(map.breakerTerminals, "breakerTerminals");
    validateMapPositions(map);
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
}

function validateMapPositions(map) {
    const typeAt = point => map.tileMap.legend[map.tileMap.rows[
        Math.floor(point.y / map.tileMap.tileSize)]?.[Math.floor(point.x / map.tileMap.tileSize)]];
    const check = (point, floor = true) => {
        if (!isPoint(point) || point.x < 0 || point.y < 0
                || point.x >= map.world.width || point.y >= map.world.height
                || !typeAt(point) || (floor && typeAt(point).solid)) {
            throw new Error(`マップ内の座標が不正です: ${point?.id || "point"}`);
        }
    };
    check(map.core);
    Object.values(map.stations).forEach(point => check(point));
    for (const area of map.areas) {
        check({ id: area.id, x: area.terminalX, y: area.terminalY }, false);
        check({ id: area.id, x: area.labelX, y: area.labelY }, false);
    }
    for (const point of [...map.trapSlots, ...map.resourceNodes, ...map.shopUnits,
        ...map.workbenchUnits, ...map.breakerTerminals, map.prepConsole, ...map.spawnPoints]) {
        check(point);
        if (point.requiredArea != null) {
            const area = map.areas.find(area => area.id === point.requiredArea);
            if (!area?.tiles.some(tile => tile.column === Math.floor(point.x / map.tileMap.tileSize)
                    && tile.row === Math.floor(point.y / map.tileMap.tileSize))) {
                throw new Error(`施設の解放エリアが不正です: ${point.id}`);
            }
        }
    }
    for (const spawn of map.spawnPoints) {
        if (Array.isArray(spawn.route)) spawn.route.forEach(point => check(point));
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
    const parameters = new URLSearchParams({ session: clientSessionId });
    const access = URL_PARAMETERS.get("access");
    if (access) parameters.set("access", access);
    if (connectionTarget.mode === "directory") parameters.set("directory", "1");
    else parameters.set("room", connectionTarget.roomId);
    menuStatus.textContent = connectionTarget.mode === "directory"
        ? "ルーム一覧に接続しています…" : "ルームに接続しています…";
    socket = new WebSocket(`${protocol}://${host}:${serverPort}/?${parameters}`);
    creatingRoom = false;
    updateRoomButtons();
    const connectingSocket = socket;
    clearTimeout(connectionAttemptTimer);
    connectionAttemptTimer = setTimeout(() => {
        if (socket === connectingSocket && connectingSocket.readyState === WebSocket.CONNECTING) {
            menuStatus.textContent = "ゲームサーバーに接続できません。公開されたWSSサーバーが必要です。";
        }
    }, 6000);
    socket.addEventListener("open", () => {
        if (socket !== connectingSocket) return;
        clearTimeout(connectionAttemptTimer);
        if (connectionTarget.mode === "directory") {
            menuStatus.textContent = "";
            updateRoomButtons();
            setMenuView("home");
            connectingSocket.send("LIST_ROOMS");
        } else {
            menuStatus.textContent = "ゲームサーバーからマップデータを受信しています…";
        }
    });
    socket.addEventListener("message", ({ data }) => {
        if (socket !== connectingSocket) return;
        let message;
        try { message = JSON.parse(data); } catch { return; }
        if (message.type === "rooms") {
            renderRoomList(message.rooms || []);
            return;
        }
        if (message.type === "room-created") {
            enterRoom(message.roomId);
            return;
        }
        if (message.type === "map") {
            try {
                applyMap(message.map);
                menuStatus.textContent = "";
            } catch (error) {
                console.error(error);
                menuStatus.textContent = "サーバーのマップデータが不正です。サーバーを再ビルドしてください。";
                startButton.disabled = true;
            }
            return;
        }
        if (message.type === "welcome") {
            myPlayerId = message.playerId;
            connectionTarget.roomId = message.roomId;
            acknowledgeInputs(message.ackInput);
            nextInputSequence = Math.max(nextInputSequence, lastAcknowledgedInput + 1);
            lastMove = "";
            send(`HELLO:${nameInput.value || "Player"}`);
            sendMovement(true);
        }
        if (message.type === "state") receiveState(message);
        if (message.type === "log") receiveLog(message.version, message.message);
        if (message.type === "effect" && ["hit", "core-pulse", "pickup", "player-hit"].includes(message.effect)) {
            hitEffects.push({ ...message, started: performance.now() });
            if (hitEffects.length > 100) hitEffects.shift();
        }
        if (message.type === "feedback" || message.type === "error") showFeedback(message.message);
        if (message.type === "error" && connectionTarget.mode === "directory") {
            creatingRoom = false;
            updateRoomButtons();
            menuStatus.textContent = message.message;
        }
    });
    socket.addEventListener("close", () => {
        if (socket !== connectingSocket) return;
        clearTimeout(connectionAttemptTimer);
        smoothed.clear();
        predictedLocal = null;
        localMove = { x: 0, y: 0 };
        dashRequested = false;
        pendingInputs = [];
        lastMove = "";
        menu.classList.remove("hidden");
        hud.classList.add("hidden");
        closeActionMenu();
        menuStatus.textContent = connectionTarget.mode === "directory"
            ? "ルーム一覧から切断されました。再接続します…"
            : "ルームから切断されました。再接続します…";
        creatingRoom = false;
        updateRoomButtons();
        startButton.disabled = true;
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 2000);
    });
    socket.addEventListener("error", () => {
        if (socket !== connectingSocket) return;
        clearTimeout(connectionAttemptTimer);
        menuStatus.textContent = "接続できません。Javaサーバーを起動してください。";
    });
}

function switchConnection(target) {
    connectionTarget = target;
    clearTimeout(reconnectTimer);
    const previousSocket = socket;
    socket = undefined;
    if (previousSocket && previousSocket.readyState < WebSocket.CLOSING) previousSocket.close();
    connect();
}

function enterRoom(roomId) {
    if (typeof roomId !== "string" || !roomId) return;
    setMenuView("lobby");
    hitEffects = [];
    state = undefined;
    myPlayerId = undefined;
    roomBrowser.classList.add("hidden");
    roomLobby.classList.remove("hidden");
    nameInput.classList.add("hidden");
    roomCode.textContent = `ROOM ${roomId.toUpperCase()}`;
    roomMembers.innerHTML = "";
    readyRoomButton.disabled = true;
    startButton.classList.add("hidden");
    switchConnection({ mode: "room", roomId });
}

function leaveRoom() {
    setMenuView("home");
    hitEffects = [];
    state = undefined;
    myPlayerId = undefined;
    predictedLocal = null;
    roomLobby.classList.add("hidden");
    roomBrowser.classList.remove("hidden");
    nameInput.classList.remove("hidden");
    menu.classList.remove("hidden");
    hud.classList.add("hidden");
    switchConnection({ mode: "directory", roomId: null });
}

function renderRoomList(rooms) {
    rooms = rooms.filter(room => room.joinable);
    if (!rooms.length) {
        roomList.innerHTML = "<p>参加できるルームはありません</p>";
        return;
    }
    roomList.innerHTML = rooms.map(room => `<button type="button" class="room-entry"
            data-room="${escapeHtml(room.id)}" ${room.joinable ? "" : "disabled"}>
        <strong>${escapeHtml(room.owner)} のルーム</strong>
        <small>${room.players}/${room.capacity} · ${room.joinable ? "参加" : "プレイ中"}</small>
    </button>`).join("");
    roomList.querySelectorAll("button[data-room]").forEach(button =>
        button.addEventListener("click", () => enterRoom(button.dataset.room)));
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
    reconcileEnemySmoothing(next);
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
    updateRoomLobby(next);
    if (["preparing", "wave"].includes(next.phase)) {
        menu.classList.add("hidden");
        hud.classList.remove("hidden");
    } else if (["lobby", "won", "lost"].includes(next.phase)) {
        closeActionMenu();
        inventoryMenu.classList.add("hidden");
        menu.classList.remove("hidden");
        hud.classList.toggle("hidden", next.phase === "lobby");
    }
    if (!["preparing", "wave"].includes(next.phase)) closeActionMenu();
}

function updateRoomLobby(snapshot) {
    if (!["lobby", "won", "lost"].includes(snapshot.phase)) return;
    roomBrowser.classList.add("hidden");
    roomLobby.classList.remove("hidden");
    nameInput.classList.add("hidden");
    roomCode.textContent = `ROOM ${String(snapshot.roomId || "").toUpperCase()}`;
    const owner = snapshot.players.find(player => player.id === snapshot.roomOwnerId);
    roomOwner.textContent = `作成者: ${owner?.name || "接続待ち"}`;
    const humans = snapshot.players.filter(player => player.human);
    roomMembers.innerHTML = humans.map(player => `<div class="room-member ${player.id === snapshot.roomOwnerId || player.ready ? "ready" : ""}">
        <strong>${escapeHtml(player.name)}</strong>
        <span>${player.id === snapshot.roomOwnerId ? "host" : player.ready ? "準備完了" : "準備中"}</span>
    </div>`).join("");
    const me = snapshot.players.find(player => player.id === myPlayerId);
    const isOwner = myPlayerId === snapshot.roomOwnerId;
    readyRoomButton.classList.toggle("hidden", isOwner);
    readyRoomButton.disabled = !me || isOwner;
    readyRoomButton.textContent = me?.ready ? "取り消す" : "準備OK";
    startButton.classList.toggle("hidden", !isOwner);
    startButton.textContent = snapshot.phase === "lobby" ? "開始" : "もう一度プレイ";
    startButton.disabled = !isOwner || !snapshot.allReady;
    menuStatus.textContent = snapshot.phase === "won" ? "防衛成功"
        : snapshot.phase === "lost" ? "防衛失敗"
            : "";
}

function reconcileEnemySmoothing(next) {
    const restarted = state && (["won", "lost"].includes(state.phase)
        && ["lobby", "preparing"].includes(next.phase) || next.round < state.round);
    const previousIds = restarted
        ? new Set()
        : new Set((state?.enemies || []).map(enemy => enemy.id));
    const nextIds = new Set(next.enemies.map(enemy => enemy.id));
    for (const key of smoothed.keys()) {
        if (key.startsWith("enemy-") && (restarted || !nextIds.has(Number(key.slice(6))))) {
            smoothed.delete(key);
        }
    }
    for (const enemy of next.enemies) {
        if (!previousIds.has(enemy.id) || !smoothed.has(`enemy-${enemy.id}`)) {
            smoothed.set(`enemy-${enemy.id}`, { x: enemy.x, y: enemy.y });
        }
    }
}

function showRoundIntro(round) {
    roundIntro.textContent = `ROUND ${round}`;
    roundIntro.classList.remove("show");
    void roundIntro.offsetWidth;
    roundIntro.classList.add("show");
    clearTimeout(roundIntroTimer);
    roundIntroTimer = setTimeout(() => roundIntro.classList.remove("show"), 2400);
}

function setMenuView(view) {
    menu.dataset.view = view;
}
function updateRoomButtons() {
    const unavailable = !nameInput.value.trim() || creatingRoom
        || connectionTarget.mode !== "directory" || socket?.readyState !== WebSocket.OPEN;
    createRoomButton.disabled = unavailable;
    joinRoomsButton.disabled = unavailable;
}

nameInput.addEventListener("input", updateRoomButtons);
joinRoomsButton.addEventListener("click", () => {
    if (joinRoomsButton.disabled) return;
    setMenuView("join");
    refreshRoomsButton.click();
});
document.querySelector("#back-rooms").addEventListener("click", () => setMenuView("home"));

startButton.addEventListener("click", () => send("START"));
readyRoomButton.addEventListener("click", () => {
    const me = getMe();
    if (me) send(`ROOM_READY:${me.ready ? 0 : 1}`);
});
createRoomButton.addEventListener("click", () => {
    updateRoomButtons();
    if (createRoomButton.disabled) return;
    creatingRoom = true;
    updateRoomButtons();
    socket.send(`CREATE_ROOM:${nameInput.value.trim()}`);
    menuStatus.textContent = "ルームを作成しています…";
});
refreshRoomsButton.addEventListener("click", () => {
    if (connectionTarget.mode === "directory" && socket?.readyState === WebSocket.OPEN) {
        socket.send("LIST_ROOMS");
    }
});
leaveRoomButton.addEventListener("click", leaveRoom);

let equipmentOrder = loadEquipmentOrder();
function loadEquipmentOrder() {
    try {
        const saved = JSON.parse(localStorage.getItem("equipment-order") || "[]");
        return Array.isArray(saved) ? [...new Set(saved.filter(key => typeof key === "string"))] : [];
    } catch { return []; }
}

function reorderEquipment(sourceKey, targetKey) {
    const entries = equipmentEntries(getMe());
    const keys = entries.map(entry => entry.key);
    if (sourceKey === targetKey || !keys.includes(sourceKey) || !keys.includes(targetKey)) return false;
    const from = keys.indexOf(sourceKey), to = keys.indexOf(targetKey);
    keys.splice(from, 1);
    keys.splice(to, 0, sourceKey);
    equipmentOrder = [...keys, ...equipmentOrder.filter(key => !keys.includes(key))];
    try { localStorage.setItem("equipment-order", JSON.stringify(equipmentOrder)); } catch { }
    return true;
}

function equipmentEntries(me) {
    const entries = [
        { key: "weapon:bat", kind: "weapon", value: "bat", label: "BAT" },
        { key: "weapon:pistol", kind: "weapon", value: "pistol", label: "PISTOL" },
    ];
    if (me.ownsShotgun) entries.push({ key: "weapon:shotgun", kind: "weapon", value: "shotgun", label: "SHOTGUN" });
    if (me.ownsSmg) entries.push({ key: "weapon:smg", kind: "weapon", value: "smg", label: "SMG" });
    if (me.ownsRifle) entries.push({ key: "weapon:rifle", kind: "weapon", value: "rifle", label: "RIFLE" });
    if (me.ownsSniper) entries.push({ key: "weapon:sniper", kind: "weapon", value: "sniper", label: "SNIPER" });
    if (me.ownsDualPistol) entries.push({ key: "weapon:dualPistol", kind: "weapon", value: "dualPistol", label: "DUAL PISTOL" });
    if (me.ownsRevolver) entries.push({ key: "weapon:revolver", kind: "weapon", value: "revolver", label: "REVOLVER" });
    if (me.ownsLmg) entries.push({ key: "weapon:lmg", kind: "weapon", value: "lmg", label: "LMG" });
    for (const [type, info] of Object.entries(BUILD_INFO)) {
        if ((me.buildItems?.[type] || 0) > 0) entries.push({ key: `build:${type}`, kind: "build", value: type, label: info.name });
    }
    if (me.movingCore) entries.push({ key: "core", kind: "core", value: "core", label: "CORE" });
    return entries.sort((a, b) => {
        const rank = key => equipmentOrder.includes(key) ? equipmentOrder.indexOf(key) : equipmentOrder.length;
        return rank(a.key) - rank(b.key);
    });
}

function selectEquipment(entry) {
    const me = getMe();
    if (me?.movingCore && entry.kind === "weapon") {
        showFeedback("CORE運搬中は武器を使用できません");
        return;
    }
    if (entry.kind === "weapon") send(`WEAPON:${entry.value}`);
    else if (entry.kind === "build") send(`EQUIP_BUILD:${entry.value}`);
    showEquipmentPopup(entry.key);
}

function showEquipmentPopup(selectedKey) {
    const me = getMe();
    if (!me) return;
    const entries = equipmentEntries(me);
    slotPopup.innerHTML = entries.map((entry, index) => {
        const amount = entry.kind === "build" ? ` ×${me.buildItems?.[entry.value] || 0}` : "";
        return `<div class="${entry.key === selectedKey ? "selected" : ""}">${index + 1}. ${escapeHtml(entry.label)}${amount}</div>`;
    }).join("");
    slotPopup.classList.remove("hidden");
    clearTimeout(slotPopupTimer);
    slotPopupTimer = setTimeout(() => slotPopup.classList.add("hidden"), 2600);
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
    if (!inventoryMenu.classList.contains("hidden")) return;
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
        ? `next round in ${Math.floor(prepSeconds / 60)}:${String(prepSeconds % 60).padStart(2, "0")}${blackoutStatus}`
        : state.phase === "wave" ? `ENEMY:${state.enemies.length + state.queued}${blackoutStatus}` : "";
    const me = getMe();
    teamElement.innerHTML = state.players.filter(player => player.id !== myPlayerId).map(player => `
        <div class="teammate ${player.down ? "down" : player.hp <= 30 ? "low" : ""} ${player.id === myPlayerId ? "self" : ""}">
            <div class="teammate-label">
                <span>${player.id === myPlayerId ? "YOU" : player.human ? escapeHtml(player.name) : `CPU${player.id.at(-1)}`}</span>
                <span class="player-stats">${player.down ? "DOWN" : ""}<b>${player.credits}G</b></span>
            </div>
            <div class="hp-line"><span style="width:${player.hp}%"></span></div>
        </div>`).join("");
    selfVitals.classList.toggle("hidden", !me);
    if (me) {
        const health = clamp(me.hp, 0, 100);
        healthHeart.style.setProperty("--health", `${health}%`);
        healthHeart.setAttribute("aria-label", `体力 ${Math.ceil(health)}%`);
        selfCredits.textContent = `${me.credits}G`;
        const selectedBuild = me.selectedBuild && (me.buildItems?.[me.selectedBuild] || 0) > 0
            ? me.selectedBuild : null;
        const showingItem = me.movingCore || selectedBuild;
        const cooldownMax = Math.max(.01, me.cooldownMax || me.cooldown || .01);
        const cooldownProgress = showingItem ? 1 : 1 - Math.min(1, me.cooldown / cooldownMax);
        weaponName.textContent = me.movingCore ? "CORE"
            : selectedBuild ? BUILD_INFO[selectedBuild].name : me.weapon.toUpperCase();
        weaponAmmo.textContent = me.movingCore ? "" : selectedBuild
            ? `×${me.buildItems[selectedBuild]}` : ammoForWeapon(me, me.weapon);
        weaponIcon.className = `weapon-icon ${me.movingCore ? "core" : selectedBuild ? `build-${selectedBuild}` : me.weapon}`;
        weaponCooldown.textContent = showingItem ? "R TO PLACE"
            : me.cooldown > 0 ? `${me.cooldown.toFixed(1)}s` : "READY";
        weaponButton.style.setProperty("--cooldown-progress", `${cooldownProgress * 100}%`);
        weaponButton.classList.toggle("cooling", !showingItem && me.cooldown > 0);
        weaponButton.classList.toggle("locked", me.movingCore);
        weaponButton.disabled = me.movingCore;
        updateInventory(me);
        const placing = Boolean(placementSelection(me));
        interactLabel.textContent = placing ? "PLACE" : "INTERACT";
        interactButton.classList.toggle("hidden", !placing && !findNearestInteraction());
    }
}

// Keep button nodes alive across snapshots so a press spanning a network update still clicks.
function updateInventory(me) {
    if (!inventoryItems.querySelector(".equipment-grid")) {
        inventoryItems.innerHTML = `
            <div class="inventory-section"><h3>EQUIPMENT</h3><div class="inventory-grid equipment-grid"></div></div>
            <div class="inventory-section"><h3>MATERIALS</h3><div class="inventory-grid materials-grid">
                ${resourceInventoryCard("wood")}
                ${resourceInventoryCard("ore")}
            </div></div>`;
    }
    const entries = equipmentEntries(me);
    const selectedKey = me.movingCore ? "core"
        : me.selectedBuild ? `build:${me.selectedBuild}` : `weapon:${me.weapon}`;
    const grid = inventoryItems.querySelector(".equipment-grid");
    const buttons = new Map([...grid.querySelectorAll("button[data-key]")]
        .map(button => [button.dataset.key, button]));
    for (const [key, button] of buttons) {
        if (!entries.some(entry => entry.key === key)) button.remove();
    }
    entries.forEach((entry, index) => {
        let button = buttons.get(entry.key);
        if (!button) {
            button = document.createElement("button");
            button.type = "button";
            button.dataset.key = entry.key;
            button.innerHTML = "<strong></strong><span></span>";
            grid.insertBefore(button, grid.children[index] || null);
        }
        if (grid.children[index] !== button) grid.insertBefore(button, grid.children[index] || null);
        button.classList.toggle("selected", selectedKey === entry.key);
        button.querySelector("strong").textContent = `${index + 1}. ${entry.label}`;
        button.querySelector("span").textContent = entry.kind === "build" ? `×${me.buildItems[entry.value]}`
            : entry.kind === "core" ? ""
                : WEAPON_FIELDS[entry.value] ? `${ammoForWeapon(me, entry.value)} / ${WEAPON_FIELDS[entry.value].capacity}`
                    : entry.value === "pistol" ? "∞" : "";
    });
    for (const type of ["wood", "ore"]) {
        const card = inventoryItems.querySelector(`[data-resource="${type}"]`);
        card.querySelector(".resource-count").textContent = `×${me[type]}`;
        card.querySelectorAll("button").forEach(button => { button.disabled = me.down || me[type] < 1; });
    }
}

inventoryItems.addEventListener("click", event => {
    if (performance.now() < inventorySuppressClickUntil) return;
    const button = event.target.closest("button");
    const me = getMe();
    if (!button || button.disabled || !me || me.down) return;
    if (button.dataset.key) {
        const entry = equipmentEntries(me).find(candidate => candidate.key === button.dataset.key);
        if (entry) selectEquipment(entry);
    } else if (button.dataset.drop) {
        const type = button.dataset.drop;
        const amount = button.dataset.amount === "all" ? me[type] : 1;
        if (amount > 0) send(`DROP_RESOURCE:${type}:${amount}`);
    }
});

function resourceInventoryCard(type) {
    return `<div class="inventory-resource" data-resource="${type}">
        <strong>${type.toUpperCase()}</strong><span class="resource-count"></span>
        <div class="resource-actions">
            <button type="button" data-drop="${type}" data-amount="1">1個落とす</button>
            <button type="button" data-drop="${type}" data-amount="all">全部落とす</button>
        </div>
    </div>`;
}

let inventoryDrag = null;
let inventorySuppressClickUntil = 0;
inventoryItems.addEventListener("pointerdown", event => {
    const button = event.target.closest("button[data-key]");
    if (!button || event.button !== 0 || inventoryDrag) return;
    inventoryDrag = { button, id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    button.setPointerCapture(event.pointerId);
});
inventoryItems.addEventListener("pointermove", event => {
    const drag = inventoryDrag;
    if (!drag || drag.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8 && !drag.moved) return;
    drag.moved = true;
    drag.button.classList.add("dragging");
    inventoryItems.querySelector(".drop-target")?.classList.remove("drop-target");
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("button[data-key]");
    if (target && inventoryItems.contains(target) && target !== drag.button) target.classList.add("drop-target");
    event.preventDefault();
});
function finishInventoryDrag(event, commit) {
    const drag = inventoryDrag;
    if (!drag || drag.id !== event.pointerId) return;
    inventoryDrag = null;
    drag.button.classList.remove("dragging");
    inventoryItems.querySelector(".drop-target")?.classList.remove("drop-target");
    if (drag.button.hasPointerCapture(event.pointerId)) drag.button.releasePointerCapture(event.pointerId);
    if (!drag.moved) return;
    inventorySuppressClickUntil = performance.now() + 400;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("button[data-key]");
    if (commit && target && inventoryItems.contains(target) && getMe()
            && reorderEquipment(drag.button.dataset.key, target.dataset.key)) updateInventory(getMe());
}
inventoryItems.addEventListener("pointerup", event => finishInventoryDrag(event, true));
inventoryItems.addEventListener("pointercancel", event => finishInventoryDrag(event, false));
inventoryItems.addEventListener("lostpointercapture", event => finishInventoryDrag(event, false));

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
        danger: String(text).includes("DOWN") || String(text).includes("DESTROYED"),
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
    if (!hasInteractionPath(me, target)) {
        if (showReason) showFeedback("端末に近づける場所へ移動してください");
        return false;
    }
    return true;
}

function hasInteractionPath(me, target) {
    const separation = distance(me, target);
    const size = TILE_MAP.tileSize;
    const mounted = !canPredictOccupy(target.x, target.y, 0, false);
    for (let step = 0; step < separation; step += 4) {
        const factor = step / Math.max(1, separation);
        const x = me.x + (target.x - me.x) * factor;
        const y = me.y + (target.y - me.y) * factor;
        if (mounted && Math.floor(x / size) === Math.floor(target.x / size)
                && Math.floor(y / size) === Math.floor(target.y / size)) continue;
        if (!canPredictOccupy(x, y, 0, false)) return false;
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
    point = snapToTile(point);
    if (!canPredictOccupy(point.x, point.y, 15, false)) return false;
    const size = TILE_MAP.tileSize;
    const column = Math.floor(point.x / size), row = Math.floor(point.y / size);
    const symbol = TILE_MAP.rows[row]?.[column];
    if (!symbol || !TILE_MAP.legend[symbol]?.buildable) return false;
    if (!forCore && distance(point, state.core) < 40) return false;
    if (distance(point, ARMORY) < 36 || distance(point, MED) < 36
            || distance(point, WOODCUTTER) < 36 || distance(point, QUARRY) < 36) return false;
    if (AREAS.some(area => distance(point, { x: area.terminalX, y: area.terminalY }) < 36)) return false;
    if (WORKBENCHES.some(workbench => distance(point, workbench) < 36)) return false;
    if (SHOP_UNITS.some(shop => distance(point, shop) < 36)) return false;
    if (BREAKER_TERMINALS.some(breaker => distance(point, breaker) < 36)) return false;
    if (PREP_CONSOLE && distance(point, PREP_CONSOLE) < 36) return false;
    if ((state.resources || []).some(node => distance(point, node) < 36)) return false;
    if (SPAWN_POINTS.some(spawn => distance(point, spawn) < 80)) return false;
    if (state.slots.some(slot => slot.defense && distance(point, slot) < (forCore ? 45 : 36))) return false;
    return !state.players.some(player => (forCore ? player.id !== myPlayerId && !player.down && distance(point, player) < 24
        : Math.abs(point.x - player.x) < 23 && Math.abs(point.y - player.y) < 23))
        && !state.enemies.some(enemy => enemy.hp > 0 && distance(point, enemy) < (forCore ? 55 : 48));
}

function openCoreMenu() {
    const core = state.core;
    const hpCost = 300 + Math.round((core.maxHp - 1000) * .6);
    const shieldCost = 350 + Math.round(core.maxShield * .8);
    const defenseCost = 450 + core.defense * 250;
    const regenCost = 500 + core.regen * 300;
    openNearbyActionMenu(`CORE HP ${Math.ceil(core.hp)} / ${Math.ceil(core.maxHp)}`, [
        option("MAX HP +250", hpCost, "UPGRADE:hp"),
        option("SHIELD +180", shieldCost, "UPGRADE:shield"),
        option(`DEFENSE Lv.${core.defense + 1}`, defenseCost, "UPGRADE:defense", core.defense >= 4),
        option(`AUTO REPAIR Lv.${core.regen + 1}`, regenCost, "UPGRADE:regen", core.regen >= 4),
        { label: "MOVE CORE", detail: "運搬後、正面の色付きタイルへRで設置", command: "EQUIP_CORE" },
    ], CORE, INTERACTION_RANGE.core);
}

function openPrepConsoleMenu() {
    const me = getMe();
    const queued = state.phase === "wave" && state.nextPrepBonus > 0
        ? ` / 予約 +${Math.floor(state.nextPrepBonus / 60)}:00` : "";
    openNearbyActionMenu("TIME CONTROL", [{
        label: "+1:00",
        detail: `${PREP_CONSOLE.cost}G${queued}`,
        command: "EXTEND_PREP",
        disabled: !me || me.credits < PREP_CONSOLE.cost,
    }], PREP_CONSOLE, 95, "single");
}

function openShopPurchase(shop) {
    const me = getMe();
    const weaponFields = WEAPON_FIELDS[shop.item];
    const alreadyOwned = Boolean(weaponFields && me[weaponFields.owned]);
    const ammo = alreadyOwned ? me[weaponFields.ammo] : 0;
    const ownedWeapons = Object.values(WEAPON_FIELDS).filter(fields => me[fields.owned]);
    const ammoFull = shop.item === "ammo" ? ownedWeapons.length > 0
        && ownedWeapons.every(fields => me[fields.ammo] >= fields.capacity)
        : alreadyOwned && ammo >= weaponFields.capacity;
    const price = alreadyOwned ? WEAPON_AMMO_REFILL_COST : shop.cost;
    const unavailable = shop.item === "ammo" && ownedWeapons.length === 0;
    openNearbyActionMenu(shop.label, [{
        label: ammoFull ? "FULL" : alreadyOwned || shop.item === "ammo" && !unavailable ? "REFILL"
            : unavailable ? "LOCKED" : "BUY",
        detail: `${price}G`,
        command: `BUY:${shop.item}`,
        disabled: ammoFull || unavailable || me.credits < price,
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

function openWorkbenchMenu(workbench) {
    const me = getMe();
    openNearbyActionMenu("WORKBENCH", Object.entries(BUILD_INFO).map(([type, info]) => ({
        label: info.name,
        detail: `${info.description} — WOOD ${info.wood} / ORE ${info.ore}`,
        command: `CRAFT:${type}`,
        disabled: me.wood < info.wood || me.ore < info.ore,
    })), workbench, INTERACTION_RANGE.workbench);
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
    return { label, detail: customDetail || `${cost}G`, command,
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
    if (/^[1-9]$/.test(key) && state && ["preparing", "wave"].includes(state.phase)) {
        event.preventDefault();
        if (!event.repeat) {
            const entry = equipmentEntries(getMe() || {})[Number(key) - 1];
            if (entry) selectEquipment(entry);
        }
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
        if (separation <= range && hasInteractionPath(me, target)) choices.push({ kind, target, label, action, separation });
    };

    state.slots.filter(slot => slot.defense)
        .forEach(slot => add("defense", slot, INTERACTION_RANGE.trapSlot, "MANAGE", () => openSlotMenu(slot)));
    SHOP_UNITS.forEach(shop => add("shop", shop, INTERACTION_RANGE.shop,
        shop.label, () => openShopPurchase(shop)));
    add("med", MED, INTERACTION_RANGE.medBay, "MED BAY", openMedMenu);
    WORKBENCHES
        .filter(workbench => !workbench.requiredArea || state.areas[workbench.requiredArea])
        .forEach(workbench => add("craft", workbench, INTERACTION_RANGE.workbench,
            "CRAFT", () => openWorkbenchMenu(workbench)));
    if (PREP_CONSOLE && state.areas[PREP_CONSOLE.requiredArea]) {
        add("prep-console", PREP_CONSOLE, 95, "+1:00", openPrepConsoleMenu);
    }
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
    if (!interaction) return;
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
    const direction = player.id === myPlayerId ? localFacing
        : { x: player.facingX, y: player.facingY };
    const facing = quantizeFacing(Number.isFinite(direction.x) ? direction.x : 0,
        Number.isFinite(direction.y) ? direction.y : -1);
    const point = {
        x: origin.x + facing.x * TILE_MAP.tileSize,
        y: origin.y + facing.y * TILE_MAP.tileSize,
    };
    // Near a tile edge, the adjacent tile can still overlap the carrier's body.
    if (!player.movingCore && Math.abs(point.x - player.x) < 23
            && Math.abs(point.y - player.y) < 23) {
        point.x += facing.x * TILE_MAP.tileSize;
        point.y += facing.y * TILE_MAP.tileSize;
    }
    return point;
}

function placeSelectedInFront() {
    const me = getMe();
    const selection = placementSelection(me);
    if (!selection) return false;
    // The preview is advisory; only the server has the current collision state.
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

function canPredictOccupy(x, y, radius, includeDefenses = true) {
    if (![x, y, radius].every(Number.isFinite) || radius < 0) return false;
    if (x - radius < 0 || y - radius < 0 || x + radius > WORLD.width || y + radius > WORLD.height
            || x >= WORLD.width || y >= WORLD.height) return false;
    for (const area of AREAS) {
        const overlaps = radius === 0 ? areaContains(area, x, y) : area.tiles.some(tile =>
            x + radius > tile.column * TILE_MAP.tileSize && x - radius < (tile.column + 1) * TILE_MAP.tileSize
            && y + radius > tile.row * TILE_MAP.tileSize && y - radius < (tile.row + 1) * TILE_MAP.tileSize);
        if (overlaps && !state.areas[area.id]) return false;
    }
    const size = TILE_MAP.tileSize;
    const minColumn = Math.floor((x - radius) / size);
    const maxColumn = radius === 0 ? Math.floor(x / size) : Math.ceil((x + radius) / size) - 1;
    const minRow = Math.floor((y - radius) / size);
    const maxRow = radius === 0 ? Math.floor(y / size) : Math.ceil((y + radius) / size) - 1;
    for (let row = minRow; row <= maxRow; row++) {
        for (let column = minColumn; column <= maxColumn; column++) {
            const symbol = TILE_MAP.rows[row]?.[column];
            if (!symbol || !TILE_MAP.legend[symbol] || TILE_MAP.legend[symbol].solid) return false;
        }
    }
    if (includeDefenses && state.slots.some(slot => slot.defense && ["block", "barricade"].includes(slot.defense.type)
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
        drawDroppedResources();
        drawTrapSlots();
        drawEnemies();
        drawPlayers();
        drawInteractionPrompt();
        drawHitEffects();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (state?.blackoutActive) drawBlackout();
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

let visibleFloorCache = null;
let floorOrigin = { x: 1020, y: 1900 };
function reachableFloorTiles() {
    const key = AREAS.map(area => Boolean(state?.areas[area.id])).join(',');
    if (visibleFloorCache?.map === TILE_MAP && visibleFloorCache.key === key) return visibleFloorCache.tiles;
    const size = TILE_MAP.tileSize;
    const tiles = new Set();
    // The initial southern entrance remains the origin even when the core is moved.
    const queue = [[Math.floor(floorOrigin.x / size), Math.floor(floorOrigin.y / size)]];
    for (let i = 0; i < queue.length; i++) {
        const [column, row] = queue[i];
        const id = row + ':' + column;
        if (tiles.has(id)) continue;
        const tile = TILE_MAP.legend[TILE_MAP.rows[row]?.[column]];
        const x = (column + .5) * size, y = (row + .5) * size;
        if (!tile || tile.solid || AREAS.some(area => !state?.areas[area.id]
                && areaContains(area, x, y))) continue;
        tiles.add(id);
        queue.push([column + 1, row], [column - 1, row], [column, row + 1], [column, row - 1]);
    }
    visibleFloorCache = { map: TILE_MAP, key, tiles };
    return tiles;
}

function drawWorld() {
    ctx.imageSmoothingEnabled = false;
    const size = TILE_MAP.tileSize;
    const reachable = reachableFloorTiles();
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
            ctx.fillStyle = !tile.solid && !reachable.has(row + ":" + column) ? "#242424" : tile.color;
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
    if (isUnlockedPoint(MED)) drawStation(MED, "MED BAY", "#d8d8d8", "#111");
    if (isUnlockedPoint(WOODCUTTER)) drawStation(WOODCUTTER, "WOODCUTTER", "#a8a8a8");
    if (isUnlockedPoint(QUARRY)) drawStation(QUARRY, "QUARRY", "#808080");
    WORKBENCHES
        .filter(workbench => !workbench.requiredArea || state.areas[workbench.requiredArea])
        .forEach(workbench => drawStation(workbench, "WORKBENCH", "#d8d8d8", "#111"));
    if (PREP_CONSOLE && state.areas[PREP_CONSOLE.requiredArea]) {
        drawStation(PREP_CONSOLE, "TIME CONTROL", "#d8d8d8", "#111");
    }
}

function isUnlockedPoint(point) {
    const area = AREAS.find(candidate => areaContains(candidate, point.x, point.y));
    return !area || state.areas[area.id];
}

function drawStation(station, label, color, labelColor = "#111") {
    ctx.fillStyle = color; ctx.fillRect(station.x - 20, station.y - 20, 40, 40);
    ctx.fillStyle = "#111"; ctx.fillRect(station.x - 11, station.y - 11, 22, 22);
    ctx.fillStyle = labelColor; ctx.font = "900 9px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(label, station.x, station.y + 31);
}

function drawResources() {
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

function drawDroppedResources() {
    for (const drop of state.drops || []) {
        const bob = Math.sin(performance.now() / 230 + drop.id) * 2;
        ctx.save();
        ctx.translate(drop.x, drop.y + bob);
        ctx.fillStyle = drop.type === "wood" ? "#b8b8b8" : "#777";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        if (drop.type === "wood") {
            ctx.fillRect(-12, -8, 24, 16);
            ctx.strokeRect(-12, -8, 24, 16);
        } else {
            ctx.beginPath();
            ctx.moveTo(0, -13); ctx.lineTo(13, -3); ctx.lineTo(8, 11);
            ctx.lineTo(-9, 10); ctx.lineTo(-13, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.fillStyle = "#fff";
        ctx.font = "900 10px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${drop.type.toUpperCase()} ×${drop.amount}`, 0, -18);
        if (drop.pickupDelay > 0) {
            ctx.fillStyle = "rgb(255 255 255 / 68%)";
            ctx.font = "850 8px ui-monospace, monospace";
            ctx.fillText(`${drop.pickupDelay.toFixed(1)}s`, 0, 21);
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
        if (player.down && rescuers.length && (player.id === myPlayerId || rescuers.some(worker => worker.id === myPlayerId))) drawReviveEffect(p.x, p.y, Math.max(...rescuers.map(worker => worker.actionProgress / 4)));
        ctx.save();
        if (player.down) { ctx.translate(p.x, p.y + 8); ctx.scale(1.35, .65); }
        else ctx.translate(p.x, p.y);
        const hit = hitEffects.findLast(effect => effect.effect === "player-hit"
            && effect.playerId === player.id && performance.now() - effect.started < 300);
        if (hit) {
            ctx.save();
            ctx.globalAlpha = .3 * (1 - (performance.now() - hit.started) / 300);
            ctx.fillStyle = "#ff3948";
            ctx.shadowColor = "#ff3948";
            ctx.shadowBlur = 8;
            ctx.fillRect(-9, -9, 18, 18);
            ctx.restore();
        }
        ctx.fillStyle = hit || player.down ? "#ff5964" : "#454545";
        const playerSize = 10;
        ctx.fillRect(-playerSize / 2, -playerSize / 2, playerSize, playerSize);
        if (player.id === myPlayerId) { ctx.strokeStyle = "white"; ctx.lineWidth = 1.5; ctx.strokeRect(-playerSize / 2, -playerSize / 2, playerSize, playerSize); }
        ctx.restore();
        if (player.id === myPlayerId) drawLocalWeaponCooldown(p.x, p.y, player);
        ctx.textAlign = "center"; ctx.fillStyle = "#454545"; ctx.font = "800 11px system-ui";
        ctx.fillText(player.down ? `${player.name} — DOWN` : player.name, p.x, p.y - 14);

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
    ctx.save();
    drawBar(x - 16, y - 25, 32, 3, clamp(progress, 0, 1), "#79d8ff");
    ctx.restore();
}

function drawHitEffects() {
    const now = performance.now();
    hitEffects = hitEffects.filter(effect => now - effect.started
        < (effect.effect === "core-pulse" || effect.effect === "pickup"
            || (effect.credits > 0 || effect.headshot) && effect.playerId === myPlayerId
            ? 900 : 360));
    for (const effect of hitEffects) {
        if (effect.effect === "player-hit") continue;
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
        if (effect.credits > 0 && effect.playerId === myPlayerId && age < 900) {
            const progress = age / 900;
            ctx.save();
            ctx.globalAlpha = 1 - progress;
            ctx.fillStyle = "#79d8ff";
            ctx.shadowColor = "#79d8ff";
            ctx.shadowBlur = 8;
            ctx.font = "950 13px ui-monospace, monospace";
            ctx.textAlign = "center";
            ctx.fillText(`+${effect.credits}G`, effect.x, effect.y - 24 - progress * 24);
            ctx.restore();
        }
        if (effect.headshot && effect.playerId === myPlayerId && age < 700) {
            const progress = age / 700;
            ctx.save();
            ctx.globalAlpha = 1 - progress;
            ctx.fillStyle = "#ff5964";
            ctx.font = "950 11px ui-monospace, monospace";
            ctx.textAlign = "center";
            ctx.fillText("HEADSHOT", effect.x, effect.y - 42 - progress * 20);
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

function areaContains(area, x, y) {
    const column = Math.floor(x / TILE_MAP.tileSize), row = Math.floor(y / TILE_MAP.tileSize);
    return area.tiles.some(tile => tile.column === column && tile.row === row);
}

function validateAreaTiles(areas, tiles) {
    const occupied = new Set();
    for (const area of areas) {
        if (!Array.isArray(area.tiles) || !area.tiles.length) throw new Error(`エリア${area.id}にタイルがありません`);
        for (const tile of area.tiles) {
            const symbol = tiles.rows[tile?.row]?.[tile?.column];
            const key = `${tile?.row}:${tile?.column}`;
            if (!Number.isInteger(tile?.column) || !Number.isInteger(tile?.row)
                    || !symbol || tiles.legend[symbol].solid || occupied.has(key)) {
                throw new Error(`エリア${area.id}のタイルが不正、または重複しています`);
            }
            occupied.add(key);
        }
    }
}
