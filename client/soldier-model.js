"use strict";
function buildSoldier(THREE) {
  const V = THREE.Vector3, Q = THREE.Quaternion, E = THREE.Euler;

  const COLORS = {
    Olive: 0x4c5030, OliveDark: 0x343722, OliveLight: 0x62673d, Skin: 0xd99a72,
    Purple: 0x974be0, PurpleLight: 0xd5b2fa, Wood: 0x967352, Cyan: 0x66dfff, Green: 0x86d85e, Red: 0xed655f, Boot: 0x2b2a24, Gun: 0x26282a, GunLight: 0x3e4245, Eye: 0x1c1a16,
  };
  const mats = {};
  const mat = (k) => mats[k] || (mats[k] = new THREE.MeshStandardMaterial({
    name: k, color: COLORS[k], roughness: k.startsWith('Gun') ? 0.55 : 0.9,
    metalness: k.startsWith('Gun') ? 0.35 : 0, flatShading: true,
  }));
  const node = (name, parent, x = 0, y = 0, z = 0) => {
    const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); parent.add(o); return o;
  };
  const box = (parent, w, h, d, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(m));
    mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true; parent.add(mesh); return mesh;
  };
  const cyl = (parent, rt, rb, h, seg, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(m));
    mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true; parent.add(mesh); return mesh;
  };

  // ---------- skeleton (node hierarchy) ----------
  const root = new THREE.Object3D(); root.name = 'Soldier';
  const HIP_Y = 0.92;
  const hips = node('Hips', root, 0, HIP_Y, 0);
  box(hips, 0.36, 0.2, 0.25, 'Olive', 0, 0, 0);
  box(hips, 0.38, 0.06, 0.27, 'OliveDark', 0, 0.07, 0); // belt
  box(hips, 0.1, 0.1, 0.06, 'OliveLight', 0.13, 0.0, -0.14); // butt pouch

  const UPPER_LEG = 0.42, LOWER_LEG = 0.4;
  const legs = {};
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const thigh = node('UpperLeg_' + side, hips, 0.1 * sx, -0.06, 0);
    box(thigh, 0.16, UPPER_LEG, 0.18, 'Olive', 0, -UPPER_LEG / 2, 0);
    box(thigh, 0.05, 0.14, 0.12, 'OliveDark', 0.09 * sx, -0.2, 0); // thigh pocket
    const shin = node('LowerLeg_' + side, thigh, 0, -UPPER_LEG, 0);
    box(shin, 0.14, LOWER_LEG - 0.06, 0.15, 'Olive', 0, -(LOWER_LEG - 0.06) / 2, 0);
    box(shin, 0.15, 0.11, 0.05, 'OliveDark', 0, -0.03, 0.08); // knee pad
    box(shin, 0.16, 0.12, 0.27, 'Boot', 0, -LOWER_LEG + 0.02, 0.04); // boot
    legs[side] = { thigh, shin };
  }

  const spine = node('Spine', hips, 0, 0.08, 0);
  box(spine, 0.46, 0.5, 0.28, 'Olive', 0, 0.27, 0); // torso
  box(spine, 0.48, 0.34, 0.33, 'OliveDark', 0, 0.3, 0); // plate carrier
  for (const x of [-0.13, 0, 0.13]) box(spine, 0.1, 0.12, 0.06, 'OliveLight', x, 0.21, 0.18); // mag pouches
  box(spine, 0.14, 0.08, 0.04, 'OliveLight', 0.1, 0.38, 0.175); // radio pouch
  // backpack
  box(spine, 0.42, 0.44, 0.2, 'OliveDark', 0, 0.3, -0.25);
  box(spine, 0.38, 0.12, 0.22, 'Olive', 0, 0.49, -0.25); // flap
  box(spine, 0.3, 0.14, 0.05, 'OliveLight', 0, 0.2, -0.37); // front pocket
  for (const sx of [-1, 1]) box(spine, 0.06, 0.24, 0.14, 'Olive', 0.23 * sx, 0.24, -0.25); // side pockets
  cyl(spine, 0.06, 0.06, 0.4, 8, 'OliveLight', 0, 0.58, -0.27, 0, 0, Math.PI / 2); // bedroll

  const head = node('Head', spine, 0, 0.54, 0.02);
  box(head, 0.12, 0.08, 0.12, 'Skin', 0, 0.03, 0); // neck
  box(head, 0.24, 0.25, 0.25, 'Skin', 0, 0.15, 0.01);
  box(head, 0.03, 0.025, 0.01, 'Eye', 0.055, 0.17, 0.14);
  box(head, 0.03, 0.025, 0.01, 'Eye', -0.055, 0.17, 0.14);
  box(head, 0.2, 0.02, 0.02, 'OliveDark', 0, 0.05, 0.12); // chin strap
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('Olive'));
  helmet.position.set(0, 0.2, 0); helmet.scale.set(1, 0.85, 1.1); helmet.castShadow = true; head.add(helmet);
  cyl(head, 0.205, 0.215, 0.05, 12, 'OliveDark', 0, 0.2, 0, 0, 0, 0).scale.set(1, 1, 1.1); // brim

  const UPPER_ARM = 0.31, LOWER_ARM = 0.33; // lower arm measured to hand centre
  const arms = {};
  const shoulderPos = {};
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    shoulderPos[side] = new V(0.3 * sx, 0.46, 0);
    const up = node('UpperArm_' + side, spine, shoulderPos[side].x, shoulderPos[side].y, 0);
    box(up, 0.18, 0.14, 0.19, 'Olive', 0, -0.03, 0); // shoulder
    box(up, 0.14, UPPER_ARM, 0.15, 'Olive', 0, -UPPER_ARM / 2, 0);
    const lo = node('LowerArm_' + side, up, 0, -UPPER_ARM, 0);
    box(lo, 0.13, LOWER_ARM - 0.06, 0.14, 'Olive', 0, -(LOWER_ARM - 0.06) / 2, 0);
    box(lo, 0.14, 0.05, 0.15, 'OliveDark', 0, -0.2, 0); // sleeve cuff
    box(lo, 0.1, 0.11, 0.11, 'Skin', 0, -LOWER_ARM, 0); // hand
    arms[side] = { up, lo };
  }

  // Keep the animated grip and muzzle nodes stable when changing weapon geometry.
  const rifle = node('Rifle', spine), muzzle = node('Muzzle', rifle);
  let currentWeapon;
  function setWeapon(weapon) {
    if(currentWeapon===weapon)return;
    currentWeapon=weapon;rifle.userData.weapon=weapon;
    for(const child of [...rifle.children])if(child!==muzzle){child.traverse(o=>o.geometry?.dispose());rifle.remove(child);}
    const part=(w,h,d,m='Gun',x=0,y=0,z=0)=>box(rifle,w,h,d,m,x,y,z);
    const tube=(r,length,m='Gun',x=0,y=0,z=0)=>cyl(rifle,r,r,length,10,m,x,y,z,Math.PI/2);
    let tip=.76;
    if(weapon==='bat' || weapon==='plasmaBlade') {
      tip=.9;part(.055,.055,.25,'Gun',0,0,.05);
      if(weapon==='bat'){tube(.055,.65,'Wood',0,0,.54);part(.12,.025,.025,'GunLight',0,0,.18);}
      else {part(.2,.035,.04,'GunLight',0,0,.18);part(.07,.025,.66,'Cyan',0,0,.55);}
    } else if(weapon==='pistol' || weapon==='revolver') {
      tip=weapon==='pistol'?.32:.44;
      part(.075,.09,tip,'GunLight',0,0,tip/2);part(.06,.16,.08,'Gun',0,-.1,.02);
      if(weapon==='revolver')tube(.07,.1,'GunLight',0,-.03,.13);else part(.07,.02,.03,'Gun',0,.06,.05);
      tube(.025,.06,'Gun',0,0,tip-.015);
    } else if(weapon==='poisonGas') {
      tip=.12;
      cyl(rifle,.10,.10,.28,12,'Purple',0,-.01,.12).name='BottleBody';
      cyl(rifle,.045,.10,.08,12,'Purple',0,.17,.12);
      cyl(rifle,.045,.045,.10,12,'PurpleLight',0,.25,.12);
      cyl(rifle,.055,.055,.05,12,'Gun',0,.325,.12).name='BottleCap';
      part(.11,.08,.015,'PurpleLight',0,-.01,.018);
    } else if(weapon==='repulsor') {
      tip=.32;
      part(.16,.075,.34,'GunLight',0,0,.12).name='RemoteBody';
      part(.11,.012,.10,'Cyan',0,.044,.21).name='RemoteScreen';
      cyl(rifle,.03,.03,.015,10,'Red',0,.05,.07);
      for(const x of [-.04,.04])part(.03,.012,.03,'Gun',x,.045,-.005);
      cyl(rifle,.012,.012,.18,8,'Gun',.055,.12,.27).name='RemoteAntenna';
    } else if(weapon==='sniper') {
      tip=buildPrecisionSniper(THREE,rifle,mats);
    } else if(weapon==='rocket') {
      tip=.82;tube(.085,.8,'GunLight',0,.03,.4);tube(.1,.055,'Olive',0,.03,.78);
      part(.06,.18,.08,'Gun',0,-.12,.08);part(.04,.1,.08,'Gun',0,.14,.4);
    } else {
      const compact=['smg','hook','repulsor','freezeGun'].includes(weapon);
      const heavy=['lmg','railgun','laserCannon','flamethrower','poisonGas'].includes(weapon);
      tip=compact?.55:.78;
      part(heavy?.13:.08,.12,compact?.3:.42,'GunLight',0,0,.12);
      part(.06,.14,.07,'Gun',0,-.1,-.02);
      if(!compact) {part(.07,.09,.22,'Gun',0,-.01,-.21);part(.1,.15,.035,'GunLight',0,-.02,-.33);}
      const accent={railgun:'Cyan',laserCannon:'Red',freezeGun:'Cyan',poisonGas:'Green',repulsor:'Cyan'}[weapon] || 'GunLight';
      part(heavy?.14:.075,.08,tip-.3,accent,0,0,(tip+.2)/2);
      tube(heavy?.04:.022,.14,'Gun',0,.01,tip-.07);
      part(weapon==='lmg'?.2:.055,weapon==='lmg'?.18:.16,.09,'Gun',0,-.13,.14);
      if(weapon==='rifle'){tube(.035,.13,'Gun',0,.12,.15);part(.04,.06,.04,'Gun',0,.065,.15);}
      if(weapon==='shotgun')tube(.025,.4,'Wood',0,-.065,.46);
      if(weapon==='railgun')for(const x of [-.09,.09])part(.035,.055,.58,'Gun',x,0,.48);
      if(weapon==='flamethrower' || weapon==='poisonGas')tube(.09,.22,weapon==='poisonGas'?'Green':'Red',.13,-.08,.12);
      if(weapon==='hook')for(const x of [-.09,.09])part(.035,.035,.18,'GunLight',x,0,.48);
      if(weapon==='ricochet')part(.08,.035,.17,'Wood',0,.08,.17);
      if(weapon==='freezeGun')part(.15,.055,.14,'Cyan',0,.09,.2);
    }
    muzzle.position.set(0,.01,tip+.025);
    rifle.traverse(o=>{if(o.isMesh)o.castShadow=false;});
  }
  setWeapon('rifle');
  const GRIP_R = new V(0, -0.065, -0.02);
  const GRIP_L = new V(0, -0.055, 0.32);

  // ---------- pose helpers ----------
  const qe = (x, y, z) => new Q().setFromEuler(new E(x, y, z, 'YXZ'));
  const SPINE_POS = spine.position.clone();
  const DOWN = new V(0, -1, 0);

  function solveArm(S, T, pole, a, b) {
    const v = T.clone().sub(S);
    let d = v.length();
    const dir = v.clone().normalize();
    d = Math.min(Math.max(d, Math.abs(a - b) + 1e-3), (a + b) * 0.999);
    const A = Math.acos(Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))));
    const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const elbow = S.clone().add(dir.clone().multiplyScalar(a * Math.cos(A))).add(p.multiplyScalar(a * Math.sin(A)));
    const hand = S.clone().add(dir.clone().multiplyScalar(d));
    const uq = new Q().setFromUnitVectors(DOWN, elbow.clone().sub(S).normalize());
    const ld = hand.sub(elbow).normalize().applyQuaternion(uq.clone().invert());
    return [uq, new Q().setFromUnitVectors(DOWN, ld)];
  }

  // u = upper-body description in root-oriented space (relative to hips origin)
  function upperBody(out, hipsYaw, u) {
    const hipsInv = qe(0, -hipsYaw, 0);
    const spineQ = qe(u.spinePitch || 0, u.spineYaw - hipsYaw, 0);
    const spineInv = spineQ.clone().invert();
    const rp = u.riflePos.clone().applyQuaternion(hipsInv).sub(SPINE_POS).applyQuaternion(spineInv);
    const rq = spineInv.clone().multiply(hipsInv).multiply(qe(u.riflePitch, u.rifleYaw, u.rifleRoll || 0));
    out.Spine = { q: spineQ };
    out.Rifle = { p: rp, q: rq };
    out.Head = { q: qe(u.headPitch || 0, u.headYaw || 0, 0) };
    const gR = GRIP_R.clone().applyQuaternion(rq).add(rp);
    const gL = GRIP_L.clone().applyQuaternion(rq).add(rp);
    const [rU, rL] = solveArm(shoulderPos.R, gR, u.poleR, UPPER_ARM, LOWER_ARM);
    const [lU, lL] = solveArm(shoulderPos.L, gL, u.poleL, UPPER_ARM, LOWER_ARM);
    out.UpperArm_R = { q: rU }; out.LowerArm_R = { q: rL };
    out.UpperArm_L = { q: lU }; out.LowerArm_L = { q: lL };
  }

  // hips height so the lower foot touches the ground
  const legH = (t, k) => 0.06 + UPPER_LEG * Math.cos(t) + LOWER_LEG * Math.cos(t + k);
  const groundHips = (tL, kL, tR, kR) => HIP_Y - (legH(0, 0) - Math.max(legH(tL, kL), legH(tR, kR)));
  function legsPose(out, tL, kL, tR, kR, splay = 0.04) {
    out.UpperLeg_L = { q: qe(tL, 0, splay) }; out.LowerLeg_L = { q: qe(kL, 0, 0) };
    out.UpperLeg_R = { q: qe(tR, 0, -splay) }; out.LowerLeg_R = { q: qe(kR, 0, 0) };
  }

  const TAU = Math.PI * 2;
  const lowReady = (dy = 0, dyaw = 0) => ({
    spineYaw: -0.15 + dyaw, spinePitch: 0.04,
    riflePos: new V(-0.12, 0.33 + dy, 0.25), riflePitch: 0.38, rifleYaw: 0.62 + dyaw, rifleRoll: -0.15,
    headYaw: 0.12, headPitch: 0.06,
    poleR: new V(-1, -0.7, -0.3), poleL: new V(0.7, -1, 0.1),
  });
  const aimed = (dy = 0, dx = 0) => ({
    spineYaw: -0.45, spinePitch: 0.06,
    riflePos: new V(-0.1 + dx, 0.53 + dy, 0.36), riflePitch: 0, rifleYaw: 0, rifleRoll: 0,
    headYaw: 0.42, headPitch: 0.1,
    poleR: new V(-1, -0.9, -0.2), poleL: new V(0.4, -1, 0),
  });

  const poses = {
    Idle: { duration: 3.2, fn(ph) {
      const b = Math.sin(TAU * ph);
      const o = { Hips: { p: new V(0, HIP_Y - 0.01 + 0.005 * b, 0), q: qe(0, 0, 0) } };
      legsPose(o, -0.02, 0.05, 0.03, 0.05, 0.06);
      const u = lowReady(0.01 * b, 0.02 * Math.sin(TAU * ph + 1));
      u.spinePitch += 0.015 * b;
      upperBody(o, 0, u);
      return o;
    } },
    Walk: { duration: 1.0, fn(ph) {
      const s = Math.sin(TAU * ph), c = Math.cos(TAU * ph);
      const hipsYaw = 0.08 * s;
      const L = [-0.5 * s, 0.12 + 0.85 * Math.max(0, c), 0.5 * s, 0.12 + 0.85 * Math.max(0, -c)];
      const o = { Hips: { p: new V(0, groundHips(...L), 0), q: qe(0, hipsYaw, 0) } };
      legsPose(o, ...L);
      const u = lowReady(0.015 * Math.abs(c), -0.06 * s);
      u.spinePitch = 0.1;
      upperBody(o, hipsYaw, u);
      return o;
    } },
    Aim: { duration: 2.4, fn(ph) {
      const b = Math.sin(TAU * ph);
      const L = [-0.22, 0.28, 0.2, 0.22];
      const o = { Hips: { p: new V(0, groundHips(...L) + 0.004 * b, 0), q: qe(0, -0.25, 0) } };
      legsPose(o, ...L, 0.08);
      upperBody(o, -0.25, aimed(0.004 * b, 0.003 * Math.sin(TAU * ph * 2)));
      return o;
    } },
    AimWalk: { duration: 1.0, fn(ph) {
      const s = Math.sin(TAU * ph), c = Math.cos(TAU * ph);
      const hipsYaw = 0.05 * s;
      const L = [-0.38 * s - 0.08, 0.3 + 0.7 * Math.max(0, c), 0.38 * s - 0.08, 0.3 + 0.7 * Math.max(0, -c)];
      const o = { Hips: { p: new V(0, groundHips(...L), 0), q: qe(0, hipsYaw, 0) } };
      legsPose(o, ...L);
      upperBody(o, hipsYaw, aimed(0.006 * Math.abs(c), 0));
      return o;
    } },
  };

  // ---------- bake to AnimationClips ----------
  const clips = [];
  for (const [name, def] of Object.entries(poses)) {
    const n = Math.round(def.duration * 30);
    const times = [];
    const tracks = {};
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * def.duration;
      times.push(t);
      const pose = def.fn((i % n) / n);
      for (const [nodeName, tr] of Object.entries(pose)) {
        if (tr.q) (tracks[nodeName + '.quaternion'] ||= []).push(...tr.q.toArray());
        if (tr.p) (tracks[nodeName + '.position'] ||= []).push(...tr.p.toArray());
      }
    }
    const kt = Object.entries(tracks).map(([path, vals]) =>
      path.endsWith('quaternion')
        ? new THREE.QuaternionKeyframeTrack(path, times, vals)
        : new THREE.VectorKeyframeTrack(path, times, vals));
    clips.push(new THREE.AnimationClip(name, def.duration, kt));
  }

  // apply Idle frame 0 as rest pose
  const rest = poses.Idle.fn(0);
  root.traverse((o) => {
    const r = rest[o.name];
    if (!r) return;
    if (r.q) o.quaternion.copy(r.q);
    if (r.p) o.position.copy(r.p);
  });

  return { root, clips, materials: mats, setWeapon };
}

window.buildSoldier = buildSoldier;

// A purpose-built precision rifle. Units and +Z bore axis match the shared grip rig.
function buildPrecisionSniper(T, parent, materials) {
  const group=new T.Group();group.name='PrecisionSniper';parent.add(group);
  if(!materials.SniperSteel) {
    // Deterministic micro-surface maps avoid external assets and repeated downloads.
    const size=128,rough=new Uint8Array(size*size*4),normal=new Uint8Array(size*size*4);
    let seed=417;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const i=(y*size+x)*4,n=(seed>>>24)/255;
      const brushed=Math.sin(y*1.71)*.45+n*.55;
      rough[i]=rough[i+1]=rough[i+2]=Math.round(155+brushed*55);rough[i+3]=255;
      normal[i]=128;normal[i+1]=Math.round(128+(brushed-.5)*18);normal[i+2]=255;normal[i+3]=255;
    }
    const texture=data=>{const t=new T.DataTexture(data,size,size,T.RGBAFormat);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(3,5);t.needsUpdate=true;return t;};
    const roughnessMap=texture(rough),normalMap=texture(normal);
    // Soft studio reflections belong only to this weapon, preserving the lab lighting.
    const ew=128,eh=64,pixels=new Uint8Array(ew*eh*4);
    for(let y=0;y<eh;y++)for(let x=0;x<ew;x++){
      const u=x/ew,v=y/eh;
      const soft=(cx,cy,wx,wy)=>Math.exp(-(((u-cx)/wx)**6)-(((v-cy)/wy)**6));
      const cool=soft(.20,.35,.055,.19),warm=soft(.70,.42,.11,.075);
      const top=Math.max(0,1-v)*22,i=(y*ew+x)*4;
      pixels[i]=Math.min(255,12+top+cool*150+warm*210);
      pixels[i+1]=Math.min(255,15+top+cool*185+warm*190);
      pixels[i+2]=Math.min(255,20+top+cool*220+warm*155);pixels[i+3]=255;
    }
    const environment=new T.DataTexture(pixels,ew,eh,T.RGBAFormat);
    environment.mapping=T.EquirectangularReflectionMapping;environment.encoding=T.sRGBEncoding;environment.needsUpdate=true;
    const configs={
      Steel:{color:0x303940,metalness:.88,roughness:.32,envMapIntensity:.65},
      Edge:{color:0x737d83,metalness:.92,roughness:.26,envMapIntensity:.75},
      Black:{color:0x141a20,metalness:.60,roughness:.44,envMapIntensity:.45},
      Sand:{color:0x80765b,metalness:.25,roughness:.64,envMapIntensity:.35},
      Rubber:{color:0x17191a,metalness:0,roughness:.94,envMapIntensity:.12},
      Glass:{color:0x183f50,metalness:.72,roughness:.085,envMapIntensity:1.35},
      Mark:{color:0xb4b6ac,metalness:.12,roughness:.65,envMapIntensity:.2},
    };
    for(const [name,config] of Object.entries(configs)){
      const m=new T.MeshStandardMaterial({name:'Sniper'+name,...config,envMap:environment});
      if(name!=='Glass' && name!=='Mark'){
        m.roughnessMap=roughnessMap;m.normalMap=normalMap;
        m.normalScale=new T.Vector2(name==='Rubber'?.11:.035,name==='Rubber'?.11:.035);
      }
      materials['Sniper'+name]=m;
    }
    materials.SniperSteel.addEventListener('dispose',()=>{roughnessMap.dispose();normalMap.dispose();environment.dispose();});
  }
  const mesh=(name,geo,material,x=0,y=0,z=0)=>{
    const o=new T.Mesh(geo,materials['Sniper'+material]);o.name=name;o.position.set(x,y,z);group.add(o);return o;
  };
  const box=(name,w,h,d,m,x=0,y=0,z=0)=>mesh(name,new T.BoxGeometry(w,h,d),m,x,y,z);
  const tube=(name,r,length,m,x=0,y=0,z=0,r2=r)=>{
    const o=mesh(name,new T.CylinderGeometry(r2,r,length,32,1),m,x,y,z);o.rotation.x=Math.PI/2;return o;
  };
  const ring=(name,r,thickness,m,x,y,z)=>{
    const o=mesh(name,new T.TorusGeometry(r,thickness,8,32),m,x,y,z);return o;
  };
  // Side-profile extrusion gives the stock, chassis and grip continuous beveled edges.
  const profile=(name,points,width,m)=>{
    const shape=new T.Shape();points.forEach(([z,y],i)=>i?shape.lineTo(z,y):shape.moveTo(z,y));shape.closePath();
    const geo=new T.ExtrudeGeometry(shape,{depth:width,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.004,bevelThickness:.004});
    geo.rotateY(-Math.PI/2);geo.translate(width/2,0,0);
    return mesh(name,geo,m);
  };
  profile('Chassis',[[-.13,.028],[.34,.028],[.39,-.028],[.31,-.082],[.01,-.084],[-.07,-.045],[-.13,-.045]],.084,'Sand');
  tube('Receiver',.047,.35,'Steel',0,.034,.095);
  box('EjectionPort',.006,.029,.105,'Black',-.048,.048,.13);
  box('BoltInsidePort',.007,.012,.082,'Edge',-.052,.045,.13);
  tube('BoltShroud',.035,.055,'Black',0,.037,-.105);
  tube('BarrelCollar',.047,.065,'Black',0,.024,.31);
  tube('FreeFloatingBarrel',.022,.78,'Steel',0,.01,.725,.026);
  // Longitudinal flutes leave the cylindrical barrel silhouette intact.
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4;
    const flute=box('BarrelFlute',.007,.003,.36,'Black',Math.sin(a)*.023,.01+Math.cos(a)*.023,.90);
    flute.rotation.z=-a;
  }
  profile('Handguard',[[.30,.025],[.73,.025],[.75,-.015],[.70,-.065],[.34,-.065],[.30,-.043]],.088,'Sand');
  for(const side of [-1,1]){
    for(let i=0;i<6;i++){
      // Inset slot plus a thin inner edge suggests a machined, recessed vent.
      box('VentRim',.003,.022,.041,'Steel',side*.047,-.023,.37+i*.059);
      box('VentRecess',.004,.013,.032,'Black',side*.049,-.023,.37+i*.059);
    }
    box('ForeEndEdge',.006,.006,.35,'Edge',side*.046,-.050,.52);
  }
  box('ReceiverRail',.072,.014,.39,'Black',0,.091,.11);
  for(let i=0;i<19;i++)box('RailTooth',.080,.009,.012,'Steel',0,.101,-.065+i*.020);
  // Adjustable skeleton stock, cheek rest and a grooved rubber recoil pad.
  tube('StockSpine',.019,.27,'Black',0,-.012,-.26);
  profile('SkeletonStock',[[-.14,-.012],[-.45,.002],[-.49,-.025],[-.49,-.14],[-.43,-.14],[-.40,-.074],[-.22,-.061]],.065,'Sand');
  box('CheekRest',.086,.037,.22,'Sand',0,.043,-.33);
  box('CheekRestTop',.080,.010,.20,'Rubber',0,.065,-.33);
  for(const z of [-.39,-.26])tube('CheekRiser',.008,.049,'Edge',0,.017,z).rotation.x=0;
  profile('ButtPad',[[-.50,.025],[-.525,.022],[-.535,-.145],[-.502,-.15]],.090,'Rubber');
  for(let i=0;i<9;i++)box('ButtPadGroove',.087,.004,.004,'Black',0,.01-i*.017,-.532);
  profile('PistolGrip',[[-.065,-.060],[.005,-.064],[-.013,-.206],[-.085,-.193],[-.107,-.17]],.057,'Rubber');
  for(const side of [-1,1])for(let i=0;i<8;i++){
    const rib=box('GripTexture',.003,.006,.049,'Black',side*.032,-.100-i*.011,-.047-i*.002);
    rib.rotation.x=-.12;
  }
  // A hollow trigger guard and curved trigger, rather than a solid block.
  const guardPoints=[[-.04,-.073],[.075,-.073],[.082,-.12],[.065,-.14],[-.01,-.14],[-.04,-.073]].map(([z,y])=>new T.Vector3(0,y,z));
  mesh('TriggerGuard',new T.TubeGeometry(new T.CatmullRomCurve3(guardPoints),24,.007,8,false),'Black');
  const triggerPoints=[[.025,-.073],[.018,-.10],[.027,-.12]].map(([z,y])=>new T.Vector3(0,y,z));
  mesh('Trigger',new T.TubeGeometry(new T.CatmullRomCurve3(triggerPoints),12,.004,8,false),'Edge');
  profile('Magazine',[[.105,-.08],[.22,-.08],[.21,-.19],[.11,-.187]],.062,'Black');
  box('MagazineBase',.073,.014,.115,'Rubber',0,-.191,.16);
  for(const side of [-1,1])for(let i=0;i<3;i++)box('MagazineStamp',.003,.063,.005,'Steel',side*.034,-.14,.127+i*.028);
  // Bolt handle sits on the right-hand side and has a turned, knurled knob.
  const bolt=tube('BoltHandle',.010,.079,'Edge',-.076,.020,-.065);bolt.rotation.set(0,0,-1.12);
  mesh('BoltKnob',new T.SphereGeometry(.022,20,12),'Black',-.113,.001,-.065).scale.set(1,1.15,1);
  for(let i=0;i<5;i++)ring('BoltKnurl',.018,.0015,'Edge',-.113,-.012+i*.006,-.065).rotation.x=Math.PI/2;
  // Scope mounts leave a visible air gap above the receiver rail.
  for(const z of [-.012,.24]){
    box('ScopeFoot',.085,.015,.047,'Black',0,.117,z);
    box('ScopeMount',.033,.036,.035,'Steel',0,.139,z);
    ring('ScopeRing',.041,.009,'Black',0,.182,z);
    box('ScopeRingCap',.060,.008,.035,'Steel',0,.226,z);
  }
  tube('ScopeTube',.035,.39,'Black',0,.182,.10);
  tube('OcularHousing',.048,.11,'Black',0,.182,-.135,.042);
  tube('ObjectiveBell',.040,.12,'Black',0,.182,.35,.068);
  tube('ObjectiveHood',.068,.075,'Black',0,.182,.445);
  tube('LensRecess',.061,.012,'Rubber',0,.182,.478);
  const frontLens=mesh('ObjectiveLens',new T.SphereGeometry(.057,32,16),'Glass',0,.182,.480);frontLens.scale.z=.08;
  const eyeLens=mesh('EyepieceGlass',new T.SphereGeometry(.039,32,16),'Glass',0,.182,-.192);eyeLens.scale.z=.12;
  ring('Eyecup',.045,.006,'Rubber',0,.182,-.194);
  for(let i=0;i<9;i++)ring('FocusRingGroove',.045,.002,'Steel',0,.182,-.16+i*.005);
  for(let i=0;i<7;i++)ring('ObjectiveGrip',.066,.0015,'Steel',0,.182,.417+i*.006);
  const turret=tube('ElevationTurret',.026,.052,'Black',0,.235,.12);turret.rotation.x=0;
  const turretTop=tube('ElevationCap',.030,.012,'Steel',0,.265,.12);turretTop.rotation.x=0;
  const sideTurret=tube('WindageTurret',.024,.052,'Black',-.057,.182,.12);sideTurret.rotation.set(0,0,Math.PI/2);
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8;
    const tick=box('TurretGraduation',.002,.002,.008,'Mark',Math.sin(a)*.025,.272,.12+Math.cos(a)*.025);
    tick.rotation.y=a;
  }
  box('ScopeIndex',.005,.002,.014,'Mark',0,.220,.174);
  // Open-bore muzzle brake with three recessed side ports and a visible crown.
  tube('MuzzleThread',.026,.050,'Edge',0,.01,1.105);
  const brakePoints=[[.033,-.058],[.036,-.050],[.036,.050],[.033,.058],[.012,.058],[.012,-.058],[.033,-.058]].map(([r,z])=>new T.Vector2(r,z));
  const brake=mesh('MuzzleBrake',new T.LatheGeometry(brakePoints,32),'Black',0,.01,1.19);brake.rotation.x=Math.PI/2;
  ring('MuzzleCrown',.015,.003,'Edge',0,.01,1.249);
  for(const side of [-1,1])for(let i=0;i<3;i++)box('BrakePort',.002,.027,.013,'Rubber',side*.035,.01,1.155+i*.032);
  // Folded bipod follows the fore-end, with separate hinges, feet and springs.
  box('BipodMount',.058,.020,.055,'Black',0,-.078,.68);
  for(const side of [-1,1]){
    tube('BipodHinge',.018,.018,'Edge',side*.035,-.09,.68).rotation.set(0,0,Math.PI/2);
    tube('FoldedBipodLeg',.010,.29,'Steel',side*.050,-.090,.85);
    tube('BipodSleeve',.014,.10,'Black',side*.050,-.090,.95);
    box('BipodFoot',.030,.029,.035,'Rubber',side*.050,-.09,1.014);
  }
  // Recessed hex fasteners provide readable highlights at FPS distances.
  for(const [x,y,z] of [[-.047,-.022,.31],[.047,-.022,.31],[-.047,-.022,.71],[.047,-.022,.71],[-.037,-.035,-.43],[.037,-.035,-.43]]){
    const screw=mesh('ChassisScrew',new T.CylinderGeometry(.009,.009,.003,6),'Edge',x,y,z);screw.rotation.z=Math.PI/2;
    const socket=mesh('HexSocket',new T.CylinderGeometry(.004,.004,.004,6),'Black',x+Math.sign(x)*.002,y,z);socket.rotation.z=Math.PI/2;
  }
  ring('SlingSocket',.013,.004,'Steel',.046,-.055,-.41).rotation.y=Math.PI/2;
  batchSniperGeometry(T,group);
  group.userData.detail='precision-sniper';
  return 1.249;
}

// Merge static parts without sharing disposable geometry between actors.
function batchSniperGeometry(T,group) {
  const surfaces=new Map();
  for(const part of [...group.children]){
    part.updateMatrix();
    const geometry=part.geometry.clone().applyMatrix4(part.matrix);
    if(!surfaces.has(part.material))surfaces.set(part.material,[]);
    surfaces.get(part.material).push({geometry,name:part.name});
    part.geometry.dispose();group.remove(part);
  }
  group.userData.parts=[];
  for(const [material,parts] of surfaces){
    const vertexCount=parts.reduce((sum,p)=>sum+p.geometry.attributes.position.count,0);
    const indexCount=parts.reduce((sum,p)=>sum+(p.geometry.index?.count || p.geometry.attributes.position.count),0);
    const geometry=new T.BufferGeometry(),indices=new (vertexCount>65535?Uint32Array:Uint16Array)(indexCount);
    for(const [key,width] of [['position',3],['normal',3],['uv',2]]){
      const data=new Float32Array(vertexCount*width);let offset=0;
      for(const part of parts){data.set(part.geometry.attributes[key].array,offset);offset+=part.geometry.attributes[key].array.length;}
      geometry.setAttribute(key,new T.BufferAttribute(data,width));
    }
    let base=0,offset=0;
    for(const part of parts){
      const count=part.geometry.index?.count || part.geometry.attributes.position.count;
      for(let i=0;i<count;i++)indices[offset+i]=base+(part.geometry.index?part.geometry.index.getX(i):i);
      group.userData.parts.push(part.name);base+=part.geometry.attributes.position.count;offset+=count;part.geometry.dispose();
    }
    geometry.setIndex(new T.BufferAttribute(indices,1));geometry.computeBoundingSphere();
    const surface=new T.Mesh(geometry,material);surface.name=material.name+'Surface';group.add(surface);
  }
}
