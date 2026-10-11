const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const feedback = require('../combat-feedback.js');
const hit = (credits, enemyId = 1, x = 100, y = 100, headshot = false) =>
    ({effect:'hit',playerId:'me',credits,enemyId,x,y,headshot});
feedback.add(hit(4), 0, 'me'); feedback.add(hit(5), 100, 'me'); feedback.add(hit(6), 200, 'me');
let labels = feedback.layout(250);
assert.deepEqual(labels.map(label => label.text), ['+4G', '+5G', '+6G']);
assert.deepEqual(labels.map(label => label.labelOffset), [0, -20, -40], 'ordinary rewards use compact 20px spacing');
feedback.add(hit(7), 250, 'me');
labels = feedback.layout(300);
assert(labels.length <= 3); assert.equal(labels.at(-1).text, '+7G', 'full groups retain the newest individual reward');
feedback.reset();
feedback.add(hit(4), 0, 'me'); feedback.add(hit(7,2,120,100,true), 250, 'me');
labels = feedback.layout(300);
assert.equal(labels.length, 2); assert.equal(labels[0].text, '+4G'); assert(!labels[0].headshot);
assert.equal(labels[1].text, '+7G'); assert(!labels[1].headshot,'No HS text labels');
assert(Math.abs(labels[0].y-labels[1].y) >= 16, 'Rewards remain readable without HS text');
feedback.add({...hit(100),playerId:'ally'}, 300, 'me');
assert.equal(feedback.layout(300).length, 2, 'only own gold is displayed');
feedback.add(hit(3,2,120,100), 800, 'me');
assert(!feedback.layout(850).find(popup=>popup.created===250).headshot,'No HS labels remain');
assert(!feedback.layout(950).find(popup=>popup.enemyId===2).headshot,'old HS expires independently');
feedback.reset();
feedback.add(hit(4), 0, 'me'); feedback.layout(0);
feedback.add(hit(5), 800, 'me'); feedback.layout(800);
assert(!feedback.layout(950).some(popup=>popup.created===0),'later hits do not extend earlier labels');
assert.equal(feedback.layout(1700).length, 0, 'each label expires after its own receipt');
feedback.add(hit(0,4,100,100,true), 1700, 'me');
const texts = [];
feedback.draw({save(){},restore(){},strokeText(){},fillText(text,x,y){texts.push({text,x,y,color:this.fillStyle,font:this.font});}}, 1700);
assert.equal(texts.length,0,'HS text is removed');
feedback.reset(); assert.equal(feedback.layout(1800).length, 0);
for (let now = 0; now <= 3000; now += 400) {
    feedback.add(hit(2), now, 'me');
    const active = feedback.layout(now);
    assert(active.length >= 1 && active.length <= 3, 'continuous hits stay within a compact group');
    assert.equal(active.at(-1).created, now, 'the newest reward remains visible');
    assert(active.every(label => label.text === '+2G'), 'continuous hits never accumulate gold');
}
feedback.reset();
for (let now = 0; now <= 10000; now += 50) {
    const credits = now / 50 + 1;
    feedback.add(hit(credits), now, 'me');
    const active = feedback.layout(now);
    assert(active.length <= 3, 'rapid fire never grows an unbounded column');
    assert(active.every(label => label.y >= 22 && label.y <= 74), 'every label stays within 78px of the hit');
    assert.equal(active.at(-1).text, `+${credits}G`, 'rapid fire displays the latest individual amount');
}
feedback.reset();
for (let i = 1; i <= 40; i++) feedback.add(hit(i), 0, 'me');
const burst = feedback.layout(0);
assert(burst.length <= 3); assert.equal(burst.at(-1).text, '+40G', 'simultaneous hits also favor the newest reward');
assert.deepEqual(feedback.layout(0).map(label => label.y), burst.map(label => label.y), 'retired labels do not reappear');
feedback.reset();
feedback.add(hit(2, 1), 0, 'me'); feedback.layout(0);
feedback.add(hit(2, 2), 200, 'me'); feedback.layout(200);
const beforeExpiry = feedback.layout(899).find(popup => popup.enemyId === 2).y;
const afterExpiry = feedback.layout(901).find(popup => popup.enemyId === 2).y;
assert(Math.abs(afterExpiry - beforeExpiry) < 1, 'an expired nearby label does not make another label jump');
feedback.reset();

feedback.reset();
const damagingHit = {...hit(4), damage:123.456};
feedback.add(damagingHit, 0, 'me');
assert.equal(feedback.layout(0)[0].damageText, '', 'normal mode hides damage');
feedback.reset();
feedback.add(damagingHit, 0, 'me', true);
assert.equal(feedback.layout(0)[0].damageText, '123.46 DMG');
assert.equal(feedback.layout(0)[0].text, '+4G', 'debug keeps individual gold');
const debugTexts = [];
feedback.draw({save(){},restore(){},fillText(text,x,y){debugTexts.push({text,x,y,color:this.fillStyle});}},0);
assert.equal(debugTexts[0].color, '#ffffff');
assert.equal(debugTexts[1].color, '#79d8ff');
assert(debugTexts[0].x < debugTexts[1].x, 'damage and gold are side by side');
feedback.reset();
feedback.add({...hit(0), damage:80},0,'me',true);
assert.equal(feedback.layout(0)[0].damageText,'80 DMG','damage appears without gold');
feedback.reset();
feedback.add({...hit(0), damage:80},0,'me');
feedback.add({...hit(0), damage:0},0,'me',true);
feedback.add({...hit(0), damage:NaN},0,'me',true);
feedback.add({...hit(0), playerId:'ally', damage:80},0,'me',true);
assert.equal(feedback.layout(0).length,0,'ignore non-debug, invalid and other player damage');
for(let now=0;now<=3000;now+=50){
    feedback.add({...hit(4), damage:80},now,'me',true);
    const labels=feedback.layout(now);
    assert(labels.length<=3);
    assert(labels.every(label=>label.y>=22&&label.y<=74),'debug rapid fire stays compact');
}
assert.equal(feedback.layout(4000).length,0,'damage expires with hit feedback');
feedback.reset();

const source = fs.readFileSync('client/app.js','utf8');
const start = source.indexOf('if (message.type === "ammo-refilled")');
const end = source.indexOf('\n        if (message.type === "error"',start);
const sounds = [];
vm.runInNewContext(source.slice(start,end), {message:{type:'ammo-refilled'},
    window:{coreAudio:{play:(...args)=>sounds.push(args)}},activeMenuAccess:{refresh(){}},
    closeInventory(){},inventoryMenu:{classList:{add(){}}},closeActionMenu(){assert.fail('refill retains the shop');}});
assert.deepEqual(sounds, [['refill',0]]);
console.log('Combat feedback passed: individual hit rewards, separate label placement, independent expiry, no HS text and refill sound');

// Raised 3D anchors use screen-space spacing; damage labels stay upright and follow their target.
feedback.reset();
feedback.add({...hit(4,1,100,100),damage:80},0,'me',true);
let targetX=240,targetY=160;
let projected=feedback.layout(100,()=>({x:targetX,y:targetY}));
assert.equal(projected[0].x,targetX);assert(projected[0].y<targetY);
targetX=300;targetY=130;
projected=feedback.layout(200,()=>({x:targetX,y:targetY}));
assert.equal(projected[0].x,targetX);assert(projected[0].y<targetY);
assert.equal(projected[0].damageText,'80 DMG');
feedback.reset();
console.log('3D combat labels passed: raised projection and moving target anchors');

// Hit confirmation is conveyed by enemy tint, never a reticle overlay.
assert.equal(feedback.hitMarker,undefined);assert.equal(feedback.drawHitMarker,undefined);
feedback.add({...hit(3),damage:10,headshot:true},100,'me');assert.equal(feedback.layout(100)[0].text,'+3G');
assert(!fs.readFileSync('client/app.js','utf8').includes('CombatFeedback.drawHitMarker'));
console.log('Hit marker removal passed: reward labels remain, no hit/HS reticle state or overlay');
