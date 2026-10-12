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
  let currentWeapon,batPoseRestore=null;
  function setWeapon(weapon) {
    if(currentWeapon===weapon)return;
    resetBatPose();
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
    const gL = (currentWeapon==='bat' ? new V(0,-.055,.09) : GRIP_L).clone().applyQuaternion(rq).add(rp);
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

  function resetBatPose() {
    if(!batPoseRestore)return;
    for(const {part,position,quaternion} of batPoseRestore) {
      part.position.copy(position);part.quaternion.copy(quaternion);
    }
    batPoseRestore=null;
  }
  function poseBat(age=Infinity) {
    resetBatPose();
    // Both hands follow the handle; a short wind-up, strike and recovery replace whole-body rolling.
    const frames=[[0,0],[.07,-.25],[.18,1],[.48,0]];
    let amount=0;
    for(let i=1;i<frames.length;i++)if(age>=frames[i-1][0] && age<frames[i][0]) {
      const t=(age-frames[i-1][0])/(frames[i][0]-frames[i-1][0]);
      amount=frames[i-1][1]+(frames[i][1]-frames[i-1][1])*(t*t*(3-2*t));break;
    }
    const u=aimed();u.riflePos.set(-.23+.3*amount,.64-.16*amount,.27+.08*amount);
    u.riflePitch=-.95+1.05*amount;u.rifleYaw=-.35+1.5*amount;u.rifleRoll=-.12-.22*amount;
    const pose={};upperBody(pose,-.25,u);
    batPoseRestore=[];
    for(const [name,value] of Object.entries(pose)) {
      const part=root.getObjectByName(name);
      batPoseRestore.push({part,position:part.position.clone(),quaternion:part.quaternion.clone()});
      if(value.p)part.position.copy(value.p);if(value.q)part.quaternion.copy(value.q);
    }
  }
  // Restore overrides before AnimationMixer runs: unchanged tracks are cached by Three.js.
  const proceduralParts = [root, hips, spine, head, rifle,
    ...Object.values(legs).flatMap(leg => [leg.thigh, leg.shin]),
    ...Object.values(arms).flatMap(arm => [arm.up, arm.lo])]
    .map(part => ({part, position:part.position.clone(), quaternion:part.quaternion.clone(), scale:part.scale.clone(), visible:part.visible}));
  let proceduralActive = false;
  function saveProceduralPose() {
    for(const saved of proceduralParts) {
      saved.position.copy(saved.part.position);saved.quaternion.copy(saved.part.quaternion);
      saved.scale.copy(saved.part.scale);saved.visible=saved.part.visible;
    }
    proceduralActive=true;
  }
  function resetProceduralPose() {
    if(!proceduralActive)return;
    for(const saved of proceduralParts) {
      saved.part.position.copy(saved.position);saved.part.quaternion.copy(saved.quaternion);
      saved.part.scale.copy(saved.scale);saved.part.visible=saved.visible;
    }
    proceduralActive=false;
  }
  function poseDown(phase=0, amount=0) {
    const stroke=Math.sin(phase)*amount;
    hips.position.set(0,.18,0);hips.rotation.set(Math.PI/2,0,.025*stroke);
    spine.rotation.set(-.06,0,.02*stroke);
    const bodyQ=hips.quaternion.clone().multiply(spine.quaternion),inverse=bodyQ.clone().invert();
    head.position.x=0;head.quaternion.copy(inverse).multiply(qe(.12,0,0));
    // Hands and elbows stay near the floor; the weapon is stowed while crawling.
    rifle.visible=false;
    for(const [side,sign] of [['L',1],['R',-1]]) {
      const reach=stroke*sign;
      const leg=legs[side];
      leg.thigh.rotation.set(.04,0,sign*(.23+.16*(amount+reach)/2));
      leg.shin.rotation.set(-.04,0,-sign*.18*(amount+reach)/2);
      const target=new V(sign*(.33+.025*reach),.09,.64+.12*reach)
        .sub(hips.position).applyQuaternion(hips.quaternion.clone().invert())
        .sub(spine.position).applyQuaternion(spine.quaternion.clone().invert());
      const pole=new V(sign,-.4,-.3).applyQuaternion(inverse);
      const [up,lo]=solveArm(shoulderPos[side],target,pole,UPPER_ARM,LOWER_ARM);
      arms[side].up.quaternion.copy(up);arms[side].lo.quaternion.copy(lo);
    }
    root.position.y=.023;
  }
  return { root, clips, materials: mats, setWeapon, poseBat, resetBatPose,
    saveProceduralPose, resetProceduralPose, poseDown };
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
      const brushed=.44+n*.20+Math.sin(y*.49)*.025;
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
      Steel:{color:0x45484a,metalness:.80,roughness:.43,envMapIntensity:.55},
      Edge:{color:0x727574,metalness:.90,roughness:.38,envMapIntensity:.60},
      Black:{color:0x272a2b,metalness:.62,roughness:.52,envMapIntensity:.40},
      Sand:{color:0x35463b,metalness:.20,roughness:.72,envMapIntensity:.28},
      Rubber:{color:0x17191a,metalness:0,roughness:.94,envMapIntensity:.12},
      Glass:{color:0x183f50,metalness:.72,roughness:.085,envMapIntensity:1.35},
      Mark:{color:0xb4b6ac,metalness:.12,roughness:.65,envMapIntensity:.2},
    };
    for(const [name,config] of Object.entries(configs)){
      const m=new T.MeshStandardMaterial({name:'Sniper'+name,...config,envMap:environment});
      if(name!=='Glass' && name!=='Mark'){
        m.roughnessMap=roughnessMap;m.normalMap=normalMap;
        m.normalScale=new T.Vector2(name==='Rubber'?.035:.018,name==='Rubber'?.11:.035);
      }
      materials['Sniper'+name]=m;
    }
    const coating=new Uint8Array(size*size*4);
    for(let i=0;i<coating.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;coating[i]=coating[i+1]=coating[i+2]=220+(seed>>>28)*2;coating[i+3]=255;}
    const coatingMap=texture(coating);coatingMap.repeat.set(9,9);materials.SniperSand.roughnessMap=coatingMap;
    materials.SniperSand.addEventListener('dispose',()=>coatingMap.dispose());
    materials.SniperSteel.addEventListener('dispose',()=>{roughnessMap.dispose();normalMap.dispose();environment.dispose();});
  }
  const mesh=(name,geo,material,x=0,y=0,z=0)=>{
    if(material==='Sand'){
      const normals=geo.attributes.normal,color=new Float32Array(normals.count*3);
      const cavity=/PocketBack/.test(name)?.60:name==='ForeEndBottom'?.18:1;
      for(let i=0;i<normals.count;i++){const shade=cavity*(.92+.08*Math.max(-1,normals.getY(i)));color.set([shade,shade,shade],i*3);}
      geo.setAttribute('color',new T.BufferAttribute(color,3));
    }
    const o=new T.Mesh(geo,materials['Sniper'+material]);o.name=name;o.position.set(x,y,z);group.add(o);return o;
  };
  const box=(name,w,h,d,m,x=0,y=0,z=0)=>mesh(name,new T.BoxGeometry(w,h,d),m,x,y,z);
  const tube=(name,r,length,m,x=0,y=0,z=0,r2=r)=>{
    const o=mesh(name,new T.CylinderGeometry(r2,r,length,r<.02?16:32,1),m,x,y,z);o.rotation.x=Math.PI/2;return o;
  };
  const ring=(name,r,thickness,m,x,y,z)=>{
    const o=mesh(name,new T.TorusGeometry(r,thickness,thickness<=.002?4:8,name==='BarrelCollarStep'?16:32),m,x,y,z);return o;
  };
  // Side-profile extrusion gives the stock, chassis and grip continuous beveled edges.
  const profile=(name,points,width,m,holes=[])=>{
    const shape=new T.Shape();points.forEach(([z,y],i)=>i?shape.lineTo(z,y):shape.moveTo(z,y));shape.closePath();
    for(const outline of holes){const hole=new T.Path();outline.forEach(([z,y],i)=>i?hole.lineTo(z,y):hole.moveTo(z,y));hole.closePath();shape.holes.push(hole);}
    const geo=new T.ExtrudeGeometry(shape,{depth:width,bevelEnabled:true,bevelSegments:width<.02?1:2,steps:1,bevelSize:.004,bevelThickness:.004});
    geo.rotateY(-Math.PI/2);geo.translate(width/2,0,0);
    return mesh(name,geo,m);
  };
  // Loft a rounded twelve-sided section through space, rather than extruding a flat plate.
  // Each station is [z, centerY, halfWidth, halfHeight].
  const shell=(name,sections,m)=>{
    const section=[[-.7,1],[.7,1],[.94,.75],[1,.32],[1,-.32],[.94,-.75],[.7,-1],[-.7,-1],[-.94,-.75],[-1,-.32],[-1,.32],[-.94,.75]];
    const positions=[],indices=[],uv=[],n=section.length;
    for(let k=0;k<sections.length;k++){
      const [z,y,w,h]=sections[k];
      for(let i=0;i<n;i++){const [x,v]=section[i];positions.push(x*w,y+v*h,z);uv.push(i/n,k/(sections.length-1));}
    }
    for(let k=0;k<sections.length-1;k++)for(let i=0;i<n;i++){
      const a=k*n+i,b=k*n+(i+1)%n,c=b+n,d=a+n;
      indices.push(a,d,b,b,d,c);
    }
    for(const [station,reverse] of [[0,true],[sections.length-1,false]]){
      const [z,y]=sections[station],center=positions.length/3;positions.push(0,y,z);uv.push(.5,.5);
      for(let i=0;i<n;i++){
        const a=station*n+i,b=station*n+(i+1)%n;
        if(reverse)indices.push(center,a,b);else indices.push(center,b,a);
      }
    }
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geometry.setIndex(indices);geometry.computeVertexNormals();
    return mesh(name,geometry,m);
  };

  // Mk II: one coherent action/chassis silhouette with a long, enclosed fore-end.
  shell('ActionHousing',[[-.130,.025,.031,.036],[-.095,.031,.054,.052],[.225,.031,.054,.052],[.290,.021,.044,.043]],'Black');
  tube('BoltShroud',.031,.055,'Steel',0,.035,-.130);
  profile('Chassis',[[-.142,.008],[-.095,.027],[.045,.022],[.080,.008],[.286,.008],[.321,-.014],[.286,-.083],[.075,-.086],[.043,-.101],[-.055,-.088],[-.116,-.050],[-.142,-.041]],.105,'Sand',[
    [[-.090,-.025],[-.058,-.014],[.021,-.026],[.038,-.045],[.020,-.063],[-.068,-.057]],
    [[.096,-.023],[.241,-.023],[.265,-.039],[.240,-.061],[.090,-.061],[.078,-.043]]
  ]);
  shell('BeddingLowerSpine',[[-.123,-.048,.033,.010],[-.06,-.074,.042,.012],[.06,-.089,.048,.012],[.29,-.076,.035,.010]],'Black');
  shell('MagwellFlange',[[.079,-.075,.044,.008],[.101,-.082,.059,.010],[.25,-.082,.059,.010],[.29,-.074,.041,.008]],'Sand');
  for(const side of [-1,1]){
    const inset=profile('ChassisPocketBack',[[-.09,-.025],[-.058,-.014],[.021,-.026],[.038,-.045],[.020,-.063],[-.068,-.057]],.004,'Sand');inset.position.x=side*.027;
    const pocket=profile('MagazinePocketBack',[[.096,-.023],[.241,-.023],[.265,-.039],[.240,-.061],[.09,-.061],[.078,-.043]],.004,'Sand');pocket.position.x=side*.028;
    const actionFlat=profile('ActionSideFlat',[[-.103,.025],[-.080,.061],[.225,.061],[.258,.033],[.239,.012],[-.093,.012]],.006,'Steel');actionFlat.position.x=side*.052;
    const release=profile('MagazineRelease',[[.055,-.065],[.080,-.067],[.077,-.111],[.056,-.107]],.009,'Black');release.position.x=side*.052;
    for(const y of [-.088,-.094,-.100])box('ReleaseSerration',.003,.002,.015,'Steel',side*.059,y,.067);
    const safety=tube('SafetyPivot',.010,.009,'Steel',side*.061,.003,-.076);safety.rotation.set(0,0,Math.PI/2);
    const lever=box('SafetyLever',.009,.008,.036,'Black',side*.066,.004,-.058);lever.rotation.x=-.18;
  }
  // Ejection recess and the visible bolt occupy only the right side of the action.
  box('EjectionRecess',.007,.028,.114,'Black',-.059,.042,.129);
  box('VisibleBolt',.008,.010,.098,'Edge',-.064,.036,.129);
  box('Extractor',.006,.006,.024,'Steel',-.069,.042,.171);
  tube('BarrelTenon',.046,.060,'Black',0,.014,.294);
  for(const z of [.279,.300,.320])ring('BarrelCollarStep',.046,.0018,'Steel',0,.014,z);
  buildFlutedSniperBarrel(T,mesh);
  // The fore-end wraps above and below the bore, with genuine recessed apertures.
  const ventHoles=[];
  for(let i=0;i<5;i++){
    const z=.367+i*.096;
    ventHoles.push([[z,-.021],[z+.006,-.015],[z+.052,-.015],[z+.058,-.021],[z+.058,-.037],[z+.052,-.043],[z+.006,-.043],[z,-.037]]);
  }
  for(const side of [-1,1]){
    const wall=profile('Mk2ForeEndWall',[[.318,.022],[.855,.022],[.927,.001],[.919,-.052],[.878,-.071],[.345,-.071],[.318,-.049]],.010,'Sand',ventHoles);
    wall.position.x=side*.060;
    const p=wall.geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      const z=p.getZ(i),t=Math.max(0,Math.min(1,(z-.34)/.58));
      p.setX(i,(p.getX(i)+side*.060)*(1-.13*t)-side*.060);
    }wall.geometry.computeVertexNormals();
    const wn=wall.geometry.attributes.normal,wc=wall.geometry.attributes.color;
    for(let i=0;i<wn.count;i++)if(wn.getX(i)*side<-.2)wc.setXYZ(i,wc.getX(i)*.47,wc.getY(i)*.47,wc.getZ(i)*.47);
    const shoulder=shell('ForeEndUpperShoulder',[[.322,.022,.011,.010],[.37,.035,.016,.013],[.85,.035,.014,.013],[.923,.013,.009,.008]],'Sand');
    shoulder.position.x=side*.047;
    box('ForeEndSeam',.004,.003,.47,'Black',side*.060,-.064,.605);
    for(const z of [.345,.888]){
      const pin=mesh('ForeEndPin',new T.CylinderGeometry(.007,.007,.004,6),'Black',side*.069,-.028,z);pin.rotation.z=Math.PI/2;
    }
  }
  shell('ForeEndBottom',[[.33,-.068,.040,.008],[.37,-.073,.049,.011],[.86,-.070,.044,.011],[.921,-.052,.031,.007]],'Sand');
  box('ForeEndTopSpine',.035,.009,.53,'Black',0,.047,.607);
  for(let i=0;i<10;i++)box('TopSpineSlot',.039,.005,.012,'Steel',0,.054,.37+i*.047);
  box('BipodMountRail',.046,.014,.125,'Black',0,-.087,.821);
  box('ReceiverRail',.075,.013,.38,'Black',0,.094,.092);
  for(let i=0;i<18;i++)box('RailTooth',.082,.008,.012,'Steel',0,.105,-.068+i*.021);
  // Broad folding stock with an adjustable cheek pad and a deep open frame.
  tube('StockHinge',.032,.108,'Steel',0,-.019,-.157).rotation.set(0,0,Math.PI/2);
  tube('HingePin',.011,.117,'Black',0,-.019,-.157).rotation.set(0,0,Math.PI/2);
  shell('StockUpperBeam',[[-.182,-.015,.031,.022],[-.245,-.011,.043,.022],[-.434,-.017,.045,.023],[-.487,-.036,.036,.022]],'Sand');
  shell('StockLowerBeam',[[-.206,-.071,.033,.018],[-.248,-.092,.039,.019],[-.40,-.108,.043,.020],[-.489,-.141,.034,.018]],'Sand');
  shell('StockFrontBrace',[[-.186,-.017,.032,.021],[-.201,-.045,.037,.026],[-.228,-.081,.036,.022]],'Sand');
  shell('StockRearBrace',[[-.447,-.031,.038,.025],[-.474,-.080,.043,.030],[-.491,-.136,.035,.022]],'Sand');
  shell('CheekRest',[[-.452,.030,.029,.012],[-.418,.045,.047,.022],[-.260,.045,.047,.022],[-.223,.029,.030,.011]],'Black');
  shell('CheekCushion',[[-.438,.060,.028,.003],[-.411,.068,.040,.004],[-.268,.068,.040,.004],[-.240,.057,.026,.003]],'Rubber');
  for(const z of [-.397,-.279])tube('CheekRiser',.008,.055,'Edge',0,.020,z).rotation.x=0;
  tube('StockSlideRod',.010,.23,'Steel',0,-.027,-.353);
  for(const z of [-.41,-.275]){
    const dial=tube('StockAdjustmentDial',.016,.020,'Black',-.052,-.039,z);dial.rotation.set(0,0,Math.PI/2);
    const cap=tube('StockDialCap',.009,.003,'Steel',-.064,-.039,z);cap.rotation.set(0,0,Math.PI/2);
  }
  profile('RecoilPadBacking',[[-.487,.025],[-.509,.020],[-.528,-.142],[-.502,-.166]],.088,'Black');
  profile('ButtPad',[[-.509,.021],[-.537,.009],[-.552,-.127],[-.543,-.163],[-.521,-.166]],.094,'Rubber');
  for(let i=0;i<9;i++)box('ButtPadGroove',.087,.003,.003,'Black',0,-.004-i*.017,-.548);
  profile('PistolGrip',[[-.070,-.065],[-.019,-.071],[.003,-.098],[-.006,-.135],[-.016,-.176],[-.009,-.201],[-.034,-.219],[-.080,-.209],[-.103,-.185],[-.100,-.157],[-.086,-.121],[-.091,-.089]],.061,'Rubber');
  for(const side of [-1,1]){
    const panel=profile('GripPalmPanel',[[-.066,-.099],[-.030,-.106],[-.038,-.169],[-.030,-.192],[-.068,-.189],[-.082,-.170]],.003,'Black');panel.position.x=side*.035;
    for(let i=0;i<7;i++){const rib=box('GripRib',.002,.002,.033,'Steel',side*.038,-.12-i*.01,-.051);rib.rotation.x=-.16;}
  }
  const guardPoints=[[-.041,-.079],[.074,-.080],[.088,-.126],[.069,-.147],[-.013,-.147],[-.041,-.079]].map(([z,y])=>new T.Vector3(0,y,z));
  mesh('TriggerGuard',new T.TubeGeometry(new T.CatmullRomCurve3(guardPoints),20,.006,6,false),'Black');
  const triggerPoints=[[.026,-.079],[.017,-.108],[.028,-.126]].map(([z,y])=>new T.Vector3(0,y,z));
  mesh('Trigger',new T.TubeGeometry(new T.CatmullRomCurve3(triggerPoints),10,.004,6,false),'Edge');
  profile('Magazine',[[.098,-.086],[.231,-.086],[.220,-.196],[.108,-.199]],.074,'Black');
  profile('MagazineFloorplate',[[.100,-.193],[.228,-.190],[.235,-.207],[.102,-.213]],.082,'Rubber');
  for(const side of [-1,1])for(let i=0;i<3;i++){
    const rib=profile('MagazinePressedRib',[[.125+i*.029,-.115],[.136+i*.029,-.114],[.131+i*.029,-.177],[.122+i*.029,-.177]],.003,'Steel');rib.position.x=side*.040;
  }
  const bolt=tube('BoltHandle',.009,.086,'Edge',-.086,.012,-.091);bolt.rotation.set(0,0,-1.12);
  mesh('BoltKnob',new T.SphereGeometry(.023,16,10),'Black',-.125,-.009,-.091).scale.set(1,1.22,1);
  for(let i=0;i<5;i++)ring('BoltKnurl',.019,.0013,'Steel',-.125,-.023+i*.007,-.091).rotation.x=Math.PI/2;
  materials.SniperSand.vertexColors=true;materials.SniperSand.normalMap=null;materials.SniperSand.roughness=.72;

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
  // A long, stepped muzzle assembly changes the rifle's overall balance and silhouette.
  const mountProfile=[[.034,-.027],[.034,.027],[.025,.027],[.025,-.027],[.034,-.027]].map(([r,z])=>new T.Vector2(r,z));
  const mount=mesh('MuzzleMount',new T.LatheGeometry(mountProfile,32),'Steel',0,.01,1.100);mount.rotation.x=Math.PI/2;
  const shroudProfile=[
    [.034,-.185],[.044,-.175],[.049,-.151],[.049,.145],[.047,.164],[.043,.177],
    [.014,.177],[.014,.151],[.038,.145],[.038,-.151],[.030,-.170],[.030,-.185],[.034,-.185]
  ].map(([r,z])=>new T.Vector2(r,z));
  const shroud=mesh('Mk2MuzzleShroud',new T.LatheGeometry(shroudProfile,40),'Black',0,.01,1.263);shroud.rotation.x=Math.PI/2;
  for(const z of [1.092,1.108,1.124])ring('MuzzleMountGroove',.044,.0018,'Steel',0,.01,z);
  ring('ShroudFrontSeam',.046,.0018,'Steel',0,.01,1.419);
  ring('MuzzleCrown',.015,.002,'Edge',0,.01,1.446);
  stampSniperLabel(T,mesh,'R-07',-.050,.017,1.193,.0015);

  // Compact folded bipod, rear-facing legs, spring collars and rubber feet.
  box('BipodClamp',.074,.019,.054,'Black',0,-.097,.818);
  for(const side of [-1,1]){
    tube('BipodHinge',.020,.018,'Steel',side*.048,-.106,.815).rotation.set(0,0,Math.PI/2);
    tube('BipodFoldedLeg',.010,.245,'Steel',side*.072,-.111,.681);
    tube('BipodSleeve',.014,.092,'Black',side*.072,-.111,.610);
    box('BipodRubberFoot',.031,.028,.033,'Rubber',side*.072,-.111,.548);
    for(const z of [.782,.793,.804])ring('BipodSpring',.013,.0014,'Steel',side*.072,-.111,z);
  }
  // Recessed hex fasteners and visible tool sockets.
  for(const [x,y,z] of [[-.058,-.003,-.116],[.058,-.003,-.116],[-.058,-.071,.274],[.058,-.071,.274],[-.047,-.120,-.448],[.047,-.120,-.448]]){
    const screw=mesh('ChassisScrew',new T.CylinderGeometry(.008,.008,.003,6),'Steel',x,y,z);screw.rotation.z=Math.PI/2;
    const socket=mesh('HexSocket',new T.CylinderGeometry(.0035,.0035,.004,6),'Black',x+Math.sign(x)*.002,y,z);socket.rotation.z=Math.PI/2;
  }
  ring('SlingSocket',.013,.003,'Steel',.048,-.049,-.429).rotation.y=Math.PI/2;
  stampSniperLabel(T,mesh,'MK-II',-.057,-.006,-.080,.0018);
  stampSniperLabel(T,mesh,'R-07 7.62',-.058,-.065,.120,.0015);

  batchSniperGeometry(T,group);
  group.userData.detail='precision-sniper';group.userData.design='precision-mk2';
  return 1.446;
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
    for(const [key,width] of [['position',3],['normal',3],['uv',2],...(parts[0].geometry.attributes.color?[['color',3]]:[])]){
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

function buildFlutedSniperBarrel(T,mesh) {
  const rings=[.321,.35,.63,.67,1.055,1.085,1.112],count=48,vertices=[],uv=[],indices=[];
  for(let k=0;k<rings.length;k++)for(let i=0;i<=count;i++){
    const z=rings[k],a=i/count*Math.PI*2;
    const flute=(z>=.67 && z<=1.055)?Math.pow(Math.max(0,Math.cos(a*8)),2)*.0027:0;
    const radius=.027-(z-.321)*.006-flute;
    vertices.push(Math.sin(a)*radius,.01+Math.cos(a)*radius,z);uv.push(i/count,k/(rings.length-1));
  }
  for(let k=0;k<rings.length-1;k++)for(let i=0;i<count;i++){
    const a=k*(count+1)+i,b=a+1,c=b+count+1,d=a+count+1;
    indices.push(a,d,b,b,d,c);
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
  mesh('Mk2FlutedBarrel',geo,'Steel');
}

// Small stamped identifiers are real surface geometry and share the markings material.
function stampSniperLabel(T,mesh,text,x,y,z,scale=.0017) {
  const font={
    'M':['101','111','111','101','101'],'K':['101','110','100','110','101'],
    'I':['111','010','010','010','111'],'L':['100','100','100','100','111'],
    'R':['110','101','110','101','101'],'P':['110','101','110','100','100'],
    'S':['111','100','111','001','111'],'N':['101','111','111','111','101'],
    '0':['111','101','101','101','111'],'1':['010','110','010','010','111'],
    '2':['110','001','010','100','111'],'3':['110','001','010','001','110'],
    '6':['011','100','110','101','010'],'7':['111','001','010','010','010'],
    '-':['000','000','111','000','000'],'.':['000','000','000','000','010'],
    '/':['001','001','010','100','100'],' ':['000','000','000','000','000'],
  };
  const positions=[],normals=[],uv=[];
  for(const [letter,char] of [...text].entries())for(const [row,line] of (font[char]||font[' ']).entries())for(let col=0;col<3;col++){
    if(line[col]!=='1')continue;
    const a=z+(letter*4+col)*scale,b=a+scale*.72,c=y-row*scale,d=c-scale*.72;
    for(const [zz,yy] of [[a,c],[a,d],[b,c],[b,c],[a,d],[b,d]]){positions.push(x,yy,zz);normals.push(-1,0,0);uv.push(0,0);}
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geo.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  mesh('StampedIdentifier',geo,'Mark');
}
