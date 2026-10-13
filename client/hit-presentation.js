"use strict";
// Visual feedback only. No collision, damage, or network state is changed here.
window.createHitPresentation = (T, scene) => {
    const LIMIT=384,FLASH_MS=180,FADE_MS=130,FADE_LIMIT=8;
    const flashes=new Map(),fades=new Map(),particles=[],lastBlood=new Map();
    let processed=new WeakSet(),lastNow=0;
    const hitColor=new T.Color('#ec263e'),glowColor=new T.Color('#b51f35');
    const geometry=new T.BoxGeometry(1,1,1),material=new T.MeshBasicMaterial({color:'#b51f35'});
    const mesh=new T.InstancedMesh(geometry,material,LIMIT),dummy=new T.Object3D();
    mesh.name='hit-blood-particles';mesh.count=0;mesh.frustumCulled=false;scene.add(mesh);
    function restore(item) {
        for(const [part,original] of item?.hitOriginals || [])part.material=original;
        if(item)item.hitOriginals=null;
    }
    function tint(item,strength,alpha=1) {
        if(!strength && alpha===1)return;
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
                const transparent=original.transparent || alpha<1;
                if(copy.transparent!==transparent)copy.needsUpdate=true;
                copy.transparent=transparent;
                copy.opacity=original.opacity*alpha;copy.depthWrite=alpha<1?false:original.depthWrite;
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
    function emit(effect,item,now) {
        if(effect.headshot!==true || now-(lastBlood.get(effect.enemyId) ?? -Infinity)<90)return;
        lastBlood.set(effect.enemyId,now);
        const origin=headPosition(item,effect);
        const dx=(effect.x ?? item.root.position.x)-(effect.fromX ?? item.root.position.x),dz=(effect.y ?? item.root.position.z)-(effect.fromY ?? item.root.position.z),length=Math.hypot(dx,dz)||1;
        const count=24;
        if(particles.length+count>LIMIT)particles.splice(0,particles.length+count-LIMIT);
        for(let i=0;i<count;i++) {
            const seed=(effect.enemyId || 0)*31+i*17+now*.01;
            const random=n=>{const value=Math.sin(seed+n*12.9898)*43758.5453;return value-Math.floor(value);};
            const a=random(1)*Math.PI*2,spread=48*(.3+.7*random(2));
            particles.push({x:origin.x,y:origin.y,z:origin.z,vx:Math.cos(a)*spread+dx/length*12,
                vy:12+random(3)*30,vz:Math.sin(a)*spread+dz/length*12,at:now,life:420,size:1.3*(.7+.6*random(4))});
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
            emit(e,item,now);
            if(e.defeated===true && !fades.has(e.enemyId)) {
                if(fades.size>=FADE_LIMIT){const oldest=fades.keys().next().value;fades.get(oldest).item.root.visible=false;fades.delete(oldest);}
                fades.set(e.enemyId,{item,at:e.started});item.root.userData.presentationOnly=true;
            }
        }
        for(const [id,flash] of flashes) {
            const age=now-flash.at;if(age>=FLASH_MS){flashes.delete(id);continue;}
            const item=lookup(id);if(item && !fades.has(id))tint(item,flash.strength*(1-age/FLASH_MS));
        }
        for(const [id,fade] of fades) {
            const age=now-fade.at;if(age>=FADE_MS){fade.item.root.visible=false;fades.delete(id);continue;}
            keep(fade.item);restore(fade.item);
            const flash=flashes.get(id),strength=flash?flash.strength*Math.max(0,1-(now-flash.at)/FLASH_MS):0;
            tint(fade.item,strength,1-age/FADE_MS);
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
        for(const {item} of fades.values()){restore(item);item.root.userData.presentationOnly=false;item.root.visible=true;}
        fades.clear();
        flashes.clear();particles.length=0;lastBlood.clear();processed=new WeakSet();mesh.count=0;
    }
    return {update,restore,release,reset};
};
