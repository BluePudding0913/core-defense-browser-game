const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const map = JSON.parse(fs.readFileSync('shared/map.json', 'utf8'));
const context = vm.createContext({
    map, TILE_MAP: map.tileMap, WORLD: map.world, AREAS: map.areas,
    ARMORY: map.stations.armory, MED: map.stations.medBay,
    WOODCUTTER: map.stations.woodcutter, QUARRY: map.stations.quarry,
    WORKBENCHES: map.workbenchUnits, SHOP_UNITS: map.shopUnits,
    BREAKER_TERMINALS: map.breakerTerminals, PREP_CONSOLE: map.prepConsole,
    SPAWN_POINTS: map.spawnPoints, myPlayerId: 'me',
    state: { areas: Object.fromEntries(map.areas.map(a => [a.id, true])),
        core: map.core, resources: map.resourceNodes, slots: [], players: [], enemies: [] },
    distance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
});
for (const name of ['isPoint', 'isPositiveNumber', 'requireUniqueIds', 'validateAreaTiles',
    'validateMapPositions', 'validateMap', 'areaContains', 'snapToTile', 'canPredictOccupy',
    'canBuildAt', 'hasInteractionPath']) {
    const start = source.indexOf(`function ${name}(`);
    assert(start >= 0, name);
    const end = source.indexOf('\nfunction ', start + 1);
    vm.runInContext(source.slice(start, end < 0 ? undefined : end), context);
}
const run = code => vm.runInContext(code, context);
run('validateMap(map)');
for (let row = 0; row < map.tileMap.rows.length; row++) {
    for (let col = 0; col < map.tileMap.rows[row].length; col++) {
        context.point = { x: col * 40 + 20, y: row * 40 + 20 };
        assert.equal(run('canPredictOccupy(point.x, point.y, 5)'), map.tileMap.rows[row][col] === '.');
        const snapped = run('snapToTile({x:point.x-19.9,y:point.y+19.9})');
        assert.equal(snapped.x, context.point.x);
        assert.equal(snapped.y, context.point.y);
    }
}
assert(run('canPredictOccupy(100,100,20)'));
assert(!run('canPredictOccupy(100,100,20.01)'));
for (const point of [{ x: NaN, y: 1900 }, { x: Infinity, y: 1900 }, { x: 1020, y: -Infinity },
    { x: 2080, y: 1900 }, { x: -1, y: 1900 }]) {
    context.point = point;
    assert(!run('canPredictOccupy(point.x, point.y, 0)'));
    assert(!run('canBuildAt(point)'));
}
assert(!run('canPredictOccupy(1020,1900,-1)'));
for (const area of map.areas) {
    context.point = { x: area.terminalX, y: area.terminalY };
    assert(!run('canBuildAt(point)'), area.id);
    assert(!run('canBuildAt(point, true)'), area.id);
}
context.state.areas['entry-room'] = false;
const cell = map.areas[0].tiles[0];
assert(!run(`canPredictOccupy(${cell.column * 40}, ${cell.row * 40}, 0)`));
assert(run('hasInteractionPath({x:1020,y:1740},{x:1020,y:1700})'), 'floor terminal is operable');
for (const mutate of [
    m => { m.areas[0].terminalX = -1; },
    m => { m.areas[0].terminalY = Infinity; },
    m => { m.workbenchUnits[0].x = 20; },
    m => { m.breakerTerminals[0].requiredArea = 'missing'; },
    m => { m.trapSlots[0].y = 2080; },
    m => { m.areas.push(null); },
    m => { m.tileMap.legend['.'] = null; },
    m => { m.spawnPoints[0].speedMultiplier = NaN; },
    m => { m.spawnPoints[0].speedMultiplier = Infinity; },
]) {
    context.invalid = structuredClone(map);
    mutate(context.invalid);
    assert.throws(() => run('validateMap(invalid)'));
}
console.log('Map regressions passed: full grid, floor terminals, collision boundaries, placement and validation');

let unlockAction;
context.state.rules = { unlockCost: 2250, areaUnlockCosts: { 'heavy-arms-area': 15000 } };
context.state.areas['heavy-arms-area'] = false;
context.getMe = () => ({ credits: 14999 });
context.INTERACTION_RANGE = { areaTerminal: 100 };
context.openNearbyActionMenu = (title, actions) => { unlockAction = actions[0]; };
const unlockStart = source.indexOf('function openUnlockMenu(');
const unlockEnd = source.indexOf('\nfunction ', unlockStart + 1);
vm.runInContext(source.slice(unlockStart, unlockEnd), context);
run('openUnlockMenu(AREAS.find(a => a.id === "heavy-arms-area"))');
assert.equal(unlockAction.detail, '15000G');
assert.equal(unlockAction.disabled, true);
context.getMe = () => ({ credits: 15000 });
run('openUnlockMenu(AREAS.find(a => a.id === "heavy-arms-area"))');
assert.equal(unlockAction.disabled, false);
run('openUnlockMenu(AREAS.find(a => a.id === "entry-room"))');
assert.equal(unlockAction.detail, '2250G');
console.log('Area price UI passed: high unlock price, affordability and default pricing');
