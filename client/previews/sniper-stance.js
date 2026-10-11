"use strict";
// Visual prototype only; not loaded by the game or connected to shooting rules.
window.buildSniperStance = T => {
    const soldier=window.buildSoldier(T);soldier.setWeapon('sniper');
    const find=name=>soldier.root.getObjectByName(name);
    const mixer=new T.AnimationMixer(soldier.root);
    mixer.clipAction(soldier.clips.find(c=>c.name==='Aim')).play();mixer.update(0);mixer.stopAllAction();
    const hips=find('Hips'),spine=find('Spine'),rifle=find('Rifle'),head=find('Head');
    hips.position.set(0,.18,0);hips.rotation.set(Math.PI/2,0,0);
    find('UpperLeg_L').rotation.set(.04,0,-.13);
    find('LowerLeg_L').rotation.set(-.04,0,0);
    find('UpperLeg_R').rotation.set(.03,0,.13);
    find('LowerLeg_R').rotation.set(-.03,0,0);
    spine.rotation.set(-.06,0,0);
    soldier.root.updateMatrixWorld(true);
    const parentRotation=spine.getWorldQuaternion(new T.Quaternion());
    const inverse=parentRotation.clone().invert();
    head.quaternion.copy(inverse);head.rotation.x+=.05;head.position.x=-.045;
    rifle.position.copy(spine.worldToLocal(new T.Vector3(-.045,.19,.76)));
    rifle.quaternion.copy(inverse);rifle.scale.setScalar(.86);
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
    soldier.root.name='SniperPronePrototype';soldier.root.updateMatrixWorld(true);
    soldier.root.position.y-=Math.min(0,new T.Box3().setFromObject(soldier.root).min.y);
    soldier.root.updateMatrixWorld(true);
    return soldier;
};
