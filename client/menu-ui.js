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
    const keyToast = document.querySelector("#settings-toast");
    let keyToastTimer;
    function hideKeyToast() {
        clearTimeout(keyToastTimer);
        keyToast.hidden = true;
        keyToast.textContent = "";
    }
    function showKeyToast(message) {
        clearTimeout(keyToastTimer);
        keyToast.hidden = false;
        keyToast.textContent = message;
        keyToastTimer = setTimeout(hideKeyToast, 2000);
    }
    const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    let name = "", view = "guest", renderedView;
    let snapshot, selfId, busy = false, connected = false, lastLobby = "", quickRequested = false;
    let matchResult = "", jobOpen = false;
    let inGameSettings = false, lobbySettings = false, settingsReturn = null;
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
            const reticle = window.coreReticleSettings.get();
            const shadows = window.coreGraphicsSettings?.getShadows() ?? true;
            const maxFps = window.coreGraphicsSettings?.getMaxFps() ?? 60;
            content = content.replace("<button>決定</button>", `<fieldset class="ui-settings-group"><legend>描画</legend><label>最大FPS<select name="max-fps"><option value="60" ${maxFps === 60 ? "selected" : ""}>60 FPS</option><option value="30" ${maxFps === 30 ? "selected" : ""}>30 FPS</option></select></label><label>影<select name="shadows"><option value="on" ${shadows ? "selected" : ""}>オン</option><option value="off" ${!shadows ? "selected" : ""}>オフ</option></select></label></fieldset><button>決定</button>`);
            content = content.replace("<button>決定</button></form>", `<fieldset class="ui-settings-group"><legend>音量</legend><label>SE<input type="range" name="volume" aria-label="SE音量" min="0" max="100" step="1" value="${Math.round(window.coreAudio.getVolume() * 100)}"><output id="volume-value">${Math.round(window.coreAudio.getVolume() * 100)}%</output></label></fieldset><fieldset class="ui-settings-group"><legend>マウス</legend><label>感度<input type="range" name="mouse-sensitivity" aria-label="マウス感度" min="20" max="300" step="5" value="${Math.round((window.coreMouseSettings?.get() ?? 1)*100)}"><output id="mouse-sensitivity-value">${Math.round((window.coreMouseSettings?.get() ?? 1)*100)}%</output></label></fieldset><fieldset class="ui-settings-group"><legend>画面酔い対策</legend><label>白い枠<select name="comfort-frame"><option value="off" ${!window.coreComfortFrame?.get() ? "selected" : ""}>オフ</option><option value="on" ${window.coreComfortFrame?.get() ? "selected" : ""}>オン</option></select></label></fieldset><fieldset class="ui-settings-group"><legend>レティクル</legend><label>形<select name="reticle-shape">${[["cross", "×"], ["plus", "+"]].map(([value, label]) => `<option value="${value}" ${reticle.shape === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label>色<input type="color" name="reticle-color" value="${reticle.color}"></label><label>大きさ<input type="range" name="reticle-size" min="4" max="32" step="1" value="${reticle.size}"><output id="reticle-size-value">${reticle.size}px</output></label><div class="ui-reticle-previews" aria-label="レティクルのプレビュー"><div class="ui-reticle-preview"><span></span></div></div></fieldset><fieldset class="ui-settings-group"><legend>キー割り当て</legend><label>回復キット<input name="medkit-key" aria-label="回復キットのキー" readonly value="${escape(window.coreKeySettings.getMedkit().toUpperCase())}"></label><label>ジョブ効果<input name="job-effect-key" aria-label="ジョブ効果のキー" readonly value="${escape(window.coreKeySettings.getJobEffect().toUpperCase())}"></label><label>伏せ固定<input name="sniper-stance-key" aria-label="伏せ固定のキー" readonly value="${escape(window.coreKeySettings.getSniperStance().toUpperCase())}"></label><label>ドローン自爆<input name="drone-self-destruct-key" aria-label="ドローン自爆のキー" readonly value="${escape(window.coreKeySettings.getDroneSelfDestruct().toUpperCase())}"></label></fieldset><button type="submit" class="ui-back">決定</button></form>`);
        }
        if (view === "settings" && (inGameSettings || lobbySettings)) content = content.replace(/<input name="name"[^>]*>/, "").replace('data-form="name"', 'data-form="game-settings"');
        if (view === "home") content = `<h1>CORE DEFENSE</h1><nav aria-label="メインメニュー">${window.coreReconnect?.saved() ? button("resume", "前のゲームに戻る") : ""}${button("quick", "クイックマッチ")}${button("phrase", "合言葉")}${back("settings").replace("戻る", "設定")}</nav><p class="ui-match-result" role="status"></p>`;
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
            if (["won", "lost"].includes(snapshot.phase)) content += `<p class="ui-defense-result${snapshot.phase === "lost" ? " failed" : ""}" role="status">${snapshot.phase === "won" ? "防衛成功" : "防衛失敗"}<small>TIME ${formatMatchTime(snapshot.elapsedSeconds)}</small></p>`;
            content += owner ? `<button data-action="start" ${!snapshot.allReady || !connected ? "disabled" : ""}>${snapshot.phase === "lobby" ? "開始" : "もう一度プレイ"}</button>` : `<button data-action="ready" ${disabled()}>${me?.ready ? "準備を取り消す" : "準備OK"}</button>`;
            content += `<button type="button" data-action="toggle-job" aria-expanded="${jobOpen}" aria-controls="job-panel" ${disabled()}>ジョブ:${window.coreJobs?.[me?.job]?.name || "Healer"}</button>`;
            content += button("lobby-settings", "設定");
            content += button("leave", "戻る");
            content += `<aside id="job-panel" class="job-panel" aria-label="ジョブ選択" ${jobOpen ? "" : "hidden"}>${window.JobUI.render(me?.job, busy || !connected)}</aside>`;
        }
        const jobScroll = root.querySelector(".job-list")?.scrollTop || 0;
        const focusedJob = document.activeElement?.dataset?.job;
        if (view === "guest" || view === "home") content += `<aside class="ui-release" aria-label="開発版について"><p><strong>PRE-RELEASE</strong><span>開発版・正式リリース前</span></p><details><summary>このバージョンについて</summary><p>内容やバランスは変更される場合があります。不具合が発生することがあります。</p><p>プレイヤー名・設定・復帰情報はこのブラウザに保存されます。進行状況はサーバー再起動で失われます。</p><p>不具合の報告には、発生した操作・ラウンド・端末とブラウザ・デバッグモードの有無を添えてください。合言葉やアクセスキーは含めないでください。</p></details></aside>`;
        root.innerHTML = `<div class="ui-shell${view === "settings" ? " ui-settings" : ""}"><section class="ui-content">${content}</section></div>`;
        const jobList = root.querySelector(".job-list");
        if (jobList) jobList.scrollTop = jobScroll;
        if (focusedJob && window.coreJobs?.[focusedJob]) root.querySelector(`[data-job="${focusedJob}"]`)?.focus();
        renderedView = view;
        updateMatchButtons();
        updateMatchResult();
        if (focus) (root.querySelector("input") || root.querySelector("button"))?.focus();
    }
    function go(next) { hideKeyToast(); jobOpen = false; view = next; quickRequested = false; matchResult = ""; render(next !== "settings"); }
    function updateMatchResult() {
        const result = root.querySelector('.ui-match-result');
        if (!result) return;
        result.textContent = matchResult;
    }
    function updateMatchButtons() {
        root.querySelectorAll('[data-action="quick"]').forEach(b => b.disabled = busy);
        root.querySelectorAll('[data-action="resume"]').forEach(b => b.disabled = busy || !connected);
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
        if (["home", "create", "search"].includes(view) && text) {
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
        refreshResume() { if (view === "home") render(); },
        settingsOpen() { return inGameSettings; },
        closeSettings() { if (inGameSettings || lobbySettings) closeGameSettings(); },
        openSettings(onClose) {
            if (!snapshot || !["preparing", "wave"].includes(snapshot.phase)) return;
            inGameSettings = true; settingsReturn = onClose; renderedView = null;
            root.hidden = false; document.body.classList.remove("menu-preview"); go("settings");
            root.querySelector('[name="volume"]')?.focus();
        },
        exited() { inGameSettings = false; lobbySettings = false; settingsReturn = null; window.coreMenu.phrase = ""; snapshot = null; lastLobby = ""; quickRequested = false; root.hidden = false; document.body.classList.add("menu-preview"); go("home"); },
        status,
        rejected() { lobbySettings = false; connected = false; busy = false; snapshot = null; lastLobby = ""; view = quickRequested ? "quick-error" : window.coreMenu.phrase ? (view === "create" ? "create" : "search") : "home"; render(); },
        connected() { connected = true; status(); },
        disconnected() {
            if (inGameSettings || lobbySettings) { inGameSettings = false; lobbySettings = false; settingsReturn = null; renderedView = null; view = "home"; }
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
            if (playing && lobbySettings) { lobbySettings = false; renderedView = null; view = "lobby"; }
            if (!playing) { inGameSettings = false; settingsReturn = null; }
            root.hidden = playing && !inGameSettings;
            document.body.classList.toggle("menu-preview", !playing);
            if (playing) { jobOpen = false; lastLobby = ""; return; }
            if (lobbySettings) return;
            const signature = JSON.stringify([id, next.roomId, next.privateRoom, next.phase, next.roomOwnerId, next.allReady, next.backupAvailable, next.backupRound, next.backupOwnerId,
                next.players.map(p => [p.id, p.name, p.human, p.ready, p.job])]);
            if (signature === lastLobby && view === "lobby") return;
            lastLobby = signature; view = "lobby";
            render();
        }
    };
    function closeGameSettings() {
        hideKeyToast();
        const returnToLobby = lobbySettings;
        const onClose = settingsReturn;
        inGameSettings = false; lobbySettings = false; settingsReturn = null; renderedView = null; view = "lobby";
        root.hidden = !returnToLobby;
        if (returnToLobby) render(true);
        onClose?.();
    }
    let volumePreview=0;
    root.addEventListener("change", async event => {
        if (view === "settings" && event.target.name === "max-fps") {
            window.coreGraphicsSettings.setMaxFps(event.target.value);
            return;
        }
        if (view === "settings" && event.target.name === "shadows") {
            window.coreGraphicsSettings.setShadows(event.target.value === "on");
            return;
        }
        if (view === "settings" && event.target.name === "comfort-frame") {
            window.coreComfortFrame.set(event.target.value === "on");
            return;
        }
        if (view !== "settings" || event.target.name !== "volume") return;
        const request=++volumePreview;
        await window.coreAudio.preloadSamples?.();
        if(request===volumePreview && view==="settings" && !root.hidden && event.target.isConnected!==false)
            window.coreAudio.play("pistol");
    });
    root.addEventListener("keydown", event => {
        const key = window.coreKeySettings.gameKey(event);
        const typing = event.target.isContentEditable || event.target.tagName === "TEXTAREA"
            || event.target.tagName === "INPUT" && !event.target.readOnly
                && !["range", "color", "button", "checkbox", "radio", "submit"].includes(event.target.type);
        const closeKey = key === "escape" || key === "e" && !typing && !event.ctrlKey && !event.altKey && !event.metaKey;
        if (inGameSettings || lobbySettings) {
            event.stopPropagation();
            if (closeKey) { event.preventDefault(); if (!event.repeat) closeGameSettings(); return; }
        }
        if (closeKey && jobOpen) {
            event.preventDefault(); event.stopPropagation();
            if (!event.repeat) setJobOpen(false);
            root.querySelector('[data-action="toggle-job"]')?.focus();
            return;
        }
        if (closeKey && ["settings", "create", "search"].includes(view)) {
            event.preventDefault(); event.stopPropagation();
            if (!event.repeat) go("home");
            return;
        }
        if (view !== "settings" || !["medkit-key", "job-effect-key", "drone-self-destruct-key", "sniper-stance-key"].includes(event.target.name)) return;
        if (event.key === "Tab") return;
        event.preventDefault();
        if (event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
        const settings = window.coreKeySettings;
        const job = event.target.name === "job-effect-key";
        const drone = event.target.name === "drone-self-destruct-key";
        const sniper=event.target.name==='sniper-stance-key';
        const saved = sniper ? settings.setSniperStance(key) : drone ? settings.setDroneSelfDestruct(key) : job ? settings.setJobEffect(key) : settings.setMedkit(key);
        event.target.value = (sniper ? settings.getSniperStance() : drone ? settings.getDroneSelfDestruct() : job ? settings.getJobEffect() : settings.getMedkit()).toUpperCase();
        showKeyToast(saved ? "保存しました" : "このキーは使用できません");
    });
    root.addEventListener("input", event => {
        if(view === "settings" && event.target.name === "mouse-sensitivity") {
            const value=window.coreMouseSettings.set(Number(event.target.value)/100);
            root.querySelector("#mouse-sensitivity-value").textContent=`${Math.round(value*100)}%`;
        }
        if (view === "settings" && event.target.name === "volume") {
            window.coreAudio.setVolume(Number(event.target.value) / 100);
            root.querySelector("#volume-value").textContent = `${Math.round(window.coreAudio.getVolume() * 100)}%`;
        }
        if (view === "settings" && event.target.name === "reticle-shape") {
            window.coreReticleSettings.update({ shape: event.target.value });
        }
        if (view === "settings" && event.target.name === "reticle-color") {
            window.coreReticleSettings.update({ color: event.target.value });
        }
        if (view === "settings" && event.target.name === "reticle-size") {
            window.coreReticleSettings.update({ size: Number(event.target.value) });
            root.querySelector("#reticle-size-value").textContent = `${window.coreReticleSettings.get().size}px`;
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
        if (action === "lobby-settings" && view === "lobby" && snapshot) {
            lobbySettings = true; renderedView = null; go("settings");
            root.querySelector('[name="volume"]')?.focus();
            return;
        }
        if (["home", "phrase", "create", "search", "settings"].includes(action)) go(action);
        if (action === "quick") {
            try { match("quick"); } catch (error) { status(error.message); }
        }
        if (action === "resume") {
            busy = true; matchResult = ""; updateMatchButtons(); updateMatchResult();
            try { window.coreGame.resume(); } catch (error) { status(error.message); }
        }
        if (action === "job") window.coreGame.changeJob(target.dataset.job);
        if (action === "start") window.coreGame.send("START");
        if (action === "ready") window.coreGame.send(`ROOM_READY:${snapshot.players.find(p => p.id === selfId)?.ready ? 0 : 1}`);
        if (action === "leave") {
            snapshot = null; lastLobby = ""; connected = false;
            window.coreMenu.phrase = ""; window.coreGame.leave(); go("home");
        }
    });
    render();
}
