"use strict";

// One shape definition drives both the aiming overlay and all settings previews.
window.coreReticleSettings = (() => {
    const storageKey = "core-defense-reticle";
    const defaults = { color: "#e8f4f8", size: 20, shape: "plus" };
    const normalize = value => ({
        color: /^#[0-9a-f]{6}$/i.test(value?.color) ? value.color.toLowerCase() : defaults.color,
        size: Number.isFinite(value?.size) ? Math.max(4, Math.min(32, Math.round(value.size))) : defaults.size,
        // Keep the old saved circle ID compatible; it now means an open ring.
        shape: ["dot", "cross", "plus"].includes(value?.shape) ? value.shape : defaults.shape
    });
    let settings = { ...defaults };
    try { settings = normalize(JSON.parse(localStorage.getItem(storageKey))); } catch { /* Optional storage. */ }
    function geometry() {
        const outer=settings.size/2,inner=outer*.4,lines=[],arcs=[];
        if(settings.shape==='dot')arcs.push([outer,0,Math.PI*2]);
        else for(const [dx,dy] of settings.shape==='cross'?[[-1,-1],[1,-1],[-1,1],[1,1]]:[[-1,0],[1,0],[0,-1],[0,1]])lines.push([dx*inner,dy*inner,dx*outer,dy*outer]);
        return {lines,arcs,color:settings.color,width:1.5};
    }
    function svg() {
        const {lines,arcs,color,width}=geometry(),center=40;
        let d=lines.map(([a,b,c,e])=>`M${center+a} ${center+b}L${center+c} ${center+e}`).join("");
        let circles="";
        for(const [r,a,b] of arcs) {
            if(b-a>=Math.PI*2)circles+=`<circle cx="40" cy="40" r="${r}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
            else d+=`M${center+Math.cos(a)*r} ${center+Math.sin(a)*r}A${r} ${r} 0 0 1 ${center+Math.cos(b)*r} ${center+Math.sin(b)*r}`;
        }
        return circles+`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
    }
    function apply() {
        const markup=`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">${svg()}</svg>`;
        document.documentElement.style.setProperty('--reticle-preview',`url("data:image/svg+xml,${encodeURIComponent(markup)}")`);
    }
    function paint(ctx,x,y) {
        const {lines,arcs,color,width}=geometry();
        ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap="round";ctx.lineJoin="round";
        ctx.shadowColor="rgba(10,16,22,.7)";ctx.shadowBlur=3;ctx.shadowOffsetY=1;ctx.beginPath();
        for(const [a,b,c,d] of lines){ctx.moveTo(x+a,y+b);ctx.lineTo(x+c,y+d);}
        for(const [r,a,b] of arcs){ctx.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r);ctx.arc(x,y,r,a,b);}
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
