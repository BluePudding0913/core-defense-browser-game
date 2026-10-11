"use strict";
// Standalone visual experiment; not connected to gameplay or authoritative shooting.
window.createBreathingPreview = (random=Math.random) => {
    const period=2800,maxRadius=58,normalMin=16,precisionMin=3.5;
    let cycle=0,current=random()<.2,next=random()<.2;
    return {
        period,
        sample(elapsed) {
            const index=Math.floor(Math.max(0,elapsed)/period);
            while(cycle<index){current=next;next=random()<.2;cycle++;}
            const phase=(Math.max(0,elapsed)%period)/period;
            const wave=Math.sin(phase*Math.PI*2);
            const min=current?precisionMin:normalMin;
            const max=maxRadius*(next?1.03:1);
            // Every cycle meets at the same radius with zero velocity, even when its type changes.
            const baseline=38;
            const radius=baseline+(wave>=0?max-baseline:baseline-min)*wave*Math.abs(wave);
            return {cycle,phase,radius,precision:current,warning:next,perfect:current&&radius<=5};
        }
    };
};
