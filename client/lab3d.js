"use strict";
// The server owns all coordinates and collision. This module only renders snapshots.
window.Lab3D = (() => {
    const tilt = 0.7;
    const groundScale = 1 / Math.sqrt(1 + tilt * tilt);
    function create(overlay) {
        if (!window.THREE) return null;
        const T = window.THREE;
        if (T.ColorManagement) T.ColorManagement.legacyMode = false;
        let renderer;
        try { renderer = new T.WebGLRenderer({ antialias: false, alpha: false }); }
        catch (error) { console.warn('3D renderer unavailable', error); return null; }
        renderer.outputEncoding = T.sRGBEncoding;
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = .9;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = T.PCFSoftShadowMap;
        renderer.domElement.id = 'lab-scene';
        overlay.before(renderer.domElement);
        document.body.classList.add('lab-3d');
        const scene = new T.Scene();
        scene.background = new T.Color('#141e26');
        const camera = new T.OrthographicCamera(-450, 450, 250, -250, 1, 5000);
        scene.add(new T.HemisphereLight(0xe4f5ff, 0x455262, .75));
        const sun = new T.DirectionalLight(0xfff3dd, 1.0);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        Object.assign(sun.shadow.camera, { left: -650, right: 650, top: 650, bottom: -650, near: 1, far: 2200 });
        sun.shadow.bias = -0.0005;
        scene.add(sun, sun.target);
        const boxGeometry = new T.BoxGeometry(1, 1, 1);
        const cylinderGeometry = new T.CylinderGeometry(1, 1, 1, 8);
        const wirePoints = Array.from({length:81}, (_,i) => { const t=i/80, a=t*Math.PI*8; return new T.Vector3((t-.5)*32, 11+Math.cos(a)*6, Math.sin(a)*6); });
        const wireGeometry = new T.TubeGeometry(new T.CatmullRomCurve3(wirePoints), 80, .65, 4, false);
        const sphereGeometry = new T.IcosahedronGeometry(1, 1);
        const materials = new Map();
        function material(color, glowing = false) {
            const key = color + ':' + glowing;
            if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({
                color, roughness: .82, flatShading: true,
                emissive: glowing ? color : 0, emissiveIntensity: glowing ? .65 : 0,
            }));
            return materials.get(key);
        }
        function box(parent, w, h, d, color, x = 0, y = h / 2, z = 0, glowing = false) {
            const mesh = new T.Mesh(boxGeometry, material(color, glowing));
            mesh.scale.set(w, h, d); mesh.position.set(x, y, z);
            mesh.castShadow = mesh.receiveShadow = !glowing; parent.add(mesh); return mesh;
        }
        let terrain = new T.Group(); scene.add(terrain);
        let lastMap, lastReachable;
        function rebuild(map, reachable) {
            if (lastMap === map && lastReachable === reachable) return;
            lastMap = map; lastReachable = reachable;
            scene.remove(terrain);
            terrain.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
            terrain = new T.Group(); scene.add(terrain);
            const floors = [], walls = [], strips = [];
            const size = map.tileSize;
            for (let r = 0; r < map.rows.length; r++) for (let c = 0; c < map.rows[r].length; c++) {
                if (reachable.has(r + ':' + c)) {
                    floors.push([c * size + size / 2, -2, r * size + size / 2, size, 4, size]);
                    if ((r + c) % 6 === 0) strips.push([c * size + size / 2, .2, r * size + size - 4, size * .6, .5, 2]);
                } else if ([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => reachable.has((r+dy)+':'+(c+dx)))) {
                    walls.push([c * size + size / 2, 11, r * size + size / 2, size, 22, size]);

                }
            }
            function instances(items, color) {
                const mesh = new T.InstancedMesh(boxGeometry, material(color), items.length);
                const dummy = new T.Object3D();
                items.forEach(([x,y,z,w,h,d], i) => {
                    dummy.position.set(x,y,z); dummy.scale.set(w,h,d); dummy.updateMatrix();
                    mesh.setMatrixAt(i, dummy.matrix);
                });
                mesh.receiveShadow = true; mesh.castShadow = true; terrain.add(mesh);
            }
            instances(floors, '#8799a2'); instances(walls, '#d8e2e6'); instances(strips, '#64b9c8');
        }
        const objects = new Map();
        let seen = new Set();
        function object(key, build) {
            seen.add(key);
            if (!objects.has(key)) { const value = build(); objects.set(key, value); scene.add(value.root); }
            return objects.get(key);
        }
        function station(key, point, color, kind = 'terminal') {
            const item = object(key + ':' + kind + ':' + color, () => {
                const root = new T.Group();
                let turretHead, muzzle;
                root.name = key + ':' + kind;
                if (kind === 'core') {
                    box(root, 34, 7, 34, '#354858');
                    box(root, 22, 30, 22, '#87e7ed', 0, 22, 0, true);
                    box(root, 30, 4, 30, '#e7f0f2', 0, 39);
                    for (const x of [-14,14]) box(root, 4, 30, 4, '#526b7a', x, 22);
                } else if (kind.includes('Turret') || kind === 'turret' || kind === 'overclockSilver') {
                    box(root, 30, 9, 30, '#384c59');
                    turretHead = new T.Group(); root.add(turretHead);
                    box(turretHead, 18, 16, 20, color, 0, 17);
                    box(turretHead, 5, 5, 30, '#283943', 0, 22, 16);
                    muzzle = new T.Object3D(); muzzle.position.set(0,22,31); turretHead.add(muzzle);
                } else if (kind === 'mine') {
                    const disk = new T.Mesh(cylinderGeometry, material('#52636c'));
                    disk.scale.set(14,4,14); disk.position.y=2; disk.castShadow=true; root.add(disk);
                    box(root, 5, 2, 5, '#ff705d', 0, 5, 0, true);
                } else if (kind === 'wire') {
                    const coil = new T.Mesh(wireGeometry, material('#a9b9c1')); coil.castShadow=true; root.add(coil);
                    for (const x of [-16,16]) box(root, 2, 18, 2, '#73838b', x);
                    for (const x of [-12,-4,4,12]) for (const angle of [-.65,.65]) {
                        const barb=box(root, .9, 9, .9, '#d3dde1', x, 14, 5); barb.rotation.z=angle;
                    }
                } else if (kind.includes('Barricade') || kind === 'barricade') {
                    const railColor = kind === 'barricade' ? '#92745a' : color;
                    for (const x of [-13,13]) {
                        box(root, 5, 28, 7, railColor, x);
                        box(root, 9, 4, 24, '#425663', x);
                    }
                    for (const y of [11,22]) box(root, 36, 6, 5, railColor, 0, y);
                    const brace=box(root, 29, 3, 5, '#516873', 0, 16, -4); brace.rotation.z=.55;
                } else if (kind === 'block') {
                    box(root, 36, 24, 36, color);
                } else if (kind === 'breaker') {
                    box(root, 20, 29, 9, '#7b909b');
                    box(root, 15, 24, 2, '#d2dce1', 0, 16, 5);
                    box(root, 4, 10, 3, '#34454f', 0, 16, 7);
                    box(root, 6, 3, 3, color, 0, 24, 7, true);
                } else {
                    box(root, 32, 5, 30, '#354855');
                    box(root, 28, 21, 24, '#cedbe0', 0, 15);
                    const screen = box(root, 21, 2, 15, color, 0, 27, 0, true); screen.rotation.x = -.18;
                    box(root, 23, 3, 4, '#425966', 0, 17, 13);
                }
                return { root, turretHead, muzzle };
            });
            item.root.position.set(point.x, 0, point.y);
            return item;
        }
        const enemyColors = { grunt: '#687a73', runner: '#b4b18a', brute: '#596260', armored: '#6d8395',
            hunter: '#a86a6a', siege: '#88784c', champion: '#8b689d', coreHunter: '#d4954b',
            boss: '#39363d', warden: '#526679', warlord: '#75434a', titan: '#6b496f',
            tiny: '#a9bd75', shield: '#4c8ca4', bomber: '#e38d47', artillery: '#749749',
            gilded: '#e8b94f', blueAce: '#358dff', carrier: '#9b7655', blackout: '#27584d', seeker: '#a35e70', explosionBoss: '#171b20' };
        function enemy(entity, point, radius, now) {
            const item = object('enemy:' + entity.id + ':' + entity.type, () => {
                const root = new T.Group();
                const body = new T.Mesh(sphereGeometry, material(enemyColors[entity.type] || '#869095'));
                body.scale.set(radius * .9, radius * .8, radius * .8); body.position.y = radius * .8;
                body.castShadow = true; root.add(body);
                for (const x of [-.3,.3]) box(root, radius * .18, radius * .15, radius * .12, '#ff826c', radius*x, radius, radius*.76, true);
                if (entity.type === 'shield') box(root, radius * 1.5, radius * 1.5, 6, '#78b7ca', 0, radius, radius);
                if (entity.type === 'carrier') box(root, 22, 27, 20, '#886543', 0, 17, -radius);
                if (entity.type === 'artillery') box(root, 10, 20, 10, '#b7d471', 0, radius*1.8);
                return { root, body };
            });
            item.root.position.set(point.x, 0, point.y);
            item.root.rotation.y = Math.atan2(entity.facingX || 0, entity.facingY ?? 1);
            item.body.material = material(entity.frozenRemaining > 0 ? '#95dded'
                : entity.type === 'explosionBoss' && entity.fuse >= 0 && Math.sin(now / Math.max(50, entity.fuse * 15)) > 0 ? '#d64e58'
                : enemyColors[entity.type] || '#869095');
        }

        function resource(key, node, now) {
            const item=object(key+':'+node.type,()=>{
                const root=new T.Group(); root.name=key+':'+node.type;
                if (node.type==='wood') {
                    for (const z of [-4,4]) for (const y of [3,8]) {
                        const log=new T.Mesh(cylinderGeometry,material('#a17a51')); log.scale.set(3,20,3); log.rotation.z=Math.PI/2;log.position.set(0,y,z);log.castShadow=true;root.add(log);
                    }
                    box(root, 3, 11, 15, '#475968');
                } else if (node.type==='medkit') {
                    box(root, 20, 12, 14, '#e2e8e9');box(root,4,1,10,'#df6366',0,12.6);box(root,12,1,3,'#df6366',0,12.7);
                    box(root,10,3,3,'#70848e',0,14,-5);
                } else {
                    const color={ore:'#6d7c86',copper:'#b98455',silver:'#d4e5ee'}[node.type] || '#91b9ca';
                    for (const [x,z,r] of [[-4,0,8],[5,3,6],[1,-5,5]]) {
                        const rock=new T.Mesh(sphereGeometry,material(color));rock.scale.set(r,r*.7,r*.8);rock.position.set(x,r*.6,z);rock.castShadow=true;root.add(rock);
                    }
                }
                return {root};
            });
            item.root.position.set(node.x,2+Math.sin(now/260+node.x*.01)*1.5,node.y);
        }
        const effectIds=new WeakMap(); let nextEffectId=0;
        function isTracer(e,now) {
            return e.effect==='hit' && Number.isFinite(e.fromX) && Number.isFinite(e.fromY) && Number.isFinite(e.x) && Number.isFinite(e.y) && now-e.started>=0 && now-e.started<198
                && (e.weapon==='turret' || e.damage===0) && !['bat','mine','flamethrower','rocket','railgun','poisonGas','repulsor','plasmaBlade','droneExplosion','laserCannon','freezeGun'].includes(e.weapon);
        }
        function tracer(effect,state,now,radius) {
            if (!effectIds.has(effect)) effectIds.set(effect,++nextEffectId);
            const item=object('trace:'+effectIds.get(effect),()=>{
                const geometry=new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3()]);
                const mat=new T.LineBasicMaterial({color:'#ff5964',transparent:true});
                const root=new T.Line(geometry,mat);root.frustumCulled=false; root.name='muzzle-tracer';
                return {root,dispose(){geometry.dispose();mat.dispose();}};
            });
            let muzzle;
            if (effect.weapon==='turret') {
                const slot=state.slots.find(s=>s.defense && Math.hypot(s.x-effect.fromX,s.y-effect.fromY)<2);
                if (slot) for (const [key,value] of objects) if (key.startsWith('defense:'+slot.id+':')) {muzzle=value.muzzle;break;}
            } else {
                const owner=state.players.find(p=>p.id===effect.playerId);
                if (owner?.drone?.active && Math.hypot(owner.drone.x-effect.fromX,owner.drone.y-effect.fromY)<12) {
                    const drone=objects.get('drone:'+owner.id);if(drone) {muzzle=drone.muzzle;}
                } else muzzle=objects.get('player:'+effect.playerId)?.muzzle;
            }
            const start=muzzle ? muzzle.getWorldPosition(new T.Vector3()) : new T.Vector3(effect.fromX,22,effect.fromY);
            const target=state.enemies.find(e=>e.id===effect.enemyId);
            const end=new T.Vector3(effect.x,target ? Math.max(6,radius(target)*.8) : start.y,effect.y);
            const positions=item.root.geometry.attributes.position;
            positions.setXYZ(0,start.x,start.y,start.z); positions.setXYZ(1,end.x,end.y,end.z);positions.needsUpdate=true;
            item.root.material.opacity=Math.max(0,1-(now-effect.started)/198);
        }
        function project(x,y,height=0) {
            const p=new T.Vector3(x,height,y).project(camera);
            return {x:(p.x+1)*overlay.width/2,y:(1-p.y)*overlay.height/2};
        }

        function collect() {
            for (const [key,item] of objects) if (!seen.has(key)) {
                scene.remove(item.root);
                item.dispose?.();
                if (item.mixer) { item.mixer.stopAllAction(); item.mixer.uncacheRoot(item.mixer.getRoot());
                    item.root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
                    const unique = new Set(); item.root.traverse(o => { if (o.isMesh) unique.add(o.material); }); unique.forEach(m => m.dispose());
                }
                objects.delete(key);
            }
        }
        let lastFrame = performance.now();
        function render(frame) {
            const { map, reachable, center, scale, state, localId, predicted, smooth, radius, stations, aim, effects = [] } = frame;
            const now = performance.now(), dt = Math.min(.1, (now - lastFrame) / 1000); lastFrame = now;
            if (renderer.domElement.width !== overlay.width || renderer.domElement.height !== overlay.height)
                renderer.setSize(overlay.width, overlay.height, false);
            const hw = overlay.width / scale / 2, hh = overlay.height / scale / 2;
            Object.assign(camera, { left: -hw, right: hw, top: hh, bottom: -hh }); camera.updateProjectionMatrix();
            camera.position.set(center.x, 1000, center.y + 1000 * tilt);
            camera.lookAt(center.x, 0, center.y);
            sun.position.set(center.x - 300, 700, center.y - 250); sun.target.position.set(center.x, 0, center.y);
            rebuild(map, reachable); seen = new Set();
            if (state) {
                for (const [point,label,color,kind] of stations) station('station:' + point.id, point, color, kind);
                const carrier = state.players.find(p => p.movingCore);
                const corePoint = carrier ? (carrier.id === localId && predicted ? predicted : smooth('player', carrier)) : state.core;
                station('core', corePoint, '#87e7ed', 'core').root.position.y = carrier ? 32 : 0;
                for (const slot of state.slots || []) if (!slot.locked && slot.defense) {
                    const type = slot.defense.type;
                    const item=station('defense:' + slot.id, slot, type.startsWith('copper') ? '#b88b68' : type.startsWith('silver') ? '#d8e6eb' : '#6c8a9a', type);
                    if (item.turretHead) {
                        const shot=effects.filter(e=>e.weapon==='turret' && now-e.started<360 && Math.hypot(e.fromX-slot.x,e.fromY-slot.y)<2).at(-1);
                        if (shot) item.turretHead.rotation.y=Math.atan2(shot.x-slot.x,shot.y-slot.y);
                    }
                }
                for (const player of state.players) {
                    const point = player.id === localId && predicted ? predicted : smooth('player', player);
                    const item = object('player:' + player.id, () => {
                        const model = window.buildSoldier(T);
                        const root = new T.Group(); root.add(model.root); model.root.scale.setScalar(16);
                        model.materials.Olive.color.set(player.id === localId ? '#63879a' : '#67786a');
                        model.materials.OliveDark.color.set('#344b58');
                        const mixer = new T.AnimationMixer(model.root);
                        const actions = Object.fromEntries(model.clips.map(c => [c.name, mixer.clipAction(c)]));
                        actions.Idle.play(); return { root, mixer, actions, muzzle: model.root.getObjectByName('Muzzle'), materials: model.materials, clip: 'Idle', previous: { ...point } };
                    });
                    const moving = Math.hypot(point.x-item.previous.x, point.y-item.previous.y) > .12;
                    const aiming = !player.down && !player.drone?.controlled;
                    const clip = aiming ? moving ? 'AimWalk' : 'Aim' : moving ? 'Walk' : 'Idle';
                    if (clip !== item.clip) { item.actions[item.clip].fadeOut(.15); item.actions[clip].reset().fadeIn(.15).play(); item.clip = clip; }
                    item.mixer.update(dt); item.previous = { ...point };
                    item.materials.Olive.color.set(player.down ? '#a86b70' : player.spyRemaining > 0 ? '#8b8e91' : player.id === localId ? '#63879a' : '#67786a');
                    item.root.position.set(point.x, player.down ? 4 : 0, point.y);
                    const shot=effects.filter(e=>e.playerId===player.id && e.effect==='hit' && now-e.started<360 && e.fromX!=null).at(-1);
                    const target=player.id===localId && !player.drone?.controlled ? aim : null;
                    const dx=target ? target.x-point.x : shot ? shot.x-shot.fromX : player.facingX || 0;
                    const dz=target ? target.y-point.y : shot ? shot.y-shot.fromY : player.facingY ?? -1;
                    item.root.rotation.set(player.down ? Math.PI/2 : 0, Math.atan2(dx,dz), 0);
                    item.root.visible = !(player.tpInvulnerableRemaining > 0 || player.reviveInvulnerableRemaining > 0) || Math.floor(now/100)%2 === 0;
                }
                for (const entity of state.enemies) if (entity.hp > 0 && entity.type !== 'ghost')
                    enemy(entity, smooth('enemy', entity), radius(entity), now);
                for (const owner of state.players) if (owner.drone?.active) {
                    const point = smooth('drone', { ...owner.drone, id: owner.id });
                    const item = object('drone:' + owner.id, () => {
                        const root = new T.Group(); box(root, 12, 5, 15, '#bed9e2');
                        for (const x of [-10,10]) for (const z of [-10,10]) box(root, 11, 1, 3, '#526d7c', x, 4, z);
                        const muzzle=new T.Object3D();muzzle.position.set(0,3,10);root.add(muzzle);
                        return { root, muzzle };
                    }); item.root.position.set(point.x, 20 + Math.sin(now/170)*1.5, point.y);
                    if (owner.id===localId && owner.drone.controlled && aim) item.root.rotation.y=Math.atan2(aim.x-point.x,aim.y-point.y);
                }
            }
            if (state) {
                for (const node of state.resources || []) if (node.available) resource('resource:'+node.id, node, now);
                for (const drop of state.drops || []) resource('drop:'+drop.id, drop, now);
                scene.updateMatrixWorld(true);
                for (const effect of effects) if (isTracer(effect, now)) tracer(effect, state, now, radius);
            }
            // Transient objects are collected after resources and tracers have marked themselves live.
            collect();
            renderer.render(scene, camera);
        }
        renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); });
        return { render, groundScale, project };
    }
    return { create, groundScale };
})();
