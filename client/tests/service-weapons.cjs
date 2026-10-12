const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),T=require('../vendor/three.min.js');
const context={window:{}};vm.runInNewContext(fs.readFileSync('client/soldier-model.js','utf8'),context);
const model=context.window.buildSoldier(T),muzzle=model.root.getObjectByName('Muzzle');
for(const weapon of ['pistol','shotgun']) {
    model.setWeapon(weapon);
    const group=model.root.getObjectByName(weapon==='pistol'?'DutyPistol':'PumpShotgun');
    group.updateMatrixWorld(true);
    // Inspect geometry in weapon coordinates, independent of the animated parent rig.
    const view=group.clone();view.position.set(0,0,0);view.quaternion.identity();view.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(view),bore=group.userData.bore;
    assert(group.children.length<=6,'Detailed parts are batched into at most six material draws');
    let triangles=0;for(const mesh of group.children){const a=mesh.geometry.attributes;triangles+=mesh.geometry.index.count/3;assert.equal(a.position.count,a.normal.count);assert.equal(a.position.count,a.uv.count);assert([...a.position.array,...a.normal.array].every(Number.isFinite));}
    assert(triangles<18000,'Geometry stays within the per-weapon budget');
    assert(muzzle.position.z>bounds.max.z,'Shared muzzle stays ahead of the physical crown');
    const ray=(origin,direction)=>new T.Raycaster(new T.Vector3(...origin),new T.Vector3(...direction)).intersectObject(view,true);
    assert(!ray([0,.01,bore.front+.1],[0,0,-1]).some(h=>h.point.z>bore.back+.005),'The bore is actually hollow');
    const wall=ray([bore.radius+.004,.01,bore.front+.1],[0,0,-1]);assert(wall.some(h=>h.point.z>bore.front-.02),'The open muzzle retains its metal rim');
    const port=ray([.2,weapon==='pistol'?.033:.028,weapon==='pistol'?.135:.06],[-1,0,0]);
    assert(port.length && port[0].point.x<.01,'The ejection port is recessed through the right wall');
    const rear=ray([0,.01,bounds.min.z-.1],[0,0,1]);assert(rear.length,'The receiver has a closed rear face');
    const normal=ray([.2,0,weapon==='pistol'?.25:.60],[-1,0,0])[0];assert(normal.face.normal.x>0,'Side surface normals point outward');
    assert(group.userData.parts.some(n=>n.includes('TriggerGuard')));
    assert(group.userData.parts.some(n=>n.includes(weapon==='pistol'?'GripCheckering':'PumpGroove')));
    const geometries=group.children.map(m=>m.geometry);let disposed=0;geometries.forEach(g=>g.addEventListener('dispose',()=>disposed++));model.setWeapon('rifle');assert.equal(disposed,geometries.length,'Swaps release each batched geometry');assert.equal(model.root.getObjectByName('Muzzle'),muzzle);
    console.log(weapon+': '+triangles+' triangles, '+geometries.length+' surfaces; open bore, port depth, outward normals and geometry lifetime passed');
}
model.setWeapon('pistol');const mixer=new T.AnimationMixer(model.root);mixer.clipAction(model.clips.find(c=>c.name==='Aim')).play();mixer.update(.2);
const original=model.root.getObjectByName('UpperArm_L').quaternion.clone();model.saveProceduralPose();model.posePistolGrip();model.root.updateMatrixWorld(true);
const hand=model.root.getObjectByName('LowerArm_L').localToWorld(new T.Vector3(0,-.33,0));const target=model.root.getObjectByName('Rifle').localToWorld(new T.Vector3(.035,-.085,-.035));assert(hand.distanceTo(target)<1e-5,'Support hand wraps the pistol grip');model.resetProceduralPose();assert(original.angleTo(model.root.getObjectByName('UpperArm_L').quaternion)<1e-7,'Hand pose restores before switching to a long gun');
assert(model.materials.ServiceSteel.normalMap && model.materials.ServiceSteel.roughnessMap);
assert(model.materials.ServicePolymer.normalMap);assert(model.materials.ServiceWalnut.map);
let disposedTextures=0;const steel=model.materials.ServiceSteel;const maps=new Set([steel.normalMap,steel.roughnessMap,steel.envMap,model.materials.ServicePolymer.normalMap,model.materials.ServiceWalnut.map]);for(const t of maps)t.addEventListener('dispose',()=>disposedTextures++);Object.values(model.materials).forEach(m=>m.dispose());assert.equal(disposedTextures,5,'Actor disposal releases all five shared surface maps once');
console.log('Service weapon materials and two-handed pistol grip passed');
