"use strict";
// Standalone visual experiment; not connected to gameplay or authoritative shooting.
window.createBreathingPreview = (random=Math.random) => {
    const period=2000,maxRadius=58,normalMin=16,precisionMin=3.5;
    let cycle=0,current=random()<.2,next=random()<.2;
    return {
        period,
        sample(elapsed) {
            const index=Math.floor(Math.max(0,elapsed)/period);
            while(cycle<index){current=next;next=random()<.2;cycle++;}
            const phase=(Math.max(0,elapsed)%period)/period;
            const wave=Math.sin(phase*Math.PI*2);
            const max=maxRadius*(current?1.20:1);
            // Every cycle passes the middle with the same nonzero velocity.
            const baseline=38;
            const radius=baseline+21*wave-wave*wave-(current && wave<0?(normalMin-precisionMin)*wave*wave:0)+(current && wave>0?(max-maxRadius)*wave*wave:0);
            return {cycle,phase,radius,precision:current,warning:current,perfect:current&&radius<=5};
        }
    };
};
