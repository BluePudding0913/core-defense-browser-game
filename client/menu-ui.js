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
    let name = "", view = "guest", message = "サーバーに接続しています…";
    let snapshot, selfId, busy = false, connected = false, lastLobby = "";
    try { name = localStorage.getItem("core-defense-guest-name")?.trim() || ""; } catch { /* Optional storage. */ }
    if (name) view = "home";
    const back = to => `<button type="button" class="ui-back" data-action="${to}">戻る</button>`;
    const button = (action, label, primary = false) => `<button type="button" ${primary ? 'class="ui-primary"' : ''} data-action="${action}">${label}</button>`;
    const disabled = () => busy || !connected ? "disabled" : "";
    function render(focus = false) {
        let content = "";
        if (view === "guest" || view === "settings") content = `<h2>プレイヤー設定</h2><form data-form="name"><label>ゲストプレイヤー名<input name="name" maxlength="16" required autocomplete="nickname" value="${escape(name)}"></label><button class="ui-primary">保存してつづける</button></form>${view === "settings" ? back("home") : ""}`;
        if (view === "home") content = `<h1>CORE DEFENSE</h1><nav aria-label="メインメニュー">${button("quick", "クイックマッチ", true)}${button("phrase", "合言葉")}${back("settings").replace("戻る", "設定")}</nav>`;
        if (view === "phrase") content = `<h2>合言葉</h2><nav>${button("create", "ルーム作成", true)}${button("search", "ルーム検索")}</nav>${back("home")}`;
        if (view === "quick") content = `<h2>クイックマッチ</h2><p class="ui-meta">空いているルームへ参加します。部屋がなければホストになります。</p><form data-form="quick"><button class="ui-primary" ${disabled()}>検索して参加</button></form>${back("home")}`;
        if (view === "create" || view === "search") content = `<h2>${view === "create" ? "ルーム作成" : "ルーム検索"}</h2><form data-form="${view}"><label>合言葉<input name="password" maxlength="32" autocomplete="off" required></label><button class="ui-primary" ${disabled()}>${view === "create" ? "作成" : "検索して参加"}</button></form>${back("phrase")}`;
        if (view === "lobby" && snapshot) {
            const owner = snapshot.roomOwnerId === selfId;
            const me = snapshot.players.find(p => p.id === selfId);
            const editable = owner && ["lobby", "won", "lost"].includes(snapshot.phase) && connected;
            content = `<h2>ルーム</h2><p class="ui-meta">CORE DEFENSE · ${snapshot.privateRoom ? '合言葉：<span class="ui-phrase">' + escape(window.coreMenu.phrase) + '</span>' : "クイックマッチ"}</p>`;
            if (owner) content += '<p class="ui-meta">ホスト設定：空席のCPUを追加・削除できます。4枠を埋め、参加者の準備完了後に開始できます。</p>';
            content += '<ol class="ui-members">' + snapshot.players.map((p, index) => {
                const cpu = snapshot.cpuSlots.includes(index + 1);
                return `<li class="${!p.human && !cpu ? "is-empty" : ""}"><span class="ui-slot">${index + 1}</span><span class="ui-member-name">${p.human ? escape(p.name) : cpu ? "CPU" : "空席"}</span>${!p.human && editable ? `<button data-action="cpu" data-slot="${index + 1}">${cpu ? "削除" : "＋ CPU"}</button>` : `<small>${p.id === snapshot.roomOwnerId ? "ホスト" : p.human ? p.ready ? "準備完了" : "準備中" : ""}</small>`}</li>`;
            }).join("") + '</ol>';
            content += owner ? `<button class="ui-primary" data-action="start" ${!snapshot.allReady || !connected ? "disabled" : ""}>${snapshot.phase === "lobby" ? "開始" : "もう一度プレイ"}</button>` : `<button class="ui-primary" data-action="ready" ${disabled()}>${me?.ready ? "準備を取り消す" : "準備OK"}</button>`;
            content += button("leave", "退出");
        }
        root.innerHTML = `<div class="ui-shell"><section class="ui-content">${content}<p id="ui-message" role="status">${escape(message)}</p></section></div>`;
        if (focus) (root.querySelector("input") || root.querySelector("button"))?.focus();
    }
    function status(text) {
        message = text; busy = false;
        root.querySelector("#ui-message").textContent = message;
        root.querySelectorAll("form button").forEach(b => b.disabled = !connected);
    }
    window.coreMenu = {
        phrase: "",
        status,
        rejected() { connected = false; busy = false; snapshot = null; lastLobby = ""; view = window.coreMenu.phrase ? "search" : "quick"; render(); },
        connected() { connected = true; busy = false; status(message.includes("接続") ? "" : message); },
        disconnected(text) {
            connected = false; busy = false; lastLobby = "";
            root.hidden = false; document.body.classList.add("menu-preview");
            message = text; render();
        },
        snapshot(next, id) {
            snapshot = next; selfId = id; connected = true; busy = false;
            const playing = ["preparing", "wave"].includes(next.phase);
            root.hidden = playing;
            document.body.classList.toggle("menu-preview", !playing);
            if (playing) { lastLobby = ""; return; }
            const signature = JSON.stringify([id, next.roomId, next.privateRoom, next.phase, next.roomOwnerId, next.allReady, next.cpuSlots,
                next.players.map(p => [p.id, p.name, p.human, p.ready])]);
            if (signature === lastLobby && view === "lobby") return;
            lastLobby = signature; view = "lobby";
            message = next.phase === "won" ? "防衛成功" : next.phase === "lost" ? "防衛失敗" : "";
            render();
        }
    };
    root.addEventListener("submit", event => {
        event.preventDefault();
        const form = event.target, data = new FormData(form);
        try {
            if (form.dataset.form === "name") {
                const value = String(data.get("name") || "").trim().slice(0, 16);
                if (!value) throw new Error("ゲストプレイヤー名を入力してください。");
                name = value;
                try { localStorage.setItem("core-defense-guest-name", name); } catch { /* Optional storage. */ }
                view = "home"; render(true); return;
            }
            if (busy) return;
            const action = form.dataset.form;
            const phrase = String(data.get("password") || "").trim();
            if (action !== "quick" && !phrase) throw new Error("合言葉を入力してください。");
            window.coreMenu.phrase = phrase;
            window.coreGame.match(action === "search" ? "join" : action, phrase, name);
            status("ルームに接続しています…"); busy = true;
            root.querySelectorAll("form button").forEach(b => b.disabled = true);
        } catch (error) { status(error.message); }
    });
    root.addEventListener("click", event => {
        const target = event.target.closest("button[data-action]");
        if (!target || target.disabled || busy) return;
        const action = target.dataset.action;
        if (["home", "phrase", "create", "search", "quick", "settings"].includes(action)) { view = action; render(true); }
        if (action === "cpu") window.coreGame.send(`ROOM_CPU:${target.dataset.slot}`);
        if (action === "start") window.coreGame.send("START");
        if (action === "ready") window.coreGame.send(`ROOM_READY:${snapshot.players.find(p => p.id === selfId)?.ready ? 0 : 1}`);
        if (action === "leave") {
            snapshot = null; lastLobby = ""; connected = false; view = "home";
            window.coreMenu.phrase = ""; window.coreGame.leave(); render(true);
        }
    });
    render();
}
