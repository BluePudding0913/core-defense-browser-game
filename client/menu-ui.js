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
    try { name = localStorage.getItem("core-defense-guest-name")?.trim() || ""; } catch { /* Optional storage. */ }
    if (name) view = "home";
    const back = to => `<button type="button" class="ui-back" data-action="${to}">戻る</button>`;
    const button = (action, label) => `<button type="button" data-action="${action}">${label}</button>`;
    const disabled = () => busy || !connected ? "disabled" : "";
    function render(focus = false) {
        // Keep live inputs (including focus, selection and IME composition) during reconnects.
        if (renderedView === view && ["guest", "settings", "create", "search"].includes(view)) {
            updateMatchButtons();
            if (focus) root.querySelector("input")?.focus();
            return;
        }
        let content = "";
        if (view === "guest" || view === "settings") content = `<h2>プレイヤー設定</h2><form data-form="name" novalidate><input name="name" maxlength="16" placeholder="ゲストプレイヤー名" aria-label="ゲストプレイヤー名" autocomplete="nickname" value="${escape(name)}"><button>決定</button></form>${view === "settings" ? back("home") : ""}`;
        if (view === "home") content = `<h1>CORE DEFENSE</h1><nav aria-label="メインメニュー">${button("quick", "クイックマッチ")}${button("phrase", "合言葉")}${back("settings").replace("戻る", "設定")}</nav>`;
        if (view === "phrase") content = `<h2>合言葉</h2><nav>${button("create", "ルーム作成")}${button("search", "ルーム検索")}</nav>${back("home")}`;
        if (view === "quick-error") content = `<h2>クイックマッチ</h2><p class="ui-connection-error" role="alert">接続できません</p>${button("quick", "再試行")}${back("home")}`;
        if (view === "create" || view === "search") content = `<h2>${view === "create" ? "ルーム作成" : "ルーム検索"}</h2><form data-form="${view}" novalidate><input name="password" maxlength="32" placeholder="合言葉" aria-label="合言葉" autocomplete="off"><button ${disabled()}>${view === "create" ? "作成" : "決定"}</button></form>${back("phrase")}`;
        if (view === "lobby" && snapshot) {
            const owner = snapshot.roomOwnerId === selfId;
            const me = snapshot.players.find(p => p.id === selfId);
            content = '<ol class="ui-members" aria-label="参加者">' + snapshot.players.filter(p => p.human).map(p => {
                const host = p.id === snapshot.roomOwnerId;
                return `<li class="room-member ${host || p.ready ? "ready" : ""}"><strong>${escape(p.name)}</strong><span>${host ? "host" : p.ready ? "準備完了" : "準備中"}</span></li>`;
            }).join("") + '</ol>';
            content += owner ? `<button data-action="start" ${!snapshot.allReady || !connected ? "disabled" : ""}>${snapshot.phase === "lobby" ? "開始" : "もう一度プレイ"}</button>` : `<button data-action="ready" ${disabled()}>${me?.ready ? "準備を取り消す" : "準備OK"}</button>`;
            content += button("leave", "退出");
        }
        root.innerHTML = `<div class="ui-shell"><section class="ui-content">${content}</section></div>`;
        renderedView = view;
        updateMatchButtons();
        if (focus) (root.querySelector("input") || root.querySelector("button"))?.focus();
    }
    function go(next) { view = next; quickRequested = false; render(true); }
    function updateMatchButtons() {
        root.querySelectorAll('[data-action="quick"]').forEach(b => b.disabled = busy);
        root.querySelectorAll('form').forEach(form => {
            const empty = !form.querySelector('input').value.trim();
            form.querySelector('button').disabled = empty
                || (form.dataset.form !== "name" && (busy || !connected));
        });
    }
    function status(text) {
        busy = false;
        if (quickRequested && text) { view = "quick-error"; render(); return; }
        updateMatchButtons();
    }
    function match(action, phrase = "") {
        if (busy) return;
        quickRequested = action === "quick";
        window.coreMenu.phrase = phrase;
        window.coreGame.match(action, phrase, name);
        busy = true;
        updateMatchButtons();
    }
    window.coreMenu = {
        phrase: "",
        status,
        rejected() { connected = false; busy = false; snapshot = null; lastLobby = ""; view = quickRequested ? "quick-error" : window.coreMenu.phrase ? "search" : "home"; render(); },
        connected() { connected = true; status(); },
        disconnected() {
            connected = false; busy = false; lastLobby = "";
            if (quickRequested) view = "quick-error";
            root.hidden = false; document.body.classList.add("menu-preview");
            render();
        },
        snapshot(next, id) {
            quickRequested = false;
            snapshot = next; selfId = id; connected = true; busy = false;
            const playing = ["preparing", "wave"].includes(next.phase);
            root.hidden = playing;
            document.body.classList.toggle("menu-preview", !playing);
            if (playing) { lastLobby = ""; return; }
            const signature = JSON.stringify([id, next.roomId, next.privateRoom, next.phase, next.roomOwnerId, next.allReady,
                next.players.map(p => [p.id, p.name, p.human, p.ready])]);
            if (signature === lastLobby && view === "lobby") return;
            lastLobby = signature; view = "lobby";
            render();
        }
    };
    root.addEventListener("input", updateMatchButtons);
    root.addEventListener("submit", event => {
        event.preventDefault();
        const form = event.target, data = new FormData(form);
        try {
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
    root.addEventListener("click", event => {
        const target = event.target.closest("button[data-action]");
        if (!target || target.disabled || busy) return;
        const action = target.dataset.action;
        if (["home", "phrase", "create", "search", "settings"].includes(action)) go(action);
        if (action === "quick") {
            try { match("quick"); } catch (error) { status(error.message); }
        }
        if (action === "start") window.coreGame.send("START");
        if (action === "ready") window.coreGame.send(`ROOM_READY:${snapshot.players.find(p => p.id === selfId)?.ready ? 0 : 1}`);
        if (action === "leave") {
            snapshot = null; lastLobby = ""; connected = false;
            window.coreMenu.phrase = ""; window.coreGame.leave(); go("home");
        }
    });
    render();
}
