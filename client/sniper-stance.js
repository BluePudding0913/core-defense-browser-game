"use strict";
window.applySniperStance=(T,soldier,pitch=0)=>{
    const find=name=>soldier.root.getObjectByName(name);
    const hips=find('Hips'),spine=find('Spine'),rifle=find('Rifle'),head=find('Head');
    hips.position.set(0,.18,0);hips.rotation.set(Math.PI/2,0,0);
    find('UpperLeg_L').rotation.set(.04,0,.16);
    find('LowerLeg_L').rotation.set(-.04,0,0);
    find('UpperLeg_R').rotation.set(.03,0,-.16);
    find('LowerLeg_R').rotation.set(-.03,0,0);
    spine.rotation.set(-.06,0,0);
    soldier.root.updateMatrixWorld(true);
    const parentRotation=hips.quaternion.clone().multiply(spine.quaternion);
    const inverse=parentRotation.clone().invert();
    head.quaternion.copy(inverse).multiply(new T.Quaternion().setFromEuler(new T.Euler(-pitch+.05,0,0)));head.position.x=-.045;
    rifle.position.copy(new T.Vector3(-.045,.19,.76).sub(hips.position).applyQuaternion(hips.quaternion.clone().invert()).sub(spine.position).applyQuaternion(spine.quaternion.clone().invert()));
    rifle.quaternion.copy(inverse).multiply(new T.Quaternion().setFromEuler(new T.Euler(-pitch,0,0)));rifle.scale.setScalar(.86);
    // Solve the hands against the actual rifle grip nodes, preserving limb lengths.
    const down=new T.Vector3(0,-1,0);
    for(const [side,grip,pole] of [
        ['R',new T.Vector3(0,-.065,-.02),new T.Vector3(-1,-.8,-.1)],
        ['L',new T.Vector3(0,-.055,.32),new T.Vector3(.25,-1,0)]
    ]) {
        const upper=find('UpperArm_'+side),lower=find('LowerArm_'+side);
        const target=grip.multiplyScalar(.86).applyQuaternion(rifle.quaternion).add(rifle.position);
        const direction=target.clone().sub(upper.position).normalize();
        const distance=Math.min(target.distanceTo(upper.position),.639);
        const angle=Math.acos(T.MathUtils.clamp((.31*.31+distance*distance-.33*.33)/(2*.31*distance),-1,1));
        pole.set(side==='R'?-1:.2,side==='R'?-.10:-1,0).applyQuaternion(inverse);
        const bend=pole.sub(direction.clone().multiplyScalar(pole.dot(direction))).normalize();
        const elbow=upper.position.clone().addScaledVector(direction,.31*Math.cos(angle)).addScaledVector(bend,.31*Math.sin(angle));
        upper.quaternion.setFromUnitVectors(down,elbow.clone().sub(upper.position).normalize());
        lower.quaternion.setFromUnitVectors(down,target.sub(elbow).normalize().applyQuaternion(upper.quaternion.clone().invert()));
    }
    soldier.root.position.y=.023;
};
