"use strict";

// Add jobs here once; both lobby layouts share the catalogue and detail view.
window.JobUI = (() => {
    const catalog = Object.freeze({
        healer: { name: "Healer", description: "ダウンした味方を素早くリバイブする。ジョブ効果キーで3×3の回復エリアを10秒展開し、範囲内の味方を即蘇生する。" },
        attacker: { name: "Attacker", description: "所持品画面で左右の武器を設定。左右クリックの長押しで同時に撃てる。武器の弾薬上限2倍。" },
        spy: { name: "Spy", description: "ジョブ効果キーで偽装。右クリックした方向へデコイを発射（0.5秒）。ピストル威力3倍。偽装中は味方の弾も受ける。" },
        tank: { name: "Tank", description: "HP200。周囲の味方の被ダメージを25%軽減し、優先して狙われる。ジョブ効果キーで1×2の壁を20秒設置（各マスHP2400）。" },
        tp: { name: "TP", description: "所持品でTPを選びRで設置。移動はR、自分のTPはR長押しで回収。ジョブ効果キーで5秒間無敵（攻撃不可・再使用20秒）。" },
        scout: { name: "Scout", description: "味方の位置とジョブを確認できる。右クリックした方向へ高速移動。ダッシュが少し速くなり、スタミナも長持ちし、素早く回復する。" },
        hacker: { name: "Hacker", description: "重火器エリアのコンピュータからミサイルを発射。暗視マップで着弾地点を指定する。" },
        drone: { name: "Drone Operator", description: "ジョブ効果キーの短押しで視点切替、長押しで出撃・回収。ドローンからブレーカー修理も可能。自爆キー（初期G）で爆発。操作中は本人が無防備。破壊時は搭載武器を失い、修復には資材が必要。" }
    });
    const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

    function render(selected = "healer", disabled = false, jobs = catalog, detailId = "job-detail") {
        const current = jobs[selected] || Object.values(jobs)[0];
        if (!current) return "";
        return `<div class="job-picker">
            <div class="job-list" role="group" aria-label="ジョブ">${Object.entries(jobs).map(([id, job]) =>
                `<button type="button" data-action="job" data-job="${escape(id)}" aria-pressed="${job === current}" aria-controls="${escape(detailId)}" ${disabled ? "disabled" : ""}>${escape(job.name)}</button>`).join("")}</div>
            <section id="${escape(detailId)}" class="job-detail" aria-live="polite" aria-atomic="true" aria-label="選択中のジョブ">
                <p>${escape(current.description || "")}</p>
            </section>
        </div>`;
    }

    function renderAllyIntel(player, areas, contains, startingArea) {
        const job = catalog[player.job]?.name || player.job || "—";
        const area = areas.find(area => contains(area, player.x, player.y));
        const location = area?.name || (startingArea && contains(startingArea, player.x, player.y)
            ? startingArea.name : "PASSAGE");
        return `<div class="teammate-intel"><span>${escape(job)}</span><span>${escape(location)}</span></div>`;
    }

    return Object.freeze({ catalog, render, renderAllyIntel });
})();
window.coreJobs = window.JobUI.catalog;
