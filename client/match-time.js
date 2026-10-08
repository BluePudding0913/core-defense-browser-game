"use strict";
function formatMatchTime(seconds) {
    const total = Math.floor(Math.max(0, Number.isFinite(seconds) ? seconds : 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total / 60) % 60;
    const rest = String(total % 60).padStart(2, "0");
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}
if (typeof module !== "undefined") module.exports = formatMatchTime;
