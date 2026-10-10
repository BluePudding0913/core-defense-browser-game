"use strict";

// Add jobs here once; both lobby layouts share the catalogue and detail view.
window.JobUI = (() => {
    const catalog = Object.freeze({
        healer: { name: "Healer", description: "味方の蘇生にかかる時間が通常の半分になります。ジョブ効果キー（初期F）で、足元に3×3マスの回復エリアを10秒間展開します。エリア内の味方は毎秒HPが6回復し、ダウンしている場合は即座に蘇生します。再使用まで30秒かかります。" },
        builder: { name: "Builder", description: "タレットなどの防衛設備のクラフト素材と、Quarryの購入費が半分になります。銀タレットの圧縮も半分の個数で行えます。" },
        attacker: { name: "Attacker", description: "攻撃力が通常の1.5倍になります。所持品画面で左右の手に別々の武器を装備できます。左クリックでメイン武器、右クリックでサブ武器を使い、両方を押し続けると同時に攻撃できます。武器は4つ持てます。弾薬の所持上限は通常の2倍です。" },
        spy: { name: "Spy", description: "ピストルのダメージが通常の3倍になります。ジョブ効果キー（初期F）で8秒間偽装し、敵に狙われにくくなります。ただし、攻撃した敵には気づかれることがあり、偽装中は味方の攻撃も受けます。偽装が切れてから15秒後に再使用できます。右クリックで敵を引きつけるデコイを発射でき、0.5秒ごとに出し直せます。" },
        tank: { name: "Tank", description: "最大HPが200になり、敵から優先して狙われます。自分と近くの味方が受けるダメージを25%軽減しますが、壁越しには効果がありません。右クリックで正面に1×2マスの壁を設置します。壁のHPは1マスにつき10000で、20秒後に消えます。再設置まで20秒かかります。" },
        tp: { name: "TP", description: "所持品からTPを選び、Rで2か所に設置すると、その間を移動できます。2セット・計4個まで設置できます。TPの近くでRを押すと移動し、自分のTPはRを長押しすると回収できます。ジョブ効果キー（初期F）で5秒間無敵になりますが、その間は攻撃できません。能力の再使用まで20秒かかります。" },
        scout: { name: "Scout", description: "攻撃とラウンドクリアで獲得するゴールドが通常の1.3倍になります。味方のジョブと居場所を確認できます。通常よりダッシュが速く、スタミナの上限が高いので長く走れます。スタミナの消費も少なく、回復も速くなります。ダウン中も通常より速く移動できます。右クリックすると、スタミナを20消費して指定した方向へ素早く移動します。クールタイムはなく、移動中でも続けて使えます。" },
        hacker: { name: "Hacker", description: "準備時間中にCOMMAND ROOM左上のSYSTEM CONSOLEで100000Gを払い、ルームのバックアップを保存できます。ゲームオーバー時、ゲーム中に1回だけ自動で保存時点へ復元します。保存し直す場合も100000G必要です。重火器エリアのコンピュータを操作すると、暗視マップで指定した地点へミサイルを発射できます。開放済みのブレーカーからも管制マップを開き、離れたブレーカーを復旧できます。ブレーカーのマップからはミサイルを発射できません。" },
        drone: { name: "Drone Operator", description: "ジョブ効果キー（初期F）で武器を選んで出撃します。出撃中は近くなら回収、離れていれば視点を切り替えます。ドローンで攻撃やブレーカーの修理ができますが、操作中の本体は無防備です。自爆キー（初期G）で周囲の敵を攻撃できます。自爆や破壊で搭載武器を失い、再出撃には資材での修復が必要です。" }
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
