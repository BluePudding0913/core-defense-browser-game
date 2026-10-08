const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const extract = name => {
    const start = source.indexOf(`function ${name}(`);
    return source.slice(start, source.indexOf('\nfunction ', start + 1));
};
const commands = [], labels = [];
const me = {id:'me', job:'tp', x:1140, y:1900, selectedBuild:'teleporter', buildItems:{teleporter:2}};
const context = vm.createContext({
    getMe:()=>me, me, myPlayerId:'me', localFacing:{x:1,y:0}, TILE_MAP:{tileSize:40},
    WeaponUI:require('../weapon-ui.js'), WEAPON_FIELDS:{}, BUILD_INFO:{teleporter:{name:'TP'}}, equipmentOrder:[],
    state:{phase:'wave',players:[me]}, send:c=>commands.push(c), canBuildAt:()=>true,
    closeActionMenu(){}, actionMenu:{classList:{contains:()=>false}}, inventoryMenu:{classList:{add(){}}},
    ctx:{save(){},restore(){},fillRect(){},strokeRect(){},fillText:text=>labels.push(text)},
});
for(const name of ['equipmentEntries','snapToTile','quantizeFacing','frontPlacementTile',
    'placementSelection','placeSelectedInFront','findNearestInteraction','toggleNearestInteraction','drawPlacementPreview'])
    vm.runInContext(extract(name),context);
assert(context.equipmentEntries(me).some(e=>e.value==='teleporter'));
assert.equal(context.findNearestInteraction().kind,'placement');
context.drawPlacementPreview(); assert(labels.includes('R PLACE'));
context.toggleNearestInteraction(); assert.deepEqual(commands,['PLACE_FRONT']);
me.down=true; assert.equal(context.placementSelection(me),null);
console.log('TP placement passed: inventory, preview marker and placement priority even with a facility panel open');
