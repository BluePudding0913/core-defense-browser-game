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
    } else if(weapon==='rocket') {
      tip=.82;tube(.085,.8,'GunLight',0,.03,.4);tube(.1,.055,'Olive',0,.03,.78);
      part(.06,.18,.08,'Gun',0,-.12,.08);part(.04,.1,.08,'Gun',0,.14,.4);
    } else {
      const compact=['smg','hook','repulsor','freezeGun'].includes(weapon);
      const heavy=['lmg','railgun','laserCannon','flamethrower','poisonGas'].includes(weapon);
      tip=compact?.55:weapon==='sniper'?1.02:.78;
      part(heavy?.13:.08,.12,compact?.3:.42,'GunLight',0,0,.12);
      part(.06,.14,.07,'Gun',0,-.1,-.02);
      if(!compact) {part(.07,.09,.22,'Gun',0,-.01,-.21);part(.1,.15,.035,'GunLight',0,-.02,-.33);}
      const accent={railgun:'Cyan',laserCannon:'Red',freezeGun:'Cyan',poisonGas:'Green',repulsor:'Cyan'}[weapon] || 'GunLight';
      part(heavy?.14:.075,.08,tip-.3,accent,0,0,(tip+.2)/2);
      tube(heavy?.04:.022,.14,'Gun',0,.01,tip-.07);
      part(weapon==='lmg'?.2:.055,weapon==='lmg'?.18:.16,.09,'Gun',0,-.13,.14);
      if(weapon==='sniper' || weapon==='rifle'){tube(.035,weapon==='sniper'?.26:.13,'Gun',0,.12,.15);part(.04,.06,.04,'Gun',0,.065,.15);}
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
