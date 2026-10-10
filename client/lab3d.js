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
                    strips.push([c * size + size / 2, 22.5, r * size + size / 2, size - 5, 1, 2]);
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
                if (kind === 'core') {
                    box(root, 34, 7, 34, '#354858');
                    box(root, 22, 30, 22, '#87e7ed', 0, 22, 0, true);
                    box(root, 30, 4, 30, '#e7f0f2', 0, 39);
                    for (const x of [-14,14]) box(root, 4, 30, 4, '#526b7a', x, 22);
                } else if (kind.includes('Turret') || kind === 'turret' || kind === 'overclockSilver') {
                    box(root, 30, 9, 30, '#384c59'); box(root, 18, 16, 20, color, 0, 17);
                    box(root, 5, 5, 30, '#283943', 0, 22, -16);
                } else if (kind === 'mine' || kind === 'wire') {
                    box(root, 30, 4, 30, color); box(root, 6, 2, 6, '#ff705d', 0, 5, 0, true);
                } else if (kind.includes('Barricade') || kind === 'barricade' || kind === 'block') {
                    box(root, 36, 24, 36, color); box(root, 32, 3, 3, '#b9d7dd', 0, 25, -16);
                } else {
                    box(root, 32, 5, 30, '#354855');
                    box(root, 28, 21, 24, '#cedbe0', 0, 15);
                    const screen = box(root, 21, 2, 15, color, 0, 27, 0, true); screen.rotation.x = -.18;
                    box(root, 23, 3, 4, '#425966', 0, 17, 13);
                }
                return { root };
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
        let lastFrame = performance.now();
        function render(frame) {
            const { map, reachable, center, scale, state, localId, predicted, smooth, radius, stations } = frame;
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
                for (const [point,label,color] of stations) station('station:' + point.id, point, color);
                const carrier = state.players.find(p => p.movingCore);
                const corePoint = carrier ? (carrier.id === localId && predicted ? predicted : smooth('player', carrier)) : state.core;
                station('core', corePoint, '#87e7ed', 'core').root.position.y = carrier ? 32 : 0;
                for (const slot of state.slots || []) if (!slot.locked && slot.defense) {
                    const type = slot.defense.type;
                    station('defense:' + slot.id, slot, type.startsWith('copper') ? '#b88b68' : type.startsWith('silver') ? '#d8e6eb' : '#6c8a9a', type);
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
                        actions.Idle.play(); return { root, mixer, actions, materials: model.materials, clip: 'Idle', previous: { ...point } };
                    });
                    const moving = Math.hypot(point.x-item.previous.x, point.y-item.previous.y) > .12;
                    const aiming = !player.down && !player.drone?.controlled;
                    const clip = aiming ? moving ? 'AimWalk' : 'Aim' : moving ? 'Walk' : 'Idle';
                    if (clip !== item.clip) { item.actions[item.clip].fadeOut(.15); item.actions[clip].reset().fadeIn(.15).play(); item.clip = clip; }
                    item.mixer.update(dt); item.previous = { ...point };
                    item.materials.Olive.color.set(player.down ? '#a86b70' : player.spyRemaining > 0 ? '#8b8e91' : player.id === localId ? '#63879a' : '#67786a');
                    item.root.position.set(point.x, player.down ? 4 : 0, point.y);
                    item.root.rotation.set(player.down ? Math.PI/2 : 0, Math.atan2(player.facingX || 0, player.facingY ?? -1), 0);
                    item.root.visible = !(player.tpInvulnerableRemaining > 0 || player.reviveInvulnerableRemaining > 0) || Math.floor(now/100)%2 === 0;
                }
                for (const entity of state.enemies) if (entity.hp > 0 && entity.type !== 'ghost')
                    enemy(entity, smooth('enemy', entity), radius(entity), now);
                for (const owner of state.players) if (owner.drone?.active) {
                    const point = smooth('drone', { ...owner.drone, id: owner.id });
                    const item = object('drone:' + owner.id, () => {
                        const root = new T.Group(); box(root, 12, 5, 15, '#bed9e2');
                        for (const x of [-10,10]) for (const z of [-10,10]) box(root, 11, 1, 3, '#526d7c', x, 4, z);
                        return { root };
                    }); item.root.position.set(point.x, 20 + Math.sin(now/170)*1.5, point.y);
                }
            }
            for (const [key,item] of objects) if (!seen.has(key)) {
                scene.remove(item.root);
                if (item.mixer) { item.mixer.stopAllAction(); item.mixer.uncacheRoot(item.mixer.getRoot());
                    item.root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
                    const unique = new Set(); item.root.traverse(o => { if (o.isMesh) unique.add(o.material); }); unique.forEach(m => m.dispose());
                }
                objects.delete(key);
            }
            renderer.render(scene, camera);
        }
        renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); });
        return { render, groundScale };
    }
    return { create, groundScale };
})();
