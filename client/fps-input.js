"use strict";
window.FPSInput = {
    create(canvas) {
        const view={yaw:0,pitch:0,zoom:false};
        let active=false,touch=null;
        const locked=()=>document.pointerLockElement===canvas;
        function release() {view.zoom=false;touch=null;if(locked())document.exitPointerLock();}
        function look(dx,dy,sensitivity=.0024) {view.yaw+=dx*sensitivity;view.pitch=Math.max(-1.2,Math.min(1.2,view.pitch-dy*sensitivity));}
        canvas.addEventListener('pointermove',e=>{if(!active)return;if(e.pointerType==='mouse' && locked())look(e.movementX,e.movementY);else if(touch?.id===e.pointerId){look(e.clientX-touch.x,e.clientY-touch.y,.006);touch.x=e.clientX;touch.y=e.clientY;}});
        canvas.addEventListener('pointerdown',e=>{if(active && e.pointerType==='touch' && e.clientX>innerWidth*.42)touch={id:e.pointerId,x:e.clientX,y:e.clientY};});
        for(const type of ['pointerup','pointercancel'])window.addEventListener(type,e=>{if(touch?.id===e.pointerId)touch=null;});
        return {
            view,locked,release,
            setActive(on){if(active && !on)release();active=on;},
            capture(){if(!active || locked())return false;try{const p=canvas.requestPointerLock();p?.catch?.(()=>{});}catch{}return true;},
            movement(x,y){const sin=Math.sin(view.yaw),cos=Math.cos(view.yaw);return {x:x*cos-y*sin,y:x*sin+y*cos};},
            facing(){return {x:Math.sin(view.yaw),y:-Math.cos(view.yaw)};},
        };
    }
};
