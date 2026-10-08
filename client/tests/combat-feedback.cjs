const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const feedback = require('../combat-feedback.js');
const hit = (credits, enemyId = 1, x = 100, y = 100, headshot = false) =>
    ({effect:'hit',playerId:'me',credits,enemyId,x,y,headshot});
feedback.add(hit(4), 0, 'me'); feedback.add(hit(4), 100, 'me'); feedback.add(hit(4), 200, 'me');
let labels = feedback.layout(250);
assert.equal(labels.length, 1); assert.equal(labels[0].text, '+12G');
feedback.add(hit(7,2,120,100,true), 250, 'me');
labels = feedback.layout(300);
assert.equal(labels.length, 2); assert.equal(labels[0].text, '+12G'); assert(!labels[0].headshot);
assert.equal(labels[1].text, '+7G'); assert(labels[1].headshot);
assert(Math.abs(labels[0].y-labels[1].y) >= 30,'nearby enemies keep separate nonoverlapping labels');
feedback.add({...hit(100),playerId:'ally'}, 300, 'me');
assert.equal(feedback.layout(300)[0].text, '+12G', 'only own gold is displayed');
feedback.add(hit(5,3,100,100), 700, 'me');
labels = feedback.layout(700);
assert.equal(labels.length, 3); assert(Math.abs(labels[0].y-labels[1].y) >= 30);
feedback.add(hit(3,2,120,100), 800, 'me');
assert(!feedback.layout(950).find(popup=>popup.enemyId===2).headshot,'body hits do not keep old HS alive');
assert.equal(feedback.layout(1700).length, 0, 'labels expire after the last receipt');
feedback.add(hit(0,4,100,100,true), 1700, 'me');
const texts = [];
feedback.draw({save(){},restore(){},strokeText(){},fillText(text,x,y){texts.push({text,x,y,color:this.fillStyle,font:this.font});}}, 1700);
assert.equal(texts.length, 1); assert.equal(texts[0].text, 'HS');
assert.equal(texts[0].color, '#ff5964'); assert(texts[0].font.includes('9px'));
feedback.reset(); assert.equal(feedback.layout(1800).length, 0);
for (let now = 0; now <= 3000; now += 400) {
    feedback.add(hit(2), now, 'me');
    const active = feedback.layout(now);
    assert.equal(active.length, 1, 'continuous hits never create duplicate labels above the same enemy');
    assert.equal(active[0].credits, 2 * (now / 400 + 1));
}
feedback.reset();
feedback.add(hit(2, 1), 0, 'me'); feedback.layout(0);
feedback.add(hit(2, 2), 200, 'me'); feedback.layout(200);
const beforeExpiry = feedback.layout(899).find(popup => popup.enemyId === 2).y;
const afterExpiry = feedback.layout(901).find(popup => popup.enemyId === 2).y;
assert(Math.abs(afterExpiry - beforeExpiry) < 1, 'an expired nearby label does not make another label jump');
feedback.reset();
const source = fs.readFileSync('client/app.js','utf8');
const start = source.indexOf('if (message.type === "ammo-refilled")');
const end = source.indexOf('\n        if (message.type === "error"',start);
const sounds = [];
vm.runInNewContext(source.slice(start,end), {message:{type:'ammo-refilled'},
    window:{coreAudio:{play:(...args)=>sounds.push(args)}},activeMenuAccess:{refresh(){}},
    inventoryMenu:{classList:{add(){}}},closeActionMenu(){assert.fail('refill retains the shop');}});
assert.deepEqual(sounds, [['refill',0]]);
console.log('Combat feedback passed: burst grouping, separate label placement, expiry, red HS and refill sound');
