"use strict";
window.coreMouseSettings = (() => {
    const key="core-defense-mouse-sensitivity";
    const normalize=value=>Number.isFinite(value)?Math.max(.2,Math.min(3,value)):1;
    let sensitivity=1;
    try { const saved=localStorage.getItem(key);if(saved!==null)sensitivity=normalize(Number(saved)); } catch {}
    return {get:()=>sensitivity,set(value){sensitivity=normalize(value);try{localStorage.setItem(key,String(sensitivity));}catch{}return sensitivity;}};
})();
