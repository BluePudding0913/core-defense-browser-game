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
        const camera = new T.PerspectiveCamera(72, 1, .5, 5000);
        const ambient=new T.HemisphereLight(0xe4f5ff, 0x455262, .75);scene.add(ambient);
        const blackoutFog=new T.Fog(0x010205,48,160);
        const nearbyLight=new T.PointLight(0xc6dded,1.8,160,2);nearbyLight.name="blackout-nearby-light";nearbyLight.visible=false;scene.add(nearbyLight);
        let darkened=false;
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
        const impactMarks=[],processedImpacts=new WeakSet(),impactDummy=new T.Object3D(),impactNormal=new T.Vector3(),planeNormal=new T.Vector3(0,0,1);
        const impactGeometry=new T.CircleGeometry(1.1,8),impactMaterial=new T.MeshBasicMaterial({color:'#252a2c',transparent:true,opacity:.75,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
        const impactMesh=new T.InstancedMesh(impactGeometry,impactMaterial,32);impactMesh.name='wall-impact-marks';impactMesh.count=0;impactMesh.frustumCulled=false;scene.add(impactMesh);
        function renderWallImpacts(effects,now) {
            for(const e of effects)if(now>=e.started && now-e.started<250 && !processedImpacts.has(e)) {
                processedImpacts.add(e);const point=window.WallImpacts?.surface(e,lastMap,lastReachable);
                if(point){impactMarks.push({...point,at:e.started});if(impactMarks.length>32)impactMarks.shift();}
            }
            for(let i=impactMarks.length-1;i>=0;i--)if(now-impactMarks[i].at>=2000)impactMarks.splice(i,1);
            impactMesh.count=impactMarks.length;
            for(let i=0;i<impactMarks.length;i++) {
                const p=impactMarks[i],scale=Math.min(1,(2000-(now-p.at))/300);
                impactDummy.position.set(p.x,p.y,p.z);impactDummy.quaternion.setFromUnitVectors(planeNormal,impactNormal.set(p.nx,p.ny,p.nz));impactDummy.scale.setScalar(scale);impactDummy.updateMatrix();impactMesh.setMatrixAt(i,impactDummy.matrix);
            }
            impactMesh.instanceMatrix.needsUpdate=true;
        }
        function rebuild(map, reachable) {
            if (lastMap === map && lastReachable === reachable) return;
            lastMap = map; lastReachable = reachable;impactMarks.length=0;impactMesh.count=0;
            scene.remove(terrain);
            terrain.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
            terrain = new T.Group(); scene.add(terrain);
            const floors = [], walls = [], ceilings = [], bulkheads = [], lights = [];
            const size = map.tileSize;
            const ground=window.BlockTerrain.compile(map);
            // Clip cuboid ranges only at visibility/unlock boundaries; never instantiate tiny voxels.
            for(const box of ground.boxes) {
                for(let r=Math.floor(box.min[2]/size);r<Math.ceil(box.max[2]/size);r++)for(let c=Math.floor(box.min[0]/size);c<Math.ceil(box.max[0]/size);c++) {
                    const visible=reachable.has(r+':'+c);
                    if(!visible && !(box.kind==='wall' && [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>reachable.has((r+dz)+':'+(c+dx)))))continue;
                    const x0=Math.max(box.min[0],c*size),x1=Math.min(box.max[0],(c+1)*size),z0=Math.max(box.min[2],r*size),z1=Math.min(box.max[2],(r+1)*size);
                    const target=box.kind==='floor'?floors:box.kind==='ceiling'?ceilings:(box.min[1]>0?bulkheads:walls);
                    target.push([(x0+x1)/2,(box.min[1]+box.max[1])/2,(z0+z1)/2,x1-x0,box.max[1]-box.min[1],z1-z0]);
                }
            }
            // Locked ground-floor sectors still close their entrances.
            for(let r=0;r<map.rows.length;r++)for(let c=0;c<map.rows[r].length;c++)if(!reachable.has(r+':'+c) && ground.support((c+.5)*size,(r+.5)*size)===0 && [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>reachable.has((r+dz)+':'+(c+dx)))) {
                const h=ground.ceiling((c+.5)*size,(r+.5)*size);walls.push([(c+.5)*size,h/2,(r+.5)*size,size,h,size]);
            }
            for(const key of reachable){const [r,c]=key.split(':').map(Number);if((r+c)%6===0)lights.push([(c+.5)*size,ground.ceiling((c+.5)*size,(r+.5)*size)-.5,(r+.5)*size,size*.6,1,4]);}
            function instances(items, color, name, glowing = false) {
                const mesh = new T.InstancedMesh(boxGeometry, material(color, glowing), items.length);
                const dummy = new T.Object3D();
                items.forEach(([x,y,z,w,h,d], i) => {
                    dummy.position.set(x,y,z); dummy.scale.set(w,h,d); dummy.updateMatrix();
                    mesh.setMatrixAt(i, dummy.matrix);
                });
                mesh.name = name; mesh.receiveShadow = !glowing; mesh.castShadow = !glowing && name !== 'lab-ceilings'; terrain.add(mesh);
            }
            instances(floors, '#8799a2', 'lab-floors');
            instances(walls, '#d8e2e6', 'lab-walls');
            // Keep the underside readable without adding a light per tile.
            material('#aebfc8').emissive.set('#aebfc8');
            material('#aebfc8').emissiveIntensity = .25;
            instances(ceilings, '#aebfc8', 'lab-ceilings');
            instances(bulkheads, '#d8e2e6', 'lab-bulkheads');
            instances(lights, '#d5f3ff', 'lab-ceiling-lights', true);
        }
        // Like the reference demo, render first-person arms separately to avoid wall clipping.
        const viewScene = new T.Scene();
        const handLight=new T.HemisphereLight(0xe4f5ff, 0x455262, 1.8);viewScene.add(handLight);
        const sniperKey=new T.DirectionalLight(0xe3efff,1.7);sniperKey.position.set(-1,3,-2);
        const sniperFill=new T.DirectionalLight(0xffdfbc,.7);sniperFill.position.set(2,1,2);
        viewScene.add(sniperKey,sniperFill);
        const viewCamera = new T.PerspectiveCamera(58, 1, .01, 10);
        viewCamera.rotation.y = Math.PI;
        const viewModel = window.buildSoldier(T);
        viewScene.add(viewModel.root);
        for (const part of ['Hips','Head']) {
            const node = viewModel.root.getObjectByName(part);
            if (part === 'Head') node.visible = false;
            else for (const child of node.children) if (child.name !== 'Spine') child.visible = false;
        }
        const spine = viewModel.root.getObjectByName('Spine');
        for (const child of spine.children) if (!['UpperArm_L','UpperArm_R','Rifle'].includes(child.name)) child.visible=false;
        // Shoulder blocks sit at eye level in the reference; hide them in first person.
        viewModel.root.traverse(o=>{if(o.isMesh){o.castShadow=false;if(o.parent.name.startsWith('UpperArm_') && o.geometry.parameters.height<.2)o.visible=false;}});
        const viewMixer = new T.AnimationMixer(viewModel.root);
        const viewAction = viewMixer.clipAction(viewModel.clips.find(c=>c.name==='Aim')); viewAction.play();
        const viewMuzzle = viewModel.root.getObjectByName('Muzzle');
        let latestFrame, viewVisible=false;
        const raycaster = new T.Raycaster();
        function aimPoint() {
            if (!latestFrame) return null;
            raycaster.setFromCamera(new T.Vector2(0,0), camera);
            const origin=raycaster.ray.origin, direction=raycaster.ray.direction;
            let distance=2400, result=null;
            // Pick the visible 3D body under the reticle; the server verifies the actual hit.
            // Trajectories and warning meshes must never become aiming targets.
            const hits=raycaster.intersectObjects([...objects.values()].filter(o=>o.root.visible && o.root.isGroup).map(o=>o.root),true);
            const wallHits=raycaster.intersectObject(terrain,true);
            for (const hit of [...hits,...wallHits].sort((a,b)=>a.distance-b.distance)) {
                if (hit.distance<2 || hit.distance>distance) continue;
                let root=hit.object; while(root.parent && root.parent!==scene) root=root.parent;
                if (root.name?.startsWith('player:'+latestFrame.localId)) continue;
                result={x:hit.point.x,y:hit.point.z};
                distance=hit.distance; break;
            }
            if (result) return result;
            const horizontal=Math.hypot(direction.x,direction.z)||1;
            return {x:origin.x+direction.x/horizontal*2400,y:origin.z+direction.z/horizontal*2400};
        }
        function fpsMuzzleWorld() {
            viewScene.updateMatrixWorld(true); viewCamera.updateMatrixWorld(true);
            const point=viewMuzzle.getWorldPosition(new T.Vector3());
            const depth=Math.max(1, -point.clone().applyMatrix4(viewCamera.matrixWorldInverse).z * 16);
            const ndc=point.project(viewCamera);
            // Match the on-screen muzzle across different world/viewmodel FOVs and model scales.
            return new T.Vector3(ndc.x*depth/camera.projectionMatrix.elements[0],
                ndc.y*depth/camera.projectionMatrix.elements[5],-depth).applyMatrix4(camera.matrixWorld);
        }
        const objects = new Map();
        let seen = new Set();
        function object(key, build) {
            seen.add(key);
            if (!objects.has(key)) { const value = build(); objects.set(key, value); scene.add(value.root); }
            return objects.get(key);
        }
        const stationAnchors = new Map();
        const stationPosition = point => stationAnchors.get(point.x+':'+point.y) || point;
        function station(key, point, color, kind = 'terminal') {
            let anchor=point,facing=0,mounted=false;
            if((kind==='terminal' || kind==='breaker' || kind==='spawn') && lastMap && lastReachable) {
                const size=lastMap.tileSize,r=Math.floor(point.y/size),c=Math.floor(point.x/size);
                const directions=[[0,1],[1,0],[0,-1],[-1,0]],depth=kind==='spawn'?.35:kind==='breaker'?4.5:3;
                // Spawn recesses attach to permanent terrain, never to a locked sector.
                const floorAt=(r,c)=>kind==='spawn'?(lastMap.legend?lastMap.legend[lastMap.rows[r]?.[c]]?.solid===false:lastMap.rows[r]?.[c]==='.') : lastReachable.has(r+':'+c);
                if(!floorAt(r,c)) {
                    const edge=directions.find(([dx,dz])=>floorAt(r+dz,c+dx));
                    if(edge) {
                        const [dx,dz]=edge;
                        anchor={x:(c+.5)*size+dx*(size/2+depth),y:(r+.5)*size+dz*(size/2+depth)};
                        facing=Math.atan2(dx,dz);mounted=true;
                    }
                } else if(kind==='breaker' || kind==='spawn') {
                    const walls=directions.filter(([dx,dz])=>!floorAt(r+dz,c+dx));
                    const distance=([dx,dz])=>dx?dx*((c+.5)*size+dx*size/2-point.x):dz*((r+.5)*size+dz*size/2-point.y);
                    walls.sort((a,b)=>distance(a)-distance(b));
                    if(walls.length) {
                        const [dx,dz]=walls[0];
                        anchor={x:dx?(c+.5)*size+dx*(size/2-depth):point.x,y:dz?(r+.5)*size+dz*(size/2-depth):point.y};
                        facing=Math.atan2(-dx,-dz);mounted=true;
                    } else {
                        // Standalone cabinets face away from the closest wall, on one of four axes.
                        const exits=directions.map(([dx,dz])=>{let n=1;while(n<lastMap.rows.length+lastMap.rows[0].length && floorAt(r+dz*n,c+dx*n))n++;return {dx,dz,n};});
                        exits.sort((a,b)=>a.n-b.n);
                        facing=Math.atan2(-exits[0].dx,-exits[0].dz);
                    }
                }
            }
            stationAnchors.set(point.x+':'+point.y,anchor);
            const item = object(key + ':' + kind + ':' + color + ':' + mounted, () => {
                const root = new T.Group();
                let turretHead, muzzle;
                root.name = key + ':' + kind;
                const model=window.MapObjectModels?.build(T,kind,{material,boxGeometry,cylinderGeometry,item:point.item});
                if(model) {
                    root.add(model);
                } else if (kind === 'core') {
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
                    const timber=kind==='barricade';
                    for(const x of [-14,14])box(root,4,25,25,timber?'#594b3c':'#384c59',x);
                    if(timber)for(const y of [6,14,22])box(root,34,6,24,'#92745a',0,y);
                    else box(root,34,24,24,color,0,13);
                    if(timber) {
                        for(const angle of [-.55,.55])box(root,3,27,2,'#bd9c73',0,14,13).rotation.z=angle;
                    } else {
                        for(const x of [-11,0,11])box(root,2,23,2,'#526b7a',x,14,13);
                        for(const x of [-12,12])for(const y of [6,22])box(root,2,2,1,'#e3e9e9',x,y,14.5);
                    }
                } else if (kind === 'block') {
                    box(root, 36, 24, 36, color);
                } else if (kind === 'terminal' && mounted) {
                    box(root, 26, 32, 6, '#263e4e', 0, 20);
                    box(root, 18, 18, 2, color, 0, 23, 4, true);
                    for(const x of [-11,11])box(root, 2, 28, 2, '#65d6ee', x, 20, 4, true);
                    box(root, 16, 3, 3, '#172832', 0, 10, 5);
                } else if (kind === 'spawn') {
                    // A dark recess sits flush against the adjacent wall, without signs or lights.
                    box(root,30,44,.5,'#0c1216',0,22);
                    for(const x of [-15.5,15.5])box(root,1,45,.8,'#4e5a60',x,22.5,.3);
                    box(root,32,1,.8,'#4e5a60',0,44.5,.3);
                } else if (kind === 'breaker') {
                    box(root, 20, 29, 9, '#7b909b');
                    box(root, 15, 24, 2, '#d2dce1', 0, 16, 5);
                    box(root, 4, 10, 3, '#34454f', 0, 16, 7);
                    box(root, 12, 4, 3, color, 0, 24, 7, true);
                    for(const x of [-11,11])box(root,2,29,3,color,x,15,5,true);
                    const lever=box(root,6,3,5,'#34454f',0,16,9);lever.rotation.x=color==='#ff5964'?.6:-.6;
                } else {
                    box(root, 32, 5, 30, '#354855');
                    box(root, 28, 21, 24, '#426577', 0, 15);
                    const screen = box(root, 21, 2, 15, color, 0, 27, 0, true); screen.rotation.x = -.18;
                    box(root, 23, 3, 4, '#425966', 0, 17, 13);
                }
                return { root, turretHead, muzzle };
            });
            item.root.position.set(anchor.x, 0, anchor.y);
            item.root.rotation.y=facing;item.root.userData.wallMounted=mounted;
            return item;
        }
        const enemyColors = { grunt: '#687a73', runner: '#b4b18a', brute: '#596260', armored: '#6d8395',
            hunter: '#a86a6a', siege: '#88784c', champion: '#8b689d', coreHunter: '#d4954b',
            finalBoss: '#57223e', poisoner: '#84982f', artilleryElite: '#345b2b', boss: '#39363d', warden: '#526679', warlord: '#75434a', titan: '#6b496f',
            tiny: '#a9bd75', shield: '#4c8ca4', bomber: '#e38d47', artillery: '#749749',
            gilded: '#e8b94f', blueAce: '#358dff', carrier: '#9b7655', blackout: '#27584d', seeker: '#a35e70', explosionBoss: '#171b20' };
        function enemy(entity, point, radius, now, hitFlash=false) {
            const item = object('enemy:' + entity.id + ':' + entity.type, () => {
                const root = new T.Group(); root.name='enemy:'+entity.id;
                if(entity.type==='grunt') {
                    const zombie=window.buildLabZombie(T,{box,sphereGeometry,material},radius);root.add(zombie.root);
                    return {root,body:zombie.body,zombie};
                }
                const body = new T.Mesh(sphereGeometry, material(enemyColors[entity.type] || '#869095'));
                body.scale.set(radius * .9, radius * .8, radius * .8); body.position.y = radius * .8;
                body.castShadow = true; root.add(body);
                for (const x of [-.3,.3]) box(root, radius * .18, radius * .15, radius * .12, '#ff826c', radius*x, radius*1.2, radius*.7, true);
                if (entity.type === 'shield') box(root, radius * 1.5, radius * 1.5, 6, '#78b7ca', 0, radius, radius);
                if (entity.type === 'carrier') box(root, 22, 27, 20, '#886543', 0, 17, -radius);
                if (entity.type === 'artillery' || entity.type === 'artilleryElite') box(root, 10, 20, 10, '#b7d471', 0, radius*1.8);
                if (entity.type === 'artilleryElite') for (const x of [-10,10]) box(root, 8, 18, 8, '#b7d471', x, radius*1.6);
                if (entity.type === 'poisoner') box(root, 12, 16, 12, '#b4cf48', 0, radius, -radius);
                return { root, body };
            });
            for(const [mesh,original] of item.flashMaterials || [])mesh.material=original;
            item.flashMaterials=null;
            item.root.position.set(point.x, 0, point.y);
            item.root.userData.entity={x:point.x,y:point.y};
            item.root.rotation.y = Math.atan2(entity.facingX || 0, entity.facingY ?? 1);
            item.zombie?.update(point,now,entity.frozenRemaining>0);
            item.body.material = material(entity.frozenRemaining > 0 ? '#95dded'
                : entity.type === 'explosionBoss' && entity.fuse >= 0 && Math.sin(now / Math.max(50, entity.fuse * 15)) > 0 ? '#d64e58'
                : enemyColors[entity.type] || '#869095');
            if(hitFlash) {
                item.flashMaterials=new Map();
                item.root.traverse(mesh=>{if(mesh.isMesh){item.flashMaterials.set(mesh,mesh.material);mesh.material=material('#ef4250',true);}});
            }
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
                        const rock=new T.Mesh(node.type==='silver'?cylinderGeometry:sphereGeometry,material(node.type==='ore'?'#56636b':color));
                        rock.scale.set(node.type==='silver'?r*.45:r,node.type==='silver'?r*1.8:r*.7,node.type==='silver'?r*.45:r*.8);rock.position.set(x,node.type==='silver'?r*.9:r*.6,z);rock.rotation.z=node.type==='silver'?x*.045:0;rock.castShadow=true;root.add(rock);
                    }
                    if(node.type==='ore')for(const x of [-5,2,7])box(root,4,3,3,'#a2aeb4',x,7,2);
                    if(node.type==='copper')for(const x of [-5,4])box(root,5,2,7,'#e0a16c',x,7,1).rotation.y=.4;
                }
                return {root};
            });
            item.root.position.set(node.x,2+Math.sin(now/260+node.x*.01)*1.5,node.y);
        }
        const shotOrigins=new WeakMap();
        function captureEffect(effect) {
            if(shotOrigins.has(effect) || !latestFrame || !Number.isFinite(effect.fromX) || !Number.isFinite(effect.fromY))return;
            const local=effect.playerId===latestFrame.localId && effect.weapon!=='turret' && (viewVisible || latestFrame.scoped);
            let muzzle;
            if(effect.weapon==='turret') {
                const slot=latestFrame.state.slots?.find(s=>s.defense&&Math.hypot(s.x-effect.fromX,s.y-effect.fromY)<2);
                if(slot)for(const [key,value] of objects)if(key.startsWith('defense:'+slot.id+':')){muzzle=value.muzzle;break;}
            } else {
                const owner=latestFrame.state.players.find(p=>p.id===effect.playerId);
                muzzle=owner?.drone?.active&&Math.hypot(owner.drone.x-effect.fromX,owner.drone.y-effect.fromY)<12 ? objects.get('drone:'+owner.id)?.muzzle : objects.get('player:'+effect.playerId)?.muzzle;
            }
            const start=local ? fpsMuzzleWorld() : muzzle ? muzzle.getWorldPosition(new T.Vector3()) : new T.Vector3(effect.fromX,Number.isFinite(effect.fromHeight)?effect.fromHeight:22,effect.fromY);
            shotOrigins.set(effect,start.clone());
        }
        function shotOrigin(effect) {captureEffect(effect);return shotOrigins.get(effect)?.clone() || new T.Vector3(effect.fromX,22,effect.fromY);}
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
                const tubeMat=new T.MeshBasicMaterial({color:'#ff5964',transparent:true,depthWrite:false});
                const tube=new T.Mesh(cylinderGeometry,tubeMat);root.add(tube);
                return {root,tube,dispose(){geometry.dispose();mat.dispose();tubeMat.dispose();}};
            });
            // A fired trajectory belongs to the world; turning must not drag its origin.
            if (!item.initialized) {
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
                const localShot=effect.playerId===latestFrame.localId && effect.weapon!=='turret' && (viewVisible || latestFrame.scoped);
                const start=shotOrigins.has(effect) ? shotOrigin(effect) : localShot ? shotOrigin(effect) : muzzle ? muzzle.getWorldPosition(new T.Vector3()) : shotOrigin(effect);
                const target=state.enemies.find(e=>e.id===effect.enemyId);
                let height=target ? Math.max(6,radius(target)*.8) : start.y;
                if(localShot && !target) {
                    const distance=Math.hypot(effect.x-effect.fromX,effect.y-effect.fromY);
                    height=camera.position.y+Math.tan(latestFrame.view?.pitch || 0)*distance;
                }
                if(Number.isFinite(effect.hitHeight))height=effect.hitHeight;
                const end=new T.Vector3(effect.x,height,effect.y);
                const positions=item.root.geometry.attributes.position;
                positions.setXYZ(0,start.x,start.y,start.z); positions.setXYZ(1,end.x,end.y,end.z);positions.needsUpdate=true;
                const delta=end.clone().sub(start);
                item.tube.position.copy(start).add(end).multiplyScalar(.5);
                item.tube.scale.set(.35,delta.length(),.35);
                item.tube.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());
                item.initialized=true;
            }
            item.root.material.opacity=Math.max(0,1-(now-effect.started)/198);
            item.tube.material.opacity=item.root.material.opacity;
        }
        function project(x,y,height=0) {
            const p=new T.Vector3(x,height,y).project(camera);
            let visible=p.z>=-1 && p.z<=1 && Math.abs(p.x)<1.1 && Math.abs(p.y)<1.1;
            if(darkened && Math.hypot(x-camera.position.x,y-camera.position.z)>145)visible=false;
            if(visible){const target=new T.Vector3(x,height,y),delta=target.clone().sub(camera.position);raycaster.set(camera.position,delta.clone().normalize());const wall=raycaster.intersectObject(terrain,true)[0];if(wall && wall.distance<delta.length()-3)visible=false;}
            const depth = -new T.Vector3(x,height,y).applyMatrix4(camera.matrixWorldInverse).z;
            const pixelsPerUnit = overlay.height * camera.projectionMatrix.elements[5] / (2 * Math.max(.5, depth));
            return {x:(p.x+1)*overlay.width/2,y:(1-p.y)*overlay.height/2,visible,pixelsPerUnit};
        }

        const ringGeometry=new T.RingGeometry(.88,1,48);
        function ring(key,x,y,r,color,opacity=.6) {
            const item=object(key,()=>{const mat=new T.MeshBasicMaterial({color,transparent:true,opacity,side:T.DoubleSide,depthWrite:false});const root=new T.Mesh(ringGeometry,mat);root.name=key;root.rotation.x=-Math.PI/2;return {root,dispose(){mat.dispose();}};});
            item.root.position.set(x,.7,y);item.root.scale.setScalar(r);item.root.material.color.set(color);item.root.material.opacity=opacity;
        }
        const squareGeometry=new T.PlaneGeometry(2,2);
        function healSquare(key,x,y,halfSize) {
            const item=object(key,()=>{
                const mat=new T.MeshBasicMaterial({color:'#41df99',transparent:true,opacity:.42,side:T.DoubleSide,depthWrite:false});
                const root=new T.Mesh(squareGeometry,mat);root.name=key;root.rotation.x=-Math.PI/2;
                const border=new T.LineLoop(new T.BufferGeometry().setFromPoints([new T.Vector3(-1,-1,0),new T.Vector3(1,-1,0),new T.Vector3(1,1,0),new T.Vector3(-1,1,0)]),new T.LineBasicMaterial({color:'#50ffc0',transparent:true,opacity:.95}));root.add(border);
                return {root,dispose(){mat.dispose();border.geometry.dispose();border.material.dispose();}};
            });
            item.root.position.set(x,.7,y);item.root.scale.set(halfSize,halfSize,1);
        }
        function beam(key,a,b,color,width=1) {
            const item=object(key,()=>{const root=new T.Mesh(cylinderGeometry,material(color,true));root.name=key;return {root};});
            const delta=b.clone().sub(a);item.root.position.copy(a).add(b).multiplyScalar(.5);item.root.scale.set(width,delta.length(),width);item.root.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());
        }
        function firedBeam(effect,color,width) {
            if(!effectIds.has(effect))effectIds.set(effect,++nextEffectId);
            const item=object('special:'+effectIds.get(effect),()=>{
                const root=new T.Mesh(cylinderGeometry,material(color,true));root.name='fired-special-beam';
                const start=shotOrigin(effect),end=new T.Vector3(effect.x,Number.isFinite(effect.hitHeight)?effect.hitHeight:22,effect.y);
                const delta=end.clone().sub(start);root.position.copy(start).add(end).multiplyScalar(.5);
                root.scale.set(width,delta.length(),width);root.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());
                return {root};
            });
        }
        function flameParticles(effect,age,count) {
            if(!effectIds.has(effect))effectIds.set(effect,++nextEffectId);
            const item=object('flame:'+effectIds.get(effect),()=>{
                const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(18),3));
                const mat=new T.PointsMaterial({color:'#ff962e',size:4,transparent:true,depthWrite:false});
                const root=new T.Points(geometry,mat);root.name='flame-particles';
                return {root,start:shotOrigin(effect),dispose(){geometry.dispose();mat.dispose();}};
            });
            const start=item.start,angle=Math.atan2(effect.y-effect.fromY,effect.x-effect.fromX);
            const range=Math.min(180,Math.hypot(effect.x-effect.fromX,effect.y-effect.fromY));
            const positions=item.root.geometry.attributes.position;
            item.root.geometry.setDrawRange(0,count);
            for(let i=0;i<count;i++){
                const spread=(i/Math.max(1,count-1)-.5)*.8,travel=range*Math.min(1,(age/180)*(.6+i*.07));
                positions.setXYZ(i,start.x+Math.cos(angle+spread)*travel,start.y+(i%3-1)*travel*.08,start.z+Math.sin(angle+spread)*travel);
            }
            positions.needsUpdate=true;item.root.material.opacity=Math.max(0,1-age/180);
        }
        let missileRadius=120;
        function repulsorWave(effect,age) {
            if(!effectIds.has(effect))effectIds.set(effect,++nextEffectId);
            const item=object('pressure:'+effectIds.get(effect),()=>{
                const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(18*25*3),3));
                const mat=new T.PointsMaterial({color:'#9adff5',size:3,sizeAttenuation:false,transparent:true,depthWrite:false});
                const root=new T.Points(geometry,mat);root.name='repulsor-longitudinal-wave';root.frustumCulled=false;
                const length=Math.hypot(effect.x-effect.fromX,effect.y-effect.fromY),dx=(effect.x-effect.fromX)/Math.max(1,length),dz=(effect.y-effect.fromY)/Math.max(1,length);
                return {root,start:shotOrigin(effect),length,dx,dz,dispose(){geometry.dispose();mat.dispose();}};
            });
            const positions=item.root.geometry.attributes.position,front=item.length*Math.min(1,age/320);
            let count=0;
            for(let layer=0;layer<18;layer++) {
                const rest=layer*item.length/17;if(rest>front)break;
                // Every particle oscillates ALONG propagation; transverse coordinates stay fixed.
                const distance=Math.max(0,rest+5*Math.sin(rest*.18-age*.035));
                for(let row=-2;row<=2;row++)for(let col=-2;col<=2;col++) {
                    positions.setXYZ(count++,item.start.x+item.dx*distance-item.dz*col*5,item.start.y+row*5,item.start.z+item.dz*distance+item.dx*col*5);
                }
            }
            positions.needsUpdate=true;item.root.geometry.setDrawRange(0,count);item.root.material.opacity=.85*(1-age/520);
        }
        function missileFlash(effect,age) {
            if(!effectIds.has(effect))effectIds.set(effect,++nextEffectId);
            const item=object('missile-impact:'+effectIds.get(effect),()=>{
                const mat=new T.MeshBasicMaterial({color:'#e5f7ff',transparent:true,opacity:.8,depthWrite:false});
                const root=new T.Mesh(sphereGeometry,mat);root.name='missile-impact-flash';return {root,dispose(){mat.dispose();}};
            });
            const progress=age/650,r=Math.max(8,missileRadius*(.2+progress*.7));
            item.root.position.set(effect.x,8+r*.25,effect.y);item.root.scale.set(r,r*.55,r);item.root.material.opacity=.8*(1-progress);
            ring('missile-shock:'+effectIds.get(effect),effect.x,effect.y,Math.max(5,missileRadius*progress*1.5),'#a7e4ff',1-progress);
            if(age<160)beam('missile-flash-column:'+effectIds.get(effect),new T.Vector3(effect.x,1,effect.y),new T.Vector3(effect.x,100,effect.y),'#e5f7ff',5*(1-age/160));
        }
        function renderCombat(frame,now) {
            const {state,smooth}=frame;
            for(const shot of state.projectiles || []) {const p=smooth('projectile',shot),dx=Math.cos(shot.angle),dy=Math.sin(shot.angle);beam('projectile:'+shot.id,new T.Vector3(p.x-dx*20,(shot.height ?? 16)-(shot.slope || 0)*20,p.y-dy*20),new T.Vector3(p.x,shot.height ?? 16,p.y),shot.source==='enemy'?'#ff7050':'#69dfff',1.5);}
            for(const shell of state.artilleryShells || []) {ring('shell:'+shell.id,shell.x,shell.y,shell.radius,'#7edc7a');const remaining=shell.remaining-Math.max(0,(now-(state.artilleryReceivedAt || now))/1000);const progress=Math.max(0,Math.min(1,1-remaining/shell.duration));const x=shell.sourceX+(shell.x-shell.sourceX)*progress,y=shell.sourceY+(shell.y-shell.sourceY)*progress;beam('shell-body:'+shell.id,new T.Vector3(x,5+Math.sin(progress*Math.PI)*65,y),new T.Vector3(x,12+Math.sin(progress*Math.PI)*65,y),'#7edc7a',3);}
            for(const [i,strike] of (state.missiles || []).entries()) {
                missileRadius=strike.radius || 120;
                const pulse=.65+.35*Math.sin(now*.018);
                ring('missile:'+i,strike.x,strike.y,missileRadius,'#79bfff',pulse);
                ring('missile-inner:'+i,strike.x,strike.y,missileRadius*.55,'#d9f4ff',pulse);
                beam('missile-beacon:'+i,new T.Vector3(strike.x,2,strike.y),new T.Vector3(strike.x,100,strike.y),'#a7e4ff',2);
                for(const [dx,dz] of [[1,0],[0,1]])beam('missile-cross:'+i+dx,new T.Vector3(strike.x-dx*18,1.2,strike.y-dz*18),new T.Vector3(strike.x+dx*18,1.2,strike.y+dz*18),'#e5f7ff',1.5);
            }
            for(const [i,area] of (state.healingAreas || []).entries()) ring('healing:'+i,area.x,area.y,area.radius || 100,'#84e6b5',.3);
            for(const [i,gas] of (state.poisonClouds || state.poisonGas || []).entries()) ring('gas:'+i,gas.x,gas.y,gas.radius || 80,gas.hostile?'#a6ce46':'#b46eeb',gas.hostile?.8:.5);
            for(const player of state.players) {
                const p=player.id===frame.localId && frame.predicted ? frame.predicted : smooth('player',player);
                for(const [side,remaining,dx,dy,range,pitch] of [['main',player.railgunRemaining,player.railgunDx,player.railgunDy,player.railgunRange,player.railgunPitch],['sub',player.secondaryRailgunRemaining,player.secondaryRailgunDx,player.secondaryRailgunDy,player.secondaryRailgunRange,player.secondaryRailgunPitch]]) if(remaining>0) {
                    const height=(Number.isFinite(pitch)?26:22)+(p.jumpHeight || player.jumpHeight || 0);
                    const start=player.id===frame.localId && viewVisible ? fpsMuzzleWorld() : new T.Vector3(p.x,height,p.y);
                    beam('rail:'+player.id+side,start,new T.Vector3(p.x+dx*range,height+Math.tan(pitch || 0)*range,p.y+dy*range),'#ff7390',2);
                }
            }
            for(const enemy of state.enemies) if(enemy.hp>0 && enemy.chargeWarning>0) {const p=smooth('enemy',enemy);beam('charge:'+enemy.id,new T.Vector3(p.x,1,p.y),new T.Vector3(p.x+enemy.chargeDx*286,1,p.y+enemy.chargeDy*286),'#ff5964',5);}
            for(const enemy of state.enemies) if(enemy.hp>0 && ['PULSE_WARNING','SUMMON_WARNING'].includes(enemy.bossAction)) {
                ring('boss-warning:'+enemy.id,enemy.x,enemy.y,enemy.pulseRadius,enemy.bossAction==='SUMMON_WARNING'?'#9ce8ff':'#ffac70',.95);
            }
            const placement=frame.placement;if(placement) ring('placement',placement.x,placement.y,19,placement.valid?'#79d8ff':'#ff5964',.9);
            for(const owner of state.players) {
                for(const [i,pad] of (owner.teleportPads || []).entries()) ring('teleport:'+owner.id+':'+i,pad.x,pad.y,18,'#ab9cff');
                if(owner.healRemaining>0)healSquare('heal:'+owner.id,owner.healX,owner.healY,owner.healHalfSize || 60);
                if(owner.hookTargetId>=0){const target=state.enemies.find(e=>e.id===owner.hookTargetId && e.hp>0);if(target)beam('hook:'+owner.id,new T.Vector3(owner.x,22,owner.y),new T.Vector3(target.x,20,target.y),'#b4e9ff',.7);}
            }
            for(const decoy of state.decoys || []) if(decoy.hp>0) {
                const item=object('decoy:'+decoy.ownerId,()=>{
                    const model=window.buildSoldier(T),root=new T.Group();root.name='decoy:'+decoy.ownerId;
                    root.add(model.root);model.root.scale.setScalar(16);model.setWeapon('pistol');
                    for(const mat of Object.values(model.materials)){mat.color.set('#c9af62');mat.transparent=true;mat.opacity=.7;}
                    const mixer=new T.AnimationMixer(model.root);mixer.clipAction(model.clips.find(c=>c.name==='Aim')).play();
                    return {root,mixer,materials:model.materials};
                });
                item.root.position.set(decoy.x,0,decoy.y);item.root.rotation.y=Math.atan2(decoy.facingX || 0,decoy.facingY ?? 1);item.mixer.update(.016);
            }
            let flameRemaining=48;const flameEmitters=new Map();
            for(const effect of frame.effects || []) {
                const age=now-effect.started;
                if(effect.effect==='missile-impact' && age>=0 && age<650)missileFlash(effect,age);
                if(effect.effect==='hit' && effect.weapon==='repulsor' && effect.damage===0 && age>=0 && age<520)repulsorWave(effect,age);
                if(effect.effect==='hit' && age>=0 && age<360 && ['rocket','mine','droneExplosion','freezeGun','poisonGas'].includes(effect.weapon)) ring('blast:'+effectIds.get(effect)+':'+effect.started,effect.x,effect.y,Math.max(4,(effect.radius || 35)*age/360),effect.weapon==='freezeGun'?'#95dded':'#ffae62',1-age/360);
                if(effect.effect==='hit' && age>=0 && age<220 && effect.damage===0 && ['laserCannon','freezeGun','plasmaBlade'].includes(effect.weapon)) {
                    firedBeam(effect,effect.weapon==='freezeGun'?'#b8efff':'#50d7ff',effect.weapon==='laserCannon'?3:1.5);
                }
                if(effect.effect==='hit' && age>=0 && age<180 && effect.weapon==='flamethrower' && effect.damage===0 && effect.enemyId==null) {
                    const used=flameEmitters.get(effect.playerId)||0,count=Math.min(6,12-used,flameRemaining);
                    if(count>0){flameParticles(effect,age,count);flameEmitters.set(effect.playerId,used+count);flameRemaining-=count;}
                }
            }
        }
        function collect() {
            for (const [key,item] of objects) if (!seen.has(key)) {
                scene.remove(item.root);
                item.dispose?.();
                if (item.mixer) { item.mixer.stopAllAction(); item.mixer.uncacheRoot(item.mixer.getRoot());
                    item.root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
                    const unique = new Set(); item.root.traverse(o => { if (o.isMesh) unique.add(o.material); }); Object.values(item.materials || {}).forEach(m=>unique.add(m));unique.forEach(m => m.dispose());
                }
                objects.delete(key);
            }
        }
        let lastFrame = performance.now(), walkPhase=0, walkBlend=0, recoil=0, sniperRecoil=0, batSwingAt=-Infinity, lastKickAt=-Infinity, lastWalkPoint=null;
        const kickedEffects=new WeakSet(),lastGunKick=new Map();
        function render(frame) {
            const { map, reachable, center, scale, state, localId, predicted, smooth, radius, stations, aim, effects = [] } = frame;
            const now = performance.now(), dt = Math.min(.1, (now - lastFrame) / 1000); lastFrame = now;
            if (renderer.domElement.width !== overlay.width || renderer.domElement.height !== overlay.height)
                renderer.setSize(overlay.width, overlay.height, false);
            latestFrame=frame;stationAnchors.clear();
            const me=state?.players.find(p=>p.id===localId), view=frame.view || {yaw:0,pitch:0};
            const eye=frame.eye || predicted || me || center;
            camera.aspect=overlay.width/overlay.height; camera.fov=window.AimControl.viewFov(me?.weapon,view,frame.scoped); camera.updateProjectionMatrix();
            const walking=frame.motion?.moving && !me?.sniper?.fixed && !me?.down && !me?.drone?.controlled && !(eye.jumpHeight>0);
            const walkPoint=predicted || eye;
            // Keep a relaxed stride, even during dashes or position corrections.
            if(walking && lastWalkPoint) walkPhase+=Math.min(
                Math.hypot(walkPoint.x-lastWalkPoint.x,walkPoint.y-lastWalkPoint.y)*.032,dt*6);
            lastWalkPoint={x:walkPoint.x,y:walkPoint.y};
            walkBlend+=((walking?1:0)-walkBlend)*(1-Math.exp(-12*dt));
            recoil*=Math.exp(-18*dt);sniperRecoil*=Math.exp(-7*dt);
            if(frame.motion) for(const effect of effects) if(effect.playerId===localId && effect.effect==='hit' && effect.damage===0 && now-effect.started<120 && !kickedEffects.has(effect)) {
                kickedEffects.add(effect);
                const kick=window.AimControl?.recoilPitch(effect.weapon) || 0;
                if(kick>0) {
                    // Shotgun pellets share one discharge; persistent effects must not kick twice.
                    if(effect.started-(lastGunKick.get(effect.weapon) ?? -Infinity)<25)continue;
                    lastGunKick.set(effect.weapon,effect.started);
                    if(!(me?.railgunRemaining>0 || me?.secondaryRailgunRemaining>0))view.pitch=Math.min(1.2,view.pitch+kick);
                }
                if(effect.weapon==='sniper'){sniperRecoil=Math.min(1.35,sniperRecoil+1);view.yaw+=(Math.sin(effect.started*1.7)>=0?1:-1)*.008;}
                else if(effect.weapon==='bat')batSwingAt=now;
                else if(now-lastKickAt>25){recoil=Math.min(1,recoil+.65);lastKickAt=now;}
            }
            const firingRail=me?.railgunRemaining>0 || me?.secondaryRailgunRemaining>0;
            const bob=(firingRail || me?.sniper?.fixed ? 0 : 1)*walkBlend*(frame.scoped ? .12 : 1)*(frame.motion?.dashing?1.15:1);
            camera.position.set(eye.x, me?.down ? 6 : me?.drone?.controlled ? 23 : (me?.sniper?.fixed ? 6.2 : 26)+(eye.jumpHeight || 0)+(eye.renderOffsetHeight || 0)+Math.sin(walkPhase*2)*.32*bob, eye.y);
            view.recoilPitch=firingRail || window.AimControl?.supported(me?.weapon) ? 0 : recoil*(frame.scoped ? .006 : .003);
            camera.rotation.set(Math.max(-1.2,Math.min(1.2,view.pitch+view.recoilPitch)),-view.yaw,me?.down ? .2 : Math.sin(walkPhase)*.0025*bob,'YXZ');
            camera.updateMatrixWorld(true);
            darkened=!!state?.blackoutActive && !me?.drone?.controlled && !frame.nightVision;
            scene.fog=darkened?blackoutFog:null;scene.background.set(darkened?'#010205':'#141e26');
            ambient.intensity=darkened?.07:.75;sun.intensity=darkened?.08:1;
            nearbyLight.visible=darkened;nearbyLight.position.copy(camera.position);
            handLight.intensity=darkened?.38:1.8;sniperKey.intensity=darkened?.4:1.7;sniperFill.intensity=darkened?.15:.7;
            const holdingSniper=me?.weapon==='sniper';
            const ads=holdingSniper?(view.sniperAds ?? (frame.scoped?1:0)):0;
            viewCamera.aspect=camera.aspect;viewCamera.fov=holdingSniper ? 62-4*ads : 58;viewCamera.updateProjectionMatrix();
            viewCamera.position.set(view.zoom ? -.1 : .03,view.zoom ? 1.58 : 1.65,view.zoom ? .16 : holdingSniper ? -.45 : -.37);
            if(holdingSniper)viewCamera.position.set(.03,1.65,-.45);
            viewCamera.position.x+=Math.sin(walkPhase)*.008*bob*(1-ads);
            viewCamera.position.y+=Math.sin(walkPhase*2)*.01*bob*(1-ads);
            viewCamera.position.z-=recoil*.035+sniperRecoil*.13;
            viewCamera.rotation.x=-recoil*.035-sniperRecoil*.12;
            sniperKey.visible=sniperFill.visible=['sniper','pistol','shotgun'].includes(me?.weapon);
            // Restore procedural overrides before the mixer, which skips unchanged animation tracks.
            viewModel.resetProceduralPose();
            viewModel.resetBatPose();
            viewModel.setWeapon(me?.weapon || 'pistol');viewMixer.update(dt);
            viewModel.root.rotation.z=0;
            if(me?.weapon==='pistol'){viewModel.saveProceduralPose();viewModel.posePistolGrip();}
            if(me?.weapon==='bat')viewModel.poseBat((now-batSwingAt)/1000);
            else batSwingAt=-Infinity;
            if(holdingSniper && ads>0){
                viewModel.root.updateMatrixWorld(true);
                const scopeEye=viewModel.root.getObjectByName('Rifle').localToWorld(new T.Vector3(0,.182,-.272));
                viewCamera.position.lerp(scopeEye,ads);
            }
            viewVisible=!!me && (!frame.scoped || holdingSniper && ads<.9) && !me.down && !me.movingCore && !me.selectedBuild && !me.drone?.controlled && !me.missileControl;
            viewModel.root.visible=viewVisible;
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
                        actions.Idle.play(); return { root, mixer, actions, model, muzzle: model.root.getObjectByName('Muzzle'), materials: model.materials, clip: 'Idle', previous: { ...point } };
                    });
                    const distance = Math.hypot(point.x-item.previous.x, point.y-item.previous.y);
                    const moving = distance > .12;
                    const aiming = !player.down && !player.drone?.controlled;
                    const prone=!!player.sniper?.fixed && !player.down;
                    const clip = aiming ? moving ? 'AimWalk' : 'Aim' : moving ? 'Walk' : 'Idle';
                    if (clip !== item.clip) { item.actions[item.clip].fadeOut(.15); item.actions[clip].reset().fadeIn(.15).play(); item.clip = clip; }
                    item.model.resetProceduralPose();
                    item.model.setWeapon(player.weapon || 'rifle');
                    item.mixer.update(dt);
                    if(player.down) {
                        item.crawlPhase=(item.crawlPhase || 0)+Math.min(distance,8)*Math.PI*2/38;
                        item.crawlAmount=(item.crawlAmount || 0)+((moving?1:0)-(item.crawlAmount || 0))*(1-Math.exp(-dt/.12));
                        item.model.saveProceduralPose();
                        item.model.poseDown(item.crawlPhase,item.crawlAmount);
                    } else {
                        item.crawlPhase=0;item.crawlAmount=0;
                        if(prone) {
                            item.model.saveProceduralPose();
                            window.applySniperStance(T,item.model,player.sniper.pitch || 0);
                        } else if(player.weapon==='pistol') {
                            item.model.saveProceduralPose();item.model.posePistolGrip();
                        }
                    }
                    item.previous = { ...point };
                    item.materials.Olive.color.set(player.down ? '#a86b70' : player.spyRemaining > 0 ? '#8b8e91' : player.id === localId ? '#63879a' : '#67786a');
                    item.root.position.set(point.x, (point.jumpHeight || player.jumpHeight || 0), point.y);
                    const shot=effects.filter(e=>e.playerId===player.id && e.effect==='hit' && now-e.started<360 && e.fromX!=null).at(-1);
                    const target=player.id===localId && !player.drone?.controlled ? aim : null;
                    const dx=prone ? player.sniper.facingX : target ? target.x-point.x : shot ? shot.x-shot.fromX : player.facingX || 0;
                    const dz=prone ? player.sniper.facingY : target ? target.y-point.y : shot ? shot.y-shot.fromY : player.facingY ?? -1;
                    item.root.rotation.set(0, Math.atan2(dx,dz), 0);
                    item.root.userData.entity={x:point.x,y:point.y};
                    item.root.visible = player.id!==localId && (!(player.tpInvulnerableRemaining > 0 || player.reviveInvulnerableRemaining > 0) || Math.floor(now/100)%2 === 0);
                }
                const hitEnemies=new Set(effects.filter(e=>e.effect==='hit' && e.playerId===localId && e.enemyId!=null && e.damage>0 && now>=e.started && now-e.started<180).map(e=>e.enemyId));
                for (const entity of state.enemies) if (entity.hp > 0)
                    enemy(entity, smooth('enemy', entity), radius(entity), now,hitEnemies.has(entity.id));
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
            if (state) {
                renderCombat(frame,now);
                renderWallImpacts(effects,now);
            }
            // Transient objects are collected after resources and tracers have marked themselves live.
            collect();
            renderer.autoClear=true; renderer.render(scene, camera);
            if (viewVisible) { renderer.autoClear=false; renderer.clearDepth(); renderer.render(viewScene,viewCamera); renderer.autoClear=true; }
        }
        renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); });
        return { render, captureEffect, groundScale, project, aimPoint, stationPosition, firstPerson:true };
    }
    return { create, groundScale };
})();
