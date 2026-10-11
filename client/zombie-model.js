"use strict";

// A faceted infected lab worker; dimensions keep the existing GRUNT height/head band.
window.buildLabZombie = (T, {box, sphereGeometry, material}, radius) => {
    const root=new T.Group();root.name="LabZombie";
    const skin="#a2b09c",coat="#687a73",pants="#38464a",boots="#252e31",skinParts=[];
    const part=(parent,w,h,d,color,x,y,z=0)=>{
        const mesh=box(parent,w*radius,h*radius,d*radius,color,x*radius,y*radius,z*radius);
        if(color===skin)skinParts.push(mesh);
        return mesh;
    };
    // Roughly 6.5 heads tall: hips at mid-height and long, articulated limbs.
    const body=part(root,.48,.31,.25,coat,0,1.16);body.name="ZombieCoat";
    part(root,.38,.22,.23,coat,0,.90);
    part(root,.35,.14,.23,pants,0,.735);
    for(const side of [-1,1]) {
        part(root,.18,.18,.25,coat,side*.10,.77,.015);
        part(root,.065,.25,.018,"#aab6ad",side*.075,1.13,.135);
    }
    part(root,.075,.055,.018,"#c5c9b8",-.15,1.18,.14);
    part(root,.09,.12,.018,"#624e49",.12,.90,.13);
    part(root,.022,.31,.018,"#34443e",0,1.01,.14);
    part(root,.13,.07,.14,skin,0,1.30,.045);
    const head=new T.Group();head.position.set(0,1.43*radius,.085*radius);head.rotation.z=-.08;root.add(head);
    const skull=new T.Mesh(sphereGeometry,material(skin));skull.scale.set(.108*radius,.12*radius,.105*radius);skull.castShadow=true;head.add(skull);skinParts.push(skull);skull.name="ZombieHead";
    part(head,.145,.075,.145,skin,0,-.085,.018);
    for(const side of [-1,1]) {
        part(head,.052,.032,.022,"#39483e",side*.048,.006,.095);
        part(head,.022,.014,.014,"#ba9e75",side*.048,.003,.111);
        part(head,.055,.030,.015,"#75846d",side*.061,-.043,.092);
    }
    part(head,.026,.047,.037,skin,0,-.025,.113);
    part(head,.080,.018,.018,"#374139",0,-.085,.100);
    const legs=[],arms=[];
    for(const side of [-1,1]) {
        const leg=new T.Group();leg.name=side<0?"ZombieLeftLeg":"ZombieRightLeg";
        leg.position.set(side*.105*radius,.72*radius,0);root.add(leg);legs.push(leg);
        part(leg,.155,.33,.18,pants,0,-.165);
        part(leg,.125,.31,.14,pants,0,-.475,.01);
        part(leg,.16,.10,.25,boots,0,-.67,.055);
        const arm=new T.Group();arm.position.set(side*.285*radius,1.26*radius,0);root.add(arm);arms.push(arm);
        arm.rotation.x=-.32;arm.rotation.z=-side*.06;
        part(arm,.15,.26,.17,coat,0,-.10);
        const forearm=new T.Group();forearm.position.set(0,-.23*radius,0);forearm.rotation.x=-.28;arm.add(forearm);
        part(forearm,.105,.24,.12,skin,0,-.12);
        part(forearm,.12,.10,.09,skin,0,-.285,.018);
    }
    let lastPoint=null,lastAt=null,phase=0,blend=0;
    function update(point,now,frozen) {
        const dt=lastAt==null?0:Math.max(0,Math.min(.1,(now-lastAt)/1000));
        const distance=lastPoint?Math.hypot(point.x-lastPoint.x,point.y-lastPoint.y):0;
        const walking=distance>.01 && !frozen;
        if(walking)phase+=Math.min(distance*.15,dt*5);
        blend+=((walking?1:0)-blend)*(1-Math.exp(-10*dt));
        legs.forEach((leg,i)=>leg.rotation.x=Math.sin(phase+i*Math.PI)*.32*blend);
        arms.forEach((arm,i)=>arm.rotation.x=-.32+Math.sin(phase+i*Math.PI)*.12*blend);
        head.rotation.z=-.08+Math.sin(phase)*.025*blend;
        for(const mesh of skinParts)mesh.material=material(frozen?"#95dded":skin);
        lastPoint={x:point.x,y:point.y};lastAt=now;
    }
    return {root,body,head,legs,arms,update};
};
