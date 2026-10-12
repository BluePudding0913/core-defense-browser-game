'use strict';
// Unarmored candidates: visible flesh, fabric, anatomy and hostile asymmetrical poses.
window.buildOrganicEnemy = (T,id) => {
 const lab=['researcher','lab-assistant','lab-pathologist'].includes(id);
 const settings={'lab-assistant':{skin:'#969b85',cloth:'#a4ada4',pants:'#304342',width:1.15,lean:.32,arm:[-.50,-.68],elbow:[-.38,-.26],head:[.15,.06,-.10]},'lab-pathologist':{skin:'#99a08c',cloth:'#b0ab98',pants:'#3a3b35',width:.82,lean:.49,arm:[-.38,-.54],elbow:[-.14,-.31],head:[.26,-.09,-.18]},researcher:{skin:'#8f9a87',cloth:'#a5a79a',pants:'#353e3c',width:.96,lean:.43,arm:[-.38,-.95],elbow:[-.16,-.55],head:[.21,-.06,.16]},rasp:{skin:'#978f7d',cloth:'#444a45',pants:'#2e3432',width:1,lean:.20,arm:[-.30,-1.05],elbow:[-.22,-.40],head:[.18,0,-.10]},rush:{skin:'#a18a77',cloth:'#69473b',pants:'#333635',width:1.19,lean:.30,arm:[-1.15,-1.40],elbow:[-.45,-.35],head:[.15,.08,.04]},hollow:{skin:'#b1aa99',cloth:'#575954',pants:'#383b3a',width:.83,lean:.23,arm:[-.20,-1.10],elbow:[-.18,-.34],head:[.22,-.12,.16]}}[id];
 if(!settings)throw new Error('Unknown organic enemy: '+id);
 const root=new T.Group();root.name='Enemy_'+id;const owned=new Set(),materials=[];
 function mat(name,color,roughness){const m=new T.MeshStandardMaterial({name,color,roughness,metalness:0,vertexColors:true});m.color.convertSRGBToLinear();m.envMapIntensity=.28;materials.push(m);return m;}
 const skin=mat('Matte living skin',settings.skin,.78),cloth=mat('Woven fabric',settings.cloth,.98),pants=mat('Trouser cloth',settings.pants,.98),shoe=mat('Worn leather','#272a27',.86),shadow=mat('Facial recess','#3d3c32',.94),hair=mat('Close cropped hair','#35372f',.99),eye=mat('Muted eyes','#878879',.73),crease=mat('Skin crease','#756f60',.93);
 const joint=(parent,name,x,y,z=0)=>{const g=new T.Group();g.name=name;g.position.set(x,y,z);parent.add(g);return g;};
 // Profile [y,width,depth,z,x]; sections are elliptical with gentle muscle and cloth variations.
 function loft(parent,name,rings,material,power=2.15,detail=32,hem=0){
  const vertices=[],indices=[],colors=[];
  for(let k=0;k<rings.length;k++){const [y,w,d,z=0,x=0]=rings[k];for(let j=0;j<detail;j++){
   const a=j/detail*Math.PI*2,c=Math.cos(a),s=Math.sin(a),f=2/power;
   const small=material===cloth||material===pants?1+.012*Math.cos(a*6+k*.45):1;
   vertices.push(x+Math.sign(c)*Math.abs(c)**f*w*.5*small,y+(k===0?hem*Math.sin(a*3+.6):0),z+Math.sign(s)*Math.abs(s)**f*d*.5*small);
   const shade=material===skin?.94+.035*Math.sin(k*.9+a*2):.965+.025*Math.cos(a*6+k*.5);colors.push(shade,shade,shade);
  }}
  for(let k=0;k<rings.length-1;k++)for(let j=0;j<detail;j++){const a=k*detail+j,b=k*detail+(j+1)%detail;indices.push(a,a+detail,b,b,a+detail,b+detail);}
  for(const k of [0,rings.length-1]){const r=rings[k],c=vertices.length/3;vertices.push(r[4]||0,r[0],r[3]||0);colors.push(.94,.94,.94);for(let j=0;j<detail;j++){const a=k*detail+j,b=k*detail+(j+1)%detail;indices.push(...(k===0?[c,a,b]:[c,b,a]));}}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();owned.add(g);const mesh=new T.Mesh(g,material);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
 }
 const wide=settings.width,torso=joint(root,'Torso',0,.88,-.025);
 const bodyRings=[[0,.26*wide,.18],[.08,.27*wide,.185],[.19,.31*wide,.205,-.005],[.30,.38*wide,.225,-.012],[.38,.40*wide,.215,-.016],[.43,.31*wide,.18,-.018],[.47,.155*wide,.125,-.005]];
 if(id==='rasp')bodyRings.unshift([-.09,.29,.20],[-.04,.285,.20]);if(id==='hollow'){bodyRings[0][1]=.19;bodyRings[1][1]=.20;bodyRings[2][1]=.245;bodyRings.splice(3,0,[.235,.28,.205,-.01],[.255,.29,.211,-.01],[.272,.30,.205,-.01]);}if(lab){bodyRings[3][3]=-.035;bodyRings[4][3]=-.055;}loft(torso,'Chest',bodyRings,id==='hollow'?skin:lab?pants:cloth);
 loft(root,'Waist',[[.715,.265*wide,.18],[.77,.31*wide,.21],[.85,.30*wide,.21],[.92,.265*wide,.19]],pants);
 const head=joint(torso,'Head',0,.475,.01);
 loft(head,'Neck',[[-.055,.12*wide,.12],[.015,.11*wide,.12,.01],[.07,.105*wide,.12,.01]],skin);
 loft(head,'Anatomical head',[[.045,.090,.10,.035],[.062,.125,.13,.032],[.09,.137,.152,.021],[.13,.157,.168,.012],[.17,.156,.178],[.21,.157,.18,-.005],[.255,.144,.164,-.012],[.28,.107,.124,-.016],[.29,.045,.06,-.016]],skin,2.25);
 // Narrow sunken sockets, a structural brow and nose; no visor or emissive eyes.
 for(const side of [-1,1]){
  const x=side*.043;
  const socket=loft(head,'Eye socket_'+side,[[.154,.038,.009,.088,x],[.165,.044,.012,.089,x],[.177,.040,.01,.086,x]],shadow,2.5,16);socket.rotation.z=side*.055;
  loft(head,'Pupil_'+side,[[.160,.006,.004,.100,x],[.165,.007,.004,.100,x]],shadow,2,12);
  loft(head,'Eye_'+side,[[.159,.020,.006,.096,x],[.164,.023,.006,.096,x],[.167,.018,.004,.096,x]],eye,2.6,12);
  loft(head,'Brow_'+side,[[.175,.050,.012,.086,x],[.182,.052,.014,.084,x],[.187,.043,.010,.080,x]],skin,2.35,20);
  loft(head,'Ear_'+side,[[.125,.022,.026,-.005,side*.080],[.155,.027,.033,-.007,side*.081],[.177,.022,.029,-.008,side*.079]],skin,2,16);
 }
 loft(head,'Nose',[[.126,.028,.025,.096],[.135,.035,.038,.105],[.15,.027,.037,.102],[.179,.014,.018,.088]],skin,2,20);
 loft(head,'Mouth crease',[[.098,.047,.005,.092],[.102,.049,.007,.093],[.105,.043,.005,.091]],shadow,2.5,16);
 loft(head,'Lower lip',[[.090,.035,.010,.087],[.096,.044,.014,.092],[.099,.039,.009,.092]],skin,2.2,16);
 if(id==='rasp')loft(head,'Cropped hair',[[.221,.159,.182,-.008],[.255,.148,.168,-.012],[.282,.110,.128,-.016],[.294,.045,.060,-.016]],hair,2.2);
 if(id==='hollow'){
  loft(torso,'Torn waist fabric',[[-.015,.27,.19],[.025,.285,.205],[.06,.26,.19]],cloth,2.1,32,.018);
 }
 const arms=[],elbows=[],legs=[],shins=[],feet=[];
 for(const side of [-1,1]){
  const i=side<0?0:1,name=side<0?'L':'R';
  const leg=joint(root,'Thigh_'+name,side*.090*wide,.81,side<0?.025:-.025);legs.push(leg);
  loft(leg,'Trouser thigh_'+name,[[-.38,.112*wide,.13],[-.29,.145*wide,.165,.005],[-.12,.17*wide,.185,.008],[.025,.18*wide,.19],[.075,.13*wide,.15]],pants,2.25);
  const shin=joint(leg,'Shin_'+name,0,-.38);shins.push(shin);
  loft(shin,'Trouser shin_'+name,[[-.35,.090*wide,.105],[-.27,.102*wide,.115],[-.13,.12*wide,.14,-.01],[.015,.12*wide,.135]],pants,2.25);
  const foot=loft(shin,'Shoe_'+name,[[-.43,.123*wide,.245,.055],[-.405,.13*wide,.25,.055],[-.36,.12*wide,.22,.045],[-.32,.09*wide,.13]],shoe,2.6);feet.push(foot);
  const arm=joint(torso,'UpperArm_'+name,side*.205*wide,.385,.006);arms.push(arm);
  loft(arm,'Upper arm_'+name,[[-.30,.086*wide,.100,.008],[-.24,.095*wide,.12,.01],[-.15,.125*wide,.145,-.005],[-.06,.15*wide,.16,-.008],[.018,.13*wide,.145],[.06,.07*wide,.10]],skin);
  if(lab){
   loft(arm,'Coat upper sleeve_'+name,[[-.305,.108,.13],[-.24,.12,.14],[-.09,.15,.17,-.008],[.025,.145,.155],[.065,.08,.11]],cloth,2.1,32,.006);
  }else if(id!=='hollow'){
   loft(arm,'Short sleeve_'+name,[[-.16,.138*wide,.158,-.003],[-.08,.16*wide,.18,-.006],[.02,.145*wide,.16],[.065,.085*wide,.11]],cloth,2.1,32,id==='rasp'?.012:.005);
   
  }
  const elbow=joint(arm,'Forearm_'+name,0,-.29,.006);elbows.push(elbow);if(id==='hollow')elbow.scale.y=1.17;
  loft(elbow,'Forearm anatomy_'+name,[[-.26,.064*wide,.076,.01],[-.21,.074*wide,.09,.008],[-.12,.10*wide,.12,.005],[-.045,.105*wide,.123],[.025,.085*wide,.10]],skin);
  if(lab)loft(elbow,'Frayed coat cuff_'+name,[[id==='lab-assistant'?-.10:i===0?-.225:-.135,.103,.116],[id==='lab-assistant'?-.05:i===0?-.16:-.08,.12,.14],[-.01,.125,.14],[.03,.106,.13]],cloth,2.1,32,i===0?.008:.02);
  const hand=joint(elbow,'Hand_'+name,0,-.26,.013);hand.rotation.set(id==='rush'?.70:.36,side*.70,side*.075);
  loft(hand,'Palm_'+name,[[-.105,.071*wide,.042,.018],[-.075,.085*wide,.053,.008],[-.025,.080*wide,.057],[.015,.064*wide,.070]],skin,2.5,24);
  for(let f=0;f<4;f++){
   const x=(f-1.5)*.020*wide,len=[.065,.082,.077,.058][f];
   const finger=joint(hand,'Finger_'+name+'_'+f,x,-.092,.021);finger.rotation.z=(f-1.5)*.075;
   loft(finger,'Curled finger_'+name+'_'+f,[[-len,.012*wide,.014,.029],[-len*.8,.017*wide,.019,.034],[-len*.48,.018*wide,.019,.028],[-len*.2,.019*wide,.020,.008],[.008,.020*wide,.023]],skin,2,12);
  }
  const thumb=joint(hand,'Thumb_'+name,side*.042,-.035,.022);thumb.rotation.z=side*-.5;
  loft(thumb,'Thumb flesh_'+name,[[-.055,.016,.018,.028],[-.035,.023,.023,.02],[0,.026,.028]],skin,2,12);
 }
// Closed thin cloth shell with an actual front opening; no painted-on lapel or slit.
function coatShell(parent,name,rings,opening,material,hem=0){
 const seg=36,pos=[],colors=[],ix=[],thickness=.003;
 for(let layer=0;layer<2;layer++)for(let k=0;k<rings.length;k++){
  const [y,w,d,z=0]=rings[k],cut=Array.isArray(opening)?opening[k]:opening;
  for(let j=0;j<=seg;j++){
   const a=Math.PI/2+cut+(Math.PI*2-2*cut)*j/seg,s=Math.sin(a),c=Math.cos(a),h=y+(k===0?hem*(Math.sin(a*3+.5)*.55+Math.sin(a*7)*.2):0);
   const wrinkle=1+.012*Math.cos(a*7+k*.7),inset=layer?thickness:0;
   pos.push(c*(w/2-inset)*wrinkle,h,z+s*(d/2-inset)*wrinkle);
   const dirt=k===0?.72:k===1?.87:.97;colors.push(dirt,dirt*.995,dirt*.965);
  }
 }
 const row=seg+1,count=rings.length*row;
 for(let k=0;k<rings.length-1;k++)for(let j=0;j<seg;j++){
  const a=k*row+j,b=a+1,c=a+row,d=c+1;ix.push(a,c,b,b,c,d,a+count,b+count,c+count,b+count,d+count,c+count);
 }
 for(const k of [0,rings.length-1])for(let j=0;j<seg;j++){const a=k*row+j,b=a+1;ix.push(a,b,a+count,b,b+count,a+count);}
 for(const j of [0,seg])for(let k=0;k<rings.length-1;k++){const a=k*row+j,b=a+row;ix.push(a,a+count,b,b,a+count,b+count);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(ix);g.computeVertexNormals();owned.add(g);const mesh=new T.Mesh(g,material);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function lapel(side){
 const a=[side*.070,.453,.082],b=[side*.13,.335,.127],c=[side*.040,.235,.122];
 const vertices=[...a,...b,...c,a[0],a[1],a[2]-.004,b[0],b[1],b[2]-.004,c[0],c[1],c[2]-.004];
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('color',new T.Float32BufferAttribute(Array(18).fill(.97),3));g.setIndex([0,1,2,5,4,3,0,3,1,1,3,4,1,4,2,2,4,5,2,5,0,0,5,3]);g.computeVertexNormals();owned.add(g);const mesh=new T.Mesh(g,cloth);mesh.name='Folded lapel_'+side;mesh.castShadow=mesh.receiveShadow=true;torso.add(mesh);
}
if(lab){
 const coatWidth=wide/.96;
 coatShell(torso,'Open lab coat',[[0,.30*coatWidth,.23],[.15,.32*coatWidth,.245],[.28,.38*coatWidth,.265,-.025],[.38,.415*coatWidth,.28,-.05],[.44,.32*coatWidth,.24,-.04],[.47,.16,.14]], id==='lab-assistant'?[.13,.13,.20,.36,.60,.75]:[.28,.28,.32,.46,.65,.75],cloth);
 const hemY=id==='lab-assistant'?.55:id==='lab-pathologist'?.31:.43;
 const tails=coatShell(root,'Split coat tails',[[hemY,.425*coatWidth,.29,-.014],[hemY+.10,.43*coatWidth,.30,-.008],[.77,.37*coatWidth,.275],[.93,.305*coatWidth,.235]], id==='lab-assistant'?[.20,.16,.13,.13]:[.38,.32,.28,.28],cloth,id==='lab-pathologist'?.045:.023);
 lapel(-1);lapel(1);
 if(id==='lab-assistant')for(const y of [.10,.19,.28])loft(torso,'Coat button_'+y,[[y,.008,.005,.127],[y+.008,.008,.005,.127]],pants,2.2,12);
 const badge=loft(torso,'Research ID',[[.26,.033,.006,.117,-.115],[.31,.033,.006,.112,-.115]],mat('Faded ID card','#adb4aa',.94),3.5,12);badge.rotation.z=-.07;
 const mouth=root.getObjectByName('Mouth crease');mouth.scale.y=2.6;mouth.position.y=-.162;root.getObjectByName('Lower lip').position.y=-.008;mouth.rotation.z=.09;
 head.position.set(0,.475,.006);
 // Cervical base stays in the shoulder girdle; only the skull pivots with the head.
 const oldNeck=root.getObjectByName('Neck');head.remove(oldNeck);owned.delete(oldNeck.geometry);oldNeck.geometry.dispose();
 loft(torso,'Neck',[[.355,.25*wide,.17,-.035],[.405,.18*wide,.145,-.025],[.45,.125,.125,-.008],[.495,.103,.105,-.005],[.53,.092,.095,-.012],[.55,.085,.085,-.015]],skin);
 if(id==='lab-pathologist')elbows.forEach(elbow=>elbow.scale.y=1.1);
 root.getObjectByName('Anatomical head').scale.set(1.025,.97,1);
 if(id!=='lab-assistant')coatShell(head,'Receding hair',[[.205,.159,.181,-.006],[.239,.153,.176,-.011],[.267,.126,.147,-.014],[.287,.060,.076,-.016]],[1.18,1.28,1.65,2.1],hair);
 for(const arm of arms)arm.position.z=-.015;
 // Only the loose lower panels sway; the shoulders stay bound to the hunched torso.
 tails.userData.coatTails=true;
}

 const restLeg=lab?[-.14,.19]:[-.12,.13],restShin=lab?[.22,.31]:[.18,.20];
 // Ground the two shoe soles after posing without traversing all mesh vertices.
 const point=new T.Vector3(),inverse=new T.Matrix4();
 function ground(){root.position.y=0;root.updateMatrixWorld(true);inverse.copy(root.matrixWorld).invert();let min=Infinity;for(const foot of feet)for(const x of [-.0615*wide,.0615*wide])for(const z of [-.0675,.1775]){point.set(x,-.43,z).applyMatrix4(foot.matrixWorld).applyMatrix4(inverse);min=Math.min(min,point.y);}root.position.y=-min*root.scale.y;}
 function stance(){torso.position.y=lab?.925:.88;torso.rotation.set(settings.lean,0,id==='hollow'?.045:lab?.055:-.025);head.rotation.set(...settings.head);legs.forEach((l,i)=>{l.rotation.set(restLeg[i],0,i===0?-.10:.10);shins[i].rotation.x=restShin[i];arms[i].rotation.set(settings.arm[i],i===0?-.08:.10,i===0?-.10:.12);elbows[i].rotation.x=settings.elbow[i];});ground();}
 let previous=null,phase=0,blend=0;
 function reset(){previous=null;phase=blend=0;stance();const tails=root.getObjectByName('Split coat tails');if(tails)tails.rotation.z=0;}
 function pose(seconds,walking=true){const dt=previous===null?0:T.MathUtils.clamp(seconds-previous,0,.1);previous=seconds;blend+=((walking?1:0)-blend)*(1-Math.exp(-dt*9));phase+=dt*(id==='rush'?6:lab?2.7:3.6)*blend;stance();legs.forEach((l,i)=>{const s=Math.sin(phase+i*Math.PI);l.rotation.x=restLeg[i]+s*(lab?(i===0?.17:.055):.25)*blend;shins[i].rotation.x=restShin[i]+Math.max(0,-s)*(lab?(i===0?.23:.035):.38)*blend;arms[i].rotation.x=settings.arm[i]-s*.12*blend;});torso.rotation.z+=Math.sin(phase)*.025*blend;head.rotation.z+=Math.sin(phase*.5)*.018*blend;if(lab){torso.rotation.x+=Math.cos(phase)*.025*blend;root.getObjectByName('Split coat tails').rotation.z=Math.sin(phase)*.015*blend;}ground();}
 function dispose(){owned.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
 if(id==='hollow')root.scale.y=1.055;if(id==='lab-assistant')root.scale.y=.95;if(id==='lab-pathologist')root.scale.y=1.065;reset();return {root,head,torso,arms,legs,pose,reset,dispose,id};
};
