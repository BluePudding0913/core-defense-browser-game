// Synthetic Node CPU inspection; does not measure browser FPS or GPU draw calls.
// Run from the worktree root: node tools/inspect-projection-performance.cjs
'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const {performance} = require('node:perf_hooks');
const THREE = require('../client/vendor/three.min.js');
let scene;
THREE.WebGLRenderer = class {
    constructor() { this.domElement = {addEventListener() {}}; this.shadowMap = {}; }
    setSize() {}
    clearDepth() {}
    render(s, c) { s.updateMatrixWorld(true); c.updateMatrixWorld(true); if (c.near !== .01) scene = s; }
};
const context = vm.createContext({window: {THREE, coreGraphicsSettings: {getShadows: () => true}},
    document: {body: {classList: {add() {}}}}, performance: {now: () => 1000}, console});
for (const name of ['aim-control', 'soldier-model', 'sniper-stance', 'organic-enemy-models',
    'lab-enemy-models', 'wall-impacts', 'block-terrain', 'map-object-models', 'hit-presentation', 'lab3d'])
    vm.runInContext(fs.readFileSync(`client/${name}.js`, 'utf8'), context);
const lab = context.window.Lab3D.create({width: 1280, height: 720, before() {}});
const mapData = JSON.parse(fs.readFileSync('shared/map.json', 'utf8'));
const map = mapData.tileMap, reachable = new Set();
map.rows.forEach((row, r) => [...row].forEach((cell, c) => { if (cell !== '#') reachable.add(`${r}:${c}`); }));
const player = {id: 'me', ...mapData.core, weapon: 'pistol', hp: 100};
const enemies = Array.from({length: 64}, (_, id) => ({id, type: 'grunt',
    x: player.x + (id % 8 - 4) * 40, y: player.y - 200 - Math.floor(id / 8) * 60,
    hp: 50, maxHp: 100, facingX: 0, facingY: 1}));
const frame = {map, reachable, center: player, eye: player, predicted: player,
    view: {yaw: 0, pitch: 0}, scale: 1,
    state: {core: mapData.core, players: [player], slots: [], resources: [], drops: [], enemies},
    localId: 'me', smooth: (_, p) => p, radius: () => 21, stations: [], effects: []};
lab.render(frame);
let meshes = 0, terrainInstances = 0, terrainMeshTests = 0, terrainInstanceCandidates = 0;
scene.traverseVisible(o => {
    if (o.isMesh) meshes++;
    if (!o.isInstancedMesh || !o.name.startsWith('lab-')) return;
    terrainInstances += o.count;
    const original = o.raycast;
    o.raycast = function(...args) {
        terrainMeshTests++;
        terrainInstanceCandidates += this.count;
        return original.apply(this, args);
    };
});
function batch() { for (const enemy of enemies) lab.project(enemy.x, enemy.y, 46.2); }
for (let i = 0; i < 20; i++) batch();
const samples = [];
for (let i = 0; i < 7; i++) {
    terrainMeshTests = terrainInstanceCandidates = 0;
    const start = performance.now(); batch(); samples.push(performance.now() - start);
}
samples.sort((a, b) => a - b);
console.log(JSON.stringify({threeRevision: THREE.REVISION, enemies: enemies.length, visibleMeshes: meshes,
    terrainInstances, terrainMeshTestsPerBatch: terrainMeshTests,
    terrainInstanceCandidatesPerBatch: terrainInstanceCandidates,
    medianProjectionBatchMs: +samples[3].toFixed(2),
    condition: 'all non-wall cells reachable, 64 injured GRUNTs, fixed camera, mocked renderer',
    limitation: 'Node CPU only; candidates are not triangle hits or GPU draw calls; not gameplay FPS'}, null, 2));
