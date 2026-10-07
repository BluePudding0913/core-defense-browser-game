"use strict";

// Add jobs here once; both lobby layouts share the catalogue and detail view.
window.JobUI = (() => {
    const catalog = Object.freeze({
        healer: { name: "ヒーラー", description: "ダウンした味方を素早くリバイブする。", stats: [["蘇生", "2秒"]] },
        spy: { name: "スパイ", description: "敵に似た姿に偽装し、認識と通常攻撃を避ける。爆発などの範囲攻撃は受ける。", stats: [["偽装", "8秒"], ["再使用", "30秒"]] },
        tp: { name: "TP", description: "テレポーターを2台所持。Rで設置・移動、R長押しで自分の装置を回収。味方全員が利用可能。", stats: [["設置上限", "1組 / 2台"]] },
        scout: { name: "スカウト", description: "ダッシュが少し速くなり、スタミナも長持ちする。", stats: [["ダッシュ速度", "+15%"], ["持続時間", "+60%"]] }
    });
    const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

    function render(selected = "healer", disabled = false, jobs = catalog, detailId = "job-detail") {
        const current = jobs[selected] || Object.values(jobs)[0];
        if (!current) return "";
        return `<div class="job-picker">
            <div class="job-list" role="group" aria-label="ジョブ">${Object.entries(jobs).map(([id, job]) =>
                `<button type="button" data-action="job" data-job="${escape(id)}" aria-pressed="${job === current}" aria-controls="${escape(detailId)}" ${disabled ? "disabled" : ""}>${escape(job.name)}</button>`).join("")}</div>
            <section id="${escape(detailId)}" class="job-detail" aria-live="polite" aria-atomic="true" aria-label="選択中のジョブ">
                <h3>${escape(current.name)}</h3>
                <p>${escape(current.description || "")}</p>
                <dl>${(current.stats || []).map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join("")}</dl>
            </section>
        </div>`;
    }

    return Object.freeze({ catalog, render });
})();
window.coreJobs = window.JobUI.catalog;
