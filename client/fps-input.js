"use strict";
window.FPSInput = {
    create(canvas) {
        const view={yaw:0,pitch:0,zoom:false};
        let active=false,touch=null,skipMouseMove=true,lookFrozen=false;
        function release(){canvas.classList.remove('fps-looking');active=false;view.zoom=false;touch=null;skipMouseMove=true;}
        function look(dx,dy,sensitivity=.0024){if(lookFrozen)return;sensitivity*=view.scoped?.35:1;view.yaw+=dx*sensitivity;view.pitch=Math.max(-1.2,Math.min(1.2,view.pitch-dy*sensitivity));}
        canvas.addEventListener('mousemove',e=>{
            if(!active)return;
            if(skipMouseMove){skipMouseMove=false;return;}
            if(Number.isFinite(e.movementX)&&Number.isFinite(e.movementY))look(e.movementX,e.movementY);
        });
        for(const type of ['mouseenter','mouseleave'])canvas.addEventListener(type,()=>{skipMouseMove=true;});
        canvas.addEventListener('pointermove',e=>{if(active&&e.pointerType!=='mouse'&&touch?.id===e.pointerId){look(e.clientX-touch.x,e.clientY-touch.y,.006);touch.x=e.clientX;touch.y=e.clientY;}});
        canvas.addEventListener('pointerdown',e=>{if(active&&e.pointerType==='touch'&&e.clientX>innerWidth*.42)touch={id:e.pointerId,x:e.clientX,y:e.clientY};});
        for(const type of ['pointerup','pointercancel'])window.addEventListener(type,e=>{if(touch?.id===e.pointerId)touch=null;});
        return {
            view,release,
            setLookFrozen(on){if(lookFrozen===on)return;lookFrozen=on;skipMouseMove=true;},
            setActive(on){if(active===on)return;if(!on)release();else{canvas.classList.add('fps-looking');active=true;skipMouseMove=true;}},
            movement(x,y){const sin=Math.sin(view.yaw),cos=Math.cos(view.yaw);return{x:x*cos-y*sin,y:x*sin+y*cos};},
            facing(){return{x:Math.sin(view.yaw),y:-Math.cos(view.yaw)};},
        };
    }
};
