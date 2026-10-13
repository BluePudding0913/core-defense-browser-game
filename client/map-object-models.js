"use strict";
// Presentation only: dimensions stay inside a 36-unit footprint. +Z is the front.
window.MapObjectModels = (() => {
    const colors = { medical:'#8dd4b0', weapon:'#d5ab6b', ammo:'#d3b450', workbench:'#d1975b', advanced:'#b2d7e7', woodcutter:'#b88c59', quarry:'#9eafbf', factory:'#82bdc7', command:'#7ac6df', time:'#95c9dc', missile:'#dd9270', job:'#a5a0dd', enchant:'#b593e0', armor:'#91aecb', gacha:'#e3b56b', team:'#78cfc7' };
    function stationKind(point) {
        if (point.item?.endsWith('Factory')) return 'factory';
        return ({ammo:'ammo',medkit:'medical',enchant:'enchant',armor:'armor',gacha:'gacha',teamMachine:'team',overclockSilver:'advanced'})[point.item] || 'weapon';
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
        function cross(x,y,z,size=1) {part('medical-cross-v',3*size,11*size,1,pale,x,y,z);part('medical-cross-h',9*size,3*size,1,pale,x,y,z+.1);}
        function feet(w=26,d=22) {for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])part('foot',3,15,3,metal,x,7.5,z);}
        function screen(x=0,y=27,z=3,w=20,h=12) {part('screen-frame',w+3,h+3,2,dark,x,y,z);part('screen',w,h,.6,accent,x,y,z+1.3,true);for(let i=0;i<3;i++)part('screen-line',w*(.65-i*.13),.7,.3,pale,x-w*.08,y+3-i*3,z+1.7);}
        if(kind==='medical') {
            feet(23,24);part('bed-frame',28,4,31,metal,0,15);part('mattress',25,4,28,pale,0,19);part('pillow',20,3,7,'#b6d5cc',0,22,-9);
            part('medical-headboard',28,18,3,accent,0,29,-14);cross(0,30,-12.3);for(const x of [-14,14])part('bed-rail',2,3,22,metal,x,24,3);
        } else if(kind==='weapon') {
            part('rack-base',32,4,25,dark);for(const x of [-14,14])part('rack-upright',3,39,4,metal,x,23,-8);
            part('rack-back',27,31,3,'#40515b',0,24,-9);part('rack-header',30,4,5,accent,0,42,-8);
            const heavy=['rocket','railgun','flamethrower'].includes(style.item), length=style.item==='sniper'?28:heavy?24:20;
            if(heavy) {
                const tube=cylinder('launcher-tube',4,28,metal,0,29,-3);tube.rotation.z=Math.PI/2;
                const collar=cylinder('launcher-collar',5,4,accent,-10,29,-3);collar.rotation.z=Math.PI/2;
                part('launcher-grip',3,7,4,dark,-4,23,-3);part('heavy-ammo-box',20,8,10,accent,0,12,-2);
            } else for(const y of [17,31]) {
                part('display-stock',8,5,3,'#96745a',-9,y,-5);part('display-receiver',12,5,4,dark,-1,y,-4);
                const barrel=part('display-barrel',length-8,heavy?4:2,heavy?4:2,metal,9,y,-4);barrel.position.x=6;
                part('display-grip',3,5,3,dark,-2,y-4,-4).rotation.z=-.25;
                if(style.item==='sniper')part('display-scope',9,2,3,accent,0,y+4,-4);
            }
        } else if(kind==='ammo') {
            part('ammo-crate',31,17,26,'#53695c');for(const x of [-12,12])part('crate-band',3,18,27,accent,x,9);
            part('open-lid',31,17,3,dark,0,25,-12).rotation.x=-.15;
            for(const x of [-8,0,8]){cylinder('cartridge',2.5,11,'#c9a765',x,22,2);cylinder('cartridge-tip',1.7,3,pale,x,29,2);}
        } else if(kind==='workbench' || kind==='advanced') {
            feet();part('worktop',34,4,28,'#b58a61',0,18);part('tool-board',31,17,3,dark,0,29,-12);
            for(const x of [-9,0,9]){part('tool-handle',2,8,2,accent,x,28,-9);part('tool-head',6,3,3,metal,x,33,-9);}
            part('vise-base',10,3,8,metal,8,22,4);for(const x of [5,11])part('vise-jaw',2,6,8,pale,x,25,4);
            cylinder('vise-wheel',2,9,dark,14,23,4).rotation.z=Math.PI/2;
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
    return {build,stationKind,colors};
})();
