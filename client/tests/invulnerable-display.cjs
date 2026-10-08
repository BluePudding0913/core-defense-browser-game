const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const start = source.indexOf('function drawPlayers(');
let now = 0; const bodies = [], stack = [];
const colors = [];
const ctx = new Proxy({globalAlpha:1, save(){stack.push({alpha:this.globalAlpha,color:this.fillStyle});}, restore(){const saved=stack.pop();this.globalAlpha=saved.alpha;this.fillStyle=saved.color;},
    fillRect(x,y,w,h){if(w===10 && h===10){bodies.push(this.globalAlpha);colors.push(this.fillStyle);}}},
    {get:(obj,key)=>key in obj ? obj[key] : ()=>{}});
const player = {id:'me',job:'healer',x:100,y:100};
const context = vm.createContext({ctx,state:{players:[player]},myPlayerId:'me',predictedLocal:null,
    smoothEntity:(_,p)=>p,hitEffects:[],performance:{now:()=>now},
    drawLocalWeaponCooldown(){},drawMedbayParticles(){}});
vm.runInContext(source.slice(start,source.indexOf('\nfunction ',start+1)),context);
for(const field of ['reviveInvulnerableRemaining','tpInvulnerableRemaining']) {
    player[field]=1;
    now=0; context.drawPlayers(); assert.equal(bodies.pop(),1);
    now=100; context.drawPlayers(); assert.equal(bodies.pop(),.25);
    player[field]=0; context.drawPlayers(); assert.equal(bodies.pop(),1);
    assert.equal(ctx.globalAlpha,1,'blink never affects later map drawing');
}
console.log('Invulnerable display passed: revive/TP blinking and restored map alpha');
player.job='attacker'; context.drawPlayers();
assert.equal(colors.pop(),'#79d8ff','local attacker keeps the player color after drawing both weapons');
