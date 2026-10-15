"use strict";

// One shape definition drives both the aiming overlay and all settings previews.
window.coreReticleSettings = (() => {
    const storageKey = "core-defense-reticle";
    const defaults = { color: "#0088ff", size: 20, shape: "plus" };
    const normalize = value => ({
        color: /^#[0-9a-f]{6}$/i.test(value?.color) ? value.color.toLowerCase() : defaults.color,
        size: Number.isFinite(value?.size) ? Math.max(4, Math.min(96, Math.round(value.size))) : defaults.size,
        // Retired circle selections fall back to the default without losing color or size.
        shape: ["cross", "plus"].includes(value?.shape) ? value.shape : defaults.shape
    });
    let settings = { ...defaults };
    try { settings = normalize(JSON.parse(localStorage.getItem(storageKey))); } catch { /* Optional storage. */ }
    function geometry() {
        const outer=settings.size/2,inner=outer*.4,lines=[];
        for(const [dx,dy] of settings.shape==='cross'?[[-1,-1],[1,-1],[-1,1],[1,1]]:[[-1,0],[1,0],[0,-1],[0,1]])lines.push([dx*inner,dy*inner,dx*outer,dy*outer]);
        return {lines,color:settings.color,width:1.5};
    }
    function svg() {
        const {lines,color,width}=geometry(),center=40;
        let d=lines.map(([a,b,c,e])=>`M${center+a} ${center+b}L${center+c} ${center+e}`).join("");
        return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
    }
    function apply() {
        const markup=`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="-20 -20 120 120">${svg()}</svg>`;
        document.documentElement.style.setProperty('--reticle-preview',`url("data:image/svg+xml,${encodeURIComponent(markup)}")`);
    }
    function paint(ctx,x,y) {
        const {lines,color,width}=geometry();
        ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap="round";ctx.lineJoin="round";
        ctx.shadowColor="rgba(10,16,22,.7)";ctx.shadowBlur=3;ctx.shadowOffsetY=1;ctx.beginPath();
        for(const [a,b,c,d] of lines){ctx.moveTo(x+a,y+b);ctx.lineTo(x+c,y+d);}
        ctx.stroke();ctx.restore();
    }
    function draw(ctx,x,y) {paint(ctx,x,y);}
    apply();
    return {get(){return {...settings};},draw,
        update(value) {
            settings=normalize({...settings,...value});apply();
            try {localStorage.setItem(storageKey,JSON.stringify(settings));} catch { /* Optional storage. */ }
        }
    };
})();
