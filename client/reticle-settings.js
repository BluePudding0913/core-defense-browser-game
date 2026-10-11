"use strict";

// Browser-local preferences for the center aiming mark, independent of mouse input.
window.coreReticleSettings = (() => {
    const storageKey = "core-defense-reticle";
    const defaults = { color: "#e8f4f8", size: 20, shape: "plus" };
    const normalize = value => ({
        color: /^#[0-9a-f]{6}$/i.test(value?.color) ? value.color.toLowerCase() : defaults.color,
        size: Number.isFinite(value?.size) ? Math.max(4, Math.min(32, Math.round(value.size))) : defaults.size,
        shape: ["dot", "cross", "plus"].includes(value?.shape) ? value.shape : defaults.shape
    });
    let settings = { ...defaults };
    try { settings = normalize(JSON.parse(localStorage.getItem(storageKey))); } catch { /* Optional storage. */ }
    function geometry() {
        const outer=settings.size/2,inner=outer*.4;
        const directions=settings.shape==="cross" ? [[-1,-1],[1,-1],[-1,1],[1,1]] : [[-1,0],[1,0],[0,-1],[0,1]];
        return {radius:outer,lines:directions.map(([x,y])=>[x*inner,y*inner,x*outer,y*outer])};
    }
    function apply() {
        const { color, size, shape }=settings,{radius,lines}=geometry();
        const extent=size+8,center=extent/2;
        const mark=shape==="dot" ? `<circle cx="${center}" cy="${center}" r="${radius}" fill="${color}"/>`
            : `<path d="${lines.map(([a,b,c,d])=>`M${center+a} ${center+b}L${center+c} ${center+d}`).join("")}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>`;
        const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${extent}" height="${extent}">${mark}</svg>`;
        document.documentElement.style.setProperty("--reticle-preview",`url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
        document.documentElement.style.setProperty("--reticle-extent",`${extent}px`);
    }
    function draw(ctx,x,y) {
        const {radius,lines}=geometry();
        ctx.save();ctx.strokeStyle=settings.color;ctx.fillStyle=settings.color;
        ctx.lineWidth=1.5;ctx.lineCap="round";ctx.beginPath();
        if(settings.shape==="dot"){ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();}
        else {for(const [a,b,c,d] of lines){ctx.moveTo(x+a,y+b);ctx.lineTo(x+c,y+d);}ctx.stroke();}
        ctx.restore();
    }
    apply();
    return {
        get() {return {...settings};},
        draw,
        update(value) {
            settings=normalize({...settings,...value});apply();
            try {localStorage.setItem(storageKey,JSON.stringify(settings));} catch { /* Optional storage. */ }
        }
    };
})();
