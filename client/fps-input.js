"use strict";
window.FPSInput = {
    create(canvas) {
        const view={yaw:0,pitch:0,zoom:false};
        let active=false,touch=null,resumeAfterUI=false,pendingLock=false,skipMouseMove=false;
        const locked=()=>document.pointerLockElement===canvas;
        function release() {resumeAfterUI=false;pendingLock=false;view.zoom=false;touch=null;if(locked())document.exitPointerLock();}
        function capture() {
            if(!active || locked() || pendingLock)return false;
            pendingLock=true;skipMouseMove=true;
            try {
                const request=canvas.requestPointerLock();
                if(request?.then)request.then(()=>{
                    pendingLock=false;
                    // A menu may have opened while the browser was granting the request.
                    if(!active && locked())document.exitPointerLock();
                },()=>{pendingLock=false;});
                else pendingLock=false;
            } catch {pendingLock=false;}
            return true;
        }
        function look(dx,dy,sensitivity=.0024) {sensitivity*=view.scoped ? .35 : 1;view.yaw+=dx*sensitivity;view.pitch=Math.max(-1.2,Math.min(1.2,view.pitch-dy*sensitivity));}
        // MouseEvent supplies relative motion under pointer lock; PointerEvent can include cursor warps.
        document.addEventListener('pointerlockchange',()=>{skipMouseMove=true;});
        canvas.addEventListener('mousemove',e=>{
            if(!active || !locked())return;
            if(skipMouseMove){skipMouseMove=false;return;}
            if(Number.isFinite(e.movementX) && Number.isFinite(e.movementY))look(e.movementX,e.movementY);
        });
        canvas.addEventListener('pointermove',e=>{if(active && e.pointerType!=='mouse' && touch?.id===e.pointerId){look(e.clientX-touch.x,e.clientY-touch.y,.006);touch.x=e.clientX;touch.y=e.clientY;}});
        canvas.addEventListener('pointerdown',e=>{if(active && e.pointerType==='touch' && e.clientX>innerWidth*.42)touch={id:e.pointerId,x:e.clientX,y:e.clientY};});
        for(const type of ['pointerup','pointercancel'])window.addEventListener(type,e=>{if(touch?.id===e.pointerId)touch=null;});
        return {
            view,locked,release,
            setActive(on,pausingForUI=false){
                if(active && !on){
                    const wasLocked=locked();
                    release();resumeAfterUI=pausingForUI && wasLocked;
                }
                if(!on && !pausingForUI)resumeAfterUI=false;
                const restore=on && !active && resumeAfterUI;
                active=on;
                if(restore){resumeAfterUI=false;capture();}
            },
            capture,
            movement(x,y){const sin=Math.sin(view.yaw),cos=Math.cos(view.yaw);return {x:x*cos-y*sin,y:x*sin+y*cos};},
            facing(){return {x:Math.sin(view.yaw),y:-Math.cos(view.yaw)};},
        };
    }
};
