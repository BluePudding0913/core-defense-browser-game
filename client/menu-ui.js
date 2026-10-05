"use strict";

// Local UI preview only. This model never calls the game server.
class MenuPreview {
    constructor() {
        this.name = "";
        this.room = null;
        this.ready = false;
        this.rooms = [
            { stage: "1", visibility: "public", members: ["Player1", null, null, "CPU"] },
            { stage: "2", visibility: "public", members: ["Player2", null, null, null] },
            { stage: "3", visibility: "public", members: ["Player3", null, "CPU", "CPU"] },
            { stage: "1", visibility: "private", password: "CORE", members: ["Player1", null, null, "CPU"] }
        ];
    }
    setName(name) {
        const clean = name.trim().slice(0, 16);
        if (!clean) throw new Error("ゲストプレイヤー名を入力してください。");
        this.name = clean;
    }
    create({ stage, visibility, password }) {
        if (!["1", "2", "3"].includes(stage)) throw new Error("ステージを選んでください。");
        if (!["public", "private"].includes(visibility)) throw new Error("公開範囲を選んでください。");
        const phrase = password.trim();
        if (visibility === "private" && !phrase) throw new Error("合言葉を入力してください。");
        this.room = { stage, visibility, password: visibility === "private" ? phrase : "",
            members: [this.name, null, null, null], owner: true, selfSlot: 0 };
        this.ready = true;
        return this.room;
    }
    join(room) {
        const slot = room.members.indexOf(null);
        if (slot < 0) throw new Error("このルームは満員です。");
        this.room = { ...room, members: [...room.members], owner: false, selfSlot: slot };
        this.room.members[slot] = this.name;
        this.ready = false;
        return this.room;
    }
    quickMatch(stage) {
        const room = this.rooms.find(candidate => candidate.visibility === "public"
            && (stage === "any" || candidate.stage === stage) && candidate.members.includes(null));
        if (!room) throw new Error("条件に合う公開ルームがありません。条件を変えるかルームを作ってください。");
        return this.join(room);
    }
    joinPassword(password) {
        const phrase = password.trim();
        if (!phrase) throw new Error("合言葉を入力してください。");
        const room = this.rooms.find(candidate => candidate.visibility === "private" && candidate.password === phrase);
        if (!room) throw new Error("合言葉に合うルームが見つかりません。");
        return this.join(room);
    }
    toggleCpu(slot) {
        if (!this.room?.owner || !Number.isInteger(slot) || slot < 0 || slot > 3 || slot === this.room.selfSlot) return;
        if (this.room.members[slot] === null) this.room.members[slot] = "CPU";
        else if (this.room.members[slot] === "CPU") this.room.members[slot] = null;
    }
    leave() { this.room = null; this.ready = false; }
}

if (typeof module !== "undefined" && module.exports) module.exports = { MenuPreview };
else if (new URLSearchParams(location.search).get("legacy") === "1") {
    // Preserve the playable client while the replacement menu is UI-only.
    document.body.classList.remove("menu-preview");
    document.querySelector("#menu-ui").remove();
    const script = document.createElement("script");
    script.src = "app.js";
    document.body.append(script);
} else mountMenuPreview();

function mountMenuPreview() {
    const root = document.querySelector("#menu-ui");
    const model = new MenuPreview();
    const escape = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    let view = "guest";
    let message = "";
    try {
        const name = localStorage.getItem("core-defense-guest-name");
        if (name?.trim()) { model.setName(name); view = "home"; }
    } catch { /* Storage is optional. */ }
    const stages = (any = false) => `${any ? '<option value="any">どれでも</option>' : ""}${[1, 2, 3].map(stage => `<option value="${stage}">ステージ${stage}</option>`).join("")}`;

    const back = '<button type="button" class="ui-back" data-action="home">戻る</button>';
    const heading = title => '<h2 tabindex="-1">' + title + '</h2>';
    function render(focus = true) {
        let content = "";
        if (view === "guest") content = '<form data-form="guest"><label>ゲストプレイヤー名<input name="name" maxlength="16" autocomplete="nickname" required value="' + escape(model.name) + '"></label><button class="ui-primary">つづける</button></form>';
        if (view === "home") content = '<nav aria-label="メインメニュー"><button class="ui-primary" data-action="quick">クイックマッチ</button><button data-action="create">ルームを作る</button><button data-action="password">合言葉で参加</button><button class="ui-back" data-action="settings">設定</button></nav>';
        if (view === "quick") content = heading('クイックマッチ') + '<form data-form="quick"><label>ステージ<select name="stage">' + stages(true) + '</select></label><button class="ui-primary">検索して参加</button></form>' + back;
        if (view === "create") content = heading('ルームを作る') + '<form data-form="create"><label>ステージ<select name="stage">' + stages() + '</select></label><fieldset aria-label="公開範囲"><div class="ui-segment"><label><input type="radio" name="visibility" value="public" checked>公開</label><label><input type="radio" name="visibility" value="private">合言葉あり</label></div></fieldset><label id="ui-create-password" hidden>合言葉<input name="password" maxlength="32" disabled></label><button class="ui-primary">作成</button></form>' + back;
        if (view === "password") content = heading('合言葉で参加') + '<form data-form="password"><label>合言葉<input name="password" maxlength="32" autocomplete="off" required></label><button class="ui-primary">参加</button></form>' + back;
        if (view === "settings") content = heading('設定') + '<form data-form="settings"><label>ゲストプレイヤー名<input name="name" maxlength="16" autocomplete="nickname" required value="' + escape(model.name) + '"></label><button class="ui-primary">保存</button></form>' + back;
        if (view === "lobby") {
            const room = model.room;
            const full = room.members.every(member => member !== null);
            content = heading('ルーム') + '<p class="ui-meta">ステージ' + room.stage + ' · ' + (room.visibility === 'public' ? '公開ルーム' : '合言葉：<span class="ui-phrase">' + escape(room.password) + '</span>') + '</p><ol class="ui-members">' + room.members.map((member, index) => {
                const self = index === room.selfSlot;
                const cpu = member === 'CPU' && !self;
                const label = member === null ? '空席' : escape(member);
                const status = index === 0 ? 'ホスト' : self ? (model.ready ? '準備完了' : 'あなた') : '';
                return '<li class="' + (member === null ? 'is-empty' : '') + '"><span class="ui-slot">' + (index + 1) + '</span><span class="ui-member-name">' + label + '</span>' + (room.owner && (member === null || cpu) ? '<button type="button" data-action="cpu" data-slot="' + index + '" aria-label="' + (index + 1) + '番の枠のCPUを' + (cpu ? '削除' : '追加') + '">' + (cpu ? '削除' : '＋ CPU') + '</button>' : '<small>' + status + '</small>') + '</li>';
            }).join('') + '</ol>';
            content += room.owner ? '<button class="ui-primary" data-action="start" ' + (full ? '' : 'disabled') + '>開始</button>' : '<button class="ui-primary" data-action="ready">' + (model.ready ? '準備を取り消す' : '準備OK') + '</button>';
            content += '<button class="ui-back" data-action="leave">退出</button>';
        }
        root.innerHTML = '<div class="ui-shell">' + (view === 'guest' || view === 'home' ? '<h1>CORE DEFENSE</h1>' : '') + '<section class="ui-content">' + content + '<p id="ui-message" role="status">' + escape(message) + '</p></section></div>';
        if (focus) (root.querySelector('h2') || root.querySelector('input') || root.querySelector('button'))?.focus();
    }
    function go(next) { view = next; message = ""; render(); }
    function saveSettings() {
        try {
            localStorage.setItem("core-defense-guest-name", model.name);
        } catch { message = "このブラウザでは設定を保存できません。今回の操作には反映しました。"; }
    }
    root.addEventListener("submit", event => {
        event.preventDefault();
        const form = event.target;
        const data = new FormData(form);
        try {
            message = "";
            if (form.dataset.form === "guest" || form.dataset.form === "settings") {
                model.setName(data.get("name"));
                saveSettings();
                view = "home";
            } else if (form.dataset.form === "create") {
                model.create({ stage: data.get("stage"), visibility: data.get("visibility"), password: data.get("password") || "" });
                view = "lobby";
            } else if (form.dataset.form === "quick") { model.quickMatch(data.get("stage")); view = "lobby"; }
            else if (form.dataset.form === "password") { model.joinPassword(data.get("password")); view = "lobby"; }
            render();
        } catch (error) { message = error.message; root.querySelector("#ui-message").textContent = message; }
    });
    root.addEventListener("change", event => {
        if (event.target.name === "visibility") {
            const privateRoom = event.target.value === "private";
            const field = root.querySelector("#ui-create-password");
            field.hidden = !privateRoom;
            field.querySelector("input").disabled = !privateRoom;
            field.querySelector("input").required = privateRoom;
        }
    });
    root.addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");
        if (!button || button.disabled) return;
        const action = button.dataset.action;
        if (["home", "quick", "create", "password", "settings"].includes(action)) go(action);
        if (action === "cpu") {
            model.toggleCpu(Number(button.dataset.slot)); render(false);
            root.querySelector(`[data-slot="${button.dataset.slot}"]`)?.focus();
        }
        if (action === "leave") { model.leave(); go("home"); }
        if (action === "ready") { model.ready = !model.ready; render(false); root.querySelector('[data-action="ready"]').focus(); }
        if (action === "start") root.querySelector("#ui-message").textContent = "準備完了！ このプレビューではゲームは開始しません。";
    });
    render(false);
}
