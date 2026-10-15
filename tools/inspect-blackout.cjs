// Structural inspection only: no WebGL/GPU timing is measured by this script.
// Run from the worktree root: node tools/inspect-blackout.cjs
'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const THREE = require('../client/vendor/three.min.js');
let scene, camera, webglRenderer, now = 1000;
THREE.WebGLRenderer = class {
    constructor() {
        this.domElement = {width: 0, height: 0, addEventListener() {}};
        this.shadowMap = {};
        webglRenderer = this;
    }
    setSize(width, height) { Object.assign(this.domElement, {width, height}); }
    clearDepth() {}
    render(s, c) {
        s.updateMatrixWorld(true); c.updateMatrixWorld(true);
        if (c.near !== .01) { scene = s; camera = c; }
    }
};
let detailed=true;
const context = vm.createContext({window: {THREE,coreGraphicsSettings:{getShadows:()=>detailed}}, document: {body: {classList: {add() {}}}},
    performance: {now: () => now}, console});
for (const name of ['aim-control', 'soldier-model', 'sniper-stance', 'organic-enemy-models',
    'lab-enemy-models', 'wall-impacts', 'block-terrain', 'map-object-models', 'hit-presentation', 'lab3d'])
    vm.runInContext(fs.readFileSync(`client/${name}.js`, 'utf8'), context);
const lab = context.window.Lab3D.create({width: 1280, height: 720, before() {}});
const mapData = JSON.parse(fs.readFileSync('shared/map.json', 'utf8'));
const map = mapData.tileMap, reachable = new Set();
map.rows.forEach((row, r) => [...row].forEach((cell, c) => {
    if (cell !== '#') reachable.add(`${r}:${c}`);
}));
const player = {id: 'me', ...mapData.core, weapon: 'pistol', hp: 100};
const state = {core: mapData.core, players: [player], slots: [], resources: [], drops: [],
    enemies: Array.from({length: 64}, (_, id) => ({id, type: 'grunt',
        x: player.x + (id % 8 - 4) * 40, y: player.y - 200 - Math.floor(id / 8) * 60,
        hp: 100, maxHp: 100, facingX: 0, facingY: 1}))};
const frame = {map, reachable, center: player, eye: player, predicted: player,
    view: {yaw: 0, pitch: 0}, scale: 1, state, localId: 'me', smooth: (_, p) => p,
    radius: () => 21, stations: [], effects: []};
function inspect(label, blackout, nightVision = false) {
    state.blackoutActive = blackout; frame.nightVision = nightVision; now += 16;
    lab.render(frame);
    const counts = {label, detailed, fog: !!scene.fog, fogNear: scene.fog?.near,
        cameraFar:camera.far,shadowMapEnabled: webglRenderer.shadowMap.enabled,
        shadowAutoUpdate:webglRenderer.shadowMap.autoUpdate,
        directionalLights: 0, pointLights: 0, shadowLights: 0, visibleMeshes: 0,
        castShadowMeshes: 0, meshesEntirelyBeyondFog: 0};
    const materials = new Set(), bounds = new THREE.Box3(), farPlane = new THREE.Plane();
    // Fog is based on view depth, not radial distance. Test the entire world-space box.
    farPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),
        camera.position.clone().addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 160));
    scene.traverseVisible(o => {
        if (o.isLight && o.layers.test(camera.layers)) {
            if (o.isDirectionalLight) counts.directionalLights++;
            if (o.isPointLight) counts.pointLights++;
            if (o.castShadow) counts.shadowLights++;
        }
        if (!o.isMesh || !o.layers.test(camera.layers)) return;
        counts.visibleMeshes++;
        if (o.castShadow) counts.castShadowMeshes++;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
        // Enemy ordinary meshes only; InstancedMesh bounds need separate handling in r149.
        if (!o.isInstancedMesh) {
            bounds.setFromObject(o);
            const nearest = new THREE.Vector3(
                farPlane.normal.x >= 0 ? bounds.min.x : bounds.max.x,
                farPlane.normal.y >= 0 ? bounds.min.y : bounds.max.y,
                farPlane.normal.z >= 0 ? bounds.min.z : bounds.max.z);
            if (farPlane.distanceToPoint(nearest) > 0) counts.meshesEntirelyBeyondFog++;
        }
    });
    counts.materialInstances = materials.size;
    console.log(JSON.stringify(counts));
}
console.log(`Three.js r${THREE.REVISION}; full map, all non-wall cells reachable, 64 GRUNTs; mocked renderer`);
inspect('normal', false);
inspect('blackout-first', true);
inspect('blackout-next', true);
inspect('restored', false);
inspect('night-vision', true, true);
detailed=false;
inspect('simple-normal',false);
inspect('simple-blackout',true);
inspect('simple-night-vision',true,true);
inspect('simple-restored',false);
