"use strict";
function buildSoldier(THREE) {
  const V = THREE.Vector3, Q = THREE.Quaternion, E = THREE.Euler;

  const COLORS = {
    Olive: 0x4c5030, OliveDark: 0x343722, OliveLight: 0x62673d, Skin: 0xd99a72,
    Boot: 0x2b2a24, Gun: 0x26282a, GunLight: 0x3e4245, Eye: 0x1c1a16,
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

  // rifle, built along +Z, origin = top of pistol grip
  const rifle = node('Rifle', spine);
  box(rifle, 0.065, 0.1, 0.4, 'Gun', 0, 0.0, 0.06); // receiver
  box(rifle, 0.07, 0.08, 0.26, 'GunLight', 0, 0.0, 0.38); // handguard
  cyl(rifle, 0.016, 0.016, 0.2, 6, 'Gun', 0, 0.01, 0.6, Math.PI / 2, 0, 0); // barrel
  box(rifle, 0.035, 0.035, 0.06, 'Gun', 0, 0.01, 0.72); // muzzle device
  box(rifle, 0.06, 0.1, 0.18, 'Gun', 0, -0.025, -0.22); // stock
  box(rifle, 0.065, 0.12, 0.03, 'GunLight', 0, -0.03, -0.31); // butt pad
  box(rifle, 0.05, 0.16, 0.075, 'Gun', 0, -0.12, 0.15, 0.22, 0, 0); // magazine
  box(rifle, 0.045, 0.11, 0.05, 'Gun', 0, -0.08, -0.03, -0.3, 0, 0); // pistol grip
  box(rifle, 0.04, 0.05, 0.12, 'GunLight', 0, 0.075, 0.06); // optic
  box(rifle, 0.012, 0.035, 0.012, 'Gun', 0, 0.06, 0.45); // front sight
  node('Muzzle', rifle, 0, 0.01, 0.76);
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

  return { root, clips, materials: mats };
}

window.buildSoldier = buildSoldier;
