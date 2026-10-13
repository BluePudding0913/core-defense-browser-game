"use strict";
// Visual feedback only. No collision, damage, or network state is changed here.
window.createHitPresentation = (T, scene) => {
    const LIMIT=384,DEATH_LIMIT=8,DEATH_MS=700,FLASH_MS=180;
    const flashes=new Map(),deaths=new Map(),particles=[],lastBlood=new Map();
    let processed=new WeakSet(),lastNow=0;
    const hitColor=new T.Color('#ec263e'),glowColor=new T.Color('#b51f35');
    const geometry=new T.BoxGeometry(1,1,1),material=new T.MeshBasicMaterial({color:'#b51f35'});
    const mesh=new T.InstancedMesh(geometry,material,LIMIT),dummy=new T.Object3D();
    mesh.name='hit-blood-particles';mesh.count=0;mesh.frustumCulled=false;scene.add(mesh);
    function restore(item) {
        for(const [part,original] of item?.hitOriginals || [])part.material=original;
        if(item)item.hitOriginals=null;
    }
    function tint(item,strength) {
        if(!strength)return;
        item.hitOriginals=new Map();item.hitTints ||= new Map();
        item.root.traverse(part=>{
            if(!part.isMesh)return;
            const originals=Array.isArray(part.material)?part.material:[part.material];
            item.hitOriginals.set(part,part.material);
            const tinted=originals.map(original=>{
                if(!item.hitTints.has(original))item.hitTints.set(original,original.clone());
                const copy=item.hitTints.get(original);
                copy.color.copy(original.color).lerp(hitColor,strength);
                if(copy.emissive)copy.emissive.copy(original.emissive).lerp(glowColor,strength*.3);
                return copy;
            });
            part.material=Array.isArray(part.material)?tinted:tinted[0];
        });
    }
    function release(item) {
        restore(item);for(const mat of item.hitTints?.values() || [])mat.dispose();item.hitTints?.clear();
    }
    function headPosition(item,effect) {
        item.root.updateMatrixWorld(true);
        const surface=item.root.getObjectByName('Anatomical head');
        if(surface)return new T.Box3().setFromObject(surface).getCenter(new T.Vector3());
        const head=item.root.getObjectByName('Head');
        if(head)return head.getWorldPosition(new T.Vector3());
        const b=new T.Box3().setFromObject(item.root);
        return new T.Vector3(item.root.position.x,b.max.y*.88,item.root.position.z);
    }
    function emit(effect,item,now,own) {
        const kill=effect.defeated===true && own;
        if(!effect.headshot && !kill)return;
        if(!kill && now-(lastBlood.get(effect.enemyId) ?? -Infinity)<90)return;
        lastBlood.set(effect.enemyId,now);
        const origin=effect.headshot?headPosition(item,effect):new T.Vector3(
            Number.isFinite(effect.x)?effect.x:item.root.position.x,
            Number.isFinite(effect.hitHeight)?effect.hitHeight:16,
            Number.isFinite(effect.y)?effect.y:item.root.position.z);
        const dx=(effect.x ?? item.root.position.x)-(effect.fromX ?? item.root.position.x),dz=(effect.y ?? item.root.position.z)-(effect.fromY ?? item.root.position.z),length=Math.hypot(dx,dz)||1;
        const count=kill?(effect.headshot?28:22):(own?9:5);
        if(kill && particles.length+count>LIMIT)particles.splice(0,particles.length+count-LIMIT);
        for(let i=0;i<count && particles.length<LIMIT;i++) {
            const seed=(effect.enemyId || 0)*31+i*17+now*.01;
            const random=n=>{const value=Math.sin(seed+n*12.9898)*43758.5453;return value-Math.floor(value);};
            const a=random(1)*Math.PI*2,spread=(kill?48:36)*(.3+.7*random(2));
            particles.push({x:origin.x,y:origin.y,z:origin.z,vx:Math.cos(a)*spread+dx/length*12,
                vy:12+random(3)*30,vz:Math.sin(a)*spread+dz/length*12,at:now,life:kill?520:340,size:(kill?1.5:1.1)*(.7+.6*random(4))});
        }
    }
    function update(effects,now,localId,lookup,keep) {
        if(now<lastNow)reset();lastNow=now;
        for(const e of effects) {
            if(e.effect!=='hit' || !(e.damage>0) || e.enemyId==null || now<e.started || now-e.started>250 || processed.has(e))continue;
            processed.add(e);
            const item=lookup(e.enemyId);if(!item)continue;
            const own=e.playerId===localId,old=flashes.get(e.enemyId),strength=own?.72:.19;
            if(!old || own || now-old.at>=FLASH_MS || old.strength<=strength)flashes.set(e.enemyId,{at:e.started,strength});
            if(!deaths.has(e.enemyId))emit(e,item,now,own);
            if(e.defeated && !deaths.has(e.enemyId)) {
                if(deaths.size>=DEATH_LIMIT)deaths.delete(deaths.keys().next().value);
                const dx=item.root.position.x-(e.fromX ?? item.root.position.x),dz=item.root.position.z-(e.fromY ?? item.root.position.z),axis=new T.Vector3(dz,0,-dx);
                if(axis.lengthSq()<.001)axis.set(1,0,0);axis.normalize();
                deaths.set(e.enemyId,{item,at:e.started,rotation:item.root.quaternion.clone(),position:item.root.position.clone(),axis,headshot:e.headshot});
                item.root.userData.presentationOnly=true;
            }
        }
        for(const [id,flash] of flashes) {
            const age=now-flash.at;if(age>=FLASH_MS){flashes.delete(id);continue;}
            const item=lookup(id);if(item)tint(item,flash.strength*(1-age/FLASH_MS));
        }
        for(const [id,d] of deaths) {
            const age=now-d.at;
            if(age>=DEATH_MS){deaths.delete(id);continue;}
            keep(d.item);
            const progress=Math.min(1,Math.max(0,(age-(d.headshot?25:45))/470)),fall=progress*progress*(3-2*progress);
            const q=new T.Quaternion().setFromAxisAngle(d.axis,fall*1.48);
            d.item.root.quaternion.copy(d.rotation).premultiply(q);
            d.item.root.position.copy(d.position);
            d.item.root.scale.setScalar(age>580?Math.max(.01,(DEATH_MS-age)/120):1);
            // Use transformed mesh bounds, rather than the loose upright body box.
            d.item.root.position.y=0;d.item.root.updateMatrixWorld(true);
            d.item.root.position.y=-new T.Box3().setFromObject(d.item.root).min.y;
        }
        for(let i=particles.length-1;i>=0;i--)if(now-particles[i].at>=particles[i].life)particles.splice(i,1);
        mesh.count=particles.length;
        particles.forEach((p,i)=>{
            const age=(now-p.at)/1000,drag=(1-Math.exp(-age*5))/5;
            dummy.position.set(p.x+p.vx*drag,Math.max(.4,p.y+p.vy*drag-45*age*age),p.z+p.vz*drag);
            dummy.rotation.set(age*5,i,age*3);dummy.scale.setScalar(p.size*(1-(now-p.at)/p.life));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate=true;
        for(const [id,at] of lastBlood)if(now-at>1000)lastBlood.delete(id);
    }
    function reset(){
        for(const d of deaths.values()){d.item.root.userData.presentationOnly=false;d.item.root.quaternion.copy(d.rotation);d.item.root.position.copy(d.position);d.item.root.scale.setScalar(1);}
        flashes.clear();deaths.clear();particles.length=0;lastBlood.clear();processed=new WeakSet();mesh.count=0;
    }
    return {update,restore,release,reset};
};
