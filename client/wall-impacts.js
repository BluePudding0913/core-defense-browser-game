"use strict";
// Infer a nearby surface from the authoritative segment, without tracing the whole map.
window.WallImpacts = (() => {
    const weapons=new Set(['pistol','smg','rifle','revolver','lmg','shotgun','ricochet','freezeGun','sniper']);
    function surface(e,map,reachable) {
        if(e.effect!=='hit'||e.damage!==0||e.enemyId!=null||!weapons.has(e.weapon)
            ||![e.fromX,e.fromY,e.fromHeight,e.x,e.y,e.hitHeight].every(Number.isFinite))return null;
        const size=map.tileSize,dx=e.x-e.fromX,dz=e.y-e.fromY,length=Math.hypot(dx,dz);
        if(length<.01)return null;
        const ux=dx/length,uz=dz/length;
        const c=Math.floor((e.x-ux*.01)/size),r=Math.floor((e.y-uz*.01)/size);
        if(!reachable.has(r+':'+c))return null;
        if(Math.abs(e.hitHeight)<.02 && e.fromHeight>e.hitHeight)return {x:e.x,y:.05,z:e.y,nx:0,ny:1,nz:0};
        const candidates=[];
        for(const [nx,nz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const speed=nx?ux*nx:uz*nz;if(speed<=1e-6)continue;
            const face=(nx?c+(nx>0?1:0):r+(nz>0?1:0))*size;
            const travel=(face-(nx?e.x:e.y))/(nx?ux:uz);
            // The server marches in five-unit steps and reports the last clear point.
            if(travel<-.02||travel>5.01)continue;
            const x=e.x+ux*travel,z=e.y+uz*travel,y=e.hitHeight+(e.hitHeight-e.fromHeight)/length*travel;
            const floorC=Math.floor((x-nx*.01)/size),floorR=Math.floor((z-nz*.01)/size);
            if(!reachable.has(floorR+':'+floorC)||reachable.has((floorR+nz)+':'+(floorC+nx))||y<.05||y>130)continue;
            candidates.push({travel,x:x-nx*.05,y,z:z-nz*.05,nx:-nx,ny:0,nz:-nz});
        }
        candidates.sort((a,b)=>a.travel-b.travel);return candidates[0] || null;
    }
    return {surface,capacity:32,lifetime:2000};
})();
