"use strict";

// Add jobs here once; both lobby layouts share the catalogue and detail view.
window.JobUI = (() => {
    const catalog = Object.freeze({
        healer: { name: "Healer", description: "ダウンした味方を素早くリバイブする。" },
        spy: { name: "Spy", description: "Rで敵に偽装し、認識と通常攻撃を避ける。攻撃した敵にも80%の確率で気づかれない。偽装中は味方の弾と範囲攻撃も受ける。" },
        tp: { name: "TP", description: "テレポーターを2台所持。Rで設置・移動、R長押しで自分の装置を回収。味方全員が利用可能。" },
        scout: { name: "Scout", description: "味方の位置とジョブを確認できる。右クリックした方向へ高速移動。ダッシュが少し速くなり、スタミナも長持ちし、素早く回復する。" },
        hacker: { name: "Hacker", description: "重火器エリアのコンピュータからミサイルを発射。暗視マップで着弾地点を指定する。" },
        drone: { name: "Drone Operator", description: "武器を搭載したドローンで偵察・攻撃。操作中は本人が無防備。破壊時は搭載武器を失い、修復には資材が必要。" }
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
