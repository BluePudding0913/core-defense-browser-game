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
    function geometry(mode="normal",age=80) {
        const hit=mode!=="normal",hs=mode==="headshot",pop=hit?1+Math.max(0,1-age/80)*.18:1;
        const radius=settings.size/2,outer=(hit?Math.max(radius+5,13)+(hs?3:0):radius)*pop;
        const inner=(hit?Math.max(radius*.6,6):radius*.4)*pop;
        const lines=[],arcs=[];
        const line=(a,b,c,d)=>lines.push([a,b,c,d]);
        if(settings.shape==="dot") {
            if(!hit)arcs.push([radius,0,Math.PI*2]);
            else for(let n=0;n<4;n++) {
                const angle=n*Math.PI/2;
                arcs.push([outer,angle+.16,angle+Math.PI/2-.16]);
                if(hs)arcs.push([outer+4,angle+.3,angle+Math.PI/2-.3]);
            }
        } else {
            const directions=settings.shape==="cross"?[[-1,-1],[1,-1],[-1,1],[1,1]]:[[-1,0],[1,0],[0,-1],[0,1]];
            for(const [dx,dy] of directions) {
                line(dx*inner,dy*inner,dx*outer,dy*outer);
                if(hs && settings.shape==="cross")line(dx*(outer-3),dy*(outer+3),dx*(outer+3),dy*(outer-3));
                if(hs && settings.shape==="plus") {
                    const tip=outer+3;
                    line(dx*outer-dy*3,dy*outer+dx*3,dx*tip,dy*tip);
                    line(dx*tip,dy*tip,dx*outer+dy*3,dy*outer-dx*3);
                }
            }
        }
        return {lines,arcs,color:hit?(hs?"#ffc45c":"#f1f8fb"):settings.color,width:hit?2.5:1.5};
    }
    function svg(mode) {
        const {lines,arcs,color,width}=geometry(mode),center=40;
        let d=lines.map(([a,b,c,e])=>`M${center+a} ${center+b}L${center+c} ${center+e}`).join("");
        let circles="";
        for(const [r,a,b] of arcs) {
            if(b-a>=Math.PI*2)circles+=`<circle cx="40" cy="40" r="${r}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
            else d+=`M${center+Math.cos(a)*r} ${center+Math.sin(a)*r}A${r} ${r} 0 0 1 ${center+Math.cos(b)*r} ${center+Math.sin(b)*r}`;
        }
        return circles+`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
    }
    function apply() {
        for(const mode of ["normal","hit","headshot"]) {
            const markup=`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">${svg("normal")}${mode==="normal"?"":svg(mode)}</svg>`;
            document.documentElement.style.setProperty(mode==="normal"?"--reticle-preview":`--reticle-preview-${mode}`,`url("data:image/svg+xml,${encodeURIComponent(markup)}")`);
        }
    }
    function paint(ctx,x,y,mode,age) {
        const {lines,arcs,color,width}=geometry(mode,age);
        ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap="round";ctx.lineJoin="round";
        ctx.shadowColor="rgba(10,16,22,.7)";ctx.shadowBlur=3;ctx.shadowOffsetY=1;ctx.beginPath();
        for(const [a,b,c,d] of lines){ctx.moveTo(x+a,y+b);ctx.lineTo(x+c,y+d);}
        for(const [r,a,b] of arcs){ctx.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r);ctx.arc(x,y,r,a,b);}
        ctx.stroke();ctx.restore();
    }
    function draw(ctx,x,y) {paint(ctx,x,y,"normal",80);}
    function drawHit(ctx,x,y,hit) {
        ctx.save();ctx.globalAlpha=(ctx.globalAlpha??1)*hit.alpha;
        paint(ctx,x,y,hit.headshot?"headshot":"hit",hit.age);
        ctx.restore();
    }
    apply();
    return {get(){return {...settings};},draw,drawHit,
        update(value) {
            settings=normalize({...settings,...value});apply();
            try {localStorage.setItem(storageKey,JSON.stringify(settings));} catch { /* Optional storage. */ }
        }
    };
})();
