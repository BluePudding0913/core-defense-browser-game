"use strict";
window.FPSInput = {
    create(canvas, {onEscape} = {}) {
        const view={yaw:0,pitch:0,zoom:false};
        let active=false,touch=null,skipMouseMove=true,lookFrozen=false;
        let pendingLock=false,lockWanted=false,resumeAfterUI=false,hadLock=false;
        const locked=()=>document.pointerLockElement===canvas;
        function release(){
            resumeAfterUI=false;lockWanted=false;view.zoom=false;touch=null;skipMouseMove=true;
            if(locked())document.exitPointerLock();
        }
        function capture(){
            if(!active || locked())return false;
            if(pendingLock)return true;
            pendingLock=true;lockWanted=true;skipMouseMove=true;
            try {
                const request=canvas.requestPointerLock();
                if(request?.then)request.then(()=>{
                    pendingLock=false;
                    if((!active || !lockWanted) && locked())document.exitPointerLock();
                },()=>{pendingLock=false;lockWanted=false;});
            } catch {pendingLock=false;lockWanted=false;}
            return true;
        }
        document.addEventListener('pointerlockchange',()=>{
            pendingLock=false;skipMouseMove=true;
            if(locked()){
                hadLock=true;
                if(!active || !lockWanted)document.exitPointerLock();
            } else {
                const escaped=hadLock && active && lockWanted && document.hasFocus?.()!==false && document.visibilityState!=="hidden";hadLock=false;lockWanted=false;view.zoom=false;
                if(escaped)onEscape?.();
            }
        });
        document.addEventListener('pointerlockerror',()=>{pendingLock=false;lockWanted=false;});
        function look(dx,dy,sensitivity=.0024){if(lookFrozen)return;sensitivity*=view.scoped?.35:1;view.yaw+=dx*sensitivity;view.pitch=Math.max(-1.2,Math.min(1.2,view.pitch-dy*sensitivity));}
        canvas.addEventListener('mousemove',e=>{
            if(!active || !locked())return;
            if(skipMouseMove){skipMouseMove=false;return;}
            if(Number.isFinite(e.movementX)&&Number.isFinite(e.movementY))look(e.movementX,e.movementY);
        });
        canvas.addEventListener('pointermove',e=>{if(active&&e.pointerType!=='mouse'&&touch?.id===e.pointerId){look(e.clientX-touch.x,e.clientY-touch.y,.006);touch.x=e.clientX;touch.y=e.clientY;}});
        canvas.addEventListener('pointerdown',e=>{if(active&&e.pointerType==='touch'&&e.clientX>innerWidth*.42)touch={id:e.pointerId,x:e.clientX,y:e.clientY};});
        for(const type of ['pointerup','pointercancel'])window.addEventListener(type,e=>{if(touch?.id===e.pointerId)touch=null;});
        return {
            view,release,capture,locked,
            setLookFrozen(on){if(lookFrozen===on)return;lookFrozen=on;skipMouseMove=true;},
            setActive(on,pausingForUI=false){
                if(active===on){if(!on && !pausingForUI)resumeAfterUI=false;return;}
                if(!on){
                    const resume=pausingForUI && (locked() || lockWanted);
                    active=false;canvas.classList.remove('fps-looking');release();resumeAfterUI=resume;
                } else {
                    active=true;canvas.classList.add('fps-looking');skipMouseMove=true;
                    const resume=resumeAfterUI;resumeAfterUI=false;if(resume)capture();
                }
            },
            movement(x,y){const sin=Math.sin(view.yaw),cos=Math.cos(view.yaw);return{x:x*cos-y*sin,y:x*sin+y*cos};},
            facing(){return{x:Math.sin(view.yaw),y:-Math.cos(view.yaw)};},
        };
    }
};
