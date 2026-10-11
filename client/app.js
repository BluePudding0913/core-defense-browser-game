"use strict";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const labRenderer = window.Lab3D?.create(canvas) || null;
let renderPositions = null;
const menu = document.querySelector("#menu");
const menuStatus = document.querySelector("#menu-status");
const startButton = document.querySelector("#start");
const nameInput = document.querySelector("#player-name");
const roomBrowser = document.querySelector("#room-browser");
const roomLobby = document.querySelector("#room-lobby");
const roomList = document.querySelector("#room-list");
const roomMembers = document.querySelector("#room-members");
const JOBS = window.JobUI.catalog;
const jobSelect = document.querySelector("#job-select");
const jobToggle = document.querySelector("#job-toggle");
const legacyJobPanel = document.querySelector("#legacy-job-panel");
jobToggle.addEventListener("click", () => {
    legacyJobPanel.hidden = !legacyJobPanel.hidden;
    jobToggle.setAttribute("aria-expanded", String(!legacyJobPanel.hidden));
});
document.addEventListener("click", event => {
    if (!event.target.closest("#job-toggle, #legacy-job-panel")) {
        legacyJobPanel.hidden = true;
        jobToggle.setAttribute("aria-expanded", "false");
    }
});
jobSelect.addEventListener("click", event => {
    const job = event.target.closest("[data-job]")?.dataset.job;
    if (job) requestJobChange(job);
});
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
const selfJob = document.querySelector("#self-job");
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
const weaponSilver = document.querySelector("#weapon-silver");
const jobCooldownLabel = document.querySelector("#job-cooldown");
const slotPopup = document.querySelector("#slot-popup");
const actionMenu = document.querySelector("#action-menu");
const actionTitle = document.querySelector("#action-title");
const actionOptions = document.querySelector("#action-options");
const actionClose = document.querySelector("#action-close");
const inventoryMenu = document.querySelector("#inventory-menu");
const inventoryItems = document.querySelector("#inventory-items");
const roundIntro = document.querySelector("#round-intro");
const screenFade = document.querySelector("#screen-fade");
const howToMenu = document.querySelector("#how-to-menu");
const howToStart = document.querySelector("#how-to-start");
document.querySelector("#inventory-settings").addEventListener("click", () => {
    endInteractionHold(true);
    keys.clear(); joystick = null; dashKey = false; setDash(false);
    if (pendingMove) clearTimeout(pendingMove.timer);
    pendingMove = null;
    if (firingPointer) stopFiring(firingPointer.clientX, firingPointer.clientY);
    sendMovement(true);
    inventoryMenu.classList.add("hidden");
    window.coreMenu?.openSettings(() => {
        if (["preparing", "wave"].includes(state?.phase)) toggleInventory();
    });
});
const howToInventory = document.querySelector("#how-to-inventory");
const howToClose = document.querySelector("#how-to-close");
const URL_PARAMETERS = new URLSearchParams(window.location.search);
const DEBUG_MODE = URL_PARAMETERS.get("debug") === "1";

const VIEW = { width: 900, height: 500 };
let WORLD = { width: 1, height: 1 };
let CORE = { x: 0, y: 0 };
let ARMORY = { id: "armory", x: 0, y: 0 };
let MED = { id: "med", x: 0, y: 0 };
let MEDBAYS = [];
let WOODCUTTER = { id: "woodcutter", x: 0, y: 0 };
let QUARRY = { id: "quarry", x: 0, y: 0 };
let WORKBENCH = { id: "workbench", x: 0, y: 0 };
let WORKBENCHES = [];
let TILE_MAP = { tileSize: 40, legend: {}, rows: [] };
let AREAS = [];
let STARTING_AREA = null;
let SPAWN_POINTS = [];
let SHOP_UNITS = [];
let BREAKER_TERMINALS = [];
let PREP_CONSOLE = null;
let MISSILE_COMPUTER = null, JOB_STATION = null;
let BUILD_INFO = {};
const RESOURCE_NAMES = { wood: "木材", ore: "鉄鉱石", copper: "銅", silver: "銀" };
const WEAPON_FIELDS = {};
let WEAPON_AMMO_REFILL_COST;
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
let lastCoreShield;
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
let droneAftermath = null;
let predictedLocal = null;
let localMove = { x: 0, y: 0 };
let localFacing = { x: 0, y: -1 };
let aimPointer = null;
const fpsInput = labRenderer?.firstPerson ? window.FPSInput.create(canvas,{onEscape:()=>{if(state && ["preparing","wave"].includes(state.phase))openExitDialog();}}) : null;
let dashRequested = false;
let lastFrameAt = performance.now();
let mapReady = false;
let resolveMapReady;
const mapReadyPromise = new Promise(resolve => { resolveMapReady = resolve; });
const keys = new Set();
const smoothed = new Map();
let clientSessionId = window.coreReconnect.session();
let nextInputSequence = 1;
let lastAcknowledgedInput = 0;
let pendingInputs = [];

function applyMap(map) {
    validateMap(map);

    WORLD = { width: map.world.width, height: map.world.height };
    CORE = { ...map.core };
    floorOrigin = { ...map.core };
    ARMORY = { ...map.stations.armory };
    MED = { ...map.stations.medBay };
    MEDBAYS = [MED, ...(map.medBayUnits || []).map(station => ({ ...station }))];
    WOODCUTTER = { ...map.stations.woodcutter };
    QUARRY = { ...map.stations.quarry };
    WORKBENCH = { ...map.stations.workbench };
    TILE_MAP = {
        tileSize: map.tileMap.tileSize,
        legend: { ...map.tileMap.legend },
        rows: [...map.tileMap.rows],
    };
    AREAS = map.areas.map(area => ({ ...area }));
    STARTING_AREA = map.startingArea;
    SPAWN_POINTS = map.spawnPoints.map(spawn => ({ ...spawn }));
    SHOP_UNITS = map.shopUnits.map(shop => ({ ...shop }));
    BREAKER_TERMINALS = map.breakerTerminals.map(breaker => ({ ...breaker }));
    WORKBENCHES = map.workbenchUnits.map(workbench => ({ ...workbench }));
    PREP_CONSOLE = { ...map.prepConsole };
    MISSILE_COMPUTER = map.missileComputer; JOB_STATION = map.jobStation;
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
    if (map.medBayUnits !== undefined && !Array.isArray(map.medBayUnits)) {
        throw new Error("medBayUnitsの配列が不正です");
    }
    requireUniqueIds([map.stations.medBay, ...(map.medBayUnits || [])], "medBayUnits");
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
        ...map.workbenchUnits, ...map.breakerTerminals, ...(map.medBayUnits || []), map.prepConsole, ...map.spawnPoints]) {
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
    if (connectionTarget.phrase) parameters.set("phrase", connectionTarget.phrase);
    if (connectionTarget.mode === "directory") parameters.set("directory", "1");
    else parameters.set("room", connectionTarget.roomId);
    if (connectionTarget.resume) parameters.set("resume", "1");
    menuStatus.textContent = connectionTarget.mode === "directory"
        ? "ルーム一覧に接続しています…" : "ルームに接続しています…";
    socket = new WebSocket(`${protocol}://${host}:${serverPort}/?${parameters}`);
    creatingRoom = false;
    updateRoomButtons();
    const connectingSocket = socket;
    let welcomed = false;
    clearTimeout(connectionAttemptTimer);
    connectionAttemptTimer = setTimeout(() => {
        if (socket === connectingSocket && connectingSocket.readyState === WebSocket.CONNECTING) {
            menuStatus.textContent = "接続できません";
            window.coreMenu?.status(menuStatus.textContent);
        }
    }, 6000);
    socket.addEventListener("open", () => {
        if (socket !== connectingSocket) return;
        clearTimeout(connectionAttemptTimer);
        if (connectionTarget.mode === "directory") {
            window.coreMenu?.connected();
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
        if (message.type === "error" || message.type === "feedback") window.coreMenu?.status(message.message);
        if (message.type === "purchase-complete") {
            window.coreAudio?.play("purchase", 0);
            if (message.closeMenu) closeActionMenu();
        }
        if (message.type === "ammo-refilled") {
            window.coreAudio?.play("refill", 0);
            if (!activeMenuAccess?.refresh) closeActionMenu();
            closeInventory();
        }
        if (message.type === "error" && !welcomed && connectionTarget.mode !== "directory" && window.coreMenu) {
            window.coreReconnect?.forget(clientSessionId, connectionTarget.roomId);
            window.coreMenu.rejected();
            leaveRoom();
            window.coreMenu.status(message.message);
            return;
        }
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
                menuStatus.textContent = "ゲームデータを読み込めません";
                startButton.disabled = true;
            }
            return;
        }
        if (message.type === "welcome") {
            welcomed = true;
            myPlayerId = message.playerId;
            connectionTarget.roomId = message.roomId;
            window.coreReconnect?.remember(clientSessionId, message.roomId,
                connectionTarget.phrase || "", nameInput.value || "Player");
            window.coreMenu?.refreshResume();
            acknowledgeInputs(message.ackInput);
            nextInputSequence = Math.max(nextInputSequence, lastAcknowledgedInput + 1);
            lastMove = "";
            send(`HELLO:${nameInput.value || "Player"}`);
            sendMovement(true);
        }
        if (message.type === "state") receiveState(message);
        if (message.type === "log") receiveLog(message.version, message.message);
        if (message.type === "effect") {
            if (message.effect === "drone-self-destruct") receiveDroneSelfDestruct(message);
            playSoundEffect(message);
        }
        if (message.type === "effect" && ["hit", "intercept", "pickup", "player-hit", "player-down", "explosion", "acid-impact", "missile-impact"].includes(message.effect)) {
            if (typeof CombatFeedback !== "undefined") CombatFeedback.add(message, performance.now(), myPlayerId, DEBUG_MODE);
            const effect = { ...message, started: performance.now() };
            if(effect.effect==='hit' && effect.weapon==='sniper' && effect.damage===0 && effect.playerId===myPlayerId)
                window.SniperAim?.shot(effect.playerId,effect.started);
            labRenderer?.captureEffect?.(effect);
            hitEffects.push(effect);
            if (hitEffects.length > 100) hitEffects.shift();
        }
        if (message.type === "feedback" || message.type === "error") showFeedback(message.message);
        if (message.type === "error" && connectionTarget.mode === "directory") {
            creatingRoom = false;
            updateRoomButtons();
            menuStatus.textContent = message.message;
        }
    });
    socket.addEventListener("close", event => {
        if (socket !== connectingSocket) return;
        droneAftermath = null;
        window.coreAudio?.stopRailguns?.();
        window.coreAudio?.resetRewind?.();
        if (event?.code === 4000) {
            // A newer tab now owns this player. Do not reconnect and steal it back.
            clientSessionId = window.coreReconnect?.newSession() || clientSessionId;
            leaveRoom(false);
            window.coreMenu?.status("別のタブで再参加しました");
            return;
        }
        endInteractionHold(true);
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
        window.coreMenu?.disconnected(menuStatus.textContent);
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 2000);
    });
    socket.addEventListener("error", () => {
        if (socket !== connectingSocket) return;
        clearTimeout(connectionAttemptTimer);
        menuStatus.textContent = "接続できません";
        window.coreMenu?.status(menuStatus.textContent);
    });
}

function switchConnection(target) {
    const leavingRoom = connectionTarget.mode === "room" && target.mode === "directory";
    connectionTarget = target;
    clearTimeout(reconnectTimer);
    const previousSocket = socket;
    socket = undefined;
    if (previousSocket && previousSocket.readyState < WebSocket.CLOSING) {
        previousSocket.close(1000, leavingRoom ? "leave-room" : "");
    }
    connect();
}

function enterRoom(roomId, options = {}) {
    if (typeof roomId !== "string" || !roomId) return;
    setMenuView("lobby");
    hitEffects = [];
    if (typeof CombatFeedback !== "undefined") CombatFeedback.reset();
    state = undefined;
    myPlayerId = undefined;
    roomBrowser.classList.add("hidden");
    roomLobby.classList.remove("hidden");
    nameInput.classList.add("hidden");
    roomCode.textContent = `ROOM ${roomId.toUpperCase()}`;
    roomMembers.innerHTML = "";
    readyRoomButton.disabled = true;
    startButton.classList.add("hidden");
    switchConnection({ mode: "room", roomId, phrase: window.coreMenu?.phrase || "", ...options });
}

function leaveRoom(forget = true) {
    window.coreAudio?.resetRewind?.();
    droneAftermath = null;
    if (forget) window.coreReconnect?.forget(clientSessionId, connectionTarget.roomId);
    keepEndArea({ phase: "lobby" });
    hideScreenIntro();
    previousPhase = undefined;
    previousRound = undefined;
    endInteractionHold(true);
    keys.clear(); joystick = null; dashKey = false;
    if (pendingMove) clearTimeout(pendingMove.timer);
    pendingMove = null; firingPointer = null;
    closeActionMenu(); inventoryMenu.classList.add("hidden"); closeHowTo();
    window.coreMenu?.exited();
    setMenuView("home");
    hitEffects = [];
    if (typeof CombatFeedback !== "undefined") CombatFeedback.reset();
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
    if (message === "START" && DEBUG_MODE) message = "START:DEBUG";
    if (/^(FIRE|SECONDARY_FIRE):/.test(message) && fpsInput) message += ':' + Math.max(-1.2,Math.min(1.2,fpsInput.view.pitch+(fpsInput.view.recoilPitch || 0))).toFixed(6);
    if (/^FIRE:/.test(message) && typeof window!=="undefined" && window.SniperAim && typeof getMe==="function" && getMe()?.sniper?.fixed) {
        message+=':'+window.SniperAim.sample(getMe(),performance.now()).elapsed.toFixed(6);
    }
    if (/^(FIRE|SECONDARY_FIRE):/.test(message) && fpsInput && typeof window!=="undefined" && window.AimControl && getMe()?.aimControl && !getMe()?.drone?.controlled
            && !(message.startsWith('FIRE:') && getMe()?.sniper?.fixed)) {
        const weapon=message.startsWith('SECONDARY_FIRE:')?getMe()?.secondaryWeapon:getMe()?.weapon;
        if(window.AimControl.supported(weapon,WEAPON_FIELDS))message+=':'+window.AimControl.sample(getMe(),performance.now(),WEAPON_FIELDS,weapon).elapsed.toFixed(6);
    }
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

function applyRules(next) {
    if (next.rules) {
        BUILD_INFO = { ...next.rules.recipes, teleporter: { name: "TP", shopOnly: true } };
        SHOP_UNITS.filter(shop => shop.item.endsWith("Factory")).forEach(shop => {
            BUILD_INFO[shop.item] = { name: shop.label, description: "持ち運べる製造装置", shopOnly: true };
        });
        WEAPON_AMMO_REFILL_COST = next.rules.shop.ammo;
        for (const key of Object.keys(WEAPON_FIELDS)) delete WEAPON_FIELDS[key];
        Object.assign(WEAPON_FIELDS, next.rules.weapons);
    }
}

let endAreaPhase = null;
let endAreaVisible = false;
let endAreaTimer;

function keepEndArea(next) {
    if (!["won", "lost"].includes(next.phase)) {
        clearTimeout(endAreaTimer);
        endAreaPhase = null;
        endAreaVisible = false;
        screenFade.classList.remove("show");
        return false;
    }
    if (endAreaPhase !== next.phase) {
        clearTimeout(endAreaTimer);
        endAreaPhase = next.phase;
        endAreaVisible = true;
        endAreaTimer = setTimeout(() => {
            if (!state || state.phase !== endAreaPhase) return;
            screenFade.classList.add("show");
            endAreaTimer = setTimeout(() => {
                if (state && state.phase === endAreaPhase) {
                    endAreaVisible = false;
                    receiveState(state);
                }
                screenFade.classList.remove("show");
            }, 350);
        }, 10000);
    }
    return endAreaVisible;
}

function receiveState(next) {
    window.coreAudio?.syncRewind?.(next.rewindRemaining || 0, next.rewindVersion || 0);
    if (state && (next.rewindVersion || 0) !== (state.rewindVersion || 0)) {
        rewindFinishedAt = performance.now();
        smoothed.clear(); predictedLocal = null; hitEffects.length = 0;
        if (typeof CombatFeedback !== "undefined") CombatFeedback.reset();
        if (firingPointer) stopFiring(firingPointer.clientX, firingPointer.clientY);
        stopSecondaryFiring(); closeActionMenu(); endInteractionHold(true);
    }
    applyRules(next);
    const keepArea = keepEndArea(next);
    window.coreMenu?.snapshot(next, myPlayerId, keepArea);
    const beginsRound = next.phase === "wave"
        && (previousPhase !== "wave" || next.round !== previousRound);
    const endsDefense = ["won", "lost"].includes(next.phase) && previousPhase !== next.phase;
    const resetCoreAlerts = next.phase === "lobby"
            || state && (next.rewindVersion !== state.rewindVersion || next.phase === "preparing" && state.phase !== "preparing");
    if (resetCoreAlerts && typeof CoreFeedback !== "undefined") CoreFeedback.reset();
    if (lastCoreHp !== undefined && (next.core.hp < lastCoreHp || (next.core.shield || 0) < lastCoreShield)) {
        coreHitStarted = performance.now();
        if (!resetCoreAlerts && typeof CoreFeedback !== "undefined") CoreFeedback.add(next.core, coreHitStarted);
    }
    lastCoreHp = next.core.hp;
    lastCoreShield = next.core.shield || 0;
    const incomingMe = next.players.find(p => p.id === myPlayerId);
    const controlChanged = Boolean(getMe()?.drone?.controlled) !== Boolean(incomingMe?.drone?.controlled)
        || Boolean(getMe()?.missileControl) !== Boolean(incomingMe?.missileControl);
    reconcileDroneSmoothing(next);
    reconcileEnemySmoothing(next);
    window.SniperAim?.sync(next.players,performance.now());
    window.AimControl?.sync(next.players,performance.now());
    state = next;
    if (getMe()?.drone?.controlled) slotPopup.classList.add("hidden");
    if (controlChanged) {
        if (firingPointer) stopFiring(firingPointer.clientX, firingPointer.clientY);
        endInteractionHold(true);
        closeActionMenu();
        sendMovement(true);
    }
    state.artilleryReceivedAt = performance.now();
    if (!getMe() || getMe().down || !["preparing", "wave"].includes(next.phase)) {
        endInteractionHold(true);
    }
    CORE.x = next.core.x;
    CORE.y = next.core.y;
    if (beginsRound) { showRoundIntro(next.round); window.coreAudio?.play("round-start"); }
    else if (next.rewindRemaining > 0 || next.rewindDelayRemaining > 0) hideScreenIntro();
    else if (endsDefense) showScreenIntro(next.phase === "won" ? "防衛成功" : "防衛失敗", 2000,
        `TIME ${formatMatchTime(next.elapsedSeconds)}`, next.phase);
    else if (!["wave", "won", "lost"].includes(next.phase) || !keepArea && ["won", "lost"].includes(next.phase)) hideScreenIntro();
    previousRound = next.round;
    previousPhase = next.phase;
    reconcileLocalPrediction(next);
    if (activeMenuAccess
            && !canUseNearby(activeMenuAccess.target, activeMenuAccess.range, false)) {
        closeActionMenu();
    }
    activeMenuAccess?.refresh?.();
    receiveLog(next.noticeVersion, next.notice);
    updateHud();
    updateWorkbenchMaterials();
    updateRoomLobby(next);
    if (["preparing", "wave"].includes(next.phase) || keepArea) {
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
    jobToggle.textContent = `ジョブ:${JOBS[me?.job]?.name || "Healer"}`;
    const jobScroll = jobSelect.querySelector(".job-list")?.scrollTop || 0;
    const focusedJob = document.activeElement?.dataset?.job;
    jobSelect.innerHTML = window.JobUI.render(me?.job, !me, JOBS, "legacy-job-detail");
    jobSelect.querySelector(".job-list").scrollTop = jobScroll;
    if (focusedJob && JOBS[focusedJob]) jobSelect.querySelector(`[data-job="${focusedJob}"]`)?.focus();
    const isOwner = myPlayerId === snapshot.roomOwnerId;
    readyRoomButton.classList.toggle("hidden", isOwner);
    readyRoomButton.disabled = !me || isOwner;
    readyRoomButton.textContent = me?.ready ? "取り消す" : "準備OK";
    startButton.classList.toggle("hidden", !isOwner);
    startButton.textContent = snapshot.phase === "lobby" ? "開始" : "もう一度プレイ";
    startButton.disabled = !isOwner || !snapshot.allReady;
    menuStatus.textContent = snapshot.phase === "won" ? `防衛成功 · TIME ${formatMatchTime(snapshot.elapsedSeconds)}`
        : snapshot.phase === "lost" ? `防衛失敗 · TIME ${formatMatchTime(snapshot.elapsedSeconds)}`
            : "";
}

function reconcileDroneSmoothing(next) {
    for (const owner of next.players) {
        const key = `drone-${owner.id}`;
        const previous = state?.players.find(p => p.id === owner.id)?.drone;
        if (!owner.drone?.active) smoothed.delete(key);
        else if (!previous?.active) smoothed.set(key, { x: owner.drone.x, y: owner.drone.y });
    }
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
    showScreenIntro(`ROUND ${round}`);
}

function hideScreenIntro() {
    clearTimeout(roundIntroTimer);
    roundIntro.classList.remove("show");
}

function showScreenIntro(text, delay = 0, detail = "", result = "") {
    hideScreenIntro();
    const show = () => {
        roundIntro.textContent = text;
        roundIntro.dataset.detail = detail;
        roundIntro.dataset.result = result;
        void roundIntro.offsetWidth;
        roundIntro.classList.add("show");
        if (!result) roundIntroTimer = setTimeout(() => roundIntro.classList.remove("show"), 2400);
    };
    if (delay > 0) roundIntroTimer = setTimeout(show, delay);
    else show();
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
const exitDialog = document.querySelector("#exit-dialog");
document.querySelector("#leave-game").addEventListener("click", openExitDialog);
function openExitDialog() {
    if (exitDialog.open) return;
    fpsInput?.setActive(false,true);
    endInteractionHold(true);
    keys.clear(); joystick = null;
    dashKey = false; setDash(false);
    if (pendingMove) clearTimeout(pendingMove.timer);
    pendingMove = null;
    if (firingPointer) stopFiring(firingPointer.clientX, firingPointer.clientY);
    if (secondaryHeld) stopSecondaryFiring();
    sendMovement();
    exitDialog.returnValue = "cancel";
    exitDialog.showModal();
}
exitDialog.addEventListener("close", () => {
    if (exitDialog.returnValue === "exit") leaveRoom();
});

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
    const entries = WeaponUI.entries(me, WEAPON_FIELDS)
        .filter(entry => !(me.drone?.active && entry.value === me.drone.weapon));
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
    if (me?.job === "attacker" && entry.kind === "weapon" && entry.value === me.secondaryWeapon) return;
    if (me?.movingCore && entry.kind === "weapon") {
        showFeedback("CORE運搬中は武器を使用できません");
        return;
    }
    if (entry.kind === "weapon") send(`WEAPON:${entry.value}`);
    else if (entry.kind === "build") send(`EQUIP_BUILD:${entry.value}`);
    else if (entry.kind === "item") { send(`USE:${entry.value}`); return; }
    showEquipmentPopup(entry.key);
}

function showEquipmentPopup(selectedKey) {
    const me = getMe();
    if (!me || me.drone?.controlled) return;
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
    if (me.movingCore || me.drone?.controlled) return;
    const entries = equipmentEntries(me).filter(entry => entry.kind !== "item"
        && !(me.job === "attacker" && entry.kind === "weapon" && entry.value === me.secondaryWeapon));
    const selectedKey = me.movingCore ? "core"
        : me.selectedBuild ? `build:${me.selectedBuild}` : `weapon:${me.weapon}`;
    const current = Math.max(0, entries.findIndex(entry => entry.key === selectedKey));
    selectEquipment(entries[(current + direction + entries.length) % entries.length]);
}

weaponButton.addEventListener("click", () => cycleEquipment(1));
function openSystemConsole(terminal) {
    const me = getMe();
    if (me?.job !== "hacker" || !["preparing", "wave"].includes(state.phase)) return;
    const options = [];
    if (state.phase === "preparing" && !state.backupUsed) options.push({label: "SAVE",
        detail: state.backupCost + "G", command: "HACKER_BACKUP", disabled: me.credits < state.backupCost});
    if (state.debugMode) options.push({label: "debug", onSelect: () => openDebugConsole(terminal)});
    if (!options.length) return;
    openNearbyActionMenu("SYSTEM CONSOLE", options, terminal, 70, "single", () => openSystemConsole(terminal));
}

function openDebugConsole(terminal) {
    if (!state.debugMode || getMe()?.job !== "hacker") return;
    openNearbyActionMenu("debug", [
        {label: "Summon Enemy", onSelect: () => openDebugSummonMenu(terminal)},
        {label: "get gold", detail: "100000G", onSelect: () => send("DEBUG:GOLD")},
        {label: "BACK", onSelect: () => openSystemConsole(terminal)},
    ], terminal, 70, "single", () => openDebugConsole(terminal));
}

function openDebugSummonMenu(terminal) {
    if (!state.debugMode || getMe()?.job !== "hacker") return;
    const options = (state.debugEnemyTypes || []).map(type => ({
        label: type.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase(),
        onSelect: () => send("DEBUG:SUMMON:" + type),
    }));
    options.push({label: "BACK", onSelect: () => openDebugConsole(terminal)});
    openNearbyActionMenu("Summon Enemy", options, terminal, 70, "single", () => openDebugSummonMenu(terminal));
}

function useJobAbility() {
    const me = getMe();
    if (!me || me.down || me.movingCore || me.missileControl
            || !state || !["preparing", "wave"].includes(state.phase)
            || !inventoryMenu.classList.contains("hidden") || !howToMenu.classList.contains("hidden")
            || !actionMenu.classList.contains("hidden")) return;
    if (me.job === "drone" && !me.drone?.active) openDroneLaunch();
    else if (["drone", "healer", "spy", "tp"].includes(me.job)) send("JOB_ABILITY");
}
// A release opens the menu; holding picks up the original target directly.
let interactionHold = null;
function beginInteractionHold() {
    if (interactionHold || !state || !["preparing", "wave"].includes(state.phase)
            || getMe()?.down || !inventoryMenu.classList.contains("hidden")
            || !howToMenu.classList.contains("hidden")) return;
    if (getMe()?.missileControl) {
        interactionHold = { used: false, timer: null, interaction: { action: () => send("COMPUTER") } };
        return;
    }
    const interaction = findNearestInteraction();
    const target = ["core", "defense", "factory"].includes(interaction?.kind)
        ? interaction.kind === "core" ? "core" : interaction.target.id : null;
    const hold = { used: false, timer: null };
    interactionHold = hold;
    if (interaction?.kind === "teleporter" && actionMenu.classList.contains("hidden") && !placementSelection(getMe())) {
        hold.interaction = interaction;
        if (interaction.owned) hold.timer = setTimeout(() => {
            hold.used = true;
            send(`PICKUP_TELEPORT:${interaction.target.x}:${interaction.target.y}`);
        }, 500);
    } else if (target && actionMenu.classList.contains("hidden")
            && (!placementSelection(getMe()) || ["defense", "factory"].includes(interaction.kind)
                && !placementSelection(getMe()).forCore)) {
        hold.timer = setTimeout(() => {
            hold.used = true;
            send(`CARRY_NEAREST:${target}`);
        }, 500);
    }
}
function endInteractionHold(cancel = false) {
    const hold = interactionHold;
    if (!hold) return;
    clearTimeout(hold.timer);
    interactionHold = null;
    if (!cancel && !hold.used) {
        if (hold.interaction) hold.interaction.action();
        else toggleNearestInteraction();
    }
}
interactButton.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    interactButton.setPointerCapture(event.pointerId);
    beginInteractionHold();
});
interactButton.addEventListener("pointerup", () => endInteractionHold());
interactButton.addEventListener("pointercancel", () => endInteractionHold(true));
interactButton.addEventListener("lostpointercapture", () => endInteractionHold(true));
interactButton.addEventListener("click", event => { if (event.detail === 0) toggleNearestInteraction(); });
window.addEventListener("wheel", event => {
    if (!state || !["preparing", "wave"].includes(state.phase)) return;
    if (!actionMenu.classList.contains("hidden") || !inventoryMenu.classList.contains("hidden")
            || !howToMenu.classList.contains("hidden") || getMe()?.missileControl) return;
    event.preventDefault();
    cycleEquipment(event.deltaY > 0 ? 1 : -1);
}, { passive: false });
actionClose.addEventListener("click", closeActionMenu);
actionMenu.addEventListener("pointerdown", event => {
    if (event.target === actionMenu) closeActionMenu();
});
inventoryMenu.addEventListener("pointerdown", event => {
    if (!event.target.closest(".inventory-popover, [data-inventory-item]")) closeInventoryPopover();
    if (event.target === inventoryMenu) closeInventory();
});
inventoryMenu.addEventListener("scroll", closeInventoryPopover, true);
howToStart.addEventListener("click", openHowTo);
howToInventory.addEventListener("click", openHowTo);
howToClose.addEventListener("click", closeHowTo);
howToMenu.addEventListener("pointerdown", event => {
    if (event.target === howToMenu) closeHowTo();
});

function openHowTo() {
    endInteractionHold(true);
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
    const blackoutStatus = state.enemyBlackout ? " / BLACKOUT" : state.blackoutActive
        ? ` / BREAKER:${(state.trippedBreakers || []).length}` : "";
    phaseDetail.textContent = state.phase === "preparing"
        ? `next round in ${Math.floor(prepSeconds / 60)}:${String(prepSeconds % 60).padStart(2, "0")}${blackoutStatus}`
        : state.phase === "wave" ? `ENEMY:${state.enemies.length + state.queued}${blackoutStatus}`
            : "";
    const me = getMe();
    teamElement.innerHTML = state.players.filter(player => player.id !== myPlayerId).map(player => `
        <div class="teammate ${player.down ? "down" : player.hp <= 30 ? "low" : ""} ${player.id === myPlayerId ? "self" : ""}">
            <div class="teammate-label">
                <span>${player.id === myPlayerId ? "YOU" : escapeHtml(player.name)}</span>
                <span class="player-stats">${player.down ? "DOWN" : ""}<b>${player.credits}G</b></span>
            </div>
            <div class="hp-line"><span style="width:${100 * player.hp / (player.maxHp || 100)}%"></span></div>
            ${me?.job === "scout" ? window.JobUI.renderAllyIntel(player, AREAS, areaContains, STARTING_AREA) : ""}
        </div>`).join("");
    selfVitals.classList.toggle("hidden", !me);
    if (me) {
        const health = clamp(100 * me.hp / (me.maxHp || 100), 0, 100);
        healthHeart.style.setProperty("--health", `${health}%`);
        healthHeart.classList.toggle("full", health === 100);
        healthHeart.setAttribute("aria-label", `体力 ${Math.ceil(health)}%`);
        selfJob.textContent = JOBS[me.job]?.name || me.job;
        jobCooldownLabel.innerHTML = WeaponUI.jobCooldowns(me).map(timer =>
            `<span class="cooldown-orb" title="${timer.label}" aria-label="${timer.label} ${timer.seconds}秒">${timer.seconds}</span>`).join("");
        selfCredits.textContent = `${me.credits}G`;
        const selectedBuild = me.selectedBuild && (me.buildItems?.[me.selectedBuild] || 0) > 0
            ? me.selectedBuild : null;
        const showingItem = me.movingCore || selectedBuild;
        const cooldownMax = Math.max(.01, me.cooldownMax || me.cooldown || .01);
        const cooldownProgress = showingItem ? 1 : 1 - Math.min(1, me.cooldown / cooldownMax);
        weaponName.textContent = me.movingCore ? "CORE"
            : selectedBuild ? BUILD_INFO[selectedBuild].name : WeaponUI.name(me.weapon, WEAPON_FIELDS, me);
        weaponAmmo.textContent = me.movingCore ? "" : selectedBuild
            ? `×${me.buildItems[selectedBuild]}` : ammoForWeapon(me, me.weapon);
        weaponIcon.className = `weapon-icon ${me.movingCore ? "core" : selectedBuild ? `build-${selectedBuild}` : me.weapon}`;
        weaponCooldown.textContent = showingItem ? "R TO PLACE"
            : me.weapon === "hook" ? (me.hookTargetId >= 0 ? me.hookReeling ? "CLICK: RELEASE" : "CLICK: REEL" : "CLICK: HOOK")
            : WeaponUI.cooldownLabel(me.cooldown, me.railgunCharge, me.railgunRemaining);
        weaponButton.style.setProperty("--cooldown-progress", `${cooldownProgress * 100}%`);
        weaponButton.classList.toggle("cooling", !showingItem && me.cooldown > 0);
        weaponButton.classList.toggle("locked", me.movingCore);
        weaponButton.disabled = me.movingCore;
        if (me.drone?.controlled) {
            weaponName.textContent = me.drone.weapon ? `DRONE / ${WeaponUI.name(me.drone.weapon, WEAPON_FIELDS, me)}` : "DRONE";
            weaponAmmo.textContent = me.drone.weapon ? ammoForWeapon(me, me.drone.weapon) : "";
            weaponIcon.className = `weapon-icon ${me.drone.weapon || "drone"}`;
            weaponCooldown.textContent = !me.drone.weapon ? "UNARMED" : WeaponUI.cooldownLabel(me.drone.cooldown);
            weaponButton.style.setProperty("--cooldown-progress", `${(1 - me.drone.cooldown / me.drone.cooldownMax) * 100}%`);
            weaponButton.classList.toggle("cooling", me.drone.cooldown > 0);
            weaponButton.disabled = true;
        }
        const silverLabel = !showingItem || me.drone?.controlled
            ? WeaponUI.silverAmmoLabel(me, me.drone?.controlled ? me.drone.weapon : me.weapon, WEAPON_FIELDS) : "";
        weaponSilver.textContent = silverLabel;
        weaponSilver.hidden = !silverLabel;
        weaponButton.classList.toggle("silver-active", Boolean(silverLabel));
        updateSecondaryHud(me);
        updateAttackerLoadout(me);
        updateInventory(me);
        const placing = Boolean(placementSelection(me));
        const interaction = findNearestInteraction();
        interactLabel.textContent = placing ? "PLACE" : interaction?.kind === "teleporter"
            ? interaction.owned ? "TP / 長押しで回収" : "TP" : ["core", "defense"].includes(interaction?.kind) ? "長押しで運搬" : "INTERACT";
        interactButton.classList.toggle("hidden", !placing && !interaction);
    }
}

function updateSecondaryHud(me) {
    const panel = document.querySelector("#secondary-hud");
    panel.classList.toggle("hidden", me.job !== "attacker" || Boolean(me.drone?.controlled));
    if (me.job !== "attacker") return;
    const weapon = me.secondaryWeapon || "bat";
    document.querySelector("#secondary-icon").className = `weapon-icon ${weapon}`;
    const progress = 1 - Math.min(1, (me.secondaryCooldown || 0) / Math.max(.01, me.secondaryCooldownMax || me.secondaryCooldown || .01));
    panel.style.setProperty("--cooldown-progress", `${progress * 100}%`);
    document.querySelector("#secondary-name").textContent = WeaponUI.name(weapon, WEAPON_FIELDS, me);
    document.querySelector("#secondary-ammo").textContent = ammoForWeapon(me, weapon);
    document.querySelector("#secondary-cooldown").textContent = WeaponUI.cooldownLabel(
        me.secondaryCooldown, me.secondaryRailgunCharge, me.secondaryRailgunRemaining);
    const silver = document.querySelector("#secondary-silver");
    silver.textContent = WeaponUI.silverAmmoLabel(me, weapon, WEAPON_FIELDS);
    silver.hidden = !silver.textContent;
}

function updateAttackerLoadout(me) {
    const panel = document.querySelector("#attacker-loadout");
    panel.classList.toggle("hidden", me.job !== "attacker");
    if (me.job !== "attacker") return;
    const entries = WeaponUI.entries(me, WEAPON_FIELDS);
    for (const select of panel.querySelectorAll("select")) {
        const opposite = select.dataset.hand === "left" ? me.secondaryWeapon : me.weapon;
        const options = entries.filter(entry => entry.value !== opposite)
            .map(entry => '<option value="' + entry.value + '">' + escapeHtml(entry.label) + '</option>').join("")
            || '<option value="none">—</option>';
        if (select.dataset.options !== options) {
            select.innerHTML = options;
            select.dataset.options = options;
        }
        select.value = select.dataset.hand === "left" ? me.weapon : me.secondaryWeapon || "bat";
        select.disabled = me.down || me.movingCore || me.missileControl;
    }
}

document.querySelector("#attacker-loadout").addEventListener("change", event => {
    const select = event.target.closest("select[data-hand]");
    const me = getMe();
    if (!select || select.disabled || me?.job !== "attacker" || me.down || me.movingCore) return;
    if (select.value === (select.dataset.hand === "left" ? me.secondaryWeapon : me.weapon)) return;
    if (!WeaponUI.entries(me, WEAPON_FIELDS).some(entry => entry.value === select.value)) return;
    if (firingPointer) stopFiring(firingPointer.clientX, firingPointer.clientY);
    stopSecondaryFiring();
    send((select.dataset.hand === "left" ? "WEAPON:" : "SECONDARY_WEAPON:") + select.value);
});

// Keep button nodes alive across snapshots so a press spanning a network update still clicks.
function updateInventory(me) {
    if (!inventoryItems.querySelector(".equipment-grid")) {
        inventoryItems.innerHTML = `
            <div class="inventory-job" aria-label="現在の職業"></div>
            <div class="inventory-status"><div class="inventory-health" role="status"></div><strong class="inventory-gold"></strong></div>
            <div class="inventory-section"><h3>ARMOR <span class="armor-total"></span></h3><div class="inventory-grid armor-grid">
                <div class="armor-slot" data-armor="tops"><i class="armor-icon tops" aria-hidden="true"></i><strong>TOPS</strong><span></span></div>
                <div class="armor-slot" data-armor="bottoms"><i class="armor-icon bottoms" aria-hidden="true"></i><strong>BOTTOMS</strong><span></span></div>
            </div></div>
            <div class="inventory-section"><h3>EQUIPMENT</h3><div class="inventory-grid equipment-grid"></div></div>
            <div class="inventory-section inventory-sub" hidden><h3>SUB</h3><div class="inventory-resource"><strong></strong><span></span></div></div>
            <div class="inventory-section"><h3>ITEMS</h3><div class="inventory-grid">
                <button type="button" class="inventory-resource" data-item="medkit" data-inventory-item="medkit" aria-haspopup="true" aria-expanded="false">
                    <strong>回復キット</strong><span class="item-count"></span>
                </button>
            </div></div>
            <div class="inventory-section"><h3>MATERIALS</h3><div class="inventory-grid materials-grid">
                ${resourceInventoryCard("wood")}
                ${resourceInventoryCard("ore")}
                ${resourceInventoryCard("copper")}
                ${resourceInventoryCard("silver")}
            </div></div>
            <div class="inventory-popover" role="group" aria-label="アイテム操作" hidden>
                <div class="inventory-popover-heading"><strong></strong><button type="button" data-close-inventory-actions aria-label="閉じる">×</button></div>
                <div class="resource-actions">
                    <button type="button" data-use="medkit">使用</button>
                    <button type="button" data-amount="1">1個落とす</button>
                    <button type="button" data-amount="all">全部落とす</button>
                </div>
            </div>`;
    }
    inventoryItems.querySelector(".inventory-job").textContent = `JOB · ${JOBS[me.job]?.name || me.job || "—"}`;
    inventoryItems.querySelector(".inventory-health").textContent = `HP ${Math.ceil(me.hp)} / ${me.maxHp || 100}${me.down ? "（ダウン中）" : ""}`;
    const medkitCard = inventoryItems.querySelector('[data-item="medkit"]');
    medkitCard.querySelector(".item-count").textContent = `×${me.medkits || 0}`;
    medkitCard.disabled = me.down || !(me.medkits > 0);
    inventoryItems.querySelector(".inventory-gold").textContent = `${(me.credits || 0).toLocaleString()} G`;
    for (const [piece, worn, reduction] of [["tops", me.armorTops, 20], ["bottoms", me.armorBottoms, 10]]) {
        const slot = inventoryItems.querySelector(`[data-armor="${piece}"]`);
        slot.classList.toggle("equipped", Boolean(worn));
        slot.querySelector("span").textContent = worn ? `装着中 · −${reduction}%` : "未装備";
    }
    inventoryItems.querySelector(".armor-total").textContent = `被ダメージ −${(me.armorTops ? 20 : 0) + (me.armorBottoms ? 10 : 0)}%`;
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
            button.innerHTML = '<i aria-hidden="true"></i><strong></strong><span></span>';
            grid.insertBefore(button, grid.children[index] || null);
        }
        if (grid.children[index] !== button) grid.insertBefore(button, grid.children[index] || null);
        button.classList.toggle("selected", selectedKey === entry.key);
        button.disabled = entry.kind === "item" && (me.down || me.hp >= (me.maxHp || 100))
            || me.job === "attacker" && entry.kind === "weapon" && entry.value === me.secondaryWeapon;
        button.querySelector("strong").textContent = `${index + 1}. ${entry.label}`;
        button.querySelector("i").className = `weapon-icon ${entry.kind === "build" ? "build-" : ""}${entry.value}`;
        button.querySelector("span").textContent = entry.kind === "build" ? `×${me.buildItems[entry.value]}`
            : entry.kind === "item" ? `×${me.medkits} · 使用する`
            : entry.kind === "core" ? ""
                : WEAPON_FIELDS[entry.value]?.capacity > 0 ? `${ammoForWeapon(me, entry.value)} / ${WeaponUI.capacity(me, WEAPON_FIELDS[entry.value])}`
                    : entry.value === "pistol" ? "∞" : "";
    });
    if (me.job === "attacker") {
        const sub = inventoryItems.querySelector(".inventory-sub");
        sub.hidden = false;
        sub.querySelector("strong").textContent = WeaponUI.name(me.secondaryWeapon || "bat", WEAPON_FIELDS, me);
        const definition = WEAPON_FIELDS[me.secondaryWeapon];
        sub.querySelector("span").textContent = WeaponUI.ammo(me, me.secondaryWeapon || "bat", WEAPON_FIELDS)
            + (definition?.capacity > 0 ? ` / ${WeaponUI.capacity(me, definition)}` : "");
    } else {
        const sub = inventoryItems.querySelector(".inventory-sub");
        if (sub) sub.hidden = true;
    }
    for (const type of Object.keys(RESOURCE_NAMES)) {
        const card = inventoryItems.querySelector(`[data-resource="${type}"]`);
        card.querySelector(".resource-count").textContent = `×${me[type] || 0}`;
        card.disabled = me.down || !(me[type] > 0);
    }
    updateInventoryPopover(me);
}

inventoryItems.addEventListener("click", event => {
    if (performance.now() < inventorySuppressClickUntil) return;
    const button = event.target.closest("button");
    const me = getMe();
    if (!button || button.disabled || !me || me.down) return;
    if (button.dataset.inventoryItem) {
        const popup = inventoryItems.querySelector(".inventory-popover");
        const type = button.dataset.inventoryItem;
        if (!popup.hidden && popup.dataset.item === type) { closeInventoryPopover(); return; }
        closeInventoryPopover();
        popup.dataset.item = type;
        popup.hidden = false;
        button.setAttribute("aria-expanded", "true");
        updateInventoryPopover(me);
        const rect = button.getBoundingClientRect();
        popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - popup.offsetWidth - 8))}px`;
        popup.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - popup.offsetHeight - 8))}px`;
    } else if (button.hasAttribute("data-close-inventory-actions")) {
        closeInventoryPopover();
    } else if (button.dataset.key) {
        closeInventoryPopover();
        const entry = equipmentEntries(me).find(candidate => candidate.key === button.dataset.key);
        if (entry) selectEquipment(entry);
    } else if (button.dataset.use) {
        if (me.medkits > 0 && me.hp < (me.maxHp || 100)) send("USE:medkit");
    } else if (button.dataset.dropItem) {
        const amount = button.dataset.amount === "all" ? me.medkits : 1;
        if (me.medkits > 0) send(`DROP_ITEM:medkit:${amount}`);
    } else if (button.dataset.drop) {
        const type = button.dataset.drop;
        const amount = button.dataset.amount === "all" ? me[type] : 1;
        if (me[type] > 0 && amount > 0) send(`DROP_RESOURCE:${type}:${amount}`);
    }
});

function resourceInventoryCard(type) {
    return `<button type="button" class="inventory-resource" data-resource="${type}" data-inventory-item="${type}" aria-haspopup="true" aria-expanded="false">
        <strong>${RESOURCE_NAMES[type]}</strong><span class="resource-count"></span>
    </button>`;
}

function closeInventoryPopover() {
    const popup = inventoryItems.querySelector(".inventory-popover");
    if (popup) popup.hidden = true;
    inventoryItems.querySelector('[aria-expanded="true"]')?.setAttribute("aria-expanded", "false");
}

function updateInventoryPopover(me) {
    const popup = inventoryItems.querySelector(".inventory-popover");
    if (!popup || popup.hidden) return;
    const type = popup.dataset.item;
    const count = type === "medkit" ? me.medkits : me[type];
    if (me.down || !(count > 0)) { closeInventoryPopover(); return; }
    popup.querySelector("strong").textContent = `${type === "medkit" ? "回復キット" : RESOURCE_NAMES[type]} ×${count}`;
    const use = popup.querySelector("[data-use]");
    use.hidden = type !== "medkit";
    use.disabled = me.hp >= (me.maxHp || 100);
    for (const button of popup.querySelectorAll("[data-amount]")) {
        delete button.dataset.drop;
        delete button.dataset.dropItem;
        button.dataset[type === "medkit" ? "dropItem" : "drop"] = type;
    }
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

function resumeGameLook() {
    if(typeof fpsInput === "undefined" || !fpsInput || !["preparing","wave"].includes(state?.phase)
        || exitDialog.open || !actionMenu.classList.contains("hidden") || !inventoryMenu.classList.contains("hidden")
        || !howToMenu.classList.contains("hidden") || window.coreMenu?.settingsOpen?.() || window.JobUI?.isConfirming?.() || getMe()?.missileControl)return;
    fpsInput.setActive(true);
    fpsInput.capture();
}
function closeInventory() {
    inventoryMenu.classList.add("hidden");
    closeInventoryPopover();
    resumeGameLook();
}
function toggleInventory() {
    closeInventoryPopover();
    endInteractionHold(true);
    if (firingPointer) stopFiring(firingPointer.clientX, firingPointer.clientY);
    if (secondaryHeld) stopSecondaryFiring();
    if (!inventoryMenu.classList.contains("hidden")) {
        closeInventory();
        return;
    }
    closeActionMenu(false);
    inventoryMenu.classList.remove("hidden");
    fpsInput?.setActive(false,true);
}

function setDash(active) {
    dashRequested = active;
    send(`DASH:${active ? 1 : 0}`);
}

function showNotice(text) {
    const entry = {
        id: `${Date.now()}-${Math.random()}`,
        text: String(text),
        danger: String(text).endsWith("がダウンしました") || String(text).includes("DOWN") || String(text).includes("DESTROYED"),
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

function playSoundEffect(message) {
    const me = getMe();
    if (!me) return;
    if (message.effect === "missile-launch") {
        window.coreAudio?.play("missile-launch", 0);
        return;
    }
    if (message.effect === "missile-impact") {
        window.coreAudio?.play("missile-impact", 0);
        document.body.animate?.([
            { transform: "translate(0, 0)" }, { transform: "translate(-2px, 1px)" },
            { transform: "translate(2px, -1px)" }, { transform: "translate(-1px, 1px)" },
            { transform: "translate(1px, 0)" }, { transform: "translate(0, 0)" },
        ], { duration: 220, easing: "ease-out" });
        return;
    }
    if (message.item === "railgun-charge" || message.effect === "shot" && message.item === "railgun") return;
    const own = message.playerId === myPlayerId;
    if (message.effect === "pickup" && !own) return;
    let name;
    if (message.effect === "shot") name = message.item === "railgun-charge" ? message.item : message.weapon;
    else if (message.effect === "item-use") name = BUILD_INFO[message.item] ? "build" : message.item || "item";
    else if (message.effect === "pickup") name = "pickup";
    else if (message.effect === "player-hit" && own) name = "damage";
    else if (message.effect === "drone-self-destruct") name = "drone-self-destruct";
    else return;
    const actor = state?.players.find(player => player.id === message.playerId);
    const origin = Number.isFinite(message.x) && Number.isFinite(message.y) ? message : actor;
    if (!own && !origin) return;
    window.coreAudio?.play(name, own ? 0 : distance(predictedLocal || me, origin));
}

function getMe() { return state?.players.find(player => player.id === myPlayerId); }

function ammoForWeapon(player, weapon) {
    return WeaponUI.ammo(player, weapon, WEAPON_FIELDS);
}

function reconcileLocalPrediction(snapshot) {
    const serverMe = snapshot.players.find(player => player.id === myPlayerId);
    if (!serverMe) return;
    acknowledgeInputs(serverMe.ackInput);
    if (!predictedLocal) {
        predictedLocal = { x: serverMe.x, y: serverMe.y, stamina: serverMe.stamina, dashing: serverMe.dashing, down: Boolean(serverMe.down), exhausted: false };
        localFacing = { x: serverMe.facingX, y: serverMe.facingY };
    }
    if (predictedLocal.down !== undefined && predictedLocal.down !== Boolean(serverMe.down)) {
        predictedLocal.x = serverMe.x; predictedLocal.y = serverMe.y;
        predictedLocal.stamina = serverMe.stamina;
        predictedLocal.dashing = false;
        predictedLocal.movementPauseUntil = performance.now() + 120;
        sendMovement(true);
    }
    predictedLocal.down = Boolean(serverMe.down);
    const beforeX=predictedLocal.x, beforeY=predictedLocal.y, beforeHeight=predictedLocal.jumpHeight || 0;
    if (typeof window !== "undefined" && window.JumpMovement) {
        const jumpPending=pendingInputs.some(input=>input.kind==="JUMP");
        if (!jumpPending) {
            predictedLocal.jumpHeight=serverMe.jumpHeight || 0;
            predictedLocal.jumpVelocity=serverMe.jumpVelocity || 0;
            predictedLocal.renderOffsetHeight=(predictedLocal.renderOffsetHeight || 0)+beforeHeight-predictedLocal.jumpHeight;
        }
    }
    const errorX = serverMe.x - predictedLocal.x;
    const errorY = serverMe.y - predictedLocal.y;
    const error = Math.hypot(errorX, errorY);
    if (error > 120 || serverMe.scoutDashRemaining > 0 || predictedLocal.scoutDashRemaining > 0
            || !(["preparing", "wave"].includes(snapshot.phase) || snapshot.phase === "won" && snapshot.victoryMoveRemaining > 0)) {
        predictedLocal.x = serverMe.x;
        predictedLocal.y = serverMe.y;
    } else {
        const waitingForMovement = pendingInputs.some(input => input.kind === "MOVE" || input.kind === "DASH");
        const moving = Math.hypot(localMove.x, localMove.y) > .12;
        const correction = waitingForMovement ? .14 : moving ? .38 : .72;
        predictedLocal.x += errorX * correction;
        predictedLocal.y += errorY * correction;
    }
    if (error <= 120 && !predictedLocal.movementPauseUntil) {
        predictedLocal.renderOffsetX=(predictedLocal.renderOffsetX || 0)+beforeX-predictedLocal.x;
        predictedLocal.renderOffsetY=(predictedLocal.renderOffsetY || 0)+beforeY-predictedLocal.y;
    } else { predictedLocal.renderOffsetX=0; predictedLocal.renderOffsetY=0; predictedLocal.renderOffsetHeight=0; }
    predictedLocal.stamina += (serverMe.stamina - predictedLocal.stamina) * .4;
    predictedLocal.scoutDashRemaining = serverMe.scoutDashRemaining || 0;
    predictedLocal.scoutDashDx = serverMe.scoutDashDx || 0;
    predictedLocal.scoutDashDy = serverMe.scoutDashDy || 0;
    if (Math.hypot(localMove.x, localMove.y) <= .12) {
        localFacing = { x: serverMe.facingX, y: serverMe.facingY };
    }
    if (serverMe.stamina >= 28) predictedLocal.exhausted = false;
    if (serverMe.stamina <= 0) predictedLocal.exhausted = true;
}

function openActionMenu(title, options, layout = "default") {
    actionTitle.textContent = title;
    if (options[0]?.titleAmmo) actionTitle.innerHTML = `${escapeHtml(title)}<span class="shop-ammo">${escapeHtml(options[0].titleAmmo)}</span>`;
    document.querySelector("#workbench-materials").hidden = layout !== "workbench";
    updateWorkbenchMaterials();
    actionMenu.classList.toggle("single-action", layout === "single");
    const buttons = Array.from(actionOptions.children);
    const reuseButtons = buttons.length === options.length
        && options.every((option, index) => buttons[index].dataset.command === (option.command || ""));
    if (!reuseButtons) actionOptions.replaceChildren();
    options.forEach((option, index) => {
        const button = reuseButtons ? buttons[index] : document.createElement("button");
        button.disabled = Boolean(option.disabled);
        const content = `${escapeHtml(option.label)}${option.detail ? `<small>${escapeHtml(option.detail)}</small>` : ""}`
            + (option.stock ? `<span class="action-stock">${escapeHtml(option.stock)}</span>` : "")
            + (option.ammoStock || []).map(entry => `<span class="ammo-refill-row">${escapeHtml(entry.name)}<span class="shop-ammo">${escapeHtml(entry.count)}</span></span>`).join("");
        if (button.innerHTML !== content) button.innerHTML = content;
        button.onclick = option.onSelect || (option.command ? () => {
            send(option.command);
            if (!option.command.startsWith("BUY:") && !option.command.startsWith("CRAFT:")
                    && !option.command.startsWith("UPGRADE:")) closeActionMenu();
        } : null);
        if (!reuseButtons) {
            button.dataset.command = option.command || "";
            actionOptions.append(button);
        }
    });
    actionMenu.classList.remove("hidden");
    fpsInput?.setActive(false,true);
}

function openNearbyActionMenu(title, options, target, range, layout = "default", refresh = null) {
    if (!canUseNearby(target, range, true)) return;
    activeMenuAccess = { target: { x: target.x, y: target.y }, range, refresh };
    openActionMenu(title, options, layout);
}

function canUseNearby(target, range, showReason) {
    const me = getMe();
    if (me?.drone?.controlled || me?.missileControl) return false;
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

function closeActionMenu(restore=true) {
    activeMenuAccess = null;
    actionMenu.classList.add("hidden");
    actionMenu.classList.remove("single-action");
    if(restore)resumeGameLook();
}

function requestJobChange(job) {
    const me = getMe();
    if (!me || me.down || me.job === job) return;
    window.JobUI.confirmChange(me, job, WEAPON_FIELDS, state.rules.weaponLimit, discard =>
        send("JOB:" + job + (discard ? ":" + discard : "")));
}

function openJobStation() {
    if (!canUseNearby(JOB_STATION, 70, true)) return;
    activeMenuAccess = { target: JOB_STATION, range: 70, refresh: refreshJobStation };
    actionTitle.textContent = "JOB";
    document.querySelector("#workbench-materials").hidden = true;
    actionMenu.classList.remove("single-action", "hidden");
    refreshJobStation();
}

function refreshJobStation() {
    const me = getMe();
    if (actionOptions.dataset.selectedJob === me?.job && actionOptions.querySelector(".job-picker")) return;
    const position = actionOptions.querySelector(".job-list")?.scrollTop || 0;
    const focused = document.activeElement?.dataset.job;
    actionOptions.innerHTML = window.JobUI.render(me?.job, !me || me.down, JOBS, "station-job-detail");
    actionOptions.dataset.selectedJob = me?.job;
    actionOptions.querySelector(".job-list").scrollTop = position;
    actionOptions.querySelectorAll("[data-job]").forEach(button => {
        button.onclick = () => requestJobChange(button.dataset.job);
        if (button.dataset.job === focused) button.focus({ preventScroll: true });
    });
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
        const metal = ["turret", "copperTurret", "silverTurret", "overclockSilver", "wire", "mine"].includes(slot.defense.type);
        const resource = slot.defense.type === "copperBarricade" ? "copper"
            : slot.defense.type === "silverBarricade" ? "silver" : metal ? "ore" : "wood";
        const me = getMe();
        openNearbyActionMenu(`${slot.defense.type.toUpperCase()} — HP ${Math.ceil(slot.defense.hp)}/${Math.ceil(slot.defense.maxHp)}`, [{
            label: "REPAIR",
            detail: slot.defense.hp >= slot.defense.maxHp ? "耐久値最大" : `${resource.toUpperCase()} 1`,
            command: `REPAIR:${slot.id}`,
            disabled: slot.defense.hp >= slot.defense.maxHp || (me[resource] || 0) < 1,
        }, {
            label: "PICK UP",
            detail: "耐久値を保ったまま回収。R長押しでも運搬できます",
            command: `REMOVE:${slot.id}`,
            disabled: slot.temporaryRemaining > 0,
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
    if (distance(point, ARMORY) < 36 || MEDBAYS.some(station => distance(point, station) < 36)
            || distance(point, WOODCUTTER) < 36 || distance(point, QUARRY) < 36) return false;
    if (AREAS.some(area => !state.areas[area.id] && distance(point, { x: area.terminalX, y: area.terminalY }) < 36)) return false;
    if (WORKBENCHES.some(workbench => distance(point, workbench) < 36)) return false;
    if (SHOP_UNITS.some(shop => distance(point, shop) < 36)) return false;
    if (BREAKER_TERMINALS.some(breaker => distance(point, breaker) < 36)) return false;
    if (PREP_CONSOLE && distance(point, PREP_CONSOLE) < 36) return false;
    if ([MISSILE_COMPUTER, JOB_STATION].some(unit => unit && distance(point, unit) < 36)) return false;
    if ((state.resources || []).some(node => distance(point, node) < 36)) return false;
    if (SPAWN_POINTS.some(spawn => distance(point, spawn) < 80)) return false;
    if (state.players.some(owner => (owner.teleportPads || []).some(pad => distance(point, pad) < (forCore ? 45 : 36)))) return false;
    if ((state.factories || []).some(unit => distance(point, unit) < (forCore ? 45 : 36))) return false;
    if (state.slots.some(slot => slot.defense && distance(point, slot) < (forCore ? 45 : 36))) return false;
    return !state.players.some(player => (forCore ? player.id !== myPlayerId && !player.down && distance(point, player) < 24
        : Math.abs(point.x - player.x) < 23 && Math.abs(point.y - player.y) < 23))
        && !state.enemies.some(enemy => enemy.hp > 0 && distance(point, enemy) < (forCore ? 55 : 48));
}

function openCoreMenu() {
    const core = state.core;
    const { hp: hpCost, shield: shieldCost, defense: defenseCost, regen: regenCost } = state.rules.coreCosts;
    openNearbyActionMenu(`CORE HP ${Math.ceil(core.hp)} / ${Math.ceil(core.maxHp)} · SHIELD ${Math.ceil(core.shield)} / ${Math.ceil(core.maxShield)}`, [
        option("MAX HP +250", hpCost, "UPGRADE:hp"),
        option("SHIELD +180", shieldCost, "UPGRADE:shield"),
        option(`DEFENSE Lv.${core.defense + 1}`, defenseCost, "UPGRADE:defense", core.defense >= 4),
        option(`AUTO REPAIR Lv.${core.regen + 1}`, regenCost, "UPGRADE:regen", core.regen >= 4),
        { label: "MOVE CORE", detail: "運搬後、正面の色付きタイルへRで設置", command: "EQUIP_CORE" },
    ], core, INTERACTION_RANGE.core, "default", openCoreMenu);
}

function openPrepConsoleMenu() {
    const me = getMe();
    const cost = state.prepExtensionCost ?? PREP_CONSOLE.cost;
    const queued = state.phase === "wave" && state.nextPrepBonus > 0
        ? ` / 予約 +${Math.floor(state.nextPrepBonus / 60)}:00` : "";
    openNearbyActionMenu("TIME CONTROL", [{
        label: "+1:00",
        detail: `${cost}G${queued}`,
        command: "EXTEND_PREP",
        disabled: !me || me.credits < cost,
    }], PREP_CONSOLE, 95, "single");
}

function openShopPurchase(shop, chooseExchange = false) {
    const me = getMe();
    if (["enchant", "armor", "overclockSilver", "teamMachine"].includes(shop.item)) {
        openUpgradeShop(shop);
        return;
    }
    if (shop.item === "gacha") { openGachaShop(shop); return; }
    const ammoShop = shop.item === "ammo";
    if (shop.item === "medkit") {
        openNearbyActionMenu(shop.label, [{
            label: "回復キット",
            detail: `${shop.cost}G`,
            stock: `所持 ${me.medkits} / ${state.rules.medkitCapacity}`,
            command: "BUY:medkit",
            disabled: me.medkits >= state.rules.medkitCapacity || me.credits < shop.cost,
        }], shop, INTERACTION_RANGE.shop, "single", () => openShopPurchase(shop));
        return;
    }
    if (shop.item.endsWith("Factory")) {
        const cost = Math.ceil(shop.cost * (me.buildingCostMultiplier ?? 1));
        openNearbyActionMenu(shop.label, [{
            label: "BUY",
            detail: cost + "G",
            command: "BUY:" + shop.item,
            disabled: !me || me.credits < cost,
        }], shop, INTERACTION_RANGE.shop, "single", () => openShopPurchase(shop));
        return;
    }
    const weaponFields = WEAPON_FIELDS[shop.item];
    const level = me.enchantments?.[shop.item] || 0;
    const title = shop.label + (weaponFields && level > 0 ? ` +${level}` : "");
    const alreadyOwned = Boolean(weaponFields && WeaponUI.owns(me, weaponFields));
    const ammo = alreadyOwned ? me[weaponFields.ammo] : 0;
    const mountedWeapon = me.drone?.active ? me.drone.weapon : null;
    const mounted = shop.item === mountedWeapon;
    const ownedWeapons = WeaponUI.ownedAmmoWeapons(me, WEAPON_FIELDS)
        .filter(fields => fields !== WEAPON_FIELDS[mountedWeapon]);
    const ammoFull = ammoShop ? ownedWeapons.length > 0
        && ownedWeapons.every(fields => me[fields.ammo] >= WeaponUI.capacity(me, fields))
        : alreadyOwned && ammo >= WeaponUI.capacity(me, weaponFields);
    const price = ammoShop ? Math.max(shop.cost, ...ownedWeapons.map(fields => fields.refillCost || 0))
        : alreadyOwned ? weaponFields.refillCost ?? WEAPON_AMMO_REFILL_COST : shop.cost;
    const unavailable = ammoShop && ownedWeapons.length === 0;
    const weaponLimitReached = weaponFields && !alreadyOwned
        && WeaponUI.atLimit(me, WEAPON_FIELDS, state.rules.weaponLimit);
    if (weaponLimitReached && chooseExchange) {
        openNearbyActionMenu(title, WeaponUI.entries(me, WEAPON_FIELDS)
            .filter(entry => !WEAPON_FIELDS[entry.value]?.meleeSlot && entry.value !== "bat" && entry.value !== mountedWeapon).map(entry => ({
                label: `交換: ${entry.label}`,
                command: `BUY:${shop.item}:${entry.value}`,
                disabled: me.credits < price,
            })), shop, INTERACTION_RANGE.shop, "default", () => openShopPurchase(shop, true));
        return;
    }
    const options = [{
        label: mounted ? "DRONE" : ammoFull ? "FULL" : alreadyOwned || ammoShop && !unavailable ? "REFILL"
            : unavailable ? "LOCKED" : "BUY",
        detail: `${price}G`,
        titleAmmo: alreadyOwned && weaponFields.capacity > 0 ? `${ammo} / ${WeaponUI.capacity(me, weaponFields)}` : "",
        command: weaponLimitReached ? undefined : `BUY:${shop.item}`,
        onSelect: weaponLimitReached ? () => openShopPurchase(shop, true) : undefined,
        disabled: mounted || ammoFull || unavailable || me.credits < price,
    }];
    openNearbyActionMenu(title, options, shop, INTERACTION_RANGE.shop, "single", () => openShopPurchase(shop));
}

function openGachaShop(shop, exchange = false) {
    const me = getMe(), result = me.gachaWeapon;
    const ammoPrize = result === "silverAmmo200";
    const owned = result && !ammoPrize && WeaponUI.owns(me, WEAPON_FIELDS[result]);
    const full = result && !ammoPrize && !WEAPON_FIELDS[result]?.meleeSlot && !owned && WeaponUI.atLimit(me, WEAPON_FIELDS, state.rules.weaponLimit);
    const options = !result ? [{
        label: "ROLL", detail: shop.cost + "G", command: "BUY:gacha:roll", disabled: me.credits < shop.cost,
    }] : full && exchange ? WeaponUI.entries(me, WEAPON_FIELDS)
        .filter(entry => !WEAPON_FIELDS[entry.value]?.meleeSlot && entry.value !== "bat" && !(me.drone?.active && me.drone.weapon === entry.value))
        .map(entry => ({label: "交換: " + entry.label, command: "BUY:gacha:" + entry.value})) : [{
            label: owned ? "REFILL" : full ? "交換して受け取る" : result === "plasmaBlade" ? "BATと交換" : "TAKE",
            command: full ? undefined : "BUY:gacha:take",
            onSelect: full ? () => openGachaShop(shop, true) : undefined,
            disabled: owned && (me.drone?.active && me.drone.weapon === result
                || WEAPON_FIELDS[result].capacity === 0),
        }];
    if (result) options.push({label: "SKIP", command: "BUY:gacha:skip"});
    openNearbyActionMenu(ammoPrize ? "SILVER AMMO ×200" : result ? WeaponUI.name(result, WEAPON_FIELDS, me) : shop.label,
        options, shop, INTERACTION_RANGE.shop, "default", () => openGachaShop(shop, exchange));
}

function openUpgradeShop(shop) {
    const me = getMe(), rules = state.rules.upgrades;
    let options;
    if (shop.item === "enchant") {
        options = WeaponUI.entries(me, WEAPON_FIELDS).filter(entry => entry.value !== "bat" && !["hook", "repulsor"].includes(entry.value)).map(entry => {
            const level = me.enchantments?.[entry.value] || 0;
            const max = level >= rules.enchantMax;
            const price = rules.enchantCosts[level];
            return {label: entry.label, detail: max ? "MAX · AUTO AIM" : `火力 +${Math.round(rules.enchantStep * 100)}%${level + 1 >= (rules.autoAimLevel ?? rules.enchantMax) ? " · AUTO AIM" : ""} · ${price}G`,
                command: `BUY:enchant:${entry.value}`, disabled: max || me.credits < price
                    || me.drone?.active && me.drone.weapon === entry.value};
        });
        if (!options.length) options = [{label: "武器なし", disabled: true}];
    } else if (shop.item === "armor") {
        options = [["BOTTOMS", "bottoms", "armorBottoms", rules.bottomsCost, rules.bottomsReduction],
            ["TOPS", "tops", "armorTops", rules.topsCost, rules.topsReduction]].map(([label, item, field, price, reduction]) => ({
                label, detail: me[field] ? "OWNED" : `被ダメージ −${Math.round(reduction * 100)}% · ${price}G`,
                command: `BUY:armor:${item}`, disabled: me[field] || me.credits < price}));
    } else if (shop.item === "overclockSilver") {
        const cost = Math.ceil(rules.compressionCost * (me.buildingCostMultiplier ?? 1));
        options = [{label: "オーバークロックシルバー", detail: `銀タレット ×${cost}`,
            stock: `所持 ${me.buildItems?.silverTurret || 0}`, command: "BUY:overclockSilver",
            disabled: (me.buildItems?.silverTurret || 0) < cost}];
    } else {
        const remaining = state.teamBuffRemaining || 0;
        options = [{label: remaining > 0 ? `${Math.ceil(remaining)}s` : "ACTIVATE",
            detail: `エリア内: 火力 +${Math.round((rules.teamDamage - 1) * 100)}% · 被ダメージ −${Math.round((1 - rules.teamDefense) * 100)}%`,
            stock: `${rules.teamDuration}s · ${rules.teamCost}G`, command: "BUY:teamMachine",
            disabled: remaining > 0 || me.credits < rules.teamCost}];
    }
    openNearbyActionMenu(shop.label, options, shop, INTERACTION_RANGE.shop,
        "default", () => openUpgradeShop(shop));
}

function openBreakerMenu(breaker) {
    send(`${state.blackoutActive && (state.trippedBreakers || []).includes(breaker.id) ? "BREAKER" : "BREAKER_MAP"}:${breaker.id}`);
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
        detail: me.gatherCooldown > 0 ? `再採取まで ${me.gatherCooldown.toFixed(1)}秒` : "ORE +1 / クラフト素材",
        command: "GATHER:ore",
        disabled: me.gatherCooldown > 0,
    }], QUARRY, INTERACTION_RANGE.resource);
}

function openWorkbenchMenu(workbench) {
    const me = getMe();
    const order = { block: 0, barricade: 1, copperBarricade: 2, silverBarricade: 3, wire: 4, mine: 5, turret: 6, copperTurret: 7, silverTurret: 8 };
    const materialCost = amount => Math.ceil((amount || 0) * (me.buildingCostMultiplier ?? 1));
    const options = Object.entries(BUILD_INFO).filter(([, info]) => !info.shopOnly)
        .sort(([a], [b]) => (order[a] ?? 7) - (order[b] ?? 7)).map(([type, info]) => ({
        label: info.name,
        detail: `${info.description} — ${Object.entries(RESOURCE_NAMES).filter(([key]) => info[key] > 0).map(([key, name]) => `${name} ${materialCost(info[key])}`).join(" / ")}`,
        command: `CRAFT:${type}`,
        disabled: Object.keys(RESOURCE_NAMES).some(key => (me[key] || 0) < materialCost(info[key])),
    }));
    if (state.rules.silverAmmo) {
        const silver = state.rules.silverAmmo;
        options.push({
            label: `銀弾 +${silver.amount}`,
            detail: `銀 ${silver.cost}`,
            stock: `所持 ${me.silverAmmo ?? 0}発 · 火力 ×${silver.damageMultiplier}`,
            command: "CRAFT:silverAmmo",
            disabled: (me.silver ?? 0) < silver.cost,
        });
    }
    openNearbyActionMenu("WORKBENCH", options, workbench, INTERACTION_RANGE.workbench,
        "workbench", () => openWorkbenchMenu(workbench));
}

function updateWorkbenchMaterials() {
    const materials = document.querySelector("#workbench-materials");
    const me = getMe();
    if (materials.hidden || !me) return;
    materials.textContent = `所持材料：${Object.entries(RESOURCE_NAMES)
        .map(([key, name]) => `${name} ${me[key] || 0}`).join(" / ")}`;
}


function openUnlockMenu(area) {
    const cost = state.rules.areaUnlockCosts?.[area.id] ?? state.rules.unlockCost;
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
    scale = Math.max(canvas.width / VIEW.width, canvas.height / VIEW.height);
}
window.addEventListener("resize", resize);
resize();

function worldYScale() { return typeof labRenderer !== "undefined" && labRenderer ? labRenderer.groundScale : 1; }

function worldFromScreen(clientX, clientY) {
    if (typeof fpsInput !== "undefined" && fpsInput) {
        const aim=labRenderer.aimPoint();
        if (aim) return aim;
        const me=predictedLocal || getMe() || camera, f=fpsInput.facing();
        return {x:me.x+f.x*2400,y:me.y+f.y*2400};
    }
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * canvas.width / rect.width;
    const py = (clientY - rect.top) * canvas.height / rect.height;
    return { x: camera.x + (px - canvas.width / 2) / scale, y: camera.y + (py - canvas.height / 2) / (scale * worldYScale()) };
}

function requestDecoy(point) {
    const me = getMe();
    if (!me || me.job !== "spy" || !["preparing", "wave"].includes(state.phase)
            || me.down || me.movingCore || me.selectedBuild || me.decoyCooldown > 0
            || me.railgunRemaining > 0 || me.railgunCharge > 0 || me.secondaryRailgunRemaining > 0 || me.secondaryRailgunCharge > 0 || exitDialog.open
            || !howToMenu.classList.contains("hidden") || !inventoryMenu.classList.contains("hidden")
            || !actionMenu.classList.contains("hidden")) return;
    send(`DECOY:${point.x.toFixed(1)}:${point.y.toFixed(1)}`);
}

function requestScoutDash(point) {
    const me = getMe();
    if (!me || me.job !== "scout" || !["preparing", "wave"].includes(state.phase)
            || me.down || me.movingCore || me.selectedBuild
            || me.stamina < me.scoutDashStamina || me.railgunRemaining > 0 || me.railgunCharge > 0 || me.secondaryRailgunRemaining > 0 || me.secondaryRailgunCharge > 0
            || exitDialog.open || !howToMenu.classList.contains("hidden")
            || !inventoryMenu.classList.contains("hidden") || !actionMenu.classList.contains("hidden")) return;
    send(`SCOUT_DASH:${point.x.toFixed(1)}:${point.y.toFixed(1)}`);
}

function requestTankWall(point) {
    const me = getMe();
    if (!me || me.job !== "tank" || !["preparing", "wave"].includes(state?.phase)
            || me.down || me.movingCore || me.selectedBuild || me.jobCooldown > 0 || exitDialog.open
            || !howToMenu.classList.contains("hidden") || !inventoryMenu.classList.contains("hidden")
            || !actionMenu.classList.contains("hidden")) return;
    send(point ? `TANK_WALL:${point.x.toFixed(1)}:${point.y.toFixed(1)}` : "TANK_WALL");
}

// Mouse down also fires when the left button is held, allowing a dash while shooting.
canvas.addEventListener("mousedown", event => {
    if (!state || !getMe()) return;
    if (event.button === 0 && fpsInput?.capture()) { event.preventDefault(); return; }
    if (event.button === 1 && fpsInput) { event.preventDefault(); fpsInput.view.zoom=true; return; }
    if(event.button===2 && fpsInput && getMe()?.job!=='attacker' && !event.altKey && window.AimControl?.supported(getMe()?.weapon,WEAPON_FIELDS)) {event.preventDefault();fpsInput.view.zoom=true;return;}
    if (event.button === 2 && fpsInput && getMe()?.job!=="attacker" && !event.altKey && (!["tank","scout","spy"].includes(getMe()?.job) || ["sniper","rifle","railgun"].includes(getMe()?.weapon))) { event.preventDefault();fpsInput.view.zoom=true;return; }
    if (event.button === 0) {
        canvas.focus({ preventScroll: true });
        startFiring("mouse", event.clientX, event.clientY);
        return;
    }
    if (event.button !== 2) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    if (getMe()?.job === "attacker" && !getMe().down && !getMe().movingCore && !getMe().selectedBuild
            && !exitDialog.open && howToMenu.classList.contains("hidden") && ["preparing", "wave"].includes(state?.phase)
            && actionMenu.classList.contains("hidden") && inventoryMenu.classList.contains("hidden")) {
        const p = worldFromScreen(event.clientX, event.clientY);
        secondaryHeld = true;
        send(`SECONDARY_FIRE:${p.x.toFixed(1)}:${p.y.toFixed(1)}:1`);
    } else {
        requestTankWall(worldFromScreen(event.clientX, event.clientY));
        requestScoutDash(worldFromScreen(event.clientX, event.clientY));
        requestDecoy(worldFromScreen(event.clientX, event.clientY));
    }
});

canvas.addEventListener("pointerdown", event => {
    if (!state || !getMe()) return;
    canvas.focus({ preventScroll: true });
    if (event.pointerType === "mouse") return;
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
    if (event.pointerType === "mouse" || firingPointer?.id === event.pointerId) aimPointer = { x: event.clientX, y: event.clientY };
    if (pendingMove?.id === event.pointerId) { pendingMove.x = event.clientX; pendingMove.y = event.clientY; }
    if (joystick?.id === event.pointerId) updateJoystick(event.clientX, event.clientY);
    if (firingPointer?.id === event.pointerId || event.pointerType === "mouse" && firingPointer?.id === "mouse") updateFiringAim(event.clientX, event.clientY);
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
let secondaryHeld = false;
function stopSecondaryFiring() {
    secondaryHeld = false;
    send("SECONDARY_FIRE:0:0:0");
    window.coreAudio?.stopRailgun?.(myPlayerId + ":right");
}
window.addEventListener("mouseup", event => {
    if (fpsInput && [1,2].includes(event.button)) fpsInput.view.zoom=!!(event.buttons & 4) || !!(event.buttons & 2) && getMe()?.job!=='attacker';
    if (event.button === 0 && firingPointer?.id === "mouse") stopFiring(event.clientX, event.clientY);
    if (event.button === 2) stopSecondaryFiring();
});
canvas.addEventListener("mousemove", event => {
    if (getMe()?.job === "attacker" && secondaryHeld && (event.buttons & 2)) {
        const p = worldFromScreen(event.clientX, event.clientY);
        send(`SECONDARY_FIRE:${p.x.toFixed(1)}:${p.y.toFixed(1)}:1`);
    }
});
canvas.addEventListener("contextmenu", event => event.preventDefault());

function startFiring(pointerId, clientX, clientY) {
    if (getMe()?.tpInvulnerableRemaining > 0) return;
    if (getMe()?.selectedBuild || getMe()?.missileControl) return;
    if (getMe()?.movingCore) {
        showFeedback("CORE運搬中は武器を使用できません");
        return;
    }
    const point = worldFromScreen(clientX, clientY);
    aimPointer = { x: clientX, y: clientY };
    firingPointer = { id: pointerId, clientX, clientY, lastAimSent: performance.now() };
    send(`FIRE:${point.x.toFixed(1)}:${point.y.toFixed(1)}:1`);
}

function updateFiringAim(clientX, clientY) {
    if (!firingPointer) return;
    if (getMe()?.tpInvulnerableRemaining > 0 || getMe()?.movingCore || getMe()?.selectedBuild) {
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
    window.coreAudio?.stopRailgun?.(myPlayerId);
}

function fireOnce(clientX, clientY) {
    if (getMe()?.tpInvulnerableRemaining > 0) return;
    if (getMe()?.selectedBuild) return;
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
    if (predictedLocal?.movementPauseUntil && performance.now() < predictedLocal.movementPauseUntil) x = y = 0;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    if (typeof fpsInput !== "undefined" && fpsInput) ({x,y}=fpsInput.movement(x,y));
    if(getMe()?.sniper?.fixed)x=y=0;
    localMove.x = Number(x.toFixed(2));
    localMove.y = Number(y.toFixed(2));
    if (Math.hypot(localMove.x,localMove.y) > .12) localFacing = quantizeFacing(localMove.x, localMove.y);
    const message = `MOVE:${localMove.x.toFixed(2)}:${localMove.y.toFixed(2)}`;
    if (force || message !== lastMove) { lastMove = message; send(message); }
}

function isTypingTarget(target) {
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
        || target?.isContentEditable;
}

window.addEventListener("keydown", event => {
    if (window.JobUI?.isConfirming?.()) return;
    if (window.coreMenu?.settingsOpen?.()) {
        if (window.coreKeySettings.gameKey(event) === "e" && !isTypingTarget(event.target)) {
            event.preventDefault(); if (!event.repeat) window.coreMenu.closeSettings?.();
        }
        return;
    }
    if (isTypingTarget(event.target)) return;
    const key = window.coreKeySettings.gameKey(event);
    if (exitDialog.open) {
        if (key === "e") { event.preventDefault(); if (!event.repeat) exitDialog.close("cancel"); }
        return;
    }
    if (!howToMenu.classList.contains("hidden")) {
        if (["escape", "e"].includes(key)) closeHowTo();
        event.preventDefault();
        return;
    }
    if (key === "escape" && state && ["preparing", "wave"].includes(state.phase)) {
        event.preventDefault();
        if (!event.repeat) openExitDialog();
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
    if (key === window.coreKeySettings.getSniperStance?.() && fpsInput && state && ["preparing","wave"].includes(state.phase)) {
        event.preventDefault();
        const me=getMe();
        if (!event.repeat && me?.weapon==='sniper' && !me.down && !me.movingCore && !me.selectedBuild
                && !me.drone?.controlled && !me.missileControl && actionMenu.classList.contains('hidden') && inventoryMenu.classList.contains('hidden')) {
            if(firingPointer)stopFiring(firingPointer.clientX,firingPointer.clientY);
            send('SNIPER:'+(me.sniper?.fixed?'0':'1'));
        }
        return;
    }
    if (key === window.coreKeySettings.getDroneSelfDestruct?.() && state && ["preparing", "wave"].includes(state.phase)) {
        event.preventDefault();
        const me = getMe();
        if (!event.repeat && me?.job === "drone" && !me.down && !me.movingCore && me.drone?.active && me.drone.hp > 0)
            send("DRONE_SELF_DESTRUCT");
        return;
    }
    if (key === window.coreKeySettings.getJobEffect()) {
        event.preventDefault();
        if (!event.repeat) useJobAbility();
        return;
    }
    if (key === window.coreKeySettings.getMedkit() && state && ["preparing", "wave"].includes(state.phase)) {
        event.preventDefault();
        const me = getMe();
        if (!event.repeat && me && !me.down && me.medkits > 0 && me.hp < (me.maxHp || 100)) send("USE:medkit");
        return;
    }
    if (key === "e") {
        event.preventDefault();
        if (!event.repeat) {
            if (getMe()?.missileControl) send("COMPUTER");
            else if (!actionMenu.classList.contains("hidden")) closeActionMenu();
            else toggleInventory();
        }
        return;
    }
    if (key === "r") {
        event.preventDefault();
        if (!event.repeat) beginInteractionHold();
        return;
    }
    if (key === " " && state && ["preparing", "wave"].includes(state.phase)) {
        event.preventDefault();
        const me = getMe();
        if (!event.repeat && actionMenu.classList.contains("hidden") && inventoryMenu.classList.contains("hidden")
                && me && !me.down && !me.movingCore && !me.drone?.controlled && !me.missileControl) {
            send("JUMP");
            if (predictedLocal) window.JumpMovement.start(predictedLocal, state.slots || []);
        }
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
    const key = window.coreKeySettings.gameKey(event);
    if (key === window.coreKeySettings.getSniperStance?.()) {send("SNIPER_CANCEL");return;}
    if (key === window.coreKeySettings.getJobEffect()) return;
    if (key === "r") { endInteractionHold(); return; }
    if (key === "shift") { dashKey = false; setDash(false); return; }
    keys.delete(key); sendMovement();
});
window.addEventListener("blur", () => {
    if (fpsInput) fpsInput.release();
    send("SNIPER_CANCEL");
    stopSecondaryFiring();
    endInteractionHold(true);
    keys.clear(); joystick = null;
    dashKey = false; setDash(false);
    if (pendingMove) clearTimeout(pendingMove.timer);
    pendingMove = null;
    if (firingPointer) stopFiring(firingPointer.clientX, firingPointer.clientY);
    sendMovement();
});

function findNearestInteraction() {
    const me = getMe();
    if (me?.missileControl) return null;
    if (!me || me.down || !state || !["preparing", "wave"].includes(state.phase)) return null;
    if (placementSelection(me)?.type === "teleporter") {
        return { kind: "placement", target: frontPlacementTile(me), label: "PLACE", action: placeSelectedInFront };
    }
    if (me.drone?.controlled) {
        const tripped = new Set(state.trippedBreakers || []);
        const breaker = BREAKER_TERMINALS.filter(target => state.blackoutActive && tripped.has(target.id)
            && (!target.requiredArea || state.areas[target.requiredArea])
            && distance(me.drone, target) <= INTERACTION_RANGE.breaker && hasInteractionPath(me.drone, target))
            .sort((a, b) => distance(me.drone, a) - distance(me.drone, b))[0];
        return breaker ? { kind: "breaker", target: breaker, label: "RESET", action: () => send(`BREAKER:${breaker.id}`) } : null;
    }
    const choices = [];
    for (const owner of state.players) {
        for (const pad of owner.teleportPads || []) {
            const separation = distance(me, pad);
            const owned = owner.id === me.id && me.job === "tp";
            if ((!owned && !(pad.paired ?? owner.teleportPads.length === 2)) || separation > 45 || !hasInteractionPath(me, pad)) continue;
            choices.push({ kind: "teleporter", target: pad, owned, separation,
                action: () => { if (pad.paired ?? owner.teleportPads.length === 2) send("TELEPORT"); } });
        }
    }
    if (choices.length) return choices.sort((a, b) => a.separation - b.separation)[0];
    const add = (kind, target, range, label, action) => {
        const separation = distance(me, target);
        if (separation <= range && hasInteractionPath(me, target)) choices.push({ kind, target, label, action, separation });
    };

    if (MISSILE_COMPUTER && me.job === "hacker" && state.areas[MISSILE_COMPUTER.requiredArea])
        add("computer", MISSILE_COMPUTER, 70, "MISSILE", () => send("COMPUTER"));
    if (JOB_STATION && state.areas[JOB_STATION.requiredArea])
        add("job-station", JOB_STATION, 70, "JOB", openJobStation);
    (state.factories || []).forEach(unit =>
        add("factory", unit, 70, "PICK UP", () => openNearbyActionMenu("QUARRY", [{
            label: "PICK UP", detail: "回収して持ち運ぶ", command: "PICKUP_FACTORY:" + unit.id,
        }], unit, 70)));
    state.slots.filter(slot => slot.defense && !slot.temporary && !(slot.temporaryRemaining > 0))
        .forEach(slot => add("defense", slot, INTERACTION_RANGE.trapSlot, "MANAGE", () => openSlotMenu(slot)));
    SHOP_UNITS.forEach(shop => add("shop", shop, INTERACTION_RANGE.shop,
        shop.label, () => openShopPurchase(shop)));
    WORKBENCHES
        .filter(workbench => (!workbench.requiredArea || state.areas[workbench.requiredArea])
            && (workbench.id !== "backup-terminal" || me.job === "hacker" && (state.debugMode || state.phase === "preparing" && !state.backupUsed)))
        .forEach(workbench => add("craft", workbench, workbench.id === "backup-terminal" ? 70 : INTERACTION_RANGE.workbench,
            workbench.id === "backup-terminal" ? "CONSOLE" : "CRAFT",
            () => workbench.id === "backup-terminal" ? openSystemConsole(workbench) : openWorkbenchMenu(workbench)));
    if (PREP_CONSOLE && state.areas[PREP_CONSOLE.requiredArea]) {
        add("prep-console", PREP_CONSOLE, 95, "+1:00", openPrepConsoleMenu);
    }
    add("core", state.core, INTERACTION_RANGE.core, "CORE", openCoreMenu);
    if (me.job === "hacker") {
        BREAKER_TERMINALS.filter(breaker => !breaker.requiredArea || state.areas[breaker.requiredArea])
            .forEach(breaker => add("breaker", breaker, INTERACTION_RANGE.breaker,
                "BREAKER", () => openBreakerMenu(breaker)));
    } else if (state.blackoutActive) {
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
    const nearest = choices.sort((a, b) => a.separation - b.separation)[0];
    if (nearest) return nearest;
    return null;
}

function useNearestInteraction() {
    const interaction = findNearestInteraction();
    if (!interaction) return;
    interaction.action();
}

function toggleNearestInteraction() {
    if (placementSelection(getMe())?.type === "teleporter") {
        closeActionMenu();
        inventoryMenu.classList.add("hidden");
        placeSelectedInFront();
        return;
    }
    if (!actionMenu.classList.contains("hidden")) {
        closeActionMenu();
        return;
    }
    inventoryMenu.classList.add("hidden");
    if (placeSelectedInFront()) return;
    useNearestInteraction();
}

function placementSelection(player) {
    if (!player || player.down || player.drone?.controlled) return null;
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
    const direction = player.id === myPlayerId ? (typeof fpsInput !== "undefined" && fpsInput ? fpsInput.facing() : localFacing)
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
    if (typeof fpsInput !== 'undefined' && fpsInput) {
        const facing=fpsInput.facing();send(`PLACE_FRONT:${facing.x.toFixed(4)}:${facing.y.toFixed(4)}`);
    } else send("PLACE_FRONT");
    return true;
}

function nearestAt(items, point) {
    return items.slice().sort((a, b) => distance(point, a) - distance(point, b))[0];
}
function openDroneLaunch() {
    const me = getMe();
    if (!me || me.down || me.job !== "drone" || me.movingCore || me.drone?.active) {
        closeActionMenu();
        return;
    }
    const broken = me.drone && me.drone.hp <= 0;
    const unavailable = broken && (me.ore < me.droneRepairOre || me.copper < me.droneRepairCopper);
    const options = WeaponUI.entries(me, WEAPON_FIELDS)
        .filter(entry => WEAPON_FIELDS[entry.value].droneMountable)
        .map(entry => ({ label: entry.label, command: `DRONE_LAUNCH:${entry.value}`, disabled: unavailable }));
    options.push({ label: "UNARMED", command: "DRONE_LAUNCH:none", disabled: unavailable });
    const title = broken ? `DRONE / REPAIR ${me.droneRepairOre} ORE / ${me.droneRepairCopper} COPPER` : "DRONE";
    openNearbyActionMenu(title, options, me, 45, "default", openDroneLaunch);
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function updateLocalPrediction(dt, visualDt = dt) {
    const serverMe = getMe();
    if (predictedLocal) {
        predictedLocal.renderOffsetHeight=(predictedLocal.renderOffsetHeight || 0)*Math.exp(-18*visualDt);
        predictedLocal.renderOffsetX=(predictedLocal.renderOffsetX || 0)*Math.exp(-14*visualDt);
        predictedLocal.renderOffsetY=(predictedLocal.renderOffsetY || 0)*Math.exp(-14*visualDt);
    }
    if (serverMe?.missileControl) return;
    if (serverMe?.drone?.controlled && predictedLocal) {
        predictedLocal.x = serverMe.x; predictedLocal.y = serverMe.y;
        predictedLocal.dashing = false;
        return;
    }
    if (!predictedLocal || !serverMe || !(["preparing", "wave"].includes(state.phase)
            || state.phase === "won" && state.victoryMoveRemaining > 0)) return;
    if (predictedLocal.movementPauseUntil) {
        if (performance.now() < predictedLocal.movementPauseUntil) return;
        predictedLocal.movementPauseUntil = 0;
        sendMovement(true);
    }
    if (typeof window !== "undefined" && window.JumpMovement) {
        if (serverMe.down || serverMe.movingCore) { predictedLocal.jumpHeight=0; predictedLocal.jumpVelocity=0; }
        else window.JumpMovement.advance(predictedLocal, dt, state.slots || [], TILE_MAP);
    }
    if (predictedLocal.scoutDashRemaining > 0 && !serverMe.down && !serverMe.movingCore
            && !serverMe.selectedBuild && !(serverMe.railgunRemaining > 0 || serverMe.railgunCharge > 0 || serverMe.secondaryRailgunRemaining > 0 || serverMe.secondaryRailgunCharge > 0)) {
        const travel = serverMe.scoutDashSpeed * Math.min(dt, predictedLocal.scoutDashRemaining);
        const next = window.ScoutMovement.advance(predictedLocal, predictedLocal.scoutDashDx,
            predictedLocal.scoutDashDy, travel, serverMe.scoutDashStep, (x,y)=>canPredictOccupy(x,y,5,true,predictedLocal.jumpHeight || 0));
        predictedLocal.x = next.x; predictedLocal.y = next.y;
        predictedLocal.scoutDashRemaining = next.blocked ? 0 : Math.max(0, predictedLocal.scoutDashRemaining - dt);
        if (predictedLocal.scoutDashRemaining < 1e-9) predictedLocal.scoutDashRemaining = 0;
        predictedLocal.dashing = false;
        return;
    }
    predictedLocal.scoutDashRemaining = 0;
    if (serverMe.sniper?.fixed) {predictedLocal.dashing=false;return;}
    const input = Math.hypot(localMove.x, localMove.y);
    if (predictedLocal.exhausted && predictedLocal.stamina >= 28) predictedLocal.exhausted = false;
    predictedLocal.dashing = !(serverMe.railgunRemaining > 0 || serverMe.railgunCharge > 0 || serverMe.secondaryRailgunRemaining > 0 || serverMe.secondaryRailgunCharge > 0) && !serverMe.down && !serverMe.movingCore
        && dashRequested && !predictedLocal.exhausted && input > .12 && predictedLocal.stamina > 0;
    if (predictedLocal.dashing) {
        predictedLocal.stamina = Math.max(0, predictedLocal.stamina - (serverMe.staminaDrain ?? 38) * dt);
        if (predictedLocal.stamina <= 0) {
            predictedLocal.exhausted = true;
            predictedLocal.dashing = false;
        }
    } else {
        predictedLocal.stamina = Math.min(serverMe.staminaMax ?? 100, predictedLocal.stamina + (serverMe.staminaRecovery ?? 24) * dt);
    }

    const walkSpeed = serverMe.walkSpeed ?? 125;
    const speed = serverMe.railgunRemaining > 0 || serverMe.secondaryRailgunRemaining > 0 ? walkSpeed * .3 : serverMe.railgunCharge > 0 || serverMe.secondaryRailgunCharge > 0 ? walkSpeed * .6 : serverMe.down ? (serverMe.downSpeed ?? 45) : serverMe.movingCore ? 82 : predictedLocal.dashing ? (serverMe.dashSpeed ?? 205) : walkSpeed;
    const nextX = clamp(predictedLocal.x + localMove.x * speed * dt, 25, WORLD.width - 25);
    const nextY = clamp(predictedLocal.y + localMove.y * speed * dt, 25, WORLD.height - 25);
    if (canPredictOccupy(nextX, predictedLocal.y, 5, true, predictedLocal.jumpHeight || 0)) predictedLocal.x = nextX;
    if (canPredictOccupy(predictedLocal.x, nextY, 5, true, predictedLocal.jumpHeight || 0)) predictedLocal.y = nextY;
}

function canPredictOccupy(x, y, radius, includeDefenses = true, feetHeight = 0) {
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
    if (feetHeight > 0 && window.JumpMovement && feetHeight + 32 > window.JumpMovement.ceiling(TILE_MAP,x,y) + .01) return false;
    if (includeDefenses && feetHeight < 23.99 && state.slots.some(slot => slot.defense && ["block", "barricade", "copperBarricade", "silverBarricade"].includes(slot.defense.type)
            && Math.hypot(x - slot.x, y - slot.y) < radius + 18)) return false;
    return true;
}

function animate(now = performance.now()) {
    const elapsed = Math.max(0, (now - lastFrameAt) / 1000);
    const dt = Math.min(.05, elapsed);
    lastFrameAt = now;
    updateLocalPrediction(dt, elapsed);
    window.coreAudio?.syncRailguns?.(socket?.readyState === WebSocket.OPEN ? state?.players || [] : [], predictedLocal || getMe(), myPlayerId, Boolean(firingPointer), secondaryHeld);
    window.TerminalUI?.update(state, getMe(), { map: { world: WORLD, tileMap: TILE_MAP, areas: AREAS, startingArea: STARTING_AREA, breakerTerminals: BREAKER_TERMINALS }, send });
    draw();
    requestAnimationFrame(animate);
}

function receiveDroneSelfDestruct(message) {
    if (message.playerId !== myPlayerId || !message.piloted
            || !Number.isFinite(message.x) || !Number.isFinite(message.y)) return;
    droneAftermath = { x: camera.x, y: camera.y, until: performance.now() + 1500 };
}

function droneCameraView() {
    const me = getMe();
    if (droneAftermath) {
        if (performance.now() < droneAftermath.until && me?.job === "drone" && !me.down && me.drone
                && ["preparing", "wave"].includes(state?.phase)) return droneAftermath;
        droneAftermath = null;
    }
    return me?.drone?.controlled ? smoothEntity("drone", { ...me.drone, id: me.id }) : null;
}

function draw() {
    if (fpsInput) { drawFirstPerson(); return; }
    renderPositions = labRenderer ? new Map() : null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const me = getMe();
    const cameraTarget = droneCameraView() || predictedLocal || me;
    if (cameraTarget) {
        camera.x += (cameraTarget.x - camera.x) * .12;
        camera.y += (cameraTarget.y - camera.y) * .12;
        const halfW = canvas.width / scale / 2, halfH = canvas.height / (scale * worldYScale()) / 2;
        camera.x = clamp(camera.x, halfW, WORLD.width - halfW);
        camera.y = clamp(camera.y, halfH, WORLD.height - halfH);
    }
    ctx.setTransform(scale, 0, 0, scale * worldYScale(), canvas.width / 2 - camera.x * scale, canvas.height / 2 - camera.y * scale * worldYScale());
    if (labRenderer) labRenderer.render({ map: TILE_MAP, reachable: reachableFloorTiles(), center: camera, scale,
        state, localId: myPlayerId, predicted: predictedLocal, smooth: smoothEntity, radius: enemyRadius,
        stations: labStations(), effects: hitEffects,
        aim: aimPointer ? worldFromScreen(aimPointer.x, aimPointer.y) : null });
    else drawWorld();
    if (labRenderer) {
        SPAWN_POINTS.forEach(drawSpawnEntrance);
        if (DEBUG_MODE) SPAWN_POINTS.forEach(drawDebugSpawn);
    }
    if (state) {
        drawAreas();
        drawBreakers();
        drawPlacementPreview();
        drawCore();
        drawShops();
        drawResources();
        drawDroppedResources();
        drawTrapSlots();
        drawHealingAreas();
        drawTeleportPads();
        drawArtilleryShells();
        drawMissiles();
        drawProjectiles();
        drawPoisonGas();
        drawEnemies();
        drawHooks();
        drawRailguns();
        drawPlayers();
        drawDrones();
        drawInteractionPrompt();
        drawHitEffects();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (state?.blackoutActive) {
        drawBlackout();
        drawBlackoutSignals();
        drawBlackoutEnemyGlow();
    }
    if (state && typeof CoreFeedback !== "undefined") {
        ctx.setTransform(scale, 0, 0, scale * worldYScale(), canvas.width / 2 - camera.x * scale, canvas.height / 2 - camera.y * scale * worldYScale());
        CoreFeedback.draw(ctx, performance.now(), WORLD, scale);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (state) drawDamageEdges();
    drawJoystick();
    drawRewindScreen();
}


function drawFirstPerson() {
    renderPositions=new Map();
    const me=getMe(), baseEye=droneCameraView() || predictedLocal || me || camera;
    const eye=baseEye===predictedLocal ? {...baseEye,x:baseEye.x+(baseEye.renderOffsetX || 0),y:baseEye.y+(baseEye.renderOffsetY || 0)} : baseEye;
    const scoped=!!fpsInput.view.zoom && ['sniper','rifle','railgun'].includes(me?.weapon) && !me?.selectedBuild && !me?.drone?.controlled;
    fpsInput.view.scoped=scoped;
    const playing=!!me && ['preparing','wave'].includes(state?.phase);
    const menusOpen=exitDialog.open || !actionMenu.classList.contains('hidden') || !inventoryMenu.classList.contains('hidden') || !howToMenu.classList.contains('hidden') || window.coreMenu?.settingsOpen?.() || window.JobUI?.isConfirming?.() || me?.missileControl;
    fpsInput.setActive(playing && !menusOpen,playing && !!menusOpen);
    fpsInput.setLookFrozen(!!me && (me.railgunRemaining>0 || me.secondaryRailgunRemaining>0));
    if(menusOpen || !playing) {
        if(me?.sniper?.deploying)send("SNIPER_CANCEL");
        if(firingPointer)stopFiring(firingPointer.clientX,firingPointer.clientY);
        if(secondaryHeld)stopSecondaryFiring();
        if(keys.size || joystick){keys.clear();joystick=null;sendMovement();}
    } else {
        sendMovement(); // Turning changes the world direction of a held movement key.
        if(window.AimControl && !me?.drone?.controlled && performance.now()-(drawFirstPerson.lookAt || -Infinity)>=50) {
            const facing=fpsInput.facing();send('LOOK:'+facing.x.toFixed(6)+':'+facing.y.toFixed(6)+':'+fpsInput.view.pitch.toFixed(6));
            drawFirstPerson.lookAt=performance.now();
        }
    }
    if(me?.sniper?.fixed && playing && !menusOpen && performance.now()-(drawFirstPerson.sniperLookAt || 0)>100) {
        const facing=fpsInput.facing();send('SNIPER_LOOK:'+facing.x.toFixed(6)+':'+facing.y.toFixed(6)+':'+fpsInput.view.pitch.toFixed(6));
        drawFirstPerson.sniperLookAt=performance.now();
    }
    if(eye){camera.x=eye.x;camera.y=eye.y;}
    const selection=me && placementSelection(me), point=selection ? frontPlacementTile(me) : null;
    const placement=point ? {...point,valid:canBuildAt(point,selection.forCore)} : null;
    labRenderer.render({map:TILE_MAP,reachable:reachableFloorTiles(),center:camera,eye,scale,state,localId:myPlayerId,predicted:predictedLocal,smooth:smoothEntity,radius:enemyRadius,stations:labStations(),effects:hitEffects,aim:worldFromScreen(0,0),view:fpsInput.view,placement,scoped,nightVision:!!droneCameraView(),motion:{moving:Math.hypot(localMove.x,localMove.y)>.12,dashing:predictedLocal?.dashing}});
    if(firingPointer)updateFiringAim(firingPointer.clientX,firingPointer.clientY);
    if(secondaryHeld){const p=worldFromScreen(0,0);const now=performance.now();if(now-(drawFirstPerson.secondaryAt || 0)>70){send(`SECONDARY_FIRE:${p.x.toFixed(1)}:${p.y.toFixed(1)}:1`);drawFirstPerson.secondaryAt=now;}}
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
    if(!state)return;
    const now=performance.now();hitEffects=hitEffects.filter(e=>now-e.started<1200);
    const activeProjectiles=new Set((state.projectiles || []).map(p=>"projectile-"+p.id));
    for(const key of smoothed.keys())if(key.startsWith("projectile-") && !activeProjectiles.has(key))smoothed.delete(key);
    const text=(label,x,y,height=32,color='#e8f4f8')=>{const p=labRenderer.project(x,y,height);if(!p.visible)return;ctx.save();const pixelRatio=canvas.width/innerWidth;const fontSize=Math.max(12,Math.min(28,p.pixelsPerUnit*6/pixelRatio));ctx.font=`bold ${fontSize*pixelRatio}px system-ui`;ctx.textAlign='center';ctx.fillStyle=color;ctx.shadowColor='#08121a';ctx.shadowBlur=4;ctx.fillText(label,p.x,p.y);ctx.restore();};
    const bar=(entity,p,height,color)=>{const a=labRenderer.project(p.x,p.y,height);if(!a.visible)return;const w=38*canvas.width/innerWidth,h=4*canvas.width/innerWidth;ctx.fillStyle='#16232c';ctx.fillRect(a.x-w/2,a.y,w,h);ctx.fillStyle=color;ctx.fillRect(a.x-w/2,a.y,w*clamp(entity.hp/Math.max(1,entity.maxHp || entity.hp),0,1),h);};
    for(const [p,label,color] of labStations()) if(Math.hypot(p.x-eye.x,p.y-eye.y)<420){const anchor=labRenderer.stationPosition(p);text(label,anchor.x,anchor.y,38,color);}
    for(const enemy of state.enemies)if(enemy.hp>0){const p=smoothEntity('enemy',enemy);if(enemy.hp<enemy.maxHp)bar(enemy,p,enemyRadius(enemy)*2.2,'#ff7780');}
    for(const player of state.players)if(player.id!==myPlayerId){const p=smoothEntity('player',player);text(player.name,p.x,p.y,34,player.down?'#ff7780':'#e8f4f8');bar(player,p,30,'#91dcc1');}
    for(const slot of state.slots || [])if(slot.defense)bar(slot.defense,slot,32,'#79d8ff');
    if(!state.players.some(p=>p.movingCore)) {text('CORE',state.core.x,state.core.y,50);bar(state.core,state.core,45,'#79d8ff');}
    for(const drop of state.drops || [])if(Math.hypot(drop.x-eye.x,drop.y-eye.y)<160)text(RESOURCE_NAMES[drop.type] || drop.type,drop.x,drop.y,20);
    if(typeof CombatFeedback!=='undefined'){ctx.setTransform(scale,0,0,scale,0,0);CombatFeedback.draw(ctx,now,popup=>{const p=projectCombatPopup(popup);return p;});ctx.setTransform(1,0,0,1,0,0);}
    const interaction=findNearestInteraction();
    ctx.save();const dpr=canvas.width/innerWidth;ctx.scale(dpr,dpr);ctx.textAlign='center';ctx.font='bold 14px system-ui';ctx.fillStyle='#f1f8fb';ctx.shadowColor='#07121b';ctx.shadowBlur=4;
    if(playing && !menusOpen){
        const x=innerWidth/2,y=innerHeight/2;
        const target=placement ? (placement.valid ? placement : null) : interaction?.target;
        if(target) {
            const anchor=labRenderer.stationPosition(target);const prompt=labRenderer.project(anchor.x,anchor.y,40);
            drawKeyPrompt('R',prompt.visible ? prompt.x/dpr : x,prompt.visible ? prompt.y/dpr : y+50);
        }
        if(scoped && me?.weapon==='sniper')ctx.fillText('5×',x,innerHeight-130);
        if(placement)ctx.fillText(placement.valid?'R PLACE':'BLOCKED',x,y+70);
        if(me?.weapon==='sniper' && !me.down && !me.selectedBuild && !me.drone?.controlled)
            ctx.fillText(window.coreKeySettings.getSniperStance().toUpperCase()+(me.sniper?.fixed?'  STAND':'  HOLD PRONE'),x,innerHeight-105);
    }
    if(me?.sniper?.deploying && playing && !menusOpen){ctx.fillStyle='#dbe5e3';ctx.fillRect(innerWidth/2-25,innerHeight-96,50*Math.min(1,me.sniper.deployTime/.8),2);}
    ctx.restore();
    if(scoped && playing && !menusOpen) {
        ctx.save();ctx.scale(dpr,dpr);
        const x=innerWidth/2,y=innerHeight/2,r=Math.min(innerWidth,innerHeight)*.42;
        ctx.fillStyle='#020406';ctx.beginPath();ctx.rect(0,0,innerWidth,innerHeight);ctx.arc(x,y,r,0,Math.PI*2,true);ctx.fill('evenodd');
        ctx.restore();
    }
    if(state.blackoutActive && !droneCameraView()){
        const shade=ctx.createRadialGradient(canvas.width/2,canvas.height/2,0,canvas.width/2,canvas.height/2,canvas.width*.65);
        shade.addColorStop(0,'rgba(0,5,10,0)');shade.addColorStop(1,'rgba(0,5,10,.45)');ctx.fillStyle=shade;ctx.fillRect(0,0,canvas.width,canvas.height);
    }
    if(playing && !menusOpen && !me.down && !me.selectedBuild && !me.drone?.controlled) {
        const spread=window.AimControl?.displaySample(me,now,WEAPON_FIELDS) || (me.weapon==='sniper'?window.SniperAim.sample(me,now):{slope:WEAPON_FIELDS[me.weapon]?.spreadSlope || 0});
        if(spread.slope>0 && window.AimControl?.visible(me,fpsInput.view,WEAPON_FIELDS)) {
            const fov=scoped?window.AimControl.scopeFov(me.weapon):fpsInput.view.zoom?48:72;
            ctx.save();ctx.scale(dpr,dpr);window.SniperAim.draw(ctx,innerWidth/2,innerHeight/2,innerHeight,fov,spread);ctx.restore();
        }
    }
    if(playing && !menusOpen && !me.down && !me.selectedBuild && !me.drone?.controlled){ctx.save();ctx.scale(dpr,dpr);window.coreReticleSettings.draw(ctx,innerWidth/2,innerHeight/2);if(typeof CombatFeedback!=='undefined')CombatFeedback.drawHeadShot(ctx,now,innerWidth/2,innerHeight/2);ctx.restore();}
    if(playing && !menusOpen) {ctx.save();ctx.scale(dpr,dpr);window.MiniMap?.draw(ctx,{map:TILE_MAP,reachable:reachableFloorTiles(),player:predictedLocal || me,yaw:fpsInput.view.yaw,state,spawns:SPAWN_POINTS,breakers:BREAKER_TERMINALS,width:innerWidth,height:innerHeight});ctx.restore();}
    drawDamageEdges();drawJoystick();drawRewindScreen();
}

function drawDamageEdges() {
    const hit = hitEffects.findLast(effect => effect.effect === "player-hit" && effect.playerId === myPlayerId);
    if (!hit) return;
    const progress = (performance.now() - hit.started) / 600;
    if (progress < 0 || progress >= 1) return;
    const width = canvas.width, height = canvas.height;
    const depth = Math.min(width, height) * .22;
    ctx.save();
    ctx.globalAlpha = .65 * (1 - progress) ** 2;
    for (const [x0, y0, x1, y1, x, y, w, h] of [
        [0, 0, depth, 0, 0, 0, depth, height],
        [width, 0, width - depth, 0, width - depth, 0, depth, height],
        [0, 0, 0, depth, 0, 0, width, depth],
        [0, height, 0, height - depth, 0, height - depth, width, depth],
    ]) {
        const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
        gradient.addColorStop(0, "rgba(255, 35, 55, 1)");
        gradient.addColorStop(1, "rgba(255, 35, 55, 0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
}

function drawBlackoutSignals() {
    if (!state?.blackoutActive) return;
    const tripped = new Set(state.trippedBreakers || []);
    const progress = (performance.now() % 2400) / 2400;
    ctx.save();
    ctx.strokeStyle = "#ff5964";
    ctx.lineWidth = 2;
    for (const breaker of BREAKER_TERMINALS) {
        if (!tripped.has(breaker.id)
                || (breaker.requiredArea && !state.areas[breaker.requiredArea])) continue;
        const x = (breaker.x - camera.x) * scale + canvas.width / 2;
        const y = (breaker.y - camera.y) * scale * worldYScale() + canvas.height / 2;
        for (let ring = 0; ring < 3; ring++) {
            const expansion = (progress + ring / 3) % 1;
            ctx.globalAlpha = .75 * (1 - expansion);
            ctx.beginPath();
            ctx.arc(x, y, (18 + expansion * 240) * scale, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    ctx.restore();
}

function drawBlackout() {
    const local = getMe();
    if (local?.missileControl) return;
    if (droneCameraView()) {
        ctx.save();
        ctx.fillStyle = "rgba(60, 255, 110, .12)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        return;
    }
    const me = predictedLocal || local;
    if (!me) return;
    const x = (me.x - camera.x) * scale + canvas.width / 2;
    const y = (me.y - camera.y) * scale * worldYScale() + canvas.height / 2;
    const remaining = (state.trippedBreakers || []).length;
    const total = Math.max(1, state.blackoutBreakerTotal || remaining);
    const severity = state.enemyBlackout ? 1 : remaining / total;
    const flicker = Math.sin(performance.now() / 83) * 5;
    const lightRadius = 170 + (1 - severity) * 70 + flicker;
    const edgeDarkness = Math.round(90 + severity * 8);
    const light = ctx.createRadialGradient(x, y, 30, x, y, lightRadius);
    light.addColorStop(0, "rgb(1 5 8 / 8%)");
    light.addColorStop(.48, "rgb(1 5 8 / 45%)");
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
            const hiddenFloor = !tile.solid && !reachable.has(row + ":" + column);
            ctx.fillStyle = hiddenFloor ? TILE_MAP.legend["#"].color : tile.color;
            ctx.fillRect(x, y, size, size);
            if (!tile.solid && !hiddenFloor) {
                ctx.strokeStyle = "rgb(0 0 0 / 5%)";
                ctx.lineWidth = 1;
                ctx.strokeRect(x + .5, y + .5, size - 1, size - 1);
            }
        }
    }
    SPAWN_POINTS.forEach(drawSpawnEntrance);
    if (DEBUG_MODE) SPAWN_POINTS.forEach(drawDebugSpawn);
    ctx.strokeStyle = "#5f5f5f"; ctx.lineWidth = 3; ctx.strokeRect(1, 1, WORLD.width - 2, WORLD.height - 2);
}

function drawSpawnEntrance(spawn) {
    if (spawn.id.startsWith("area-") && !state?.areas[spawn.id.slice(5).split(":")[0]]) return;
    const TILE_SIZE = TILE_MAP.tileSize;
    const cell = { column: Math.floor(spawn.x / TILE_SIZE), row: Math.floor(spawn.y / TILE_SIZE) };
    const incoming = state?.phase === "wave" && state.activeSpawns.includes(spawn.id);
    ctx.save();
    ctx.strokeStyle = incoming ? "#ff5964" : "#996536";
    ctx.lineWidth = 5;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const symbol = TILE_MAP.rows[cell.row + dy]?.[cell.column + dx];
        const wall = TILE_MAP.legend[symbol];
        if (!wall?.solid) continue;
        const x = spawn.x + dx * TILE_SIZE / 2, y = spawn.y + dy * TILE_SIZE / 2;
        ctx.beginPath(); ctx.moveTo(x - dy * 13, y - dx * 13);
        ctx.lineTo(x + dy * 13, y + dx * 13); ctx.stroke();
        break;
    }
    ctx.restore();
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
    const reachable = reachableFloorTiles();
    const size = TILE_MAP.tileSize;
    if (STARTING_AREA) {
        ctx.save();
        ctx.fillStyle = "rgb(255 255 255 / 72%)";
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 5;
        ctx.font = "900 13px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(STARTING_AREA.name, STARTING_AREA.labelX, STARTING_AREA.labelY);
        ctx.restore();
    }
    for (const area of AREAS) {
        const unlocked = state.areas[area.id];
        const column = Math.floor(area.terminalX / size);
        const row = Math.floor(area.terminalY / size);
        const terminalVisible = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]
            .some(([dx, dy]) => reachable.has((row + dy) + ":" + (column + dx)));
        ctx.save();

        if (unlocked) {
            ctx.fillStyle = "rgb(255 255 255 / 72%)";
            ctx.shadowColor = "#000";
            ctx.shadowBlur = 5;
            ctx.font = "900 13px ui-monospace, monospace"; ctx.textAlign = "center";
            ctx.fillText(area.name, area.labelX, area.labelY);
            ctx.shadowBlur = 0;
        }

        if (!unlocked && terminalVisible) {
            if (typeof labRenderer === "undefined" || !labRenderer) {
                ctx.fillStyle = "#d8d8d8";
                ctx.fillRect(area.terminalX - 15, area.terminalY - 15, 30, 30);
                ctx.strokeStyle = "#79d8ff"; ctx.lineWidth = 2;
                ctx.strokeRect(area.terminalX - 18, area.terminalY - 18, 36, 36);
            }
            ctx.fillStyle = "white"; ctx.font = "800 9px ui-monospace, monospace"; ctx.textAlign = "center";
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
        if (typeof labRenderer === "undefined" || !labRenderer) {
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
        }
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
    if (typeof labRenderer === "undefined" || !labRenderer) {
        ctx.fillStyle = "#666";
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
        ctx.fillStyle = "#79d8ff";
        ctx.fillRect(x - size / 2, y + size / 2 - size * ratio, size, size * ratio);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.strokeRect(x - size / 2, y - size / 2, size, size);
    }
    if (core.shield > 0) {
        ctx.strokeStyle = "#70bfff";
        ctx.globalAlpha = .8;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - size / 2 - 5, y - size / 2 - 5, size + 10, size + 10);
    }
    if (typeof labRenderer !== "undefined" && labRenderer) drawBar(x - 20, y + size / 2 + 10, 40, 4, ratio, "#79d8ff");
    const hitAge = performance.now() - coreHitStarted;
    if (hitAge < 350) {
        ctx.strokeStyle = "#ff4e58"; ctx.globalAlpha = 1 - hitAge / 350; ctx.lineWidth = 9;
        const hitSize = 48 + hitAge / 8;
        ctx.strokeRect(x - hitSize / 2, y - hitSize / 2, hitSize, hitSize);
    }
    ctx.restore();
    ctx.fillStyle = "#70bfff"; ctx.font = "900 10px ui-monospace, monospace"; ctx.textAlign = "center";
    ctx.fillText(`SHIELD ${Math.ceil(core.shield)} / ${Math.ceil(core.maxShield)}`, x, y - size / 2 - 12);
    if (!carrier) {
        ctx.fillStyle = "white"; ctx.font = "900 8px ui-monospace, monospace"; ctx.textAlign = "center";
        ctx.fillText("CORE", x, y + 3);
    }
}

function drawShops() {
    for (const [unit, label] of [[MISSILE_COMPUTER, "MISSILE"], [JOB_STATION, "JOB"]])
        if (unit && state.areas[unit.requiredArea]) drawStation(unit, label, "#7adba1", "#111");
    SHOP_UNITS.filter(isUnlockedPoint)
        .forEach(shop => {
            const active = shop.item === "teamMachine" && state.teamBuffRemaining > 0;
            drawStation(shop, active ? `TEAM ${Math.ceil(state.teamBuffRemaining)}s` : shop.label, active ? "#7adba1" : "#d8d8d8", "#111");
        });
    (state.factories || []).forEach(unit => {
        const shop = SHOP_UNITS.find(shop => shop.item === unit.item);
        drawStation(unit, shop.label, "#70bfff", "#111");
    });
    for (const station of MEDBAYS) {
        if (isUnlockedPoint(station)) drawStation(station, "MED BAY", "#d8d8d8", "#111");
    }
    if (isUnlockedPoint(WOODCUTTER)) drawStation(WOODCUTTER, "WOODCUTTER", "#a8a8a8");
    if (isUnlockedPoint(QUARRY)) drawStation(QUARRY, "QUARRY", "#808080");
    WORKBENCHES
        .filter(workbench => !workbench.requiredArea || state.areas[workbench.requiredArea])
        .forEach(workbench => drawStation(workbench, workbench.id === "backup-terminal" ? "CONSOLE" : "WORKBENCH",
            workbench.id === "backup-terminal" ? "#7fead5" : "#d8d8d8", "#111"));
    if (PREP_CONSOLE && state.areas[PREP_CONSOLE.requiredArea]) {
        drawStation(PREP_CONSOLE, "TIME CONTROL", "#d8d8d8", "#111");
    }
}

function isUnlockedPoint(point) {
    const area = AREAS.find(candidate => areaContains(candidate, point.x, point.y));
    return !area || state.areas[area.id];
}

function drawStation(station, label, color, labelColor = "#111") {
    if (typeof labRenderer === "undefined" || !labRenderer) {
        ctx.fillStyle = color; ctx.fillRect(station.x - 20, station.y - 20, 40, 40);
        ctx.fillStyle = "#111"; ctx.fillRect(station.x - 11, station.y - 11, 22, 22);
    }
    ctx.fillStyle = labelColor; ctx.font = "900 9px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(label, station.x, station.y + 31);
}

function drawResources() {
    if (typeof labRenderer !== "undefined" && labRenderer) return;
    for (const node of state.resources || []) {
        if (!node.available) continue;
        const bob = Math.sin(performance.now() / 260 + node.x * .01) * 3;
        ctx.save();
        ctx.translate(node.x, node.y + bob);
        ctx.fillStyle = node.type === "wood" ? "#b0b0b0" : node.type === "copper" ? "#aa754d" : node.type === "silver" ? "#eee" : "#777";
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
        if (typeof labRenderer === "undefined" || !labRenderer) {
            ctx.fillStyle = drop.type === "wood" ? "#b8b8b8" : drop.type === "copper" ? "#aa754d" : drop.type === "silver" ? "#eee" : "#777";
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1.5;
            if (drop.type === "medkit") {
                ctx.fillStyle = "#eee";
                ctx.fillRect(-10, -8, 20, 16);
                ctx.strokeRect(-10, -8, 20, 16);
                ctx.fillStyle = "#e45151";
                ctx.fillRect(-2, -6, 4, 12);
                ctx.fillRect(-6, -2, 12, 4);
            } else if (drop.type === "wood") {
                ctx.fillRect(-8, -6, 16, 12);
                ctx.strokeRect(-8, -6, 16, 12);
            } else {
                ctx.beginPath();
                ctx.moveTo(0, -10); ctx.lineTo(10, -2); ctx.lineTo(6, 9);
                ctx.lineTo(-7, 8); ctx.lineTo(-10, -3); ctx.closePath(); ctx.fill(); ctx.stroke();
            }
        }
        ctx.fillStyle = "#fff";
        ctx.font = "900 10px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(drop.type.toUpperCase(), 0, -18);
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
    if (typeof labRenderer === "undefined" || !labRenderer) {
        if (defense.type === "block") {
            ctx.fillStyle = "#666"; ctx.fillRect(slot.x - 18, slot.y - 18, 36, 36);
            ctx.fillStyle = "#929292"; ctx.fillRect(slot.x - 14, slot.y - 14, 28, 7);
            ctx.fillStyle = "#444"; ctx.fillRect(slot.x - 14, slot.y - 3, 10, 13);
            ctx.strokeStyle = "#bbb"; ctx.lineWidth = 2; ctx.strokeRect(slot.x - 18, slot.y - 18, 36, 36);
        } else if (["turret", "copperTurret", "silverTurret", "overclockSilver"].includes(defense.type)) {
            ctx.fillStyle = "#79d8ff"; ctx.fillRect(slot.x - 18, slot.y - 18, 36, 36);
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(slot.x, slot.y); ctx.lineTo(slot.x, slot.y - 29); ctx.stroke();
            if (defense.type !== "turret") { ctx.fillStyle = defense.type === "overclockSilver" ? "#b686ff" : defense.type === "copperTurret" ? "#aa754d" : "#eee"; ctx.fillRect(slot.x - 8, slot.y - 8, 16, 16); }
        } else if (defense.type === "wire") {
            ctx.strokeStyle = "#b8b8b8"; ctx.lineWidth = 3; ctx.beginPath();
            for (let i = -24; i <= 24; i += 8) { ctx.moveTo(slot.x + i, slot.y - 20); ctx.lineTo(slot.x + i + 10, slot.y + 20); }
            ctx.stroke();
        } else if (defense.type === "mine") {
            ctx.fillStyle = "#ff5964"; ctx.beginPath(); ctx.arc(slot.x, slot.y, 17, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(slot.x, slot.y, 5, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.fillStyle = defense.type === "copperBarricade" ? "#986543" : defense.type === "silverBarricade" ? "#c3cbd0" : "#666"; ctx.fillRect(slot.x - 18, slot.y - 18, 36, 36);
            ctx.strokeStyle = "#bbb"; ctx.lineWidth = 3; ctx.strokeRect(slot.x - 18, slot.y - 18, 36, 36);
        }
    }
    if (["barricade", "copperBarricade", "silverBarricade"].includes(defense.type)) drawBar(slot.x - 14, slot.y + 10, 28, 4, defense.hp / defense.maxHp, "#fff");
    else if (defense.type !== "mine") drawBar(slot.x - 25, slot.y + 29, 50, 4, defense.hp / defense.maxHp, "#fff");
}

function smoothEntity(prefix, entity) {
    const key = `${prefix}-${entity.id}`;
    if (typeof renderPositions !== "undefined" && renderPositions?.has(key)) return renderPositions.get(key);
    const point = smoothed.get(key) || { x: entity.x, y: entity.y };
    point.x += (entity.x - point.x) * .32; point.y += (entity.y - point.y) * .32;
    smoothed.set(key, point);
    if (typeof renderPositions !== "undefined" && renderPositions) renderPositions.set(key, point);
    return point;
}

function enemyRadius(enemy) {
    return ({ finalBoss: 58, poisoner: 20, artilleryElite: 27, boss: 42, warlord: 44, titan: 48, warden: 44, brute: 28, armored: 30,
        siege: 32, champion: 26, blueAce: 9, runner: 16, hunter: 18, ghost: 18, tiny: 3, shield: 24, bomber: 20, artillery: 22, explosionBoss: 42 })[enemy.type] || 21;
}

function drawArtilleryShells() {
    if (state.phase !== "wave") return;
    const elapsed = Math.max(0, (performance.now() - (state.artilleryReceivedAt ?? performance.now())) / 1000);
    for (const shell of state.artilleryShells || []) {
        const remaining = shell.remaining - elapsed;
        if (remaining <= 0) continue;
        const progress = clamp(1 - remaining / shell.duration, 0, 1);
        ctx.save();
        ctx.fillStyle = "rgb(126 220 122 / 18%)";
        ctx.strokeStyle = "rgb(126 220 122 / 40%)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(shell.x, shell.y, shell.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "#7edc7a"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(shell.x, shell.y, shell.radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2); ctx.stroke();
        const x = shell.sourceX + (shell.x - shell.sourceX) * progress;
        const y = shell.sourceY + (shell.y - shell.sourceY) * progress - Math.sin(progress * Math.PI) * 65;
        ctx.fillStyle = "#7edc7a";
        ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
}

function drawEnemies() {
    const colors = { finalBoss: "#301626", poisoner: "#84982f", artilleryElite: "#345b2b", grunt: "#707070", coreHunter: "#d4954b", runner: "#999", brute: "#505050", boss: "#2f2f2f",
        armored: "#626c78", hunter: "#a66e6e", siege: "#776951", champion: "#786283",
        warlord: "#4d3030", titan: "#34253f", tiny: "#a9bd75", shield: "#466c80", bomber: "#dd7b32", artillery: "#65803c", gilded: "#e8b94f", blueAce: "#358dff", carrier: "#836044", blackout: "#24443d", seeker: "#82434d" };
    for (const enemy of state.enemies) {
        if (enemy.hp <= 0) continue;
        if (typeof WardenUI !== "undefined") WardenUI.draw(ctx, enemy);
        const p = smoothEntity("enemy", enemy), radius = enemyRadius(enemy);
        if (enemy.type === "carrier" && enemy.bagHp > 0) {
            const bx = p.x + enemy.bagX - enemy.x, by = p.y + enemy.bagY - enemy.y;
            ctx.fillStyle = "#62442e"; ctx.strokeStyle = "#d9ae77"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(bx, by, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            drawBar(bx - 14, by - 21, 28, 4, enemy.bagHp / 600, "#d9ae77");
            ctx.fillStyle = "#fff"; ctx.font = "bold 9px monospace"; ctx.textAlign = "center";
            ctx.fillText("12", bx, by + 3);
            if (enemy.releaseProgress > 0) {
                ctx.strokeStyle = "#ffb95c"; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(bx, by, 18, -Math.PI / 2, -Math.PI / 2 + enemy.releaseProgress / 1.5 * Math.PI * 2); ctx.stroke();
            }
        }
        if (enemy.type === "boss" && enemy.chargeWarning > 0) {
            ctx.strokeStyle = "rgb(255 92 92 / 55%)"; ctx.lineWidth = 14;
            ctx.beginPath(); ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + enemy.chargeDx * 286, p.y + enemy.chargeDy * 286); ctx.stroke();
        }
        if (enemy.type === "ghost") {
            ctx.save();
            ctx.strokeStyle = "rgb(220 230 235 / 40%)"; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = "rgb(235 242 245 / 65%)";
            ctx.beginPath();
            ctx.arc(p.x - radius * .3, p.y - 3, 2.5, 0, Math.PI * 2);
            ctx.arc(p.x + radius * .3, p.y - 3, 2.5, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            continue;
        }
        const recentHit = hitEffects.find(effect => effect.effect === "hit" && effect.damage > 0
            && performance.now() - effect.started < 260
            && effect.enemyId === enemy.id);
        if (recentHit) {
            ctx.save();
            ctx.globalAlpha = 1 - (performance.now() - recentHit.started) / 260;
            ctx.fillStyle = "#ff3b48";
            ctx.shadowColor = "#ff3b48";
            ctx.shadowBlur = 24;
            ctx.beginPath(); ctx.arc(p.x, p.y, radius + 7, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
        const isBoss = ["boss", "warlord", "titan", "warden", "finalBoss"].includes(enemy.type);
        const explosionBoss = enemy.type === "explosionBoss";
        let flashing = false;
        if (explosionBoss && enemy.fuse >= 0) {
            const sinceSnapshot = Math.max(0, (performance.now() - (state.artilleryReceivedAt ?? performance.now())) / 1000);
            const elapsed = clamp(30 - enemy.fuse + sinceSnapshot, 0, 30);
            // Integrate a frequency rising from 0.5 Hz to 5 Hz for a continuous blink phase.
            flashing = Math.sin(2 * Math.PI * (.5 * elapsed + .075 * elapsed * elapsed)) > 0;
        }
        if (typeof labRenderer === "undefined" || !labRenderer) {
            ctx.fillStyle = enemy.type === "warden" ? ["#4c5965", "#73563e", "#8b343b"][(enemy.bossPhase || 1) - 1]
                : explosionBoss ? (flashing ? "#b52b32" : "#080808") : colors[enemy.type] || colors.grunt;
            ctx.beginPath();
            if (explosionBoss) {
                for (let i = 0; i < 6; i++) {
                    const angle = Math.PI / 3 * i - Math.PI / 6;
                    const x = p.x + Math.cos(angle) * radius, y = p.y + Math.sin(angle) * radius;
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.closePath();
            } else if (enemy.type === "blueAce") {
                ctx.moveTo(p.x-radius, p.y-radius); ctx.lineTo(p.x+radius, p.y-radius);
                ctx.lineTo(p.x+radius, p.y+radius); ctx.lineTo(p.x-radius, p.y+radius); ctx.closePath();
            } else ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = isBoss ? "#fff" : "#c8c8c8"; ctx.lineWidth = isBoss ? 5 : Math.min(2, radius / 3); ctx.stroke();
            const eyeRadius = Math.min(3, radius * .2), eyeOffset = Math.min(3, radius * .5);
            ctx.fillStyle = explosionBoss ? "#ff1527" : "#fff"; ctx.beginPath(); ctx.arc(p.x - radius * .3, p.y - eyeOffset, eyeRadius, 0, Math.PI * 2); ctx.arc(p.x + radius * .3, p.y - eyeOffset, eyeRadius, 0, Math.PI * 2); ctx.fill();
        }
        if (enemy.frozenRemaining > 0) {
            ctx.save(); ctx.fillStyle = "rgb(90 211 255 / 35%)"; ctx.strokeStyle = "#a7edff"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(p.x, p.y, radius + 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
        }
        if (enemy.type === "shield" && (typeof labRenderer === "undefined" || !labRenderer)) {
            const angle = Math.atan2(enemy.facingY ?? 1, enemy.facingX ?? 0);
            ctx.strokeStyle = "#83d5f2"; ctx.lineWidth = 7;
            ctx.beginPath(); ctx.arc(p.x, p.y, radius + 4, angle - Math.PI / 3, angle + Math.PI / 3); ctx.stroke();
        }
        if ((enemy.type === "artillery" || enemy.type === "artilleryElite") && (typeof labRenderer === "undefined" || !labRenderer)) {
            ctx.fillStyle = "#cce76b";
            ctx.beginPath(); ctx.arc(p.x, p.y - radius * .7, 9, 0, Math.PI * 2); ctx.fill();
        }
        if (enemy.type !== "grunt" && enemy.type !== "tiny") { ctx.fillStyle = "white"; ctx.font = "800 9px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText((({coreHunter:"CORE HUNTER",finalBoss:"OVERLORD",artilleryElite:"ARTILLERY ELITE"})[enemy.type] || enemy.type.toUpperCase()), p.x, p.y + radius + 15); }
        if (isBoss) {
            drawBar(p.x - 44, p.y - radius - 17, 88, 6, clamp(enemy.hp / enemy.maxHp, 0, 1), "#ff5964");
            ctx.fillStyle = "#fff"; ctx.font = "800 10px ui-monospace, monospace"; ctx.textAlign = "center";
            ctx.fillText(`${Math.ceil(enemy.hp)} / ${Math.ceil(enemy.maxHp)}`, p.x, p.y - radius - 23);
        }
    }
}

function drawPoisonGas() {
    const now = performance.now(), elapsed = Math.max(0, (now - (state.artilleryReceivedAt ?? now)) / 1000);
    for (const cloud of state.poisonClouds || []) {
        const remaining = Math.max(0, cloud.remaining - elapsed);
        if (!remaining) continue;
        ctx.save(); ctx.globalAlpha = Math.min(1, remaining);
        ctx.fillStyle = cloud.hostile ? "rgb(150 195 60 / 18%)" : "rgb(180 110 235 / 15%)"; ctx.strokeStyle = cloud.hostile ? "#a6ce46" : "rgb(180 110 235 / 65%)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cloud.x, cloud.y, cloud.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = cloud.hostile ? "rgb(175 210 80 / 16%)" : "rgb(205 160 245 / 14%)";
        for (let i = 0; i < (cloud.hostile ? 4 : 10); i++) {
            const angle = i * 2.4 + now / 3600, distance = cloud.radius * (.25 + (i % 3) * .22);
            ctx.beginPath(); ctx.arc(cloud.x + Math.cos(angle) * distance,
                cloud.y + Math.sin(angle) * distance, 13 + Math.sin(now / 500 + i) * 4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
}

function drawGachaWeaponEffect(effect, now) {
    const age = now - effect.started;
    if (effect.damage !== 0 || effect.enemyId != null) return;
    if (effect.weapon === "laserCannon" && age < 220) {
        ctx.save(); ctx.globalAlpha = 1 - age / 220;
        ctx.strokeStyle = "#50d7ff"; ctx.lineWidth = (state.rules?.weapons?.laserCannon?.width || 10) * 2;
        ctx.shadowColor = "#50d7ff"; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.moveTo(effect.fromX, effect.fromY); ctx.lineTo(effect.x, effect.y); ctx.stroke();
        ctx.strokeStyle = "#eeffff"; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
    } else if (effect.weapon === "freezeGun" && age < 220) {
        ctx.save(); ctx.globalAlpha = 1 - age / 220; ctx.strokeStyle = "#b8efff"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(effect.fromX, effect.fromY); ctx.lineTo(effect.x, effect.y); ctx.stroke(); ctx.restore();
    } else if (effect.weapon === "plasmaBlade" && age < 240) {
        const angle = Math.atan2(effect.y - effect.fromY, effect.x - effect.fromX);
        ctx.save(); ctx.globalAlpha = 1 - age / 240; ctx.strokeStyle = "#76eaff"; ctx.lineWidth = 12;
        ctx.shadowColor = "#76eaff"; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.arc(effect.fromX, effect.fromY, 115, angle - Math.PI / 2, angle + Math.PI / 2); ctx.stroke(); ctx.restore();
    } else if (effect.weapon === "repulsor" && age < 200) {
        const angle = Math.atan2(effect.y - effect.fromY, effect.x - effect.fromX);
        const radius = Math.hypot(effect.x - effect.fromX, effect.y - effect.fromY) * age / 200;
        ctx.save(); ctx.globalAlpha = (1 - age / 200) * .65;
        ctx.strokeStyle = "#b4c5ff"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(effect.fromX, effect.fromY, radius, angle - Math.PI / 2, angle + Math.PI / 2); ctx.stroke(); ctx.restore();
    } else if (effect.weapon === "poisonGas" && age < 300) {
        ctx.save(); ctx.globalAlpha = 1 - age / 300; ctx.strokeStyle = "#b46eeb"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(effect.fromX, effect.fromY); ctx.lineTo(effect.x, effect.y); ctx.stroke(); ctx.restore();
    }
}

function drawMissiles() {
    for (const strike of state.missiles || []) {
        ctx.save(); ctx.strokeStyle = "#69dfff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(strike.x, strike.y, strike.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#69dfff"; ctx.font = "bold 14px monospace"; ctx.textAlign = "center";
        ctx.fillText(Math.max(0, strike.remaining - (performance.now() - state.artilleryReceivedAt) / 1000).toFixed(1), strike.x, strike.y); ctx.restore();
    }
}

function drawHooks() {
    for (const player of state.players) {
        if (player.down || !(player.hookTargetId >= 0)) continue;
        const enemy = state.enemies.find(e => e.id === player.hookTargetId && e.hp > 0);
        if (!enemy) continue;
        const p = smoothEntity("player", player), e = smoothEntity("enemy", enemy);
        ctx.save(); ctx.strokeStyle = player.hookReeling ? "#b4e9ff" : "#8095a3"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(e.x, e.y); ctx.stroke();
        ctx.beginPath(); ctx.arc(e.x, e.y, enemyRadius(enemy) + 6, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
}

function drawRailguns() {
    for (const owner of state.players) {
      const hands = [owner];
      if (owner.job === "attacker") hands.push({ ...owner, weapon: owner.secondaryWeapon,
          railgunCharge: owner.secondaryRailgunCharge, railgunRemaining: owner.secondaryRailgunRemaining,
          railgunDx: owner.secondaryRailgunDx, railgunDy: owner.secondaryRailgunDy, railgunRange: owner.secondaryRailgunRange });
      for (const player of hands) {
        if (player.down || player.weapon !== "railgun") continue;
        const p = player.id === myPlayerId && predictedLocal ? predictedLocal : smoothEntity("player", player);
        ctx.save();
        if (player.railgunRemaining > 0) {
            const endX = p.x + player.railgunDx * player.railgunRange;
            const endY = p.y + player.railgunDy * player.railgunRange;
            ctx.strokeStyle = "#87ddff"; ctx.globalAlpha = .4;
            ctx.lineWidth = TILE_MAP.tileSize; ctx.shadowColor = "#a9eaff"; ctx.shadowBlur = 16;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(endX, endY); ctx.stroke();
            ctx.globalAlpha = .9; ctx.strokeStyle = "#f0fcff"; ctx.lineWidth = TILE_MAP.tileSize * .28;
            ctx.stroke();
        } else if (player.railgunCharge > 0) {
            const progress = Math.min(1, player.railgunCharge / 1.2);
            ctx.strokeStyle = "#a9eaff"; ctx.lineWidth = 2; ctx.shadowColor = "#a9eaff"; ctx.shadowBlur = 10;
            ctx.beginPath(); ctx.arc(p.x, p.y, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); ctx.stroke();
        }
        ctx.restore();
      }
    }
}

function drawTeleportPads() {
    for (const owner of state.players) {
        for (const [index, pad] of (owner.teleportPads || []).entries()) {
            ctx.save(); ctx.translate(pad.x, pad.y);
            ctx.strokeStyle = (pad.paired ?? owner.teleportPads.length === 2) ? (pad.pair === 1 ? "#66dfc6" : "#aa83ff") : "#666";
            ctx.fillStyle = "#211a36"; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = "#eee"; ctx.font = "800 10px system-ui"; ctx.textAlign = "center";
            ctx.fillText(`TP${(pad.pair ?? Math.floor(index / 2)) + 1}`, 0, 4); ctx.restore();
        }
    }
}

function drawHealingAreas() {
    for (const p of state.players) {
        if (!(p.healRemaining > 0)) continue;
        const h = p.healHalfSize;
        ctx.save(); ctx.fillStyle = "rgba(92,235,160,.15)"; ctx.strokeStyle = "#5ceba0"; ctx.lineWidth = 1;
        ctx.fillRect(p.healX - h, p.healY - h, h * 2, h * 2);
        ctx.strokeRect(p.healX - h, p.healY - h, h * 2, h * 2);
        for (let i = 1; i < 3; i++) {
            ctx.beginPath(); ctx.moveTo(p.healX - h + i * h * 2 / 3, p.healY - h); ctx.lineTo(p.healX - h + i * h * 2 / 3, p.healY + h);
            ctx.moveTo(p.healX - h, p.healY - h + i * h * 2 / 3); ctx.lineTo(p.healX + h, p.healY - h + i * h * 2 / 3); ctx.stroke();
        }
        ctx.restore();
    }
}

function drawPlayers() {
    for (const decoy of state.decoys || []) {
        if (decoy.hp <= 0) continue;
        ctx.save();
        ctx.globalAlpha = .65;
        ctx.fillStyle = "#eecb65";
        ctx.fillRect(decoy.x - 9, decoy.y - 9, 18, 18);
        ctx.strokeStyle = "#fff0b1";
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(decoy.x, decoy.y, 18, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        drawBar(decoy.x - 15, decoy.y - 23, 30, 3, decoy.hp / decoy.maxHp, "#eecb65");
    }
    for (const player of state.players) {
        const isLocal = player.id === myPlayerId && predictedLocal;
        const p = isLocal ? predictedLocal : smoothEntity("player", player);
        if (player.job === "tank" && !player.down) {
            ctx.save();
            ctx.strokeStyle = "#7acba822";
            ctx.beginPath(); ctx.arc(p.x, p.y, player.tankAuraRadius, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
        }
        if (player.tpInvulnerableRemaining > 0 && !player.down) {
            ctx.save(); ctx.strokeStyle = "#aa83ff"; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(p.x, p.y, 24, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        }
        const rescuers = state.players.filter(worker => worker.action === player.id);
        if (player.down && rescuers.length && (player.id === myPlayerId || rescuers.some(worker => worker.id === myPlayerId))) drawReviveEffect(p.x, p.y, Math.max(...rescuers.map(worker => worker.actionProgress / (worker.reviveSeconds ?? 4))));
        if (typeof labRenderer === "undefined" || !labRenderer) {
            ctx.save();
            if (player.down) { ctx.translate(p.x, p.y + 8); ctx.scale(1.35, .65); }
            else ctx.translate(p.x, p.y);
            if (!player.down && (player.tpInvulnerableRemaining > 0 || player.reviveInvulnerableRemaining > 0)) {
                ctx.globalAlpha = Math.floor(performance.now() / 100) % 2 ? .25 : 1;
            }
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
            ctx.fillStyle = hit || player.down ? "#ff5964" : player.id === myPlayerId ? "#79d8ff" : "#454545";
            if (player.job === "attacker" && !player.down) {
                ctx.save();
                ctx.fillStyle = "#b5b5b5";
                ctx.fillRect(-12, -3, 4, 12); ctx.fillRect(8, -3, 4, 12);
                ctx.fillStyle = "#454545";
                ctx.fillRect(-12, -3, 4, 4); ctx.fillRect(8, -3, 4, 4);
                ctx.restore();
            }
            const playerSize = 10;
            const disguised = player.spyRemaining > 0 && !player.down;
            if (disguised) {
                ctx.fillStyle = "#707070"; ctx.strokeStyle = "#c8c8c8"; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                ctx.fillStyle = "#fff";
                ctx.fillRect(-6, -5, 3, 3); ctx.fillRect(3, -5, 3, 3);
                ctx.fillStyle = "#79d8ff"; ctx.fillRect(-2, 6, 4, 2);
            } else ctx.fillRect(-playerSize / 2, -playerSize / 2, playerSize, playerSize);
            if (player.id === myPlayerId && !disguised) { ctx.strokeStyle = "white"; ctx.lineWidth = 1.5; ctx.strokeRect(-playerSize / 2, -playerSize / 2, playerSize, playerSize); }
            if (player.drone?.controlled && player.drone?.active && !player.down) {
                ctx.fillStyle = "#b7c9d1"; ctx.fillRect(-8, 5, 16, 8);
                ctx.fillStyle = "#253f49"; ctx.fillRect(-5, 7, 3, 3); ctx.fillRect(2, 7, 3, 3);
            }
            if (player.selectedBuild?.endsWith("Factory") && player.buildItems?.[player.selectedBuild] > 0) {
                ctx.fillStyle = "#70bfff";
                ctx.fillRect(-9, -24, 18, 16);
                ctx.fillStyle = "#111";
                ctx.fillRect(-5, -20, 10, 8);
            }
            ctx.restore();
        }
        if (player.id === myPlayerId) drawLocalWeaponCooldown(p.x, p.y, player);
        ctx.textAlign = "center"; ctx.fillStyle = typeof labRenderer !== "undefined" && labRenderer ? "#f2f7fa" : "#454545"; ctx.font = "800 11px system-ui";
        ctx.fillText(player.name, p.x, p.y - (typeof labRenderer !== "undefined" && labRenderer ? 37 : 14));
        drawMedbayParticles(player, p);

    }
    ctx.textAlign = "left";
}

function droneRecoveryAvailable(me) {
    return me?.job === "drone" && !me.down && !me.movingCore && me.drone?.active
        && state && ["preparing", "wave"].includes(state.phase)
        && distance(me, me.drone) <= me.droneRecoveryRange && hasInteractionPath(me, me.drone);
}

function drawDrones() {
    for (const owner of state.players) {
        if (!owner.drone?.active) continue;
        const p = smoothEntity("drone", { ...owner.drone, id: owner.id });
        ctx.save();
        ctx.translate(p.x, p.y);
        if (typeof labRenderer === "undefined" || !labRenderer) {
            ctx.fillStyle = "#0005";
            ctx.beginPath(); ctx.ellipse(0, 12, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#8be8f5"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(9, 9);
            ctx.moveTo(9, -9); ctx.lineTo(-9, 9); ctx.stroke();
            for (const [x, y] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) {
                ctx.beginPath(); ctx.ellipse(x, y, 6, 3, performance.now() / 70, 0, Math.PI * 2); ctx.stroke();
            }
            ctx.fillStyle = "#ddfbff"; ctx.fillRect(-4, -4, 8, 8);
        }
        drawBar(-15, -23, 30, 3, owner.drone.hp / owner.drone.maxHp, "#8be8f5");
        if (owner.id === myPlayerId && droneRecoveryAvailable(owner)
                && actionMenu.classList.contains("hidden") && inventoryMenu.classList.contains("hidden")
                && howToMenu.classList.contains("hidden")) {
            drawKeyPrompt(window.coreKeySettings.getJobEffect().toUpperCase(), 0, -34);
        }
        ctx.restore();
    }
}

function drawMedbayParticles(player, position) {
    if (!player.medbayHealing || player.down || player.hp >= (player.maxHp || 100)) return;
    const time = performance.now() / 1200;
    for (let index = 0; index < 4; index++) {
        const progress = (time + index * .25) % 1;
        const angle = index * Math.PI / 2 + .4 + progress * .35;
        const distance = 24 * (1 - progress);
        ctx.save();
        ctx.globalAlpha = Math.sin(progress * Math.PI) * .95;
        ctx.fillStyle = "#76cfa2";
        ctx.shadowColor = "#76cfa2";
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(position.x + Math.cos(angle) * distance,
            position.y + Math.sin(angle) * distance, 2.5 - progress * .7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawInteractionPrompt() {
    const interaction = findNearestInteraction();
    if (!interaction || interaction.kind === "spy" || !actionMenu.classList.contains("hidden")) return;
    const x = interaction.target.x;
    const y = interaction.target.y - 34;
    drawKeyPrompt("R", x, y);
}

function drawKeyPrompt(key, x, y) {
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
    ctx.fillText(key, x, y + 1);
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
    const flameBudget = typeof FlameParticles !== "undefined" ? FlameParticles.createBudget() : null;
    hitEffects = hitEffects.filter(effect => now - effect.started
        < (effect.effect === "player-hit" ? 600 : effect.effect === "player-down" ? 1200 : effect.effect === "pickup"
            || (effect.credits > 0 || effect.headshot) && effect.playerId === myPlayerId
            ? 900 : 360));
    for (const effect of hitEffects) {
        if (effect.effect === "player-hit") continue;
        if (effect.effect === "player-down") {
            const progress = (now - effect.started) / 1200;
            ctx.save();
            ctx.strokeStyle = "#ff5964";
            ctx.lineWidth = 3;
            for (let ring = 0; ring < 3; ring++) {
                const expansion = progress - ring * .16;
                if (expansion < 0) continue;
                ctx.globalAlpha = (1 - progress) * .8;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, 12 + expansion * 180, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
            continue;
        }
        if (effect.effect === "explosion" || effect.effect === "acid-impact") {
            const progress = (now - effect.started) / 360;
            ctx.save(); ctx.globalAlpha = 1 - progress;
            const allied = effect.source === "ally";
            const artillery = effect.effect === "acid-impact";
            ctx.fillStyle = allied ? "rgb(105 223 255 / 25%)" : artillery ? "rgb(126 220 122 / 25%)" : "rgb(255 112 80 / 25%)";
            ctx.strokeStyle = allied ? "#69dfff" : artillery ? "#7edc7a" : "#ff805c"; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius * (.25 + .75 * progress), 0, Math.PI * 2);
            ctx.fill(); ctx.stroke(); ctx.restore(); continue;
        }
        if (effect.effect === "intercept") {
            const progress = (now - effect.started) / 360;
            ctx.save(); ctx.globalAlpha = 1 - progress;
            ctx.strokeStyle = "#bcefff"; ctx.lineWidth = 2;
            for (let i = 0; i < 6; i++) {
                const angle = i * Math.PI / 3, radius = 5 + progress * 18;
                ctx.beginPath(); ctx.moveTo(effect.x + Math.cos(angle) * radius, effect.y + Math.sin(angle) * radius);
                ctx.lineTo(effect.x + Math.cos(angle) * (radius + 5), effect.y + Math.sin(angle) * (radius + 5)); ctx.stroke();
            }
            ctx.restore(); continue;
        }
        if (effect.effect === "pickup") {
            const progress = (now - effect.started) / 900;
            ctx.save();
            ctx.globalAlpha = 1 - progress;
            ctx.fillStyle = "#000";
            ctx.font = "900 11px ui-monospace, monospace";
            ctx.textAlign = "center";
            ctx.fillText(`+${effect.resource === "medkit" ? "回復キット" : RESOURCE_NAMES[effect.resource] || effect.resource}${effect.amount > 1 ? ` ×${effect.amount}` : ""}`,
                effect.x, effect.y - 18 - progress * 22);
            ctx.restore();
            continue;
        }
        if (["laserCannon", "poisonGas", "repulsor", "freezeGun", "plasmaBlade"].includes(effect.weapon)) {
            drawGachaWeaponEffect(effect, now);
            continue;
        }
        if (effect.weapon === "flamethrower") {
            if (effect.damage === 0 && effect.enemyId == null && typeof FlameParticles !== "undefined") {
                FlameParticles.draw(ctx, effect, now, state.rules.flameHalfAngle,
                    (origin, target) => canPredictOccupy(target.x, target.y, 0, false) && hasInteractionPath(origin, target), flameBudget);
            }
            continue;
        }
        const age = now - effect.started;
        if (age < 360) {
            const progress = age / 360;
            ctx.save(); ctx.globalAlpha = 1 - progress; ctx.strokeStyle = "#ff5964";
            if (effect.weapon === "bat" && effect.damage === 0 && progress < .55) {
                ctx.strokeStyle = "#79d8ff";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, 4 + progress * 6, 0, Math.PI * 2);
                ctx.stroke();
            }
            if ((typeof labRenderer === "undefined" || !labRenderer) && (effect.weapon === "turret" || effect.damage === 0)
                && !["bat", "mine"].includes(effect.weapon) && progress < .55) {
                ctx.lineWidth = 1.35;
                ctx.beginPath(); ctx.moveTo(effect.fromX, effect.fromY); ctx.lineTo(effect.x, effect.y); ctx.stroke();
            }
            ctx.restore();
        }
    }
    if (typeof CombatFeedback !== "undefined") {
        if (typeof labRenderer !== "undefined" && labRenderer) {
            ctx.save(); ctx.setTransform(scale, 0, 0, scale, 0, 0);
            CombatFeedback.draw(ctx, now, projectCombatPopup);
            ctx.restore();
        } else CombatFeedback.draw(ctx, now);
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

window.coreGame = {
    resume() {
        const saved = window.coreReconnect?.saved();
        if (!saved) throw new Error("復帰できるゲームがありません");
        clientSessionId = window.coreReconnect.adopt(saved.sessionId);
        nameInput.value = saved.name;
        if (window.coreMenu) window.coreMenu.phrase = saved.phrase;
        enterRoom(saved.roomId, { phrase: saved.phrase, resume: true });
    },
    match(action, password, name) {
        if (socket?.readyState !== WebSocket.OPEN || connectionTarget.mode !== "directory") {
            throw new Error("接続できません");
        }
        nameInput.value = name;
        socket.send("MATCH:" + JSON.stringify({ action, password, name }));
    },
    send,
    changeJob: requestJobChange,
    leave: leaveRoom
};
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

function drawProjectiles() {
    const active = new Set((state.projectiles || []).map(shot => "projectile-" + shot.id));
    for (const key of smoothed.keys()) if (key.startsWith("projectile-") && !active.has(key)) smoothed.delete(key);
    for (const shot of state.projectiles || []) {
        const p = smoothEntity("projectile", shot);
        const dx = Math.cos(shot.angle), dy = Math.sin(shot.angle);
        ctx.save(); ctx.strokeStyle = shot.source === "enemy" ? "#ff7050" : "#69dfff";
        ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 12; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p.x - dx * 20, p.y - dy * 20); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.translate(p.x, p.y); ctx.rotate(shot.angle); ctx.fillStyle = "#fff5e9";
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -4); ctx.lineTo(-3, 0); ctx.lineTo(-5, 4); ctx.closePath(); ctx.fill(); ctx.restore();
        if (shot.source === "enemy" && shot.hp < shot.maxHp) drawBar(p.x - 9, p.y - 12, 18, 2, shot.hp / shot.maxHp, "#ff7050");
    }
}

function drawBlackoutEnemyGlow() {
    if (getMe()?.missileControl) return;
    ctx.save();
    for (const enemy of state.enemies || []) {
        if (enemy.type !== "blackout" || !enemy.powerCut || enemy.hp <= 0) continue;
        const p = smoothed.get("enemy-" + enemy.id) || enemy;
        const x = (p.x - camera.x) * scale + canvas.width / 2, y = (p.y - camera.y) * scale * worldYScale() + canvas.height / 2;
        ctx.strokeStyle = "#8affd7"; ctx.shadowColor = "#66ffcb"; ctx.shadowBlur = 16; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, enemyRadius(enemy) * scale, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#e2fff5"; ctx.fillRect(x-8*scale, y-6*scale, 5*scale, 4*scale);
        ctx.fillRect(x+3*scale, y-6*scale, 5*scale, 4*scale);
    }
    ctx.restore();
}

let rewindFinishedAt = -Infinity;
function drawRewindScreen() {
    if (!state) return;
    const now = performance.now(), remaining = state.rewindRemaining || 0;
    const flash = Math.max(0, 1 - (now - rewindFinishedAt) / 850);
    if (remaining <= 0 && flash <= 0) return;
    const w = canvas.width, h = canvas.height;
    ctx.save();
    if (remaining > 0) {
        const t = Math.floor(now / 65), progress = clamp(1 - remaining / (state.rewindDuration || 6), 0, 1);
        ctx.globalAlpha = .18; ctx.drawImage(canvas, Math.sin(t * 3.1) * 16, 0); ctx.globalAlpha = 1;
        ctx.fillStyle = "rgb(0 7 16 / 75%)"; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 75; i++) {
            const n = Math.abs(Math.sin(t * 43.1 + i * 19.7));
            ctx.fillStyle = i % 3 ? "rgb(105 255 223 / 12%)" : "rgb(255 90 130 / 20%)";
            ctx.fillRect(n * w, ((i * 89 + t * 17) % h), w * (.1 + n * .2), 1 + n * 3);
        }
        ctx.fillStyle = "rgb(100 230 255 / 8%)";
        for (let y = t % 4; y < h; y += 4) ctx.fillRect(0, y, w, 1);
        ctx.textAlign = "center"; ctx.font = "800 24px ui-monospace, monospace";
        ctx.fillStyle = "#ff6288"; ctx.fillText("SIGNAL LOST", w/2 + Math.sin(t)*3, h/2 - 46);
        ctx.fillStyle = "#a4ffdf"; ctx.font = "800 18px ui-monospace, monospace";
        ctx.fillText(progress < .3 ? "BACKUP DETECTED" : progress < .85 ? "RESTORING SYSTEM..." : "REBOOTING...", w/2, h/2);
        ctx.fillStyle = "#193b3d"; ctx.fillRect(w/2-130, h/2+26, 260, 3);
        ctx.fillStyle = "#86ffdb"; ctx.fillRect(w/2-130, h/2+26, 260*progress, 3);
    } else {
        ctx.fillStyle = "rgba(170,255,230," + flash * .75 + ")"; ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
}

function projectCombatPopup(popup) {
    const enemy = state.enemies.find(entity => entity.id === popup.enemyId && entity.hp > 0);
    const point = enemy ? smoothEntity('enemy', enemy) : popup;
    if (enemy) popup.height = enemyRadius(enemy) * 1.6;
    const projected = labRenderer.project(point.x, point.y, popup.height || 24);
    return { x: projected.visible===false ? -10000 : projected.x / scale, y: projected.visible===false ? -10000 : projected.y / scale };
}

function labStations() {
    if (!state) return [];
    const stations = SHOP_UNITS.filter(isUnlockedPoint).map(p => [p, p.label, '#80cee1']);
    for (const p of MEDBAYS.filter(isUnlockedPoint)) stations.push([p, 'MED BAY', '#88d7b1']);
    for (const p of [WOODCUTTER, QUARRY].filter(isUnlockedPoint)) stations.push([p, '', '#d3b78c']);
    for (const p of [...WORKBENCHES, PREP_CONSOLE, MISSILE_COMPUTER, JOB_STATION].filter(Boolean))
        if (!p.requiredArea || state.areas[p.requiredArea]) stations.push([p, '', '#89cbd8']);
    const tripped = new Set(state.trippedBreakers || []);
    for (const p of BREAKER_TERMINALS) if (!p.requiredArea || state.areas[p.requiredArea])
        stations.push([p, state.blackoutActive && tripped.has(p.id) ? 'RESET' : 'POWER', state.blackoutActive && tripped.has(p.id) ? '#ff5964' : '#89cbd8', 'breaker']);
    const reachable = reachableFloorTiles(), size = TILE_MAP.tileSize;
    for(const p of SPAWN_POINTS) {
        if(p.id.startsWith('area-') && !state.areas[p.id.slice(5).split(':')[0]])continue;
        stations.push([p,'','#222b30','spawn']);
    }
    for (const area of AREAS) {
        const c = Math.floor(area.terminalX / size), r = Math.floor(area.terminalY / size);
        if (!state.areas[area.id] && [[0,0],[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => reachable.has((r+dy)+':'+(c+dx))))
            stations.push([{id:'unlock:'+area.id, x:area.terminalX, y:area.terminalY}, 'UNLOCK', '#79d8ff', 'terminal']);
    }
    for (const p of state.factories || []) stations.push([p, '', '#80cee1']);
    return stations;
}
