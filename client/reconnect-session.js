"use strict";

// Tab identity stays independent until the player explicitly resumes a saved game.
window.coreReconnect = (() => {
    const tabKey = "core-defense-session";
    const port = new URLSearchParams(location.search).get("serverPort") || "8887";
    const roomKey = `core-defense-return-room:${port}`;
    const validId = value => typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value);
    function createId() {
        const bytes = new Uint8Array(24);
        crypto.getRandomValues(bytes); // Available on HTTP as well as HTTPS.
        return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    }
    function adopt(id) {
        try { sessionStorage.setItem(tabKey, id); } catch { /* Storage may be disabled. */ }
        return id;
    }
    function session() {
        let id;
        try { id = sessionStorage.getItem(tabKey); } catch { /* Storage may be disabled. */ }
        return validId(id) ? id : adopt(createId());
    }
    function saved() {
        try {
            const value = JSON.parse(localStorage.getItem(roomKey));
            return value && validId(value.sessionId)
                && typeof value.roomId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value.roomId)
                && typeof value.phrase === "string" && value.phrase.length <= 32
                && typeof value.name === "string" && value.name.length <= 16 ? value : null;
        } catch { return null; }
    }
    function remember(sessionId, roomId, phrase, name) {
        try { localStorage.setItem(roomKey, JSON.stringify({ sessionId, roomId, phrase, name })); }
        catch { /* Reconnection in the current tab still works without local storage. */ }
    }
    function forget(sessionId, roomId) {
        const value = saved();
        if (value?.sessionId !== sessionId || value.roomId !== roomId) return;
        try { localStorage.removeItem(roomKey); } catch { /* Storage may be disabled. */ }
    }
    return { session, adopt, saved, remember, forget, newSession: () => adopt(createId()) };
})();
