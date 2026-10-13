"use strict";
// Presentation only: dimensions stay inside a 36-unit footprint. +Z is the front.
window.MapObjectModels = (() => {
    const colors = { medical:'#8dd4b0', medkit:'#ec949b', weapon:'#d5ab6b', ammo:'#d3b450', workbench:'#d1975b', advanced:'#b2d7e7', woodcutter:'#b88c59', quarry:'#9eafbf', factory:'#82bdc7', factoryShop:'#82bdc7', command:'#7ac6df', time:'#95c9dc', missile:'#dd9270', job:'#a5a0dd', enchant:'#b593e0', armor:'#91aecb', gacha:'#e3b56b', team:'#78cfc7' };
    function stationKind(point) {
        if (point.item?.endsWith('Factory')) return 'factoryShop';
        return ({ammo:'ammo',medkit:'medkit',enchant:'enchant',armor:'armor',gacha:'gacha',teamMachine:'team',overclockSilver:'advanced'})[point.item] || 'weapon';
    }
    function buildKit(T,style={}) {
        const root=new T.Group();root.name='MedicalKit';
        const geometry=style.boxGeometry || new T.BoxGeometry(1,1,1),mats=new Map();
        const material=style.material || (color=>{if(!mats.has(color))mats.set(color,new T.MeshStandardMaterial({color,roughness:.6}));return mats.get(color);});
        for(const [name,w,h,d,c,x,y,z] of [
            ['kit-body',20,12,14,'#e2e8e9',0,6,0],['kit-seam',20.3,1,14.3,'#9bafb7',0,9,0],
            ['kit-cross-v',3,8,1,'#df6366',0,6,7.3],['kit-cross-h',9,3,1,'#df6366',0,6,7.4],
            ['kit-top-cross-v',3,1,10,'#df6366',0,12.3,0],['kit-top-cross-h',12,1,3,'#df6366',0,12.4,0],
            ['kit-handle-left',2,4,2,'#70848e',-5,14,-4],['kit-handle-right',2,4,2,'#70848e',5,14,-4],['kit-handle-top',12,2,2,'#70848e',0,16,-4]
        ]){const mesh=new T.Mesh(geometry,material(c));mesh.name=name;mesh.scale.set(w,h,d);mesh.position.set(x,y,z);mesh.castShadow=true;root.add(mesh);}
        return root;
    }
    function build(T, kind, style = {}) {
        if (!colors[kind]) return null;
        const resourceColor={woodFactory:'#b88c59',oreFactory:'#9eafbf',copperFactory:'#c38b64',silverFactory:'#c9e4ee'}[style.item];
        const root=new T.Group(), accent=style.color || resourceColor || colors[kind], dark='#293b47', metal='#677d89', pale='#dbe4e5';
        const boxGeometry=style.boxGeometry || new T.BoxGeometry(1,1,1), cylinderGeometry=style.cylinderGeometry || new T.CylinderGeometry(1,1,1,12);
        const materials=new Map();
        const material=style.material || ((color,glow=false)=>{
            const key=color+glow;
            if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color,roughness:.7,metalness:.18,emissive:glow?color:0,emissiveIntensity:glow?.35:0}));
            return materials.get(key);
        });
        function part(name,w,h,d,color,x=0,y=h/2,z=0,glow=false) {
            const mesh=new T.Mesh(boxGeometry,material(color,glow));mesh.name=name;mesh.scale.set(w,h,d);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=!glow;root.add(mesh);return mesh;
        }
        function cylinder(name,r,h,color,x=0,y=h/2,z=0) {
            const mesh=new T.Mesh(cylinderGeometry,material(color));mesh.name=name;mesh.scale.set(r,h,r);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);return mesh;
        }
        function cross(x,y,z,size=1) {part('medical-cross-v',3*size,11*size,1,pale,x,y,z,true);part('medical-cross-h',9*size,3*size,1,pale,x,y,z+.1,true);}
        // Table undersides are at 14.5–16: embed each leg slightly into the slab.
        function feet(w=26,d=22) {for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])part('foot',3,16.5,3,metal,x,8.25,z);}
        function screen(x=0,y=27,z=3,w=20,h=12) {part('screen-frame',w+3,h+3,2,dark,x,y,z);part('screen',w,h,.6,accent,x,y,z+1.3,true);for(let i=0;i<3;i++)part('screen-line',w*(.65-i*.13),.7,.3,pale,x-w*.08,y+3-i*3,z+1.7);}
        if(kind==='medical') {
            part('healing-base',34,5,34,dark);part('healing-chassis',28,17,28,metal,0,13);
            for(const x of [-14,14])for(const z of [-14,14]){part('emitter-housing',5,25,5,dark,x,16,z);part('emitter-light',2,17,5.4,accent,x,18,z,true);part('emitter-cap',6,3,6,pale,x,30,z);}
            cylinder('healing-core',8,12,accent,0,25,0).material=material(accent,true);cylinder('healing-collar',11,3,pale,0,32);cylinder('healing-aperture',8,1,accent,0,34,0).material=material(accent,true);
            part('medical-panel',16,15,1,dark,0,14,14.5);cross(0,14,15.3,.85);
            for(const x of [-9,9])part('healing-top-strip',3,1,22,accent,x,23,0,true);
        } else if(kind==='weapon' || kind==='medkit' || kind==='factoryShop') {
            part('case-base',34,16,26,dark);part('case-trim',34,2,26,metal,0,17);part('case-top',34,2,26,metal,0,45);
            for(const x of [-16,16])for(const z of [-12,12])part('case-post',1.5,27,1.5,metal,x,31,z);
            part('case-display-bed',30,1,22,'#425966',0,19);part('case-light-strip',27,1,1,accent,0,43,-10,true);
            const assets=style.displayAssets || new Map();
            if(!assets.has('glass'))assets.set('glass',new T.MeshStandardMaterial({color:'#b9e3ed',transparent:true,opacity:.12,roughness:.08,metalness:.15,depthWrite:false,side:T.DoubleSide}));
            for(const [w,h,d,x,y,z] of [[31,25,.3,0,31,12],[31,25,.3,0,31,-12],[.3,25,23,-16,31,0],[.3,25,23,16,31,0],[31,.3,23,0,44,0]]){
                const glass=new T.Mesh(boxGeometry,assets.get('glass'));glass.name='showcase-glass';glass.scale.set(w,h,d);glass.position.set(x,y,z);glass.renderOrder=2;root.add(glass);
            }
            if(kind==='medkit') {
                const kit=buildKit(T,{boxGeometry,material});kit.position.y=22;kit.scale.setScalar(.9);root.add(kit);
                part('kit-display-plinth',22,3,17,pale,0,20.5);
            } else {
                const factory=kind==='factoryShop',item=style.item || (factory?'oreFactory':'rifle'),key=(factory?'machine:':'weapon:')+item;
                if(!assets.has(key))assets.set(key,factory?{root:build(T,'factory',{...style,item})}:window.buildWeaponModel(T,item));
                const display=assets.get(key).root.clone(true);display.name=factory?'ShowcaseFactory':'ShowcaseWeapon';display.userData.item=item;
                display.traverse(o=>{if(o.isMesh)o.castShadow=true;});
                if(!factory)display.rotation.y=Math.PI/2;display.updateMatrixWorld(true);
                const bounds=new T.Box3().setFromObject(display),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
                const scale=Math.min(27/size.x,17/size.y,17/size.z);display.scale.setScalar(scale);display.position.set(-center.x*scale,31-center.y*scale,-center.z*scale);root.add(display);
                if(factory) {
                    display.position.y=22-bounds.min.y*scale;
                    part('machine-plinth',23,2,17,pale,0,21);
                } else {
                    // Find the real underside, rather than assuming equal barrel/stock heights.
                    display.updateMatrixWorld(true);
                    const actual=new T.Box3().setFromObject(display),ray=new T.Raycaster(),up=new T.Vector3(0,1,0);
                    for(const side of [-1,1]) {
                        const target=side*(actual.max.x-actual.min.x)*.28;
                        let contact;
                        for(const dx of [0,-.5,.5,-1,1,-2,2]) {
                            for(const fraction of [0,.125,-.125,.25,-.25,.375,-.375,.49,-.49]) {
                                const z=(actual.min.z+actual.max.z)/2+fraction*(actual.max.z-actual.min.z);
                                ray.set(new T.Vector3(target+dx,19.5,z),up);
                                const hit=ray.intersectObject(display,true)[0];
                                if(hit){contact=new T.Vector3(target+dx,hit.point.y,z);break;}
                            }
                            if(contact)break;
                        }
                        if(!contact)throw new Error('No showcase support contact for '+item);
                        const height=contact.y-19.4+.2;
                        part('weapon-rest',3,1,5,dark,contact.x,20,contact.z);
                        part('weapon-support',1.2,height,1.2,metal,contact.x,19.4+height/2,contact.z);
                        part('weapon-saddle',2,.6,3,dark,contact.x,contact.y-.1,contact.z);
                    }
                }
            }
        } else if(kind==='ammo') {
            part('ammo-crate',31,17,26,'#53695c');for(const x of [-12,12])part('crate-band',3,18,27,accent,x,9);
            part('open-lid',31,17,3,dark,0,25,-12).rotation.x=-.15;
            for(const x of [-8,0,8]){cylinder('cartridge',2.5,11,'#c9a765',x,22,2);cylinder('cartridge-tip',1.7,3,pale,x,29,2);}
        } else if(kind==='workbench' || kind==='advanced') {
            feet();part('worktop',34,4,28,'#b58a61',0,18);
            part('hammer-handle',12,1.5,2,'#795737',-5,21,-4);part('hammer-head',3,3,7,metal,-11,21.5,-4);
            part('wrench-handle',11,1.5,2,pale,3,20.75,5);part('wrench-neck',3,1.5,6,metal,9,20.75,5);
            for(const z of [2,8])part('wrench-jaw',4,1.5,2,pale,11,20.75,z);
            if(kind==='advanced') {for(const x of [-12,12])part('press-column',3,28,4,metal,x,32,5);part('press-beam',28,5,8,accent,0,46,5);cylinder('press-piston',3,16,pale,0,37,5);part('press-head',13,4,10,accent,0,28,5);}
        } else if(kind==='woodcutter' || kind==='factory' && style.item==='woodFactory') {
            feet();part('saw-table',34,4,28,metal,0,18);const saw=cylinder('saw-blade',10,1.3,pale,0,23,0);saw.rotation.z=Math.PI/2;
            for(let i=0;i<12;i++){const a=i*Math.PI/6;const tooth=part('saw-tooth',2,3,2,pale,0,23+Math.sin(a)*10,Math.cos(a)*10);tooth.rotation.x=-a;}
            const log=cylinder('timber',4,28,'#a77c50',9,24,0);log.rotation.x=Math.PI/2;part('saw-motor',8,8,10,accent,-10,23,0);
            if(kind==='factory'){part('timber-output-bin',24,7,10,dark,0,6,10);for(const x of [-7,0,7]){const timber=cylinder('cut-timber',2.5,10,'#bd9466',x,11,10);timber.rotation.x=Math.PI/2;}}
        } else if(kind==='quarry' || kind==='factory') {
            part('drill-base',32,5,30,dark);for(const x of [-13,13])part('drill-support',4,36,6,metal,x,23,-7);
            part('drill-crossbar',32,6,10,accent,0,40,-7);cylinder('drill-motor',6,10,accent,0,32,0);cylinder('drill-shaft',2,18,pale,0,19,0);
            for(let i=0;i<4;i++){const blade=part('drill-flute',9-i,2,3,metal,0,12+i*3,0);blade.rotation.y=i*.8;}
            if(kind==='factory'){part('output-bin',24,8,12,accent,0,8,10);for(const x of [-6,0,6])part('output-ingot',4,3,5,pale,x,13,10);}
        } else if(kind==='armor') {
            part('armor-base',28,4,24,dark);part('mannequin-post',3,32,3,metal,0,20);
            part('vest',18,19,9,accent,0,30);for(const x of [-10,10])part('shoulder',6,6,11,pale,x,39);
            part('chest-plate',13,10,2,metal,0,31,5.5);for(const x of [-5,5])part('greave',7,12,7,accent,x,12,1);
        } else if(kind==='enchant') {
            part('upgrade-plinth',30,7,28,dark);for(const x of [-13,13]){part('upgrade-pillar',5,35,8,metal,x,25);part('energy-strip',1,24,1,accent,x,26,5,true);}
            part('upgrade-bridge',31,5,9,accent,0,44);cylinder('upgrade-pad',9,3,accent,0,10);
            part('suspended-weapon',20,4,4,pale,0,25);part('weapon-grip',3,6,3,metal,-5,21);part('energy-core',5,6,5,accent,0,33,0,true);
        } else if(kind==='gacha') {
            part('capsule-cabinet',29,23,25,accent);part('capsule-top',29,4,25,pale,0,42);
            for(const x of [-13,13])part('window-post',3,17,24,metal,x,32);part('window-back',24,16,2,dark,0,32,-11);
            for(const [x,y,z,c] of [[-7,27,3,'#92cbbd'],[5,28,4,'#be9fdf'],[-2,34,-3,'#d8bd76']])cylinder('capsule',4,6,c,x,y,z).rotation.z=.6;
            part('prize-slot',15,7,2,dark,0,9,13);cylinder('crank',3,3,pale,8,19,14).rotation.x=Math.PI/2;
        } else if(kind==='team') {
            part('relay-base',30,5,28,dark);cylinder('relay-column',7,23,metal,0,17);cylinder('relay-collar',10,4,accent,0,29);
            part('antenna-mast',2,21,2,pale,0,41);for(const x of [-9,9]){part('antenna-arm',16,2,2,accent,x/2,43);part('antenna-prong',2,10,2,pale,x,46);}
            for(const x of [-11,11])part('relay-battery',6,18,9,accent,x,14,0);
        } else if(kind==='job') {
            part('locker-base',30,4,26,dark);part('locker',28,39,24,accent,0,23);part('locker-door',24,34,2,metal,0,24,13);
            part('helmet',12,8,10,pale,0,34,15);part('helmet-visor',10,3,1,dark,0,34,20.5);
            for(const x of [-6,6])part('locker-vent',7,1,1,dark,x,13,14.5);part('door-handle',2,7,2,pale,9,23,15);
        } else if(kind==='missile') {
            feet();part('launch-desk',32,5,26,dark,0,17);screen(-6,30,-6,14,15);
            cylinder('missile-body',3,22,pale,10,30,0);cylinder('missile-nose',1.8,5,accent,10,43,0);
            for(const x of [6,14])part('missile-fin',2,8,7,accent,x,23,0);part('launch-button',5,2,5,'#df705c',-6,21,8,true);
        } else if(kind==='time') {
            part('timer-base',28,5,25,dark);part('timer-pedestal',18,22,17,metal,0,16);const dial=cylinder('clock-rim',13,4,accent,0,36,0);dial.rotation.x=Math.PI/2;
            const face=cylinder('clock-face',11,1,pale,0,36,2.5);face.rotation.x=Math.PI/2;
            part('clock-hand-minute',1.5,9,1,dark,0,39,3.5);part('clock-hand-hour',7,1.5,1,dark,3,36,3.6);
            for(const [x,y] of [[0,45],[9,36],[0,27],[-9,36]])part('clock-tick',2,2,1,metal,x,y,3.5);
        } else if(kind==='command') {
            feet();part('console-desk',34,5,26,dark,0,18);screen(0,32,-8,25,17);
            part('keyboard',22,1,8,metal,0,21,5);for(const x of [-8,-4,0,4,8])part('keys',2,1,5,pale,x,22,5);
        }
        root.userData.modelKind=kind;return root;
    }
    return {build,buildKit,stationKind,colors};
})();
