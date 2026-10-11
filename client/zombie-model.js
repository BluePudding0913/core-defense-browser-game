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
    const body=part(root,.82,.57,.40,coat,0,.83);body.name="ZombieCoat";
    part(root,.64,.18,.38,pants,0,.48);
    for(const side of [-1,1]) {
        part(root,.27,.20,.43,coat,side*.25,.57,.03); // Separate uneven coat tails.
        part(root,.13,.35,.035,"#aab6ad",side*.13,.90,.22);
    }
    part(root,.14,.09,.025,"#c5c9b8",-.23,.98,.23); // Lab ID.
    part(root,.15,.18,.03,"#624e49",.21,.72,.23);   // Muted stain.
    part(root,.045,.35,.028,"#34443e",0,.83,.225);
    part(root,.21,.14,.22,skin,0,1.16);
    const head=new T.Group();head.position.set(0,1.355*radius,.04*radius);head.rotation.z=-.08;root.add(head);
    const skull=new T.Mesh(sphereGeometry,material(skin));skull.scale.set(.29*radius,.23*radius,.25*radius);skull.castShadow=true;head.add(skull);skinParts.push(skull);skull.name="ZombieHead";
    part(head,.37,.16,.32,skin,0,-.13,.06);
    for(const side of [-1,1]) {
        part(head,.12,.075,.04,"#39483e",side*.13,.01,.235);
        part(head,.055,.034,.025,"#ba9e75",side*.13,.005,.263);
        part(head,.14,.065,.022,"#75846d",side*.16,-.075,.23);
    }
    part(head,.06,.10,.07,skin,0,-.045,.27);
    part(head,.22,.045,.025,"#374139",0,-.16,.235);
    const legs=[],arms=[];
    for(const side of [-1,1]) {
        const leg=new T.Group();leg.position.set(side*.22*radius,.49*radius,0);root.add(leg);legs.push(leg);
        part(leg,.23,.40,.25,pants,0,-.22);
        part(leg,.25,.10,.36,boots,0,-.44,.06);
        const arm=new T.Group();arm.position.set(side*.43*radius,1.02*radius,0);root.add(arm);arms.push(arm);
        arm.rotation.x=-.65;arm.rotation.z=-side*.12;
        part(arm,.21,.32,.24,coat,side*.035,-.12);
        part(arm,.15,.25,.17,skin,side*.035,-.36,.04);
        part(arm,.19,.11,.12,skin,side*.035,-.52,.10);
    }
    let lastPoint=null,lastAt=null,phase=0,blend=0;
    function update(point,now,frozen) {
        const dt=lastAt==null?0:Math.max(0,Math.min(.1,(now-lastAt)/1000));
        const distance=lastPoint?Math.hypot(point.x-lastPoint.x,point.y-lastPoint.y):0;
        const walking=distance>.01 && !frozen;
        if(walking)phase+=Math.min(distance*.15,dt*5);
        blend+=((walking?1:0)-blend)*(1-Math.exp(-10*dt));
        legs.forEach((leg,i)=>leg.rotation.x=Math.sin(phase+i*Math.PI)*.32*blend);
        arms.forEach((arm,i)=>arm.rotation.x=-.65+Math.sin(phase+i*Math.PI)*.12*blend);
        head.rotation.z=-.08+Math.sin(phase)*.025*blend;
        for(const mesh of skinParts)mesh.material=material(frozen?"#95dded":skin);
        lastPoint={x:point.x,y:point.y};lastAt=now;
    }
    return {root,body,head,legs,arms,update};
};

