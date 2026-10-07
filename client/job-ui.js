"use strict";

// Add jobs here once; both lobby layouts share the catalogue and detail view.
window.JobUI = (() => {
    const catalog = Object.freeze({
        healer: { name: "ヒーラー", description: "ダウンした味方を素早くリバイブする。" },
        spy: { name: "スパイ", description: "敵に似た姿に偽装し、認識と通常攻撃を避ける。偽装中は味方の弾と範囲攻撃も受ける。" },
        tp: { name: "TP", description: "テレポーターを2台所持。Rで設置・移動、R長押しで自分の装置を回収。味方全員が利用可能。" },
        scout: { name: "スカウト", description: "ダッシュが少し速くなり、スタミナも長持ちする。" },
        drone: { name: "Drone Operator", description: "ドローンで偵察・射撃。命中した敵を誘導できる。操作中は本人が無防備。破壊後は資材で修復。" }
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

    return Object.freeze({ catalog, render });
})();
window.coreJobs = window.JobUI.catalog;
