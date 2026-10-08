"use strict";

// The game client owns the connection; this menu renders authoritative snapshots.
if (new URLSearchParams(location.search).get("legacy") === "1") {
    document.body.classList.remove("menu-preview");
    document.querySelector("#menu-ui").remove();
} else mountMenu();
const gameScript = document.createElement("script");
gameScript.src = "app.js";
document.body.append(gameScript);

function mountMenu() {
    const root = document.querySelector("#menu-ui");
    const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    let name = "", view = "guest", renderedView;
    let snapshot, selfId, busy = false, connected = false, lastLobby = "", quickRequested = false;
    let matchResult = "", jobOpen = false;
    let inGameSettings = false, settingsReturn = null;
    try { name = localStorage.getItem("core-defense-guest-name")?.trim() || ""; } catch { /* Optional storage. */ }
    if (name) view = "home";
    const back = to => `<button type="button" class="ui-back" data-action="${to}">戻る</button>`;
    const button = (action, label) => `<button type="button" data-action="${action}">${label}</button>`;
    const disabled = () => busy || !connected ? "disabled" : "";
    function render(focus = false) {
        // Keep live inputs (including focus, selection and IME composition) during reconnects.
        if (renderedView === view && ["guest", "settings", "create", "search"].includes(view)) {
            updateMatchButtons();
            updateMatchResult();
            if (focus) root.querySelector("input")?.focus();
            return;
        }
        let content = "";
        if (view === "guest" || view === "settings") content = `${view === "guest" ? "<h2>プレイヤー設定</h2>" : ""}<form data-form="name" novalidate><input name="name" maxlength="16" placeholder="ゲストプレイヤー名" aria-label="ゲストプレイヤー名" autocomplete="nickname" value="${escape(name)}"><button>決定</button></form>`;
        if (view === "settings") {
            const pointer = window.corePointerSettings.get();
            content = content.replace("<button>決定</button></form>", `<fieldset class="ui-pointer-settings"><legend>音量</legend><label>SE<input type="range" name="volume" aria-label="SE音量" min="0" max="100" step="1" value="${Math.round(window.coreAudio.getVolume() * 100)}"><output id="volume-value">${Math.round(window.coreAudio.getVolume() * 100)}%</output></label></fieldset><fieldset class="ui-pointer-settings"><legend>ポインター</legend><label>形<select name="pointer-shape">${[["dot", "●"], ["cross", "×"], ["plus", "+"]].map(([value, label]) => `<option value="${value}" ${pointer.shape === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label>色<input type="color" name="pointer-color" value="${pointer.color}"></label><label>大きさ<input type="range" name="pointer-size" min="4" max="32" step="1" value="${pointer.size}"><output id="pointer-size-value">${pointer.size}px</output></label><div class="ui-pointer-preview" aria-label="ポインターのプレビュー"><span></span></div></fieldset><fieldset class="ui-pointer-settings"><legend>キー割り当て</legend><label>回復キット<input name="medkit-key" aria-label="回復キットのキー" readonly value="${escape(window.coreKeySettings.getMedkit().toUpperCase())}"></label><small id="medkit-key-status" role="status"></small></fieldset><button type="submit" class="ui-back">決定</button></form>`);
        }
        if (view === "settings" && inGameSettings) content = content.replace(/<input name="name"[^>]*>/, "").replace('data-form="name"', 'data-form="game-settings"');
        if (view === "home") content = `<h1>CORE DEFENSE</h1><nav aria-label="メインメニュー">${button("quick", "クイックマッチ")}${button("phrase", "合言葉")}${back("settings").replace("戻る", "設定")}</nav>`;
        if (view === "phrase") content = `<nav aria-label="合言葉">${button("create", "ルーム作成")}${button("search", "ルーム検索")}</nav>${back("home")}`;
        if (view === "quick-error") content = `<p class="ui-connection-error" role="alert">接続できません</p>${back("home")}`;
        if (view === "create" || view === "search") content = `<p class="ui-match-result" role="status"></p><form data-form="${view}" novalidate><input name="password" maxlength="32" placeholder="合言葉" aria-label="合言葉" autocomplete="off"><button ${disabled()}>${view === "create" ? "作成" : "決定"}</button></form>${back("phrase")}`;
        if (view === "lobby" && snapshot) {
            const owner = snapshot.roomOwnerId === selfId;
            const me = snapshot.players.find(p => p.id === selfId);
            content = '<ol class="ui-members" aria-label="参加者">' + snapshot.players.filter(p => p.human).map(p => {
                const host = p.id === snapshot.roomOwnerId;
                return `<li class="room-member ${host || p.ready ? "ready" : ""}"><strong>${escape(p.name)}</strong><span>${host ? "host" : p.ready ? "準備完了" : "準備中"}</span></li>`;
            }).join("") + '</ol>';
            content += owner ? `<button data-action="start" ${!snapshot.allReady || !connected ? "disabled" : ""}>${snapshot.phase === "lobby" ? "開始" : "もう一度プレイ"}</button>` : `<button data-action="ready" ${disabled()}>${me?.ready ? "準備を取り消す" : "準備OK"}</button>`;
            content += `<button type="button" data-action="toggle-job" aria-expanded="${jobOpen}" aria-controls="job-panel" ${disabled()}>ジョブ:${window.coreJobs?.[me?.job]?.name || "ヒーラー"}</button>`;
            content += button("leave", "戻る");
            content += `<aside id="job-panel" class="job-panel" aria-label="ジョブ選択" ${jobOpen ? "" : "hidden"}>${window.JobUI.render(me?.job, busy || !connected)}</aside>`;
        }
        const jobScroll = root.querySelector(".job-list")?.scrollTop || 0;
        const focusedJob = document.activeElement?.dataset?.job;
        root.innerHTML = `<div class="ui-shell${view === "settings" ? " ui-settings" : ""}"><section class="ui-content">${content}</section></div>`;
        const jobList = root.querySelector(".job-list");
        if (jobList) jobList.scrollTop = jobScroll;
        if (focusedJob && window.coreJobs?.[focusedJob]) root.querySelector(`[data-job="${focusedJob}"]`)?.focus();
        renderedView = view;
        updateMatchButtons();
        updateMatchResult();
        if (focus) (root.querySelector("input") || root.querySelector("button"))?.focus();
    }
    function go(next) { jobOpen = false; view = next; quickRequested = false; matchResult = ""; render(next !== "settings"); }
    function updateMatchResult() {
        const result = root.querySelector('.ui-match-result');
        if (!result) return;
        result.textContent = matchResult;
    }
    function updateMatchButtons() {
        root.querySelectorAll('[data-action="quick"]').forEach(b => b.disabled = busy);
        root.querySelectorAll('form').forEach(form => {
            if (form.dataset.form === "game-settings") { form.querySelector("button").disabled = false; return; }
            const empty = !form.querySelector('input').value.trim();
            form.querySelector('button').disabled = empty
                || (form.dataset.form !== "name" && (busy || !connected));
        });
    }
    function status(text) {
        busy = false;
        if (quickRequested && text) { view = "quick-error"; render(); return; }
        if (["create", "search"].includes(view) && text) {
            matchResult = view === "search" && text.includes("参加できるルームが見つかりません") ? "見つかりませんでした" : text;
            updateMatchResult();
        }
        updateMatchButtons();
    }
    function match(action, phrase = "") {
        if (busy) return;
        quickRequested = action === "quick";
        window.coreMenu.phrase = phrase;
        if (action === "join" || action === "create") {
            matchResult = action === "create" ? "作成中…" : "検索中…";
            updateMatchResult();
        }
        window.coreGame.match(action, phrase, name);
        busy = true;
        updateMatchButtons();
    }
    window.coreMenu = {
        phrase: "",
        settingsOpen() { return inGameSettings; },
        openSettings(onClose) {
            if (!snapshot || !["preparing", "wave"].includes(snapshot.phase)) return;
            inGameSettings = true; settingsReturn = onClose; renderedView = null;
            root.hidden = false; document.body.classList.remove("menu-preview"); go("settings");
            root.querySelector('[name="volume"]')?.focus();
        },
        exited() { inGameSettings = false; settingsReturn = null; window.coreMenu.phrase = ""; snapshot = null; lastLobby = ""; quickRequested = false; root.hidden = false; document.body.classList.add("menu-preview"); go("home"); },
        status,
        rejected() { connected = false; busy = false; snapshot = null; lastLobby = ""; view = quickRequested ? "quick-error" : window.coreMenu.phrase ? (view === "create" ? "create" : "search") : "home"; render(); },
        connected() { connected = true; status(); },
        disconnected() {
            if (inGameSettings) { inGameSettings = false; settingsReturn = null; renderedView = null; view = "home"; }
            if (["create", "search"].includes(view)) matchResult = "接続できません";
            connected = false; busy = false; lastLobby = ""; jobOpen = false;
            if (quickRequested) view = "quick-error";
            root.hidden = false; document.body.classList.add("menu-preview");
            render();
        },
        snapshot(next, id, keepArea = false) {
            quickRequested = false;
            snapshot = next; selfId = id; connected = true; busy = false;
            const playing = ["preparing", "wave"].includes(next.phase) || keepArea;
            if (!playing) { inGameSettings = false; settingsReturn = null; }
            root.hidden = playing && !inGameSettings;
            document.body.classList.toggle("menu-preview", !playing);
            if (playing) { jobOpen = false; lastLobby = ""; return; }
            const signature = JSON.stringify([id, next.roomId, next.privateRoom, next.phase, next.roomOwnerId, next.allReady,
                next.players.map(p => [p.id, p.name, p.human, p.ready, p.job])]);
            if (signature === lastLobby && view === "lobby") return;
            lastLobby = signature; view = "lobby";
            render();
        }
    };
    function closeGameSettings() {
        const onClose = settingsReturn;
        inGameSettings = false; settingsReturn = null; renderedView = null; view = "lobby";
        root.hidden = true;
        onClose?.();
    }
    root.addEventListener("change", event => {
        if (view === "settings" && event.target.name === "volume") window.coreAudio.play("pistol");
    });
    root.addEventListener("keydown", event => {
        if (inGameSettings) {
            event.stopPropagation();
            if (event.key === "Escape") { event.preventDefault(); closeGameSettings(); return; }
        }
        if (event.key === "Escape" && jobOpen) {
            setJobOpen(false);
            root.querySelector('[data-action="toggle-job"]')?.focus();
            return;
        }
        if (view !== "settings" || event.target.name !== "medkit-key") return;
        if (event.key === "Tab") return;
        event.preventDefault();
        if (event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
        const saved = window.coreKeySettings.setMedkit(event.key);
        event.target.value = window.coreKeySettings.getMedkit().toUpperCase();
        root.querySelector("#medkit-key-status").textContent = saved ? "保存しました" : "このキーは使用できません";
    });
    root.addEventListener("input", event => {
        if (view === "settings" && event.target.name === "volume") {
            window.coreAudio.setVolume(Number(event.target.value) / 100);
            root.querySelector("#volume-value").textContent = `${Math.round(window.coreAudio.getVolume() * 100)}%`;
        }
        if (view === "settings" && event.target.name === "pointer-shape") {
            window.corePointerSettings.update({ shape: event.target.value });
        }
        if (view === "settings" && event.target.name === "pointer-color") {
            window.corePointerSettings.update({ color: event.target.value });
        }
        if (view === "settings" && event.target.name === "pointer-size") {
            window.corePointerSettings.update({ size: Number(event.target.value) });
            root.querySelector("#pointer-size-value").textContent = `${window.corePointerSettings.get().size}px`;
        }
        if (["create", "search"].includes(view) && !busy) { matchResult = ""; updateMatchResult(); }
        updateMatchButtons();
    });
    root.addEventListener("submit", event => {
        event.preventDefault();
        const form = event.target, data = new FormData(form);
        try {
            if (form.dataset.form === "game-settings") { closeGameSettings(); return; }
            if (form.dataset.form === "name") {
                const value = String(data.get("name") || "").trim().slice(0, 16);
                if (!value) return;
                name = value;
                try { localStorage.setItem("core-defense-guest-name", name); } catch { /* Optional storage. */ }
                go("home"); return;
            }
            if (busy) return;
            const action = form.dataset.form;
            const phrase = String(data.get("password") || "").trim();
            if (!phrase) return;
            match(action === "search" ? "join" : action, phrase);
        } catch (error) { status(error.message); }
    });
    function setJobOpen(open) {
        jobOpen = open;
        const panel = root.querySelector("#job-panel");
        if (panel) panel.hidden = !open;
        root.querySelector('[data-action="toggle-job"]')?.setAttribute("aria-expanded", String(open));
    }
    root.addEventListener("click", event => {
        const target = event.target.closest("button[data-action]");
        if (!event.target.closest(".job-panel") && target?.dataset.action !== "toggle-job") setJobOpen(false);
        if (!target || target.disabled || busy) return;
        if (target.dataset.action === "toggle-job") { setJobOpen(!jobOpen); return; }
        const action = target.dataset.action;
        if (["home", "phrase", "create", "search", "settings"].includes(action)) go(action);
        if (action === "quick") {
            try { match("quick"); } catch (error) { status(error.message); }
        }
        if (action === "job") window.coreGame.send(`JOB:${target.dataset.job}`);
        if (action === "start") window.coreGame.send("START");
        if (action === "ready") window.coreGame.send(`ROOM_READY:${snapshot.players.find(p => p.id === selfId)?.ready ? 0 : 1}`);
        if (action === "leave") {
            snapshot = null; lastLobby = ""; connected = false;
            window.coreMenu.phrase = ""; window.coreGame.leave(); go("home");
        }
    });
    render();
}
