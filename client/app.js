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
const selfHealthLabel = document.querySelector("#self-health-label");
const selfCredits = document.querySelector("#self-credits");
const selfMaterials = document.querySelector("#self-materials");
const noticeElement = document.querySelector("#notice");
const feedbackElement = document.querySelector("#feedback");
const interactButton = document.querySelector("#interact");
const weaponButton = document.querySelector("#weapon");
const weaponName = document.querySelector("#weapon-name");
const weaponAmmo = document.querySelector("#weapon-ammo");
const weaponCooldown = document.querySelector("#weapon-cooldown");
const weaponIcon = document.querySelector("#weapon-icon");
const actionMenu = document.querySelector("#action-menu");
const actionTitle = document.querySelector("#action-title");
const actionOptions = document.querySelector("#action-options");
const actionClose = document.querySelector("#action-close");
const buildBelt = document.querySelector("#build-belt");
const roundIntro = document.querySelector("#round-intro");
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
const BUILD_INFO = {
    block: { name: "BLOCK", wood: 4, ore: 0, description: "通路を塞ぐ基本ブロック" },
    turret: { name: "AUTO TURRET", wood: 4, ore: 8, description: "範囲内の敵を自動射撃" },
    wire: { name: "BARBED WIRE", wood: 2, ore: 4, description: "通過する敵を減速" },
    mine: { name: "MINE", wood: 1, ore: 5, description: "接近した敵へ範囲ダメージ" },
    barricade: { name: "BARRICADE", wood: 6, ore: 2, description: "高耐久の進路妨害" },
};
const INTERACTION_RANGE = Object.freeze({
    armory: 105,
    medBay: 95,
    core: 95,
    trapSlot: 100,
    areaTerminal: 100,
    resource: 110,
    workbench: 110,
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

async function loadMap() {
    const response = await fetch("../shared/map.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`map.json: HTTP ${response.status}`);
    applyMap(await response.json());
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
        ["spawnPoints", map.spawnPoints], ["trapSlots", map.trapSlots]]) {
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
    socket = new WebSocket(`${protocol}://${host}:${serverPort}/?session=${encodeURIComponent(clientSessionId)}`);
    socket.addEventListener("open", () => {
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
        if (message.type === "effect" && ["hit", "core-pulse"].includes(message.effect)) {
            hitEffects.push({ ...message, started: performance.now() });
            if (hitEffects.length > 100) hitEffects.shift();
        }
        if (message.type === "feedback" || message.type === "error") showFeedback(message.message);
    });
    socket.addEventListener("close", () => {
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

function cycleWeapon(direction = 1) {
    const me = getMe();
    if (!me) return;
    const weapons = ["pistol", "bat"];
    if (me.ownsShotgun) weapons.push("shotgun");
    if (me.ownsRifle) weapons.push("rifle");
    const current = Math.max(0, weapons.indexOf(me.weapon));
    const next = weapons[(current + direction + weapons.length) % weapons.length];
    send(`WEAPON:${next}`);
}

weaponButton.addEventListener("click", () => cycleWeapon(1));
interactButton.addEventListener("click", useNearestInteraction);
window.addEventListener("wheel", event => {
    if (!state || !["preparing", "wave"].includes(state.phase)) return;
    event.preventDefault();
    cycleWeapon(event.deltaY > 0 ? 1 : -1);
}, { passive: false });
actionClose.addEventListener("click", closeActionMenu);
actionMenu.addEventListener("pointerdown", event => {
    if (event.target === actionMenu) closeActionMenu();
});

function updateHud() {
    if (!state) return;
    roundElement.textContent = `ROUND ${state.round} / ${state.maxRounds}`;
    phaseElement.textContent = state.phase === "preparing" ? "PREPARING"
        : state.phase === "wave" ? "DEFENDING"
            : state.phase.toUpperCase();
    phaseDetail.textContent = state.phase === "preparing"
        ? `00:${String(Math.ceil(state.prepTime)).padStart(2, "0")}`
        : `${state.enemies.length + state.queued} HOSTILES`;
    const me = getMe();
    teamElement.innerHTML = state.players.filter(player => player.id !== myPlayerId).map(player => `
        <div class="teammate ${player.down ? "down" : ""} ${player.id === myPlayerId ? "self" : ""}">
            <div class="teammate-label">
                <span>${player.id === myPlayerId ? "YOU" : player.human ? escapeHtml(player.name) : `CPU${player.id.at(-1)}`}</span>
                <span class="player-stats">${player.down ? "DOWN" : `${Math.ceil(player.hp)} HP`}<b>${player.credits} CR</b></span>
            </div>
            <div class="hp-line"><span style="width:${player.hp}%"></span></div>
        </div>`).join("");
    selfVitals.classList.toggle("hidden", !me);
    if (me) {
        const health = clamp(me.hp, 0, 100);
        healthHeart.style.setProperty("--health", `${health}%`);
        healthHeart.setAttribute("aria-label", `体力 ${Math.ceil(health)}%`);
        selfHealthLabel.textContent = me.down ? "DOWN" : `${Math.ceil(health)} HP`;
        selfCredits.textContent = `${me.credits} CR`;
        selfMaterials.textContent = `WOOD ${me.wood} · ORE ${me.ore}`;
        const ammo = me.weapon === "shotgun" ? String(me.shotgunAmmo) : me.weapon === "rifle" ? String(me.rifleAmmo) : "∞";
        const cooldownMax = Math.max(.01, me.cooldownMax || me.cooldown || .01);
        const cooldownProgress = 1 - Math.min(1, me.cooldown / cooldownMax);
        weaponName.textContent = me.weapon.toUpperCase();
        weaponAmmo.textContent = ammo;
        weaponIcon.className = `weapon-icon ${me.weapon}`;
        weaponCooldown.textContent = me.cooldown > 0 ? `${me.cooldown.toFixed(1)}s` : "READY";
        weaponButton.style.setProperty("--cooldown-progress", `${cooldownProgress * 100}%`);
        weaponButton.classList.toggle("cooling", me.cooldown > 0);
        updateBuildBelt(me);
        interactButton.classList.toggle("hidden", !findNearestInteraction());
    }
}

function updateBuildBelt(me) {
    const available = Object.entries(BUILD_INFO).filter(([type]) => (me.buildItems?.[type] || 0) > 0);
    buildBelt.classList.toggle("hidden", available.length === 0);
    buildBelt.innerHTML = available.map(([type, info]) => `
        <button type="button" data-build="${type}" class="${me.selectedBuild === type ? "selected" : ""}">
            <strong>${info.name}</strong><span>×${me.buildItems[type]}</span>
        </button>`).join("");
    buildBelt.querySelectorAll("button").forEach(button => button.addEventListener("click", () => {
        send(`EQUIP_BUILD:${button.dataset.build}`);
    }));
}

function setDash(active) {
    dashRequested = active;
    send(`DASH:${active ? 1 : 0}`);
}

function showNotice(text) {
    const entry = {
        id: `${Date.now()}-${Math.random()}`,
        text: String(text),
        round: state?.round > 0 ? `R${state.round}` : "SYS",
    };
    noticeEntries.unshift(entry);
    if (noticeEntries.length > 4) noticeEntries.length = 4;
    renderNotices();
    setTimeout(() => {
        const index = noticeEntries.findIndex(item => item.id === entry.id);
        if (index >= 0) noticeEntries.splice(index, 1);
        renderNotices();
    }, 5200);
}

function renderNotices() {
    noticeElement.innerHTML = noticeEntries.map(entry => `
        <div class="log-entry"><span>${entry.round}</span><p>${escapeHtml(entry.text)}</p></div>`).join("");
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

function reconcileLocalPrediction(snapshot) {
    const serverMe = snapshot.players.find(player => player.id === myPlayerId);
    if (!serverMe) return;
    acknowledgeInputs(serverMe.ackInput);
    if (!predictedLocal) {
        predictedLocal = { x: serverMe.x, y: serverMe.y, stamina: serverMe.stamina, dashing: serverMe.dashing, exhausted: false };
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
    if (serverMe.stamina >= 28) predictedLocal.exhausted = false;
    if (serverMe.stamina <= 0) predictedLocal.exhausted = true;
}

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

function openNearbyActionMenu(title, options, target, range) {
    if (!canUseNearby(target, range, true)) return;
    activeMenuAccess = { target: { x: target.x, y: target.y }, range };
    openActionMenu(title, options);
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
}

function openSlotMenu(slot) {
    if (slot.locked) {
        openNearbyActionMenu("AREA LOCKED", [{ label: "入口の解放端末を操作してください", disabled: true }],
            slot, INTERACTION_RANGE.trapSlot);
    } else if (!slot.defense) {
        openNearbyActionMenu("EMPTY TILE", [{
            label: "CRAFT FIRST",
            detail: "作業台でクラフトし、持った状態で近くの床を右クリック",
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

function canBuildAt(point) {
    const size = TILE_MAP.tileSize;
    const column = Math.floor(point.x / size), row = Math.floor(point.y / size);
    const symbol = TILE_MAP.rows[row]?.[column];
    if (!symbol || !TILE_MAP.legend[symbol]?.buildable) return false;
    if (AREAS.some(area => !state.areas[area.id]
            && point.x >= area.x && point.x <= area.x + area.width
            && point.y >= area.y && point.y <= area.y + area.height)) return false;
    if (distance(point, CORE) < 90 || distance(point, ARMORY) < 70 || distance(point, MED) < 70
            || distance(point, WOODCUTTER) < 70 || distance(point, QUARRY) < 70
            || distance(point, WORKBENCH) < 70) return false;
    if (SPAWN_POINTS.some(spawn => distance(point, spawn) < 80)) return false;
    if (state.slots.some(slot => distance(point, slot) < 36)) return false;
    return !state.players.some(player => distance(point, player) < (player.id === myPlayerId ? 30 : 48))
        && !state.enemies.some(enemy => enemy.hp > 0 && distance(point, enemy) < 48);
}

function openCoreMenu() {
    const core = state.core;
    const hpCost = 300 + Math.round((core.maxHp - 1000) * .6);
    const shieldCost = 350 + Math.round(core.maxShield * .8);
    const defenseCost = 450 + core.defense * 250;
    const regenCost = 500 + core.regen * 300;
    openNearbyActionMenu("CORE UPGRADES", [
        option("MAX HP +250", hpCost, "UPGRADE:hp"),
        option("SHIELD +180", shieldCost, "UPGRADE:shield"),
        option(`DEFENSE Lv.${core.defense + 1}`, defenseCost, "UPGRADE:defense", core.defense >= 4),
        option(`AUTO REPAIR Lv.${core.regen + 1}`, regenCost, "UPGRADE:regen", core.regen >= 4),
    ], CORE, INTERACTION_RANGE.core);
}

function openArmoryMenu() {
    const me = getMe();
    openNearbyActionMenu("ARMORY", [
        option("SHOTGUN", 450, "BUY:shotgun", me.ownsShotgun, me.ownsShotgun ? "購入済み" : "範囲攻撃 / 30発"),
        option("RIFLE", 650, "BUY:rifle", me.ownsRifle, me.ownsRifle ? "購入済み" : "長射程 / 24発"),
        option("AMMO PACK", 100, "BUY:ammo", !me.ownsShotgun && !me.ownsRifle, "SG +16 / RF +12"),
    ], ARMORY, INTERACTION_RANGE.armory);
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
    openNearbyActionMenu(area.name, [option("OPEN AREA", cost, `UNLOCK:${area.id}`, unlocked, unlocked ? "解放済み" : area.detail)],
        { x: area.terminalX, y: area.terminalY }, INTERACTION_RANGE.areaTerminal);
}

function option(label, cost, command, extraDisabled = false, customDetail = "") {
    const me = getMe();
    return { label, detail: customDetail || `${cost} CR`, command,
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
    if (event.pointerType === "mouse" && event.button === 2) {
        event.preventDefault();
        placeHeldBuild(event.clientX, event.clientY);
        return;
    }
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
    const point = worldFromScreen(clientX, clientY);
    firingPointer = { id: pointerId, clientX, clientY, lastAimSent: performance.now() };
    send(`FIRE:${point.x.toFixed(1)}:${point.y.toFixed(1)}:1`);
}

function updateFiringAim(clientX, clientY) {
    if (!firingPointer) return;
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
    const point = worldFromScreen(clientX, clientY);
    send(`FIRE:${point.x.toFixed(1)}:${point.y.toFixed(1)}:1`);
    send(`FIRE:${point.x.toFixed(1)}:${point.y.toFixed(1)}:0`);
}

function placeHeldBuild(clientX, clientY) {
    const me = getMe();
    const type = me?.selectedBuild;
    if (!type || (me.buildItems?.[type] || 0) <= 0) {
        showFeedback("作業台でクラフトしたアイテムを選択してください");
        return;
    }
    const point = snapToTile(worldFromScreen(clientX, clientY));
    if (distance(me, point) > 180) {
        showFeedback("もっと近いタイルを右クリックしてください");
        return;
    }
    if (!canBuildAt(point)) {
        showFeedback("ここには配置できません");
        return;
    }
    send(`PLACE:${point.x}:${point.y}:${type}`);
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
    const message = `MOVE:${localMove.x.toFixed(2)}:${localMove.y.toFixed(2)}`;
    if (force || message !== lastMove) { lastMove = message; send(message); }
}

window.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();
    if (key === "r") {
        event.preventDefault();
        if (!event.repeat) useNearestInteraction();
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
    add("armory", ARMORY, INTERACTION_RANGE.armory, "ARMORY", openArmoryMenu);
    add("med", MED, INTERACTION_RANGE.medBay, "MED BAY", openMedMenu);
    add("wood", WOODCUTTER, INTERACTION_RANGE.resource, "WOODCUTTER", openWoodcutterMenu);
    add("ore", QUARRY, INTERACTION_RANGE.resource, "QUARRY", openQuarryMenu);
    add("craft", WORKBENCH, INTERACTION_RANGE.workbench, "CRAFT", openWorkbenchMenu);
    add("core", CORE, INTERACTION_RANGE.core, "CORE", openCoreMenu);
    for (const area of AREAS) {
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

function nearestAt(items, point) {
    return items.slice().sort((a, b) => distance(point, a) - distance(point, b))[0];
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function updateLocalPrediction(dt) {
    const serverMe = getMe();
    if (!predictedLocal || !serverMe || !["preparing", "wave"].includes(state.phase)) return;
    const input = Math.hypot(localMove.x, localMove.y);
    if (predictedLocal.exhausted && predictedLocal.stamina >= 28) predictedLocal.exhausted = false;
    predictedLocal.dashing = !serverMe.down && dashRequested && !predictedLocal.exhausted && input > .12 && predictedLocal.stamina > 0;
    if (predictedLocal.dashing) {
        predictedLocal.stamina = Math.max(0, predictedLocal.stamina - 38 * dt);
        if (predictedLocal.stamina <= 0) {
            predictedLocal.exhausted = true;
            predictedLocal.dashing = false;
        }
    } else {
        predictedLocal.stamina = Math.min(100, predictedLocal.stamina + 24 * dt);
    }

    const speed = serverMe.down ? 45 : predictedLocal.dashing ? 265 : 155;
    const nextX = clamp(predictedLocal.x + localMove.x * speed * dt, 25, WORLD.width - 25);
    const nextY = clamp(predictedLocal.y + localMove.y * speed * dt, 25, WORLD.height - 25);
    if (canPredictOccupy(nextX, predictedLocal.y, 21)) predictedLocal.x = nextX;
    if (canPredictOccupy(predictedLocal.x, nextY, 21)) predictedLocal.y = nextY;
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
        drawCore();
        drawShops();
        drawTrapSlots();
        drawEnemies();
        drawPlayers();
        drawInteractionPrompt();
        drawHitEffects();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (state?.phase === "wave" && state.roundEvent === "blackout") drawBlackout();
    drawJoystick();
}

function drawBlackout() {
    const me = predictedLocal || getMe();
    if (!me) return;
    const x = (me.x - camera.x) * scale + canvas.width / 2;
    const y = (me.y - camera.y) * scale + canvas.height / 2;
    const flicker = Math.sin(performance.now() / 83) * 5;
    const light = ctx.createRadialGradient(x, y, 55, x, y, 235 + flicker);
    light.addColorStop(0, "rgb(1 5 8 / 0%)");
    light.addColorStop(.48, "rgb(1 5 8 / 20%)");
    light.addColorStop(1, "rgb(1 5 8 / 88%)");
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
    ctx.strokeStyle = "#5a7079"; ctx.lineWidth = 3; ctx.strokeRect(1, 1, WORLD.width - 2, WORLD.height - 2);
}

function drawDebugSpawn(spawn) {
    const incoming = Boolean(state && state.phase === "wave" && state.activeSpawns.includes(spawn.id));
    const failed = incoming && state.roundEvent === "door_failure" && state.failedSpawn === spawn.id;
    const pulse = (Math.sin(performance.now() / 130) + 1) / 2;
    ctx.save();
    ctx.strokeStyle = failed ? "#ffb267" : incoming ? "#ff6c74" : "#627880";
    ctx.lineWidth = incoming ? 3 : 2;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(spawn.x, spawn.y);
    for (const point of spawn.route) ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (incoming) { ctx.shadowColor = failed ? "#ff9b3d" : "#ff4f58"; ctx.shadowBlur = 14 + pulse * 15; }
    ctx.fillStyle = failed ? "#ef8a2f" : incoming ? "#e23f49" : "#3a464b"; ctx.beginPath(); ctx.arc(spawn.x, spawn.y, incoming ? 25 + pulse * 3 : 17, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = failed ? "#ffe0a8" : incoming ? "#ffc0b8" : "#8c686b"; ctx.lineWidth = incoming ? 4 : 2; ctx.stroke();
    ctx.restore();
    ctx.fillStyle = failed ? "#ffe0a8" : incoming ? "#ffd1c9" : "#75858b"; ctx.font = "900 10px ui-monospace, monospace"; ctx.textAlign = "center";
    const labelY = spawn.y < 60 ? spawn.y + 43 : spawn.y > WORLD.height - 60 ? spawn.y - 34 : spawn.y - 31;
    ctx.fillText(failed ? `DEBUG FAILED: ${spawn.name}` : incoming ? `DEBUG ACTIVE: ${spawn.name}` : `DEBUG: ${spawn.name}`, spawn.x, labelY);
}

function drawAreas() {
    for (const area of AREAS) {
        const unlocked = state.areas[area.id];
        const tileSize = TILE_MAP.tileSize;
        ctx.save();
        ctx.fillStyle = unlocked ? "rgb(24 48 56 / 18%)" : "rgb(7 12 16 / 56%)";
        ctx.fillRect(area.x, area.y, area.width, area.height);
        ctx.strokeStyle = unlocked ? area.color : "#80525b";
        ctx.lineWidth = 3;
        ctx.strokeRect(area.x + 2, area.y + 2, area.width - 4, area.height - 4);

        if (unlocked) {
            ctx.fillStyle = `${area.color}24`;
            ctx.fillRect(area.x + 7, area.y + 7, area.width - 14, 3);
        } else {
            ctx.fillStyle = "rgb(207 103 121 / 16%)";
            const startColumn = Math.floor(area.x / tileSize);
            const endColumn = Math.ceil((area.x + area.width) / tileSize);
            const startRow = Math.floor(area.y / tileSize);
            const endRow = Math.ceil((area.y + area.height) / tileSize);
            for (let row = startRow; row < endRow; row++) {
                for (let column = startColumn; column < endColumn; column++) {
                    if ((row + column) % 2 === 0) continue;
                    const x = Math.max(area.x + 4, column * tileSize + 14);
                    const y = Math.max(area.y + 4, row * tileSize + 14);
                    if (x + 12 < area.x + area.width && y + 12 < area.y + area.height) {
                        ctx.fillRect(x, y, 12, 12);
                    }
                }
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
    ctx.save();
    ctx.fillStyle = "#161616";
    ctx.fillRect(CORE.x - 19, CORE.y - 19, 38, 38);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.strokeRect(CORE.x - 19, CORE.y - 19, 38, 38);
    if (state.core.shield > 0) {
        ctx.strokeStyle = "#70bfff";
        ctx.globalAlpha = .8;
        ctx.lineWidth = 2;
        ctx.strokeRect(CORE.x - 24, CORE.y - 24, 48, 48);
    }
    const hitAge = performance.now() - coreHitStarted;
    if (hitAge < 350) {
        ctx.strokeStyle = "#ff4e58"; ctx.globalAlpha = 1 - hitAge / 350; ctx.lineWidth = 9;
        const size = 48 + hitAge / 8;
        ctx.strokeRect(CORE.x - size / 2, CORE.y - size / 2, size, size);
    }
    ctx.restore();
    ctx.fillStyle = "white"; ctx.font = "900 8px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText("CORE", CORE.x, CORE.y + 3);
}

function drawShops() {
    drawStation(ARMORY, "ARMORY", "#e8b84d");
    drawStation(MED, "MED BAY", "#ed6680");
    drawStation(WOODCUTTER, "WOODCUTTER", "#b58a55");
    drawStation(QUARRY, "QUARRY", "#7f8a92");
    drawStation(WORKBENCH, "WORKBENCH", "#6ab9d5");
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
    if (defense.type === "block") {
        ctx.fillStyle = "#64777f"; ctx.fillRect(slot.x - 18, slot.y - 18, 36, 36);
        ctx.fillStyle = "#81949b"; ctx.fillRect(slot.x - 14, slot.y - 14, 28, 7);
        ctx.fillStyle = "#4d6068"; ctx.fillRect(slot.x - 14, slot.y - 3, 10, 13);
        ctx.strokeStyle = "#a9bac0"; ctx.lineWidth = 2; ctx.strokeRect(slot.x - 18, slot.y - 18, 36, 36);
    } else if (defense.type === "turret") {
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
        const isLocal = player.id === myPlayerId && predictedLocal;
        const p = isLocal ? predictedLocal : smoothEntity("player", player);
        const rescuers = state.players.filter(worker => worker.action === player.id);
        if (rescuers.length) drawReviveEffect(p.x, p.y, Math.max(...rescuers.map(worker => worker.actionProgress / 4)));
        ctx.save();
        if (player.down) { ctx.translate(p.x, p.y + 8); ctx.scale(1.35, .65); }
        else ctx.translate(p.x, p.y);
        ctx.fillStyle = colors[Number(player.id.at(-1)) - 1] || "#ddd";
        const playerSize = player.id === myPlayerId ? 44 : 38;
        ctx.fillRect(-playerSize / 2, -playerSize / 2, playerSize, playerSize);
        if (player.id === myPlayerId) { ctx.strokeStyle = "white"; ctx.lineWidth = 3; ctx.strokeRect(-playerSize / 2, -playerSize / 2, playerSize, playerSize); }
        ctx.restore();
        if (player.id === myPlayerId) drawLocalWeaponCooldown(p.x, p.y, player);
        ctx.textAlign = "center"; ctx.fillStyle = "white"; ctx.font = "800 11px system-ui";
        ctx.fillText(player.down ? `${player.name} — DOWN` : player.name, p.x, p.y - 31);
        drawBar(p.x - 24, p.y + 28, 48, 4, player.hp / 100, player.down ? "#d94b4b" : "#54d286");
        if (player.action) drawBar(p.x - 30, p.y + 37, 60, 5, player.actionProgress / 4, "#f0c052");
    }
    ctx.textAlign = "left";
}

function drawInteractionPrompt() {
    const interaction = findNearestInteraction();
    if (!interaction || !actionMenu.classList.contains("hidden")) return;
    const x = interaction.target.x;
    const y = interaction.target.y - 48;
    ctx.save();
    ctx.fillStyle = "white";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#111";
    ctx.font = "900 15px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("R", x, y + 1);
    ctx.font = "800 9px ui-monospace, monospace";
    ctx.fillText(interaction.label, x, y - 25);
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
    ctx.save(); ctx.strokeStyle = "#69ed9b"; ctx.lineWidth = 4; ctx.shadowColor = "#69ed9b"; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(x, y, 34 + pulse * 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); ctx.stroke(); ctx.restore();
    ctx.fillStyle = "#83f1aa"; ctx.font = "900 10px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(`REVIVING ${Math.round(progress * 100)}%`, x, y - 48);
}

function drawHitEffects() {
    const now = performance.now();
    hitEffects = hitEffects.filter(effect => now - effect.started
        < (effect.effect === "core-pulse" ? 900 : effect.weapon === "mine" ? 650 : 420));
    for (const effect of hitEffects) {
        if (effect.effect === "core-pulse") {
            const progress = (now - effect.started) / 900;
            ctx.save();
            ctx.globalAlpha = 1 - progress;
            ctx.strokeStyle = "#c877ff";
            ctx.shadowColor = "#c877ff";
            ctx.shadowBlur = 22;
            ctx.lineWidth = 12 * (1 - progress) + 2;
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, 65 + progress * 210, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            continue;
        }
        const duration = effect.weapon === "mine" ? 650 : 420;
        const progress = (now - effect.started) / duration;
        const alpha = 1 - progress;
        const color = effect.weapon === "mine" ? "#ff694f" : effect.weapon === "turret" ? "#65dfff" : effect.weapon === "bat" ? "#ff9f43" : "#ffe082";
        ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color;
        if (!["bat", "mine"].includes(effect.weapon) && progress < .55) {
            ctx.lineWidth = 4 * (1 - progress); ctx.beginPath(); ctx.moveTo(effect.fromX, effect.fromY); ctx.lineTo(effect.x, effect.y); ctx.stroke();
        }
        const radius = effect.weapon === "mine" ? 24 + progress * 100 : 8 + progress * (effect.defeated ? 42 : 25);
        if (effect.damage > 0 || effect.weapon === "mine") {
            ctx.lineWidth = effect.defeated ? 5 : 3; ctx.beginPath(); ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2); ctx.stroke();
            for (let i = 0; i < 6; i++) {
                const angle = i * Math.PI / 3, inner = radius * .5, outer = radius * .9 + 12;
                ctx.beginPath(); ctx.moveTo(effect.x + Math.cos(angle) * inner, effect.y + Math.sin(angle) * inner); ctx.lineTo(effect.x + Math.cos(angle) * outer, effect.y + Math.sin(angle) * outer); ctx.stroke();
            }
        }
        if (effect.damage > 0) {
            ctx.fillStyle = "white"; ctx.font = "900 15px ui-monospace, monospace"; ctx.textAlign = "center";
            ctx.fillText(`-${Math.round(effect.damage)}`, effect.x, effect.y - 28 - progress * 25);
        }
        ctx.restore();
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

async function initialize() {
    menuStatus.textContent = "マップデータを読み込んでいます…";
    try {
        await loadMap();
    } catch (error) {
        console.warn("HTTPからマップを読み込めないため、ゲームサーバーから取得します。", error);
        menuStatus.textContent = "ゲームサーバーからマップデータを取得します…";
    }
    connect();
    await mapReadyPromise;
    animate();
}

initialize();
