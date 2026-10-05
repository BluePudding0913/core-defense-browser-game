"use strict";

// Local UI preview only. This model never calls the game server.
class MenuPreview {
    constructor() {
        this.name = "";
        this.room = null;
        this.waitSeconds = 30;
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
    create({ stage, visibility, password, autoFill }, now = Date.now()) {
        if (!["1", "2", "3"].includes(stage)) throw new Error("ステージを選んでください。");
        if (!["public", "private"].includes(visibility)) throw new Error("公開範囲を選んでください。");
        const phrase = password.trim();
        if (visibility === "private" && !phrase) throw new Error("合言葉を入力してください。");
        this.room = { stage, visibility, password: visibility === "private" ? phrase : "",
            members: [this.name, null, null, null], autoFill, owner: true, selfSlot: 0,
            deadline: autoFill ? now + this.waitSeconds * 1000 : null };
        this.ready = true;
        return this.room;
    }
    join(room) {
        const slot = room.members.indexOf(null);
        if (slot < 0) throw new Error("このルームは満員です。");
        this.room = { ...room, members: [...room.members], owner: false, selfSlot: slot, autoFill: false, deadline: null };
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
    setAutoFill(enabled, now = Date.now()) {
        if (!this.room?.owner) return;
        this.room.autoFill = enabled;
        this.room.deadline = enabled ? now + this.waitSeconds * 1000 : null;
    }
    tick(now = Date.now()) {
        if (!this.room?.owner || !this.room.autoFill || this.room.deadline === null || now < this.room.deadline) return false;
        this.room.members = this.room.members.map(member => member === null ? "CPU" : member);
        this.room.deadline = null;
        return true;
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
        const seconds = Number(localStorage.getItem("core-defense-cpu-wait"));
        if ([15, 30, 60].includes(seconds)) model.waitSeconds = seconds;
    } catch { /* Storage is optional. */ }
    const stages = (any = false) => `${any ? '<option value="any">どれでも</option>' : ""}${[1, 2, 3].map(stage => `<option value="${stage}">ステージ${stage}</option>`).join("")}`;

    const back = '<button type="button" class="ui-back" data-action="home">戻る</button>';
    const heading = title => '<h2 tabindex="-1">' + title + '</h2>';
    function render(focus = true) {
        let content = "";
        if (view === "guest") content = '<form data-form="guest"><label>ゲストプレイヤー名<input name="name" maxlength="16" autocomplete="nickname" required value="' + escape(model.name) + '"></label><button class="ui-primary">つづける</button></form>';
        if (view === "home") content = '<nav aria-label="メインメニュー"><button class="ui-primary" data-action="quick">クイックマッチ</button><button data-action="create">ルームを作る</button><button data-action="password">合言葉で参加</button><button class="ui-back" data-action="settings">設定</button></nav>';
        if (view === "quick") content = heading('クイックマッチ') + '<form data-form="quick"><label>ステージ<select name="stage">' + stages(true) + '</select></label><button class="ui-primary">検索して参加</button></form>' + back;
        if (view === "create") content = heading('ルームを作る') + '<form data-form="create"><label>ステージ<select name="stage">' + stages() + '</select></label><fieldset><legend>公開範囲</legend><div class="ui-segment"><label><input type="radio" name="visibility" value="public" checked>公開</label><label><input type="radio" name="visibility" value="private">合言葉あり</label></div></fieldset><label id="ui-create-password" hidden>合言葉<input name="password" maxlength="32" disabled></label><label class="ui-check"><input type="checkbox" name="autoFill" checked>' + model.waitSeconds + '秒後に空席をCPUで補充</label><button class="ui-primary">作成</button></form>' + back;
        if (view === "password") content = heading('合言葉で参加') + '<form data-form="password"><label>合言葉<input name="password" maxlength="32" autocomplete="off" required></label><button class="ui-primary">参加</button></form>' + back;
        if (view === "settings") content = heading('設定') + '<form data-form="settings"><label>ゲストプレイヤー名<input name="name" maxlength="16" autocomplete="nickname" required value="' + escape(model.name) + '"></label><label>CPU補充まで<select name="wait">' + [15, 30, 60].map(seconds => '<option value="' + seconds + '" ' + (seconds === model.waitSeconds ? 'selected' : '') + '>' + seconds + '秒</option>').join('') + '</select></label><button class="ui-primary">保存</button></form>' + back;
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
            content += room.owner ? '<label class="ui-check"><input id="ui-auto-fill" type="checkbox" ' + (room.autoFill ? 'checked' : '') + '>CPU自動補充 <small id="ui-countdown"></small></label><button class="ui-primary" data-action="start" ' + (full ? '' : 'disabled') + '>開始</button>' : '<button class="ui-primary" data-action="ready">' + (model.ready ? '準備を取り消す' : '準備OK') + '</button>';
            content += '<button class="ui-back" data-action="leave">退出</button>';
        }
        root.innerHTML = '<div class="ui-shell">' + (view === 'guest' || view === 'home' ? '<h1>CORE DEFENSE</h1>' : '') + '<section class="ui-content">' + content + '<p id="ui-message" role="status">' + escape(message) + '</p></section><small class="ui-preview-label">UIプレビュー</small></div>';
        updateCountdown();
        if (focus) (root.querySelector('h2') || root.querySelector('input') || root.querySelector('button'))?.focus();
    }
    function go(next) { view = next; message = ""; render(); }
    function saveSettings() {
        try {
            localStorage.setItem("core-defense-guest-name", model.name);
            localStorage.setItem("core-defense-cpu-wait", model.waitSeconds);
        } catch { message = "このブラウザでは設定を保存できません。今回の操作には反映しました。"; }
    }
    function updateCountdown() {
        const label = root.querySelector("#ui-countdown");
        if (!label) return;
        const room = model.room;
        label.textContent = !room.autoFill ? ""
            : room.deadline === null ? "完了"
                : `あと${Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000))}秒`;
    }
    root.addEventListener("submit", event => {
        event.preventDefault();
        const form = event.target;
        const data = new FormData(form);
        try {
            message = "";
            if (form.dataset.form === "guest" || form.dataset.form === "settings") {
                model.setName(data.get("name"));
                if (form.dataset.form === "settings") model.waitSeconds = Number(data.get("wait"));
                saveSettings();
                view = "home";
            } else if (form.dataset.form === "create") {
                model.create({ stage: data.get("stage"), visibility: data.get("visibility"), password: data.get("password") || "", autoFill: data.has("autoFill") });
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
        if (event.target.id === "ui-auto-fill") { model.setAutoFill(event.target.checked); updateCountdown(); }
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
    setInterval(() => {
        if (view !== "lobby") return;
        if (model.tick()) {
            const focused = document.activeElement;
            const focusedSelector = focused?.id === "ui-auto-fill" ? "#ui-auto-fill"
                : focused?.dataset.slot ? `[data-slot="${focused.dataset.slot}"]`
                    : focused?.dataset.action ? `[data-action="${focused.dataset.action}"]` : null;
            render(false);
            if (focusedSelector) root.querySelector(focusedSelector)?.focus();
        } else updateCountdown();
    }, 500);
    render(false);
}
