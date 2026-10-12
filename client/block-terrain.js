"use strict";
// Cuboids in x/y/z block coordinates. Only a 2D spatial index is allocated; height stays sparse.
window.BlockTerrain = (() => {
    const cache=new WeakMap();
    function compile(map) {
        if(cache.has(map))return cache.get(map);
        const size=map.tileSize,rows=map.rows.length,cols=map.rows[0]?.length || 0,buckets=Array.from({length:rows*cols},()=>[]),boxes=[];
        const floor=(r,c)=>{const symbol=map.rows[r]?.[c];return symbol!=null&&(map.legend?map.legend[symbol]?.solid===false:symbol==='.');};
        if(map.blockMap) {
            const unit=map.blockMap.blockSize;
            for(const region of map.blockMap.regions)boxes.push({kind:region.kind,min:region.from.map(v=>v*unit),max:region.to.map(v=>v*unit)});
        } else {
            // Old standalone previews/fixtures only. Production map carries explicit 3D blocks.
            const height=(r,c)=>{const span=(dr,dc)=>{let n=1;for(const sign of [-1,1])for(let j=1;floor(r+dr*j*sign,c+dc*j*sign);j++)n++;return n;};return Math.min(span(1,0),span(0,1))<=2?64:130;};
            for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)if(floor(r,c)) {
                const h=height(r,c);boxes.push({kind:'floor',min:[c*size,-4,r*size],max:[(c+1)*size,0,(r+1)*size]},{kind:'ceiling',min:[c*size,h,r*size],max:[(c+1)*size,h+6,(r+1)*size]});
                for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]])if(floor(r+dz,c+dx)&&height(r+dz,c+dx)>h)boxes.push({kind:'wall',min:[c*size+(dx>0?size-2:0),h,r*size+(dz>0?size-2:0)],max:[c*size+(dx<0?2:size),height(r+dz,c+dx),r*size+(dz<0?2:size)]});
            } else boxes.push({kind:'wall',min:[c*size,0,r*size],max:[(c+1)*size,130,(r+1)*size]});
        }
        for(const box of boxes)for(let r=Math.floor(box.min[2]/size);r<Math.ceil(box.max[2]/size);r++)for(let c=Math.floor(box.min[0]/size);c<Math.ceil(box.max[0]/size);c++)buckets[r*cols+c].push(box);
        const at=(x,z)=>{const c=Math.floor(x/size),r=Math.floor(z/size);return c<0||r<0||c>=cols||r>=rows?[]:buckets[r*cols+c];};
        const contains=(b,x,z)=>x>=b.min[0]&&x<b.max[0]&&z>=b.min[2]&&z<b.max[2];
        const ceiling=(x,z,feet=0)=>{let h=Infinity;for(const b of at(x,z))if(contains(b,x,z)&&b.min[1]>feet+1e-6)h=Math.min(h,b.min[1]);return h;};
        const support=(x,z,feet=0)=>{let h=-Infinity;for(const b of at(x,z))if(contains(b,x,z)&&b.max[1]<=feet+1e-6)h=Math.max(h,b.max[1]);return h;};
        const clearBody=(x,z,radius,feet,height)=>{
            for(let r=Math.max(0,Math.floor((z-radius)/size));r<=Math.min(rows-1,Math.floor((z+radius)/size));r++)for(let col=Math.max(0,Math.floor((x-radius)/size));col<=Math.min(cols-1,Math.floor((x+radius)/size));col++)for(const b of buckets[r*cols+col]){
                if(b.max[1]<=feet+1e-6||b.min[1]>=feet+height-1e-6)continue;
                const dx=x-Math.max(b.min[0],Math.min(b.max[0],x)),dz=z-Math.max(b.min[2],Math.min(b.max[2],z));
                if(radius===0?contains(b,x,z):dx*dx+dz*dz<radius*radius-1e-9)return false;
            }return true;
        };
        const result={boxes,buckets,at,ceiling,support,clearBody};cache.set(map,result);return result;
    }
    function validate(map) {
        const blocks=map.blockMap;if(!blocks)return;
        const fail=()=>{throw new Error('Invalid 3D block map');};
        if(!Number.isInteger(blocks.blockSize)||blocks.blockSize<=0||map.tileSize%blocks.blockSize!==0||!Array.isArray(blocks.regions)||blocks.regions.length<1||blocks.regions.length>20000)fail();
        let refs=0;
        for(const b of blocks.regions){
            if(!b||!['floor','wall','ceiling'].includes(b.kind)||!Array.isArray(b.from)||!Array.isArray(b.to)||b.from.length!==3||b.to.length!==3||!b.from.every(Number.isInteger)||!b.to.every(Number.isInteger)||b.from.some((v,i)=>v>=b.to[i]))fail();
            const u=blocks.blockSize;if(b.from[0]<0||b.from[2]<0||b.from[1]<-128||b.to[1]>4096||b.to[0]*u>map.rows[0].length*map.tileSize||b.to[2]*u>map.rows.length*map.tileSize)fail();
            refs+=(Math.ceil(b.to[0]*u/map.tileSize)-Math.floor(b.from[0]*u/map.tileSize))*map.rows.length;
        }
        if(refs>1000000)fail();
        const terrain=compile(map);
        for(let r=0;r<map.rows.length;r++)for(let c=0;c<map.rows[r].length;c++)if(!map.legend[map.rows[r][c]].solid){const x=(c+.5)*map.tileSize,z=(r+.5)*map.tileSize;if(terrain.support(x,z)!==0||!Number.isFinite(terrain.ceiling(x,z))||terrain.ceiling(x,z)<40)fail();}
    }
    return {compile,validate};
})();
