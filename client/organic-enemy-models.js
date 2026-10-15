'use strict';
// Unarmored candidates: visible flesh, fabric, anatomy and hostile asymmetrical poses.
window.buildOrganicEnemy = (T,id) => {
 const specialist=['lab-ghost','lab-warlord','lab-titan','lab-artilleryelite','lab-explosionboss','lab-finalboss','lab-boss','lab-runner','lab-brute','lab-poisoner','lab-shield','lab-bomber','lab-carrier','lab-hunter','lab-armored','lab-artillery','lab-corehunter','lab-seeker','lab-blackout','lab-siege','lab-champion','lab-warden','lab-tiny','lab-gilded','lab-blueace'].includes(id);
 const lab=['researcher','lab-assistant','lab-pathologist'].includes(id)||specialist;
 let settings={'lab-assistant':{skin:'#969b85',cloth:'#a4ada4',pants:'#304342',width:1.15,lean:.32,arm:[-.50,-.68],elbow:[-.38,-.26],head:[.15,.06,-.10]},'lab-pathologist':{skin:'#99a08c',cloth:'#b0ab98',pants:'#3a3b35',width:.82,lean:.49,arm:[-.38,-.54],elbow:[-.14,-.31],head:[.26,-.09,-.18]},researcher:{skin:'#8f9a87',cloth:'#a5a79a',pants:'#353e3c',width:.96,lean:.43,arm:[-.38,-.95],elbow:[-.16,-.55],head:[.21,-.06,.16]},rasp:{skin:'#978f7d',cloth:'#444a45',pants:'#2e3432',width:1,lean:.20,arm:[-.30,-1.05],elbow:[-.22,-.40],head:[.18,0,-.10]},rush:{skin:'#a18a77',cloth:'#69473b',pants:'#333635',width:1.19,lean:.30,arm:[-1.15,-1.40],elbow:[-.45,-.35],head:[.15,.08,.04]},hollow:{skin:'#b1aa99',cloth:'#575954',pants:'#383b3a',width:.83,lean:.23,arm:[-.20,-1.10],elbow:[-.18,-.34],head:[.22,-.12,.16]}}[id];

 const extra={
  'lab-ghost':{skin:'#b0d5d5',cloth:'#81aeb8',pants:'#668a98',width:.72,lean:.38,arm:[-.85,-1.02],elbow:[-.28,-.40],head:[.19,-.10,.12]},
  'lab-explosionboss':{skin:'#9b8d79',cloth:'#62503c',pants:'#343831',width:1.90,lean:.57,arm:[-.24,-.85],elbow:[-.18,-.65],head:[-.14,.12,-.18]},
  'lab-finalboss':{skin:'#aeb7b3',cloth:'#444b51',pants:'#292f35',width:1.35,lean:.06,arm:[-.42,-.88],elbow:[-.25,-.45],head:[.04,-.04,0]},
  'lab-warlord':{skin:'#a49389',cloth:'#661f32',pants:'#252a32',width:1.55,lean:.14,arm:[-.55,-.75],elbow:[-.38,-.48],head:[.18,-.08,.05]},
  'lab-titan':{skin:'#aea397',cloth:'#6b496f',pants:'#3f3943',width:2.10,lean:.30,arm:[-.65,-.58],elbow:[-.35,-.42],head:[.24,.04,-.10]},
  'lab-artilleryelite':{skin:'#9ca189',cloth:'#526a43',pants:'#364332',width:1.27,lean:.34,arm:[-.38,-.65],elbow:[-.28,-.50],head:[.20,-.10,.08]},
  'lab-boss':{skin:'#a39c8c',cloth:'#635c50',pants:'#353c3a',width:1.95,lean:.20,arm:[-.72,-.88],elbow:[-.44,-.56],head:[.12,-.04,-.08]},
  'lab-tiny':{skin:'#a4ad8e',cloth:'#a0a995',pants:'#4c554b',width:1.02,lean:.65,arm:[-.95,-1.10],elbow:[-.90,-.75],head:[.25,.06,-.10]},
  'lab-gilded':{skin:'#a5a18c',cloth:'#35372e',pants:'#2d302b',width:1.18,lean:.23,arm:[-.38,-.56],elbow:[-.28,-.60],head:[.19,-.08,.08]},
  'lab-blueace':{skin:'#9aabaa',cloth:'#466f9f',pants:'#2e3d54',width:.93,lean:.46,arm:[-.80,-1.15],elbow:[-1.0,-.85],head:[.12,.08,-.08]},
  'lab-runner':{skin:'#9b9f8d',cloth:'#6b8781',pants:'#344945',width:.85,lean:.53,arm:[-.55,-1.20],elbow:[-.95,-.68],head:[.12,-.12,.08]},
  'lab-brute':{skin:'#a39e8c',cloth:'#686d65',pants:'#3d403a',width:1.65,lean:.22,arm:[-.38,-.47],elbow:[-.24,-.32],head:[.21,.06,-.06]},
  'lab-poisoner':{skin:'#a1aa87',cloth:'#b7baa1',pants:'#35453b',width:.92,lean:.48,arm:[-.54,-.92],elbow:[-.32,-.85],head:[.27,.14,-.16]},
  'lab-shield':{skin:'#9c9f8f',cloth:'#526469',pants:'#333f43',width:1.12,lean:.28,arm:[-.72,-.40],elbow:[-.95,-.24],head:[.18,-.09,.09]},
  'lab-bomber':{skin:'#a19b87',cloth:'#8c604a',pants:'#44423c',width:.95,lean:.46,arm:[-.58,-.85],elbow:[-.43,-.62],head:[.25,.10,-.14]},
  'lab-carrier':{skin:'#9a9d8a',cloth:'#424f4b',pants:'#303a36',width:1.2,lean:.40,arm:[-.34,-.51],elbow:[-.20,-.33],head:[.19,-.07,.12]},
  'lab-hunter':{skin:'#a0a28f',cloth:'#8b9290',pants:'#424b48',width:.78,lean:.57,arm:[-.92,-1.12],elbow:[-.64,-.50],head:[.13,-.06,-.12]},
  'lab-armored':{skin:'#9c9e8b',cloth:'#4d5b5b',pants:'#363f3d',width:1.3,lean:.24,arm:[-.43,-.59],elbow:[-.29,-.35],head:[.20,.08,-.06]},
  'lab-artillery':{skin:'#9d9f8a',cloth:'#74735a',pants:'#41483d',width:1.06,lean:.29,arm:[-.36,-.70],elbow:[-.26,-.58],head:[.20,-.11,.10]},
  'lab-corehunter':{skin:'#9c9e85',cloth:'#97815a',pants:'#444639',width:1.43,lean:.40,arm:[-.96,-1.01],elbow:[-.50,-.55],head:[.15,.02,-.05]},
  'lab-seeker':{skin:'#a4a497',cloth:'#8b7777',pants:'#3e4043',width:.79,lean:.25,arm:[-.72,-.32],elbow:[-.43,-.16],head:[.17,-.20,.14]},
  'lab-blackout':{skin:'#a2ab97',cloth:'#425f59',pants:'#323e3b',width:1.10,lean:.56,arm:[-.43,-.65],elbow:[-.23,-.35],head:[.26,.06,-.10]},
  'lab-siege':{skin:'#a2a08b',cloth:'#80745b',pants:'#41443a',width:1.83,lean:.34,arm:[-.45,-.68],elbow:[-.28,-.34],head:[.19,.06,-.08]},
  'lab-champion':{skin:'#a0a38e',cloth:'#4a4652',pants:'#353c3d',width:1.10,lean:.10,arm:[-.35,-.60],elbow:[-.20,-.60],head:[.26,-.08,.08]},
  'lab-warden':{skin:'#a4a793',cloth:'#657379',pants:'#394447',width:1.45,lean:.24,arm:[-.20,-.50],elbow:[-.14,-.26],head:[.24,-.09,-.13]}
 }[id];
 settings=settings||extra;
 if(!settings)throw new Error('Unknown organic enemy: '+id);
 const root=new T.Group();root.name='Enemy_'+id;const owned=new Set(),materials=[];
 function mat(name,color,roughness){const m=new T.MeshStandardMaterial({name,color,roughness,metalness:0,vertexColors:true});if(T.ColorManagement?.legacyMode!==false)m.color.convertSRGBToLinear();m.envMapIntensity=.28;materials.push(m);return m;}
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
 if(id==='rasp')bodyRings.unshift([-.09,.29,.20],[-.04,.285,.20]);if(id==='hollow'){bodyRings[0][1]=.19;bodyRings[1][1]=.20;bodyRings[2][1]=.245;bodyRings.splice(3,0,[.235,.28,.205,-.01],[.255,.29,.211,-.01],[.272,.30,.205,-.01]);}if(lab){bodyRings[3][3]=-.035;bodyRings[4][3]=-.055;}loft(torso,'Chest',bodyRings,id==='hollow'?skin:lab&&!specialist?pants:cloth);
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
  if(lab&&!specialist){
   loft(arm,'Coat upper sleeve_'+name,[[-.305,.108,.13],[-.24,.12,.14],[-.09,.15,.17,-.008],[.025,.145,.155],[.065,.08,.11]],cloth,2.1,32,.006);
  }else if(id!=='hollow'){
   loft(arm,'Short sleeve_'+name,[[-.16,.138*wide,.158,-.003],[-.08,.16*wide,.18,-.006],[.02,.145*wide,.16],[.065,.085*wide,.11]],cloth,2.1,32,id==='rasp'?.012:.005);
   
  }
  const elbow=joint(arm,'Forearm_'+name,0,-.29,.006);elbows.push(elbow);if(id==='hollow')elbow.scale.y=1.17;
  loft(elbow,'Forearm anatomy_'+name,[[-.26,.064*wide,.076,.01],[-.21,.074*wide,.09,.008],[-.12,.10*wide,.12,.005],[-.045,.105*wide,.123],[.025,.085*wide,.10]],skin);
  if(lab&&!specialist)loft(elbow,'Frayed coat cuff_'+name,[[id==='lab-assistant'?-.10:i===0?-.225:-.135,.103,.116],[id==='lab-assistant'?-.05:i===0?-.16:-.08,.12,.14],[-.01,.125,.14],[.03,.106,.13]],cloth,2.1,32,i===0?.008:.02);
  const hand=joint(elbow,'Hand_'+name,0,-.26,.013);hand.rotation.set(id==='rush'?.70:.36,side*.70,side*.075);
  loft(hand,'Palm_'+name,[[-.105,.071*wide,.042,.018],[-.075,.085*wide,.053,.008],[-.025,.080*wide,.057],[.015,.064*wide,.070]],skin,2.5,24);
  // Local -Z is the palm side: wrist flexion, finger flexion and thumb opposition agree.
  // Sweep sections perpendicular to the phalanges, including the rounded fingertip.
  for(let f=0;f<4;f++){
   const x=side*(f-1.5)*.020*wide,len=[.065,.082,.077,.058][f];
   const finger=joint(hand,'Finger_'+name+'_'+f,x,-.090+[0,-.003,0,.006][f],.014);
   finger.rotation.z=side*(f-1.5)*.035;
   const steps=12,detail=12,centers=[{y:.006,z:0,angle:0}],vertices=[],colors=[],indices=[];
   for(let k=1;k<=steps;k++){
    const t=k/steps,angle=t<.4?.08:t<.75?.08+(t-.4)/.35*.68:.76+(t-.75)/.25*.45;
    const prev=centers[k-1],mid=(prev.angle+angle)*.5;
    centers.push({y:prev.y-len/steps*Math.cos(mid),z:prev.z-len/steps*Math.sin(mid),angle});
   }
   for(let k=steps;k>=0;k--){
    const t=k/steps,c=centers[k],radius=(.010-.002*t)*wide*(t>.83?Math.sqrt(Math.max(.025,1-((t-.83)/.17)**2)):1);
    for(let j=0;j<detail;j++){
     const a=j/detail*Math.PI*2,v=Math.sin(a)*radius;
     vertices.push(Math.cos(a)*radius,c.y-v*Math.sin(c.angle),c.z+v*Math.cos(c.angle));colors.push(.96,.96,.96);
    }
   }
   for(let k=0;k<steps;k++)for(let j=0;j<detail;j++){const a=k*detail+j,b=k*detail+(j+1)%detail;indices.push(a,a+detail,b,b,a+detail,b+detail);}
   for(const k of [0,steps]){const c=centers[steps-k],center=vertices.length/3;vertices.push(0,c.y,c.z);colors.push(.96,.96,.96);for(let j=0;j<detail;j++){const a=k*detail+j,b=k*detail+(j+1)%detail;indices.push(...(k===0?[center,a,b]:[center,b,a]));}}
   const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();owned.add(g);
   const mesh=new T.Mesh(g,skin);mesh.name='Curled finger_'+name+'_'+f;mesh.castShadow=mesh.receiveShadow=true;finger.add(mesh);
  }
  // Radial side is toward the index finger, mirrored between left and right hands.
  const radial=-side,thumb=joint(hand,'Thumb_'+name,radial*.030*wide,-.038,.004);thumb.rotation.z=radial*.62;
  loft(thumb,'Thumb flesh_'+name,[[-.060,.013*wide,.016,-.023],[-.047,.020*wide,.023,-.022],[-.026,.025*wide,.028,-.013],[0,.034*wide,.034],[.012,.026*wide,.028,.003]],skin,2.15,16);
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
 if(id==='lab-tiny') {
  loft(root,'Short patient smock',[[.56,.35,.27],[.69,.36,.28],[.87,.31,.24],[.96,.27,.21]],cloth,2.3,24,.025);
  loft(torso,'Patient neckline',[[.38,.26,.20],[.45,.18,.15],[.47,.12,.12]],cloth,2.2,20);
  const cuff=mat('Broken restraint','#67756c',.88);
  loft(elbows[0],'Broken wrist restraint',[[-.255,.09,.10,.01],[-.215,.10,.11,.01]],cuff,2.6,16);
  for(const side of ['L','R'])root.getObjectByName('Hand_'+side).scale.setScalar(1.35);
 }
 if(id==='lab-gilded') {
  const gold=mat('Tarnished brass','#f5bf3e',.20),strap=mat('Specimen straps','#34382f',.95),seal=mat('Sealed specimen jade','#3dbaa1',.64);
  gold.metalness=.9;gold.envMapIntensity=.8;
  seal.emissive.copy(seal.color);seal.emissiveIntensity=.32;
  loft(torso,'Gold specimen vest',[[.02,.34,.25],[.20,.40,.28],[.36,.48,.28,-.025],[.43,.34,.23,-.02]],gold,3.2,24);
  // A gold protective hood and dark horizontal visor replace the shared bare scalp.
  loft(head,'Gilded recovery hood',[[.19,.183,.21,-.012],[.25,.178,.20,-.014],[.30,.128,.15,-.017],[.325,.055,.07,-.017]],gold,2.8,24);
  loft(head,'Gilded face shield',[[.075,.10,.035,.105],[.10,.155,.045,.105],[.22,.171,.045,.105],[.24,.14,.035,.10]],gold,3.5,24);
  loft(head,'Gilded dark visor',[[.158,.144,.012,.131],[.184,.144,.012,.131]],strap,3.5,20);
  loft(head,'Gilded visor inset',[[.167,.105,.008,.139],[.175,.105,.008,.139]],seal,3,16);
  loft(torso,'Specimen strongbox',[[.01,.35,.22,-.25],[.06,.42,.28,-.25],[.43,.42,.28,-.25],[.49,.34,.23,-.25]],gold,4,24);
  for(const y of [.10,.36])loft(torso,'Strongbox reinforcement_'+y,[[y,.43,.29,-.25],[y+.035,.43,.29,-.25]],strap,4,20);
  loft(torso,'Strongbox jade seal',[[.20,.105,.012,-.397],[.29,.105,.012,-.397]],seal,3,16);
  for(const side of [-1,1]) {
   loft(torso,'Brass shoulder clasp_'+side,[[.35,.13,.10,.08,side*.18],[.43,.14,.11,.04,side*.16]],gold,3,16);
   loft(torso,'Specimen harness_'+side,[[.03,.03,.025,.135,side*.13],[.29,.03,.025,.145,side*.16],[.45,.035,.03,.05,side*.15]],strap,2.5,16);
   loft(torso,'Gold specimen canister_'+side,[[.03,.085,.10,-.25,side*.255],[.07,.105,.12,-.25,side*.255],[.35,.105,.12,-.25,side*.255],[.39,.08,.09,-.25,side*.255]],gold,2,20);
   loft(torso,'Canister seal_'+side,[[.25,.110,.125,-.25,side*.255],[.28,.110,.125,-.25,side*.255]],seal,2,16);
   loft(elbows[side<0?0:1],'Gilded forearm guard_'+side,[[-.24,.12,.13,.01],[-.10,.15,.16,.01],[-.06,.12,.13]],gold,2.8,20);
  }
  loft(torso,'Brass chest seal',[[.19,.11,.018,.15],[.30,.11,.018,.15]],strap,3,16);
  loft(torso,'Jade chest seal',[[.22,.07,.012,.165],[.27,.07,.012,.165]],seal,3,16);
 }
 if(id==='lab-blueace') {
  const armor=mat('Blue response armor','#477dab',.7),dark=mat('Response webbing','#273c4e',.95),stripe=mat('Pale rank marks','#b0ced6',.83);
  loft(torso,'Blue response vest',[[.02,.31,.235],[.21,.39,.26],[.36,.43,.245,-.03],[.43,.30,.21,-.02]],armor,2.7,24);
  loft(head,'Blue response helmet',[[.205,.173,.20,-.012],[.25,.16,.185,-.015],[.30,.10,.13,-.02]],armor,2.4,24);
  for(const side of [-1,1]) {
   loft(torso,'Response shoulder pad_'+side,[[.29,.10,.16,-.025,side*.235],[.40,.12,.18,-.02,side*.22]],armor,2.8,20);
   loft(torso,'Response chest strap_'+side,[[.07,.025,.025,.135,side*.11],[.35,.025,.025,.115,side*.14]],dark,2.5,12);
  }
  for(const y of [.18,.23])loft(torso,'Ace rank stripe_'+y,[[y,.09,.009,.142],[y+.015,.09,.009,.142]],stripe,3,12);
 }
 if(!specialist){
 const coatWidth=wide/.96;
 coatShell(torso,'Open lab coat',[[0,.30*coatWidth,.23],[.15,.32*coatWidth,.245],[.28,.38*coatWidth,.265,-.025],[.38,.415*coatWidth,.28,-.05],[.44,.32*coatWidth,.24,-.04],[.47,.16,.14]], id==='lab-assistant'?[.13,.13,.20,.36,.60,.75]:[.28,.28,.32,.46,.65,.75],cloth);
 const hemY=id==='lab-assistant'?.55:id==='lab-pathologist'?.31:.43;
 const tails=coatShell(root,'Split coat tails',[[hemY,.425*coatWidth,.29,-.014],[hemY+.10,.43*coatWidth,.30,-.008],[.77,.37*coatWidth,.275],[.93,.305*coatWidth,.235]], id==='lab-assistant'?[.20,.16,.13,.13]:[.38,.32,.28,.28],cloth,id==='lab-pathologist'?.045:.023);
 lapel(-1);lapel(1);
 if(id==='lab-assistant')for(const y of [.10,.19,.28])loft(torso,'Coat button_'+y,[[y,.008,.005,.127],[y+.008,.008,.005,.127]],pants,2.2,12);
 const badge=loft(torso,'Research ID',[[.26,.033,.006,.117,-.115],[.31,.033,.006,.112,-.115]],mat('Faded ID card','#adb4aa',.94),3.5,12);badge.rotation.z=-.07;
 }
 if(id==='lab-ghost'){
  coatShell(torso,'Ghost examination gown',[[.01,.24,.20],[.18,.27,.22],[.33,.32,.24,-.035],[.43,.24,.19,-.025],[.47,.14,.13]], [.45,.45,.48,.65,.85],cloth);
  coatShell(root,'Ghost torn gown',[[.34,.28,.23,-.01],[.48,.32,.25],[.77,.28,.23],[.92,.23,.20]], [.70,.55,.45,.45],cloth,.055);
  loft(elbows[0],'Ghost patient band',[[-.24,.082,.09,.01],[-.205,.087,.095,.01]],cloth,2.6,16);
  elbows.forEach(elbow=>elbow.scale.y=1.10);
  for(const m of materials){
   m.transparent=true;m.opacity=m===skin?.30:m===cloth?.24:m===pants||m===shoe?.18:.38;
   m.depthWrite=false;m.side=T.FrontSide;
   m.emissive.copy(m.color);m.emissiveIntensity=.14;
  }
 }
 if(id==='lab-runner'){
  coatShell(torso,'Scrub collar',[[.38,.30,.22,-.035],[.44,.24,.19,-.025],[.47,.14,.13]], [.58,.72,.85],cloth);
  loft(torso,'Scrub pocket',[[.22,.055,.008,.103,-.080],[.28,.055,.008,.105,-.080]],cloth,3,16);
  loft(arms[0],'Torn scrub sleeve',[[-.18,.12,.14],[-.12,.14,.16],[.025,.14,.15]],cloth,2.1,24,.009);
  loft(head,'Disordered cropped hair',[[.22,.159,.182,-.008],[.26,.146,.163,-.012],[.29,.05,.06,-.016]],hair,2.1,24);
 }
 if(id==='lab-brute'){
  const apron=mat('Heavy canvas apron','#a5a28e',.99);
  loft(torso,'Apron bib',[[.02,.43,.022,.181],[.18,.44,.024,.183],[.36,.34,.023,.171]],apron,3,24);
  loft(root,'Apron skirt',[[.36,.48,.045,.160],[.49,.51,.045,.165],[.78,.46,.04,.17],[.94,.43,.03,.16]],apron,3,24,.012);
  for(const side of [-1,1])loft(torso,'Apron strap_'+side,[[.32,.035,.025,.16,side*.16],[.43,.035,.03,.12,side*.18],[.47,.035,.03,.04,side*.16]],apron,2.5,12);
  elbows.forEach(e=>{e.scale.x=1.18;e.scale.z=1.13;});
 }
 if(id==='lab-poisoner'){
  const equipment=mat('Contamination equipment','#35473b',.87),tank=mat('Worn reagent cylinders','#64785a',.89),reagent=mat('Toxic chartreuse reagent','#9dc43c',.58),lens=mat('Smoked green lenses','#405e44',.38),glove=mat('Chemical rubber gloves','#455b43',.94);
  coatShell(torso,'Poisoner open lab coat',[[0,.29,.235],[.16,.31,.25],[.29,.36,.265,-.025],[.39,.39,.28,-.05],[.44,.30,.24,-.04],[.47,.16,.14]],[.28,.28,.34,.48,.65,.75],cloth);
  coatShell(root,'Split coat tails',[[.38,.40,.28,-.014],[.49,.42,.29,-.008],[.77,.35,.27],[.93,.29,.235]],[.42,.36,.28,.28],cloth,.035);
  lapel(-1);lapel(1);
  loft(torso,'Poisoner research badge',[[.24,.045,.012,.141,-.105],[.29,.045,.012,.141,-.105]],equipment,3,12);
  loft(torso,'Chemical stained pocket',[[.16,.065,.013,.128,.10],[.23,.065,.013,.135,.10]],tank,3,16);
  for(const x of [.085,.112])loft(torso,'Pocket sample vial_'+x,[[.21,.016,.018,.148,x],[.27,.016,.018,.148,x]],reagent,2,12);
  for(const side of [-1,1]){
   loft(torso,'Reagent tank_'+side,[[.06,.095,.095,-.20,side*.067],[.09,.116,.116,-.20,side*.067],[.33,.116,.116,-.20,side*.067],[.36,.09,.09,-.20,side*.067]],tank,2,24);
   loft(torso,'Tank reagent window_'+side,[[.12,.054,.012,-.261,side*.067],[.29,.054,.012,-.261,side*.067]],reagent,3,12);
   loft(torso,'Tank valve_'+side,[[.35,.025,.03,-.20,side*.067],[.40,.025,.03,-.20,side*.067]],equipment,2,12);
   loft(torso,'Tank harness_'+side,[[.03,.025,.025,.131,side*.13],[.24,.025,.025,.146,side*.13],[.42,.025,.025,.10,side*.15],[.47,.025,.025,-.03,side*.13]],equipment,2,12);
   loft(head,'Respirator filter_'+side,[[.08,.035,.04,.101,side*.049],[.115,.035,.04,.101,side*.049]],equipment,2,16);
   loft(head,'Round protective lens_'+side,[[.144,.016,.012,.102,side*.047],[.151,.043,.016,.104,side*.047],[.177,.043,.016,.104,side*.047],[.184,.016,.012,.102,side*.047]],lens,2,20);
   const g=new T.TorusGeometry(.029,.006,8,24);g.setAttribute('color',new T.Float32BufferAttribute(Array(g.attributes.position.count*3).fill(.96),3));owned.add(g);
   const rim=new T.Mesh(g,equipment);rim.name='Round goggle rim_'+side;rim.position.set(side*.047,.164,.112);rim.castShadow=rim.receiveShadow=true;head.add(rim);
   loft(head,'Goggle temple_'+side,[[.159,.012,.15,.025,side*.080],[.169,.012,.15,.025,side*.080]],equipment,2,12);
  }
  loft(head,'Goggle bridge',[[.162,.035,.012,.112],[.169,.035,.012,.112]],equipment,2,12);
  const grayHair=mat('Disheveled gray hair','#8a9380',.99);
  coatShell(head,'Disheveled researcher hair',[[.20,.173,.19,-.008],[.24,.17,.185,-.014],[.28,.12,.14,-.02],[.30,.05,.065,-.03]],[1.25,1.35,1.65,2.1],grayHair,.008);
  for(const side of [-1,1])loft(head,'Unkempt hair tuft_'+side,[[.19,.05,.09,-.025,side*.075],[.23,.07,.085,-.03,side*.09],[.255,.008,.025,-.04,side*.13]],grayHair,2,16);
  loft(head,'Respirator cup',[[.075,.055,.032,.100],[.10,.08,.05,.112],[.13,.055,.032,.103]],equipment,2.3,24);
  for(let i=0;i<2;i++){
   loft(arms[i],'Research coat sleeve_'+i,[[-.30,.10,.12],[-.15,.13,.15],[.02,.14,.15]],cloth,2.1,24);
   loft(elbows[i],'Stained researcher cuff_'+i,[[-.20,.09,.105],[-.08,.115,.13],[.03,.10,.12]],cloth,2.1,24,.01);
   loft(elbows[i],'Chemical glove cuff_'+i,[[-.27,.082,.095,.01],[-.20,.095,.11,.01]],glove,2.2,16);
   root.getObjectByName('Hand_'+(i?'R':'L')).traverse(o=>{if(o.isMesh)o.material=glove;});
  }
  const syringe=joint(root.getObjectByName('Hand_R'),'Poisoner reagent syringe',-.035,-.065,-.045);syringe.rotation.z=-.35;
  loft(syringe,'Syringe reagent barrel',[[-.14,.055,.055],[-.12,.065,.065],[.12,.065,.065],[.14,.055,.055]],reagent,2,20);
  for(const y of [-.14,.12])loft(syringe,'Syringe collar_'+y,[[y,.075,.075],[y+.024,.075,.075]],equipment,2,16);
  loft(syringe,'Syringe needle',[[-.28,.004,.004],[-.18,.010,.010],[-.14,.015,.015]],equipment,2,12);
  loft(syringe,'Syringe plunger',[[.14,.018,.018],[.23,.018,.018]],equipment,2,12);
  loft(syringe,'Syringe thumb plate',[[.225,.09,.045],[.245,.09,.045]],equipment,3,12);
 }
 if(id==='lab-shield'){
  const panel=mat('Worn containment shield','#596c70',.8),grip=mat('Shield webbing','#303b3e',.96);
  const shield=joint(elbows[0],'Containment shield',0,-.42,.09);shield.rotation.x=1.39;
  loft(shield,'Shield panel',[[-.43,.29,.026],[-.38,.43,.032],[.26,.43,.032],[.38,.32,.026]],panel,4,32);
  loft(shield,'Shield top band',[[.26,.43,.034,.002],[.285,.41,.034,.002]],grip,4,24);
  loft(shield,'Shield grip',[[-.15,.033,.038,-.13],[0,.033,.038,-.13]],grip,2.5,12);
  for(const y of [-.165,.015])loft(shield,'Grip bracket_'+y,[[y-.012,.10,.13,-.075],[y+.012,.10,.13,-.075]],grip,3,12);
  for(const arm of arms)loft(arm,'Security jacket sleeve_'+arm.name,[[-.305,.108*wide,.13],[-.24,.12*wide,.14],[-.09,.15*wide,.17,-.008],[.025,.145*wide,.155],[.065,.08*wide,.11]],cloth,2.1,24);
  loft(torso,'Jacket seam',[[.03,.009,.008,.107],[.32,.009,.008,.095],[.43,.009,.008,.045]],grip,2,12);
  loft(head,'Security cropped hair',[[.22,.16,.18,-.008],[.26,.146,.166,-.012],[.29,.045,.06,-.016]],hair,2.2,24);
 }
 if(id==='lab-bomber'){
  const webbing=mat('Demolition webbing','#413f36',.98),charge=mat('Dull demolition packs','#6a6554',.9),warning=mat('Faded hazard band','#a37558',.94);
  for(const side of [-1,1]){
   loft(torso,'Demolition strap_'+side,[[.015,.034,.024,.103,side*.09],[.25,.034,.024,.121,side*.10],[.43,.034,.024,.065,side*.13]],webbing,2.5,12);
   loft(torso,'Demolition charge_'+side,[[.035,.070,.055,.139,side*.078],[.055,.090,.065,.139,side*.078],[.24,.090,.065,.139,side*.078],[.26,.070,.055,.139,side*.078]],charge,3,20);
   loft(torso,'Charge hazard band_'+side,[[.12,.093,.068,.139,side*.078],[.145,.093,.068,.139,side*.078]],warning,3,20);
  }
  loft(torso,'Charge controller',[[.29,.045,.025,.135],[.34,.045,.025,.126]],webbing,3,16);
  // One damaged sleeve gives a readable asymmetry without surface clutter.
  loft(arms[0],'Maintenance sleeve',[[-.26,.10,.12],[-.12,.13,.15],[.025,.14,.15]],cloth,2.1,24,.012);
 }
 if(id==='lab-carrier'){
  const pack=mat('Canvas specimen carrier','#b7914e',.99),strap=mat('Carrier harness','#353b32',.97),seam=mat('Carrier canvas seams','#d0b47a',.99),patch=mat('Carrier specimen marker','#754137',.98);
  // A stuffed, gathered sack: the shoulder-high crown and broad sides read from the front too.
  loft(torso,'Specimen backpack',[[-.16,.34,.26,-.29],[-.11,.56,.40,-.32],[.04,.66,.47,-.33],[.25,.70,.49,-.34],[.46,.66,.46,-.33],[.61,.54,.38,-.31],[.69,.32,.25,-.29],[.73,.23,.19,-.28]],pack,2.35,32);
  loft(torso,'Gathered sack mouth',[[.68,.31,.25,-.29],[.73,.23,.19,-.28],[.78,.35,.25,-.29],[.80,.32,.23,-.29]],pack,2.2,24,.018);
  loft(torso,'Sack neck binding',[[.711,.265,.215,-.28],[.735,.265,.215,-.28]],strap,2.2,20);
  loft(torso,'Sack tie tail',[[.57,.025,.025,-.405,.075],[.65,.029,.026,-.408,.045],[.73,.025,.024,-.391,.015]],strap,2.1,12);
  loft(torso,'Reinforced sack base',[[-.16,.35,.27,-.29],[-.115,.57,.415,-.32],[-.065,.62,.445,-.33]],strap,2.35,24);
  for(const side of [-1,1]){
   loft(torso,'Carrier strap_'+side,[[.01,.058,.027,.113,side*.12],[.26,.062,.03,.128,side*.13],[.43,.062,.03,.085,side*.15],[.49,.062,.032,-.06,side*.15],[.46,.062,.032,-.18,side*.17]],strap,2.5,16);
   loft(torso,'Sack compression belt_'+side,[[-.12,.047,.028,-.49,side*.18],[.04,.047,.028,-.561,side*.20],[.25,.047,.028,-.585,side*.21],[.46,.047,.028,-.553,side*.20],[.61,.047,.028,-.49,side*.16]],strap,2.5,16);
   loft(torso,'Sack stitched panel_'+side,[[-.08,.009,.012,-.475,side*.25],[.10,.009,.012,-.54,side*.28],[.30,.009,.012,-.55,side*.29],[.49,.009,.012,-.512,side*.26],[.62,.009,.012,-.46,side*.18]],seam,2,12);
   loft(torso,'Side specimen pouch_'+side,[[-.025,.10,.16,-.32,side*.345],[.015,.14,.21,-.32,side*.355],[.20,.14,.21,-.32,side*.355],[.25,.11,.18,-.32,side*.345]],pack,2.5,20);
   loft(torso,'Side pouch flap_'+side,[[.18,.147,.22,-.325,side*.355],[.23,.147,.22,-.325,side*.355],[.26,.115,.19,-.325,side*.345]],seam,2.5,16);
   loft(torso,'Carrier harness buckle_'+side,[[.24,.076,.037,.146,side*.13],[.28,.076,.037,.146,side*.13]],seam,3,12);
  }
  loft(torso,'Harness bridge',[[.18,.32,.027,.145],[.21,.32,.027,.145]],strap,3,16);
  loft(torso,'Sack specimen patch',[[.24,.19,.018,-.592],[.39,.19,.018,-.585]],patch,3.5,16);
  loft(torso,'Sack specimen stripe',[[.295,.125,.019,-.605],[.325,.125,.019,-.604]],seam,3,12);
 }
 if(id==='lab-hunter'){
  const band=mat('Patient wrist band','#b5b6a3',.97);
  loft(root,'Torn patient gown',[[.51,.31,.235],[.62,.32,.25],[.80,.28,.23],[.94,.235,.20]],cloth,2.2,32,.025);
  loft(torso,'Patient gown neckline',[[.405,.23,.18,-.025],[.45,.16,.135,-.008],[.47,.12,.12]],cloth,2.15,24);
  loft(elbows[1],'Patient wrist band',[[-.25,.072*wide,.085,.011],[-.23,.078*wide,.092,.011]],band,2.2,20);
  const sleeve=root.getObjectByName('Short sleeve_R');sleeve.parent.remove(sleeve);owned.delete(sleeve.geometry);sleeve.geometry.dispose();
 }
 if(id==='lab-armored'){
  const protection=mat('Worn protective textile','#69746e',.95),webbing=mat('Protective vest webbing','#3c4742',.98),armor=mat('Heavy ballistic shell','#77848a',.64),edge=mat('Ballistic edge guards','#39464c',.82);
  loft(torso,'Protective vest',[[.015,.365,.235],[.10,.40,.255],[.29,.51,.265,-.025],[.38,.54,.25,-.04],[.43,.39,.23,-.03]],protection,2.6,32);
  for(const side of [-1,1])loft(torso,'Vest shoulder strap_'+side,[[.35,.065,.023,.093,side*.16],[.44,.065,.028,.075,side*.16],[.47,.065,.03,.015,side*.13]],protection,2.4,16);
  loft(torso,'Vest waist band',[[.035,.38,.25],[.075,.39,.26]],webbing,2.6,24);
  // Thick chamfered shells sit above the soft vest, with dark rims exposing their depth.
  loft(torso,'Chest armor rim',[[.085,.36,.075,.135],[.14,.46,.095,.145],[.32,.53,.095,.115],[.405,.38,.075,.095]],edge,4,16);
  loft(torso,'Ballistic chest plate',[[.105,.33,.070,.177],[.15,.425,.085,.185],[.31,.49,.085,.155],[.385,.35,.065,.135]],armor,4,16);
  loft(torso,'Back armor rim',[[.07,.36,.075,-.135],[.16,.45,.095,-.155],[.34,.50,.09,-.17],[.41,.34,.07,-.145]],edge,4,16);
  loft(torso,'Ballistic back plate',[[.09,.33,.065,-.175],[.17,.415,.075,-.195],[.33,.46,.075,-.21],[.39,.31,.06,-.18]],armor,4,16);
  for(let i=0;i<2;i++)loft(torso,'Abdominal armor_'+i,[[.008+i*.047,.31,.055,.133],[.045+i*.047,.35,.065,.143],[.06+i*.047,.32,.05,.135]],armor,4,16);
  loft(torso,'Armored collar',[[.405,.25,.205,-.018],[.445,.27,.215,-.018],[.48,.215,.17,-.008]],edge,3.4,20);
  for(const arm of arms){
   const old=arm.children.find(o=>o.name.startsWith('Short sleeve_'));arm.remove(old);owned.delete(old.geometry);old.geometry.dispose();
   loft(arm,'Protective uniform sleeve_'+arm.name,[[-.305,.11*wide,.13,.008],[-.24,.12*wide,.15,.01],[-.15,.15*wide,.175,-.005],[-.06,.175*wide,.19,-.008],[.018,.155*wide,.175],[.065,.10*wide,.13]],cloth,2.1,24);
  }
  for(const side of [-1,1]){
   const i=side<0?0:1;
   loft(arms[i],'Shoulder armor rim_'+side,[[-.12,.225,.24,-.008],[.015,.25,.26,-.008],[.09,.145,.17,-.015]],edge,3.4,16);
   loft(arms[i],'Ballistic shoulder shell_'+side,[[-.09,.245,.255,-.008],[.025,.265,.275,-.008],[.10,.145,.17,-.015]],armor,3.4,16);
   loft(elbows[i],'Armored elbow_'+side,[[-.055,.15,.155],[.025,.17,.18],[.07,.13,.145]],edge,3,16);
   loft(elbows[i],'Ballistic forearm guard_'+side,[[-.23,.12,.14,.02],[-.18,.15,.17,.02],[-.045,.17,.185,.014],[.005,.14,.15,.01]],armor,3.5,16);
   loft(legs[i],'Ballistic thigh plate_'+side,[[-.29,.145,.055,.095],[-.10,.19,.07,.115],[-.03,.17,.055,.115]],armor,3.6,16);
   loft(shins[i],'Knee armor rim_'+side,[[-.07,.17,.08,.072],[.035,.18,.09,.075],[.07,.13,.065,.06]],edge,3.4,16);
   loft(shins[i],'Ballistic knee cap_'+side,[[-.055,.14,.065,.115],[.025,.16,.075,.12],[.06,.11,.055,.10]],armor,3.4,16);
   loft(shins[i],'Ballistic shin guard_'+side,[[-.30,.11,.055,.055],[-.25,.135,.065,.07],[-.095,.16,.075,.085],[-.06,.14,.055,.08]],armor,3.5,16);
   loft(head,'Helmet cheek guard_'+side,[[.09,.04,.115,.016,side*.085],[.16,.05,.16,-.005,side*.086],[.235,.05,.17,-.014,side*.077]],armor,3.2,16);
  }
  // The recessed face remains readable inside the helmet and jaw protection.
  loft(head,'Helmet rim',[[.198,.20,.228,-.012],[.224,.20,.228,-.012]],edge,3,24);
  loft(head,'Open face helmet',[[.215,.204,.231,-.012],[.255,.195,.216,-.014],[.298,.15,.17,-.017],[.323,.065,.08,-.017]],armor,2.8,24);
  loft(head,'Armored chin guard',[[.065,.13,.045,.085],[.095,.16,.055,.098],[.12,.135,.04,.105]],edge,3.2,16);
 }
 if(id==='lab-artillery'){
  const device=mat('Worn launcher casing','#5a6655',.86),webbing=mat('Launcher harness','#38473d',.97),interior=mat('Launcher interior','#222a24',.98);
  loft(torso,'Launcher support',[[.02,.24,.105,-.16],[.07,.28,.13,-.16],[.39,.28,.13,-.16],[.44,.23,.10,-.16]],device,3,24);
  const tube=joint(torso,'Shoulder launcher',.13,.02,-.245);tube.rotation.x=.16;
  coatShell(tube,'Open launcher tube',[[0,.145,.145],[.04,.15,.15],[.61,.15,.15],[.70,.15,.15]],0,device);
  coatShell(tube,'Launcher muzzle rim',[[.67,.158,.158],[.705,.158,.158]],0,device);
  loft(tube,'Launcher bore floor',[[.01,.138,.138],[.015,.138,.138]],interior,2,24);
  for(const side of [-1,1])loft(torso,'Launcher shoulder strap_'+side,[[.02,.033,.024,.105,side*.12],[.28,.033,.024,.113,side*.13],[.44,.033,.024,.067,side*.14],[.47,.033,.025,-.04,side*.13]],webbing,2.4,16);
  loft(torso,'Launcher spare canister',[[.06,.09,.09,-.24,-.10],[.09,.11,.11,-.24,-.10],[.35,.11,.11,-.24,-.10],[.38,.09,.09,-.24,-.10]],device,2,24);
 }
 if(id==='lab-corehunter'){
  const glove=mat('Heavy recovery gloves','#525543',.97),webbing=mat('Recovery harness','#665f48',.98);
  coatShell(torso,'Recovery vest',[[.015,.40,.24],[.16,.44,.26],[.30,.56,.29,-.025],[.39,.59,.29,-.04],[.45,.37,.22,-.025]], [.22,.23,.30,.55,.8],cloth);
  for(const elbow of elbows){
   loft(elbow,'Recovery gauntlet_'+elbow.name,[[-.28,.10*wide,.10,.012],[-.23,.13*wide,.13,.01],[-.12,.15*wide,.15,.005],[-.06,.14*wide,.15]],glove,2.3,24);
   const hand=elbow.children.find(o=>o.name.startsWith('Hand_'));hand.scale.set(1.20,1.18,1.15);hand.traverse(o=>{if(o.isMesh)o.material=glove;});
  }
  loft(torso,'Recovery belt',[[.015,.41,.25],[.055,.42,.26]],webbing,2.7,24);
 }
 if(id==='lab-seeker'){
  const equipment=mat('Tracking instrument','#464644',.92);
  coatShell(torso,'Seeker long coat',[[.005,.26,.22],[.19,.28,.23],[.34,.34,.245,-.04],[.43,.26,.20,-.03],[.47,.14,.13]], [.25,.28,.45,.68,.80],cloth);
  coatShell(root,'Seeker coat tails',[[.29,.37,.27],[.43,.38,.28],[.77,.29,.24],[.94,.26,.22]], [.39,.35,.27,.25],cloth,.024);
  loft(arms[0],'Seeker long sleeve',[[-.305,.11*wide,.13,.008],[-.24,.12*wide,.15,.01],[-.15,.15*wide,.175,-.005],[-.06,.175*wide,.19,-.008],[.018,.155*wide,.175],[.065,.10*wide,.13]],cloth,2.1,24);
  loft(torso,'Tracking instrument',[[.23,.065,.025,.134,-.075],[.30,.065,.025,.13,-.075]],equipment,3,20);
  loft(torso,'Instrument strap',[[.18,.02,.014,.12,-.08],[.39,.02,.014,.07,-.10],[.46,.02,.014,.025,-.07]],equipment,2,12);
  const casing=mat('Guided launcher casing','#555e59',.86),bore=mat('Guided launcher bore','#252a28',.98),red=mat('Tracking sensor red','#bd4b46',.73);
  // A forward-facing shoulder tube stays on the torso as the arms and head move.
  loft(torso,'Seeker launcher saddle',[[.31,.12,.19,-.035,.22],[.40,.15,.22,-.035,.22],[.45,.13,.20,-.035,.22]],equipment,3,20);
  const launcher=joint(torso,'Seeker guided launcher',.24,.46,-.05);launcher.rotation.x=Math.PI/2;
  coatShell(launcher,'Guided launcher tube',[[-.26,.14,.14],[-.22,.18,.18],[.27,.18,.18],[.34,.16,.16]],0,casing);
  coatShell(launcher,'Guided launcher muzzle',[ [.30,.19,.19],[.35,.19,.19] ],0,equipment);
  loft(launcher,'Guided launcher rear breech',[[-.25,.13,.13],[-.23,.13,.13]],bore,2,20);
  loft(launcher,'Guidance sensor housing',[[.19,.07,.075,0,-.12],[.32,.07,.075,0,-.12]],equipment,2.8,16);
  loft(launcher,'Red tracking lens',[[.322,.048,.05,0,-.12],[.327,.048,.05,0,-.12]],red,2,20);
  for(const y of [-.17,.13])coatShell(launcher,'Launcher retention band_'+y,[[y,.19,.19],[y+.025,.19,.19]],0,equipment);
  loft(torso,'Seeker ammunition case',[[.025,.25,.14,-.20],[.065,.29,.16,-.20],[.30,.29,.16,-.20],[.34,.25,.14,-.20]],casing,3,20);
  for(const x of [-.075,.075]){
   loft(torso,'Guided reload pod_'+x,[[.08,.085,.09,-.30,x],[.12,.10,.11,-.30,x],[.33,.10,.11,-.30,x],[.38,.06,.07,-.30,x]],equipment,2,20);
   loft(torso,'Reload identification band_'+x,[[.27,.103,.113,-.30,x],[.29,.103,.113,-.30,x]],red,2,16);
  }
  loft(torso,'Launcher shoulder harness',[[.02,.04,.025,.12,.11],[.29,.04,.025,.13,.13],[.43,.05,.03,.06,.18],[.46,.05,.035,-.04,.18]],equipment,2.5,16);
 }
 if(id==='lab-blackout'){
  const equipment=mat('Electrical insulation','#333e37',.97),caseMat=mat('Power case','#6c7662',.9),ceramic=mat('Breaker ceramic','#aaad96',.94);
  loft(torso,'Dorsal power case',[[-.04,.25,.16,-.20],[.01,.32,.20,-.20],[.42,.32,.20,-.20],[.47,.25,.16,-.20]],caseMat,3.5,28);
  for(const side of [-1,1]){
   loft(torso,'Electrical shoulder strap_'+side,[[.01,.04,.024,.103,side*.12],[.27,.04,.024,.116,side*.13],[.43,.04,.024,.07,side*.14],[.47,.04,.025,-.04,side*.13]],equipment,2.5,16);
   loft(torso,'Ceramic breaker_'+side,[[.16,.035,.03,.13,side*.037],[.24,.035,.03,.13,side*.037]],ceramic,3,16);
  }
  const path=new T.CatmullRomCurve3([new T.Vector3(.12,.38,-.29),new T.Vector3(.25,.25,-.30),new T.Vector3(.29,-.06,-.27),new T.Vector3(.12,-.15,-.24),new T.Vector3(.05,.01,-.29)]);
  const g=new T.TubeGeometry(path,24,.012,8,false);g.setAttribute('color',new T.Float32BufferAttribute(Array(g.attributes.position.count*3).fill(.96),3));owned.add(g);
  const cable=new T.Mesh(g,equipment);cable.name='Looped power cable';cable.castShadow=cable.receiveShadow=true;torso.add(cable);
  for(const arm of arms){
   const old=arm.children.find(o=>o.name.startsWith('Short sleeve_'));arm.remove(old);owned.delete(old.geometry);old.geometry.dispose();
   loft(arm,'Electrical jacket sleeve_'+arm.name,[[-.305,.11*wide,.13,.008],[-.24,.12*wide,.15,.01],[-.15,.15*wide,.175,-.005],[-.06,.175*wide,.19,-.008],[.018,.155*wide,.175],[.065,.10*wide,.13]],cloth,2.1,24);
  }
  for(const elbow of elbows){const hand=elbow.children.find(o=>o.name.startsWith('Hand_'));hand.traverse(o=>{if(o.isMesh)o.material=equipment;});}
 }
 if(id==='lab-siege'){
  const ram=mat('Worn crushing gauntlet','#63695a',.89),webbing=mat('Heavy work harness','#4b4d3f',.98);
  loft(elbows[1],'Crushing gauntlet',[[-.47,.17,.18,.02],[-.43,.23,.23,.02],[-.12,.23,.22,.02],[-.045,.17,.16,.01]],ram,2.8,28);
  loft(elbows[1],'Crushing face',[[-.49,.20,.20,.02],[-.455,.23,.23,.02]],ram,3,24);
  for(const side of [-1,1])loft(elbows[1],'Ram guide_'+side,[[-.41,.027,.035,.02,side*.13],[-.10,.027,.035,.02,side*.13]],webbing,2.2,16);
  loft(torso,'Diagonal work harness',[[.03,.06,.025,.103,-.18],[.20,.06,.025,.123,0],[.41,.06,.025,.08,.20]],webbing,2.3,16);
  loft(torso,'Reinforced waist',[[.015,.49,.25],[.075,.52,.26]],webbing,2.6,24);
 }
 if(id==='lab-champion'){
  const trim=mat('Supervisor coat trim','#4b424e',.99);
  coatShell(torso,'Supervisor coat',[[.005,.345,.24],[.19,.37,.25],[.34,.45,.27,-.03],[.43,.345,.22,-.025],[.47,.15,.13]], [.24,.27,.40,.67,.8],cloth);
  coatShell(root,'Supervisor coat tails',[[.34,.45,.30],[.47,.46,.31],[.77,.38,.27],[.94,.345,.24]], [.36,.33,.26,.24],cloth,.012);
  lapel(-1);lapel(1);
  for(const arm of arms){
   const old=arm.children.find(o=>o.name.startsWith('Short sleeve_'));arm.remove(old);owned.delete(old.geometry);old.geometry.dispose();
   loft(arm,'Supervisor sleeve_'+arm.name,[[-.305,.11*wide,.13,.008],[-.24,.12*wide,.15,.01],[-.15,.15*wide,.175,-.005],[-.06,.175*wide,.19,-.008],[.018,.155*wide,.175],[.065,.10*wide,.13]],cloth,2.1,24);
  }
  loft(torso,'Supervisor collar',[[.43,.17,.145],[.48,.14,.125],[.51,.115,.115]],trim,2.4,24);
  loft(arms[0],'Supervisor cuff',[[-.30,.12*wide,.135,.008],[-.27,.125*wide,.14,.008]],trim,2.3,20);
 }

 // Boss-only industrial details share the same ownership and pose hierarchy as anatomy.
 function bossMesh(parent,name,geometry,material){geometry.setAttribute('color',new T.Float32BufferAttribute(Array(geometry.attributes.position.count*3).fill(.96),3));owned.add(geometry);const m=new T.Mesh(geometry,material);m.name=name;m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
 function hose(parent,name,points,radius,material){return bossMesh(parent,name,new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),20,radius,7,false),material);}
 function dial(parent,name,x,y,z,radius,material){const m=bossMesh(parent,name,new T.CylinderGeometry(radius,radius,.018,24),material);m.rotation.x=Math.PI/2;m.position.set(x,y,z);return m;}
 function bore(parent,name,radius,length,material){
  const ring=new T.Shape(),hole=new T.Path();ring.absarc(0,0,radius,0,Math.PI*2,false);hole.absarc(0,0,radius*.68,0,Math.PI*2,true);ring.holes.push(hole);
  const g=new T.ExtrudeGeometry(ring,{depth:length,bevelEnabled:false,steps:1,curveSegments:12});g.rotateX(Math.PI/2);bossMesh(parent,name,g,material);
 }
 if(id==='lab-explosionboss'){
  const frame=mat('Blast carrier steel','#353d36',.87),charge=mat('Scorched explosive casing','#8b6039',.91),warning=mat('Blast hazard ochre','#cea04f',.93),rubber=mat('Heavy fuel hoses','#242b27',.95),gauge=mat('Aged pressure dial','#c4b695',.87);
  head.scale.set(.92,.86,.98);torso.scale.set(1.05,1,1.35);
  root.getObjectByName('Chest').material=skin;
  // Heavy abdomen and sunken head break the ordinary upright human silhouette.
  loft(torso,'Distended abdomen',[[-.22,.42,.35,.05],[-.13,.59,.46,.08],[.02,.69,.49,.07],[.18,.64,.41,.04],[.32,.45,.26]],skin,2.1,32);
  loft(torso,'Abdominal blast cage',[[-.14,.53,.07,.27],[-.04,.64,.075,.31],[.13,.59,.07,.29],[.22,.40,.05,.22]],frame,3.4,24);
  for(const x of [-.22,-.11,0,.11,.22])loft(torso,'Blast cage rib_'+x,[[-.12,.035,.035,.32,x],[.12,.035,.035,.33,x],[.20,.03,.03,.25,x*.8]],warning,3,12);
  loft(torso,'Blast carrier frame',[[-.13,.58,.15,-.23],[.49,.58,.15,-.23]],frame,3,20);
  for(const side of [-1,1]){
   const tall=side<0?.68:.54;
   loft(torso,'Large explosive drum_'+side,[[-.12,.24,.26,-.36,side*.24],[-.07,.31,.34,-.36,side*.24],[tall-.05,.31,.34,-.36,side*.24],[tall,.24,.26,-.36,side*.24]],charge,2,24);
   for(const y of [.00,.36])loft(torso,'Drum retaining band_'+side+'_'+y,[[y,.322,.352,-.36,side*.24],[y+.035,.322,.352,-.36,side*.24]],frame,2,20);
   loft(torso,'Tank neck_'+side,[[tall,.10,.11,-.36,side*.24],[tall+.06,.10,.11,-.36,side*.24]],frame,3,16);
   const wheel=bossMesh(torso,'Tank shutoff wheel_'+side,new T.TorusGeometry(.065,.012,6,20),warning);wheel.rotation.x=Math.PI/2;wheel.position.set(side*.24,tall+.065,-.36);
   loft(torso,'Blast harness_'+side,[[.00,.07,.04,.24,side*.22],[.30,.07,.04,.16,side*.28],[.47,.07,.04,-.03,side*.21]],frame,3,12);
   hose(torso,'Tank feed hose_'+side,[[side*.24,tall+.02,-.36],[side*.43,.46,-.27],[side*.40,.18,.10],[side*.18,.09,.36]],.021,rubber);
  }
  // One armored dragging arm, one bare arm; no matching shoulder pads.
  elbows[0].scale.set(1.35,1.18,1.3);arms[0].scale.y=1.12;
  loft(arms[0],'Riveted blast shoulder',[[-.18,.29,.29],[.01,.36,.32],[.10,.20,.20]],charge,3,20);
  loft(elbows[0],'Scorched forearm shield',[[-.28,.26,.08,.13],[-.12,.31,.09,.14],[.04,.23,.07,.12]],frame,3,20);
  for(const x of [-.07,.07])dial(elbows[0],'Shield rivet_'+x,x,-.09,.19,.013,warning);
  loft(elbows[1],'Blast wrist cuff_1',[[-.25,.15,.17,.01],[-.17,.16,.18,.01]],frame,3,16);
  loft(torso,'Exposed fuse controller',[[.22,.17,.08,.23],[.36,.17,.08,.18]],frame,3,20);
  dial(torso,'Pressure gauge',-.045,.29,.267,.047,gauge);
  loft(torso,'Pressure needle',[[.282,.006,.008,.279,-.045],[.318,.006,.008,.279,-.032]],shadow,2,8);
  loft(torso,'Fuse warning lens',[[.27,.035,.012,.276,.057],[.32,.035,.012,.253,.057]],warning,3,12);
  // Respirator and corrugated feed replace the ordinary exposed jaw.
  loft(head,'Blast respirator',[[.07,.15,.09,.12],[.14,.18,.11,.12],[.19,.13,.07,.10]],rubber,3,20);
  dial(head,'Respirator intake',0,.12,.19,.044,frame);
  hose(torso,'Respirator supply',[[.08,.58,.19],[.22,.48,.25],[.31,.31,.20],[.22,.13,.35]],.017,rubber);
  loft(head,'Blast brow hood',[[.19,.19,.19,-.01],[.28,.18,.18,-.02],[.32,.11,.12,-.02]],frame,3,20);
  for(const side of [-1,1])loft(shins[side<0?0:1],'Blast shin brace_'+side,[[-.31,.15,.04,.08],[-.03,.18,.05,.08]],frame,3,16);
 }
 if(id==='lab-finalboss'){
  const shell=mat('Final containment armor','#b7bab0',.73),frame=mat('Final restraint graphite','#29353d',.82),signal=mat('Pulse ceramic inserts','#62afa6',.65),dark=mat('Core cavity','#172329',.94);
  signal.emissive.set('#245c55');if(T.ColorManagement?.legacyMode!==false)signal.emissive.convertSRGBToLinear();signal.emissiveIntensity=.38;
  head.scale.set(.90,1.12,.95);
  root.getObjectByName('Chest').material=frame;
  // A narrow waist and splayed segmented rib cage leave an actual recessed core.
  loft(torso,'Final waist corset',[[-.12,.27,.22],[.02,.29,.24],[.16,.34,.25]],frame,3.6,20);
  loft(torso,'Pulse sternum housing',[[.07,.27,.045,.13],[.23,.35,.05,.14],[.40,.24,.05,.11]],dark,3,24);
  const core=joint(torso,'Recessed pulse core',0,.245,.183);
  const coreRing=bossMesh(core,'Core aperture rim',new T.TorusGeometry(.092,.019,8,32),frame);coreRing.scale.y=1.23;
  dial(core,'Pulse core lens',0,0,-.012,.073,signal);
  loft(core,'Core split seam',[[-.085,.012,.01,.008],[.085,.012,.01,.008]],frame,3,12);
  for(const side of [-1,1]){
   for(let i=0;i<3;i++){
    const y=.11+i*.10;
    loft(torso,'Floating rib armor_'+side+'_'+i,[[y,.13,.08,.19,side*.22],[y+.06,.21,.08,.17,side*.23],[y+.085,.16,.06,.14,side*.21]],shell,3.7,16);
   }
   loft(torso,'Final collar blade_'+side,[[.35,.14,.15,-.02,side*.23],[.51,.16,.17,-.05,side*.27],[.63,.07,.09,-.08,side*.29]],shell,3.4,20);
   loft(arms[side<0?0:1],'Final shoulder armor_'+side,[[-.10,.22,.24],[.015,.31,.29],[.16,.23,.20],[.24,.055,.065]],shell,3.8,20);
   loft(shins[side<0?0:1],'Segmented final greave_'+side,[[-.34,.10,.13,.025],[-.21,.13,.17,.035],[.015,.17,.18,.02]],shell,3.4,20);
   loft(legs[side<0?0:1],'Final knee plate_'+side,[[-.40,.14,.05,.13],[-.29,.18,.06,.14],[-.23,.13,.04,.12]],frame,3,16);
  }
  // Broken containment halo, anchored by a spine and three braces, rather than a backpack.
  const halo=joint(torso,'Segmented containment halo',0,.36,-.30);
  for(let i=0;i<6;i++){
   const segment=bossMesh(halo,'Halo segment_'+i,new T.TorusGeometry(.43,.035,6,24,Math.PI*.255),shell);segment.rotation.z=i*Math.PI/3+.12;
   const inset=bossMesh(halo,'Halo pulse track_'+i,new T.TorusGeometry(.405,.012,5,20,Math.PI*.23),signal);inset.rotation.z=i*Math.PI/3+.15;inset.position.z=.022;
  }
  loft(torso,'Dorsal pulse chamber',[[-.10,.16,.14,-.24],[.50,.18,.15,-.25],[.62,.12,.12,-.25]],frame,3.4,20);
  for(const side of [-1,1])hose(torso,'Halo support spar_'+side,[[0,.05,-.25],[side*.18,.13,-.30],[side*.34,.25,-.30]],.025,frame);
  // Small radial launch cells keep the halo's shape, with real recessed muzzles.
  for(const side of [-1,1]){
   const launcher=joint(halo,'Final salvo pod_'+side,side*.36,.14,0);launcher.rotation.z=-side*.65;launcher.rotation.x=.45;
   bore(launcher,'Final salvo barrel_'+side,.063,.21,frame);
   loft(launcher,'Final bore floor_'+side,[[-.20,.085,.085],[-.18,.085,.085]],dark,2,24);
  }
  // Right forearm is a cannon; left carries three elongated articulated-looking talons.
  const cannon=joint(elbows[1],'Integrated pulse cannon',0,-.40,.035);cannon.rotation.z=Math.PI;
  const replacedHand=root.getObjectByName('Hand_R');replacedHand.traverse(o=>{if(o.isMesh){owned.delete(o.geometry);o.geometry.dispose();}});replacedHand.parent.remove(replacedHand);
  bore(cannon,'Pulse cannon bore',.107,.29,frame);
  loft(cannon,'Pulse cannon floor',[[-.28,.14,.14],[-.26,.14,.14]],dark,2,24);
  for(const side of [-1,1])loft(elbows[1],'Cannon cheek plate_'+side,[[-.28,.06,.20,.02,side*.11],[-.03,.06,.21,.02,side*.11]],shell,3.5,16);
  loft(elbows[0],'Final talon bracer',[[-.25,.15,.15],[.02,.18,.18]],frame,3.4,20);
  const hand=root.getObjectByName('Hand_L');
  for(const x of [-.052,0,.052])loft(hand,'Containment talon_'+x,[[-.25,.010,.018,-.055,x],[-.20,.023,.026,-.045,x],[-.11,.025,.035,-.015,x],[-.02,.025,.033,0,x]],shell,3,12);
  // A faceless split mask replaces the common jaw guard and facial details.
  for(const part of [...head.children])if(/^(Eye|Pupil|Brow|Nose|Mouth|Lower lip)/.test(part.name)){head.remove(part);owned.delete(part.geometry);part.geometry.dispose();}
  loft(head,'Final faceless mask',[[.04,.055,.045,.11],[.09,.115,.065,.105],[.24,.14,.055,.095],[.30,.095,.035,.055]],shell,3.7,24);
  loft(head,'Mask vertical split',[[.055,.008,.009,.145],[.245,.008,.009,.128]],dark,3,12);
  loft(head,'Mask pulse slit',[[.17,.007,.009,.140],[.215,.007,.009,.137]],signal,3,12);
 }
 if(id==='lab-warlord'){
  const armor=mat('Command armor','#30343f',.79),trim=mat('Command insignia','#c8c9c2',.85),red=mat('Command crimson edges','#9e2944',.91);
  loft(torso,'Command cuirass',[[.015,.43,.28],[.16,.50,.31],[.32,.62,.32,-.025],[.41,.48,.25,-.03]],armor,3,24);
  loft(torso,'Command gorget',[[.40,.29,.22,-.02],[.48,.24,.19],[.51,.18,.16]],armor,2.7,24);
  loft(head,'Command officer helmet',[[.20,.192,.22,-.01],[.26,.19,.215,-.012],[.31,.13,.15,-.017],[.33,.055,.075,-.017]],armor,3,24);
  loft(head,'Command helmet brow',[[.18,.21,.09,.09],[.205,.21,.09,.09]],red,3.8,20);
  loft(head,'Command jaw guard',[[.055,.10,.06,.10],[.09,.155,.06,.105],[.135,.16,.045,.105]],armor,3.2,20);
  loft(head,'Command helmet crest',[[.215,.026,.012,.106],[.265,.030,.012,.098],[.31,.025,.012,.065],[.335,.018,.012,.025]],trim,3,12);
  coatShell(root,'Command coat tails',[[.36,.57,.34],[.49,.58,.35],[.77,.48,.30],[.94,.43,.27]],[.42,.38,.30,.28],cloth,.018);
  const standard=joint(torso,'Command dorsal standard',0,.05,-.29);
  loft(standard,'Standard mast',[[.05,.022,.025],[.80,.022,.025]],trim,3,12);
  loft(standard,'Crimson command banner',[[.40,.21,.018],[.49,.28,.018],[.76,.28,.018]],red,4,16);
  for(const x of [-.055,.055])loft(standard,'Banner insignia_'+x,[[.54,.018,.024,0,x],[.69,.018,.024,0,x]],trim,3,12);
  for(const side of [-1,1]){
   const arm=arms[side<0?0:1];
   loft(arm,'Command pauldron_'+side,[[-.14,.26,.28],[-.05,.35,.33],[.08,.31,.29],[.13,.17,.19]],armor,3.5,24);
   loft(arm,'Crimson shoulder rim_'+side,[[-.14,.275,.295],[-.11,.30,.31]],red,3.5,20);
   loft(arm,'Command shoulder rank_'+side,[[.05,.32,.30],[.075,.32,.30]],trim,3.5,20);
   loft(elbows[side<0?0:1],'Command bracer_'+side,[[-.25,.15,.16,.01],[-.12,.18,.19,.01],[-.06,.14,.15]],armor,2.7,20);
   loft(shins[side<0?0:1],'Command greave_'+side,[[-.31,.13,.05,.065],[-.12,.16,.055,.075],[-.02,.16,.05,.07]],armor,3.2,20);
  }
  for(const y of [.22,.27,.32])loft(torso,'Command rank bar_'+y,[[y,.105,.014,.151],[y+.016,.105,.014,.151]],trim,3,12);
 }
 if(id==='lab-titan'){
  const iron=mat('Titan restraint frame','#554e5b',.88),padding=mat('Restraint padding','#948590',.97);
  head.scale.setScalar(1.13);
  loft(torso,'Titan restraint yoke',[[.36,.70,.32,-.03],[.43,.72,.34,-.03],[.49,.42,.26],[.53,.28,.22]],iron,2.8,24);
  for(const side of [-1,1]){
   loft(torso,'Titan back rail_'+side,[[.01,.075,.10,-.20,side*.23],[.42,.085,.11,-.22,side*.26]],iron,3,16);
   loft(elbows[side<0?0:1],'Titan forearm restraint_'+side,[[-.29,.24,.25,.01],[-.18,.26,.27,.01],[-.10,.22,.23]],iron,2.8,24);
   loft(legs[side<0?0:1],'Titan knee brace_'+side,[[-.40,.25,.06,.14],[-.29,.28,.07,.15],[-.24,.22,.05,.13]],iron,3,20);
  }
  for(const y of [.06,.19])loft(torso,'Titan torso band_'+y,[[y,.57,.32],[y+.055,.62,.34]],padding,2.5,24);
  loft(torso,'Titan chest lock',[[.16,.13,.055,.18],[.28,.15,.06,.18]],iron,3,16);
 }
 if(id==='lab-artilleryelite'){
  const device=mat('Elite launcher casing','#647c4f',.86),interior=mat('Elite launcher interior','#222c21',.98),webbing=mat('Elite launcher webbing','#34432f',.97);
  loft(torso,'Elite launcher rack',[[.01,.40,.15,-.20],[.08,.43,.16,-.20],[.40,.43,.16,-.20],[.45,.35,.13,-.18]],device,3,24);
  for(const side of [-1,1]){
   const tube=joint(torso,'Elite shoulder launcher_'+side,side*.17,.04,-.28);tube.rotation.x=.18;
   coatShell(tube,'Elite open tube_'+side,[[0,.16,.16],[.05,.17,.17],[.61,.17,.17],[.70,.17,.17]],0,device);
   coatShell(tube,'Elite muzzle rim_'+side,[[.67,.18,.18],[.705,.18,.18]],0,device);
   loft(tube,'Elite bore floor_'+side,[[.01,.15,.15],[.015,.15,.15]],interior,2,24);
   loft(torso,'Elite harness_'+side,[[.02,.045,.03,.13,side*.15],[.29,.045,.03,.14,side*.17],[.45,.045,.03,.06,side*.17]],webbing,2.5,16);
  }
  loft(torso,'Elite reagent reservoir',[[.03,.15,.14,-.31],[.07,.18,.17,-.31],[.37,.18,.17,-.31],[.41,.14,.13,-.31]],device,2,24);
 }
 if(id==='lab-boss'){
  const ceramic=mat('Broken containment ceramic','#a7a69a',.88),iron=mat('Breach restraint iron','#414d4b',.83),warning=mat('Faded hazard paint','#ae6946',.94);
  head.scale.setScalar(1.12);
  loft(torso,'Breach collar',[[.40,.34,.25,-.025],[.46,.32,.24,-.015],[.50,.25,.21],[.52,.23,.20]],iron,2.7,24);
  loft(torso,'Broken chest plate',[[.04,.43,.055,.175],[.11,.55,.065,.185],[.29,.61,.06,.19],[.37,.49,.05,.15]],ceramic,3.2,24,.018);
  for(const side of [-1,1]){
   loft(torso,'Breach harness_'+side,[[.01,.05,.035,.15,side*.22],[.28,.05,.035,.20,side*.26],[.43,.05,.035,-.02,side*.22]],iron,2.4,12);
   loft(torso,'Back restraint rail_'+side,[[.02,.055,.075,-.18,side*.20],[.39,.065,.075,-.20,side*.22],[.48,.05,.07,-.13,side*.18]],iron,3,12);
   const arm=arms[side<0?0:1],elbow=elbows[side<0?0:1];elbow.scale.set(1.25,1.04,1.25);
   loft(arm,'Broken shoulder shell_'+side,[[-.14,.27,.29,-.005],[-.06,.36,.34],[.04,.31,.29],[.10,.18,.19]],ceramic,2.8,24,.012);
   loft(elbow,'Heavy wrist shackle_'+side,[[-.245,.21,.23,.015],[-.16,.23,.24,.015],[-.12,.21,.23,.015]],iron,2.7,24);
   loft(elbow,'Shackle hazard stripe_'+side,[[-.22,.215,.235,.015],[-.195,.225,.245,.015]],warning,2.7,24);
   loft(legs[side<0?0:1],'Breach kneepad_'+side,[[-.40,.18,.04,.13],[-.31,.22,.05,.14],[-.25,.17,.04,.12]],iron,3,16);
  }
  loft(head,'Broken jaw restraint',[[.07,.19,.045,.105],[.105,.20,.045,.11],[.13,.19,.035,.095]],iron,2.8,20);
  for(const x of [-.12,0,.12])loft(torso,'Chest hazard bar_'+x,[[.17,.025,.01,.224,x],[.25,.025,.01,.224,x+.025]],warning,3,12);
  for(const side of [-1,1])loft(torso,'Broken collar lug_'+side,[[.46,.06,.08,-.01,side*.19],[.57,.06,.08,-.01,side*.19]],iron,3,12);
 }
 if(id==='lab-warden'){
  const restraint=mat('Worn restraint webbing','#414f50',.97),iron=mat('Dark shackle','#545e5b',.88);
  const jacketSection=y=>{
   const index=bodyRings.findIndex(r=>r[0]>=y),a=bodyRings[index-1],b=bodyRings[index],t=(y-a[0])/(b[0]-a[0]);
   return [y,T.MathUtils.lerp(a[1],b[1],t)+.012,T.MathUtils.lerp(a[2],b[2],t)+.010,T.MathUtils.lerp(a[3]||0,b[3]||0,t)];
  };
  for(const y of [.06,.19,.32])loft(torso,'Restraint strap_'+y,[jacketSection(y),jacketSection(y+.03)],restraint,2.15,32);
  loft(elbows[0],'Wrist restraint',[[-.26,.12,.12,.01],[-.205,.12,.12,.01]],iron,2.6,24);
  const chain=joint(elbows[0],'Hanging restraint chain',.075,-.24,.015);
  for(let i=0;i<6;i++){
   const g=new T.TorusGeometry(.026,.006,8,20);g.setAttribute('color',new T.Float32BufferAttribute(Array(g.attributes.position.count*3).fill(.96),3));owned.add(g);
   const link=new T.Mesh(g,iron);link.name='Chain link_'+i;link.position.y=-i*.070;link.scale.y=1.35;link.rotation.y=i%2?Math.PI/2:0;link.castShadow=link.receiveShadow=true;chain.add(link);
  }
  loft(torso,'Restraint jacket collar',[[.40,.27,.19,-.02],[.46,.18,.14],[.49,.13,.12]],cloth,2.4,24);
 }
 const mouth=root.getObjectByName('Mouth crease');if(mouth){mouth.scale.y=2.6;mouth.position.y=-.162;root.getObjectByName('Lower lip').position.y=-.008;mouth.rotation.z=.09;}
 head.position.set(0,.475,.006);
 // Cervical base stays in the shoulder girdle; only the skull pivots with the head.
 const oldNeck=root.getObjectByName('Neck');head.remove(oldNeck);owned.delete(oldNeck.geometry);oldNeck.geometry.dispose();
 loft(torso,'Neck',[[.355,.25*wide,.17,-.035],[.405,.18*wide,.145,-.025],[.45,.125,.125,-.008],[.495,.103,.105,-.005],[.53,.092,.095,-.012],[.55,.085,.085,-.015]],skin);
 if(id==='lab-pathologist')elbows.forEach(elbow=>elbow.scale.y=1.1);
 root.getObjectByName('Anatomical head').scale.set(1.025,.97,1);
 if(!specialist&&id!=='lab-assistant')coatShell(head,'Receding hair',[[.205,.159,.181,-.006],[.239,.153,.176,-.011],[.267,.126,.147,-.014],[.287,.060,.076,-.016]],[1.18,1.28,1.65,2.1],hair);
 for(const arm of arms)arm.position.z=-.015;
 // Only the loose lower panels sway; the shoulders stay bound to the hunched torso.
 const tails=root.getObjectByName('Split coat tails');if(tails)tails.userData.coatTails=true;
}

 const restLeg=lab?[-.14,.19]:[-.12,.13],restShin=lab?[.22,.31]:[.18,.20];
 // Ground the two shoe soles after posing without traversing all mesh vertices.
 const point=new T.Vector3(),inverse=new T.Matrix4();
 function ground(){root.position.y=0;root.updateMatrixWorld(true);inverse.copy(root.matrixWorld).invert();let min=Infinity;for(const foot of feet)for(const x of [-.0615*wide,.0615*wide])for(const z of [-.0675,.1775]){point.set(x,-.43,z).applyMatrix4(foot.matrixWorld).applyMatrix4(inverse);min=Math.min(min,point.y);}root.position.y=-min*root.scale.y;}
 function stance(){torso.position.y=lab?.925:.88;torso.rotation.set(settings.lean,0,id==='hollow'?.045:lab?.055:-.025);head.rotation.set(...settings.head);legs.forEach((l,i)=>{l.rotation.set(restLeg[i],0,i===0?-.10:.10);shins[i].rotation.x=restShin[i];arms[i].rotation.set(settings.arm[i],i===0?-.08:.10,i===0?-.10:.12);elbows[i].rotation.x=settings.elbow[i];});ground();}
 let previous=null,phase=0,blend=0;
 function reset(){previous=null;phase=blend=0;stance();const tails=root.getObjectByName('Split coat tails');if(tails)tails.rotation.z=0;for(const name of ['Seeker coat tails','Supervisor coat tails','Command coat tails','Hanging restraint chain']){const part=root.getObjectByName(name);if(part)part.rotation.z=0;}}
 const gait={
  'lab-ghost':[5.4,.36,.36,.48,.48],
  'lab-warlord':[4.1,.37,.37,.50,.50],'lab-titan':[2.8,.30,.30,.42,.42],'lab-artilleryelite':[3.3,.32,.32,.44,.44],
  researcher:[3.4,.30,.12,.42,.16],'lab-assistant':[3.4,.30,.12,.42,.16],'lab-pathologist':[3.4,.30,.12,.42,.16],
  'lab-runner':[8.5,.55,.55,.75,.75],'lab-brute':[3.3,.32,.32,.42,.42],
  'lab-shield':[3.6,.32,.32,.44,.44],'lab-bomber':[5.8,.42,.42,.58,.58],
  'lab-carrier':[3.5,.30,.30,.42,.42],'lab-hunter':[6.5,.48,.48,.65,.65],
  'lab-armored':[3.4,.32,.32,.44,.44],'lab-artillery':[3.8,.34,.34,.46,.46],
  'lab-corehunter':[5.8,.44,.44,.56,.56],'lab-seeker':[3.8,.31,.31,.42,.42],
  'lab-blackout':[3.4,.30,.30,.40,.40],'lab-siege':[3.0,.30,.30,.40,.40],
  'lab-champion':[4.2,.36,.36,.48,.48],'lab-warden':[3.2,.31,.31,.42,.42],'lab-boss':[4.4,.40,.40,.55,.55],
  'lab-explosionboss':[3.2,.30,.38,.43,.54],'lab-finalboss':[4.0,.36,.36,.49,.49],
  'lab-tiny':[8.8,.48,.48,.65,.65],'lab-gilded':[4.8,.36,.36,.50,.50],'lab-blueace':[9.5,.57,.57,.80,.80]
 }[id]||[id==='rush'?7:4.5,.34,.34,.50,.50];
 function advance(seconds,walking=true,travel){
  const dt=previous===null?0:T.MathUtils.clamp(seconds-previous,0,.1);previous=seconds;
  blend+=((walking?1:0)-blend)*(1-Math.exp(-dt*9));
  // In game, cadence follows ground travel; limit catch-up on teleports or sparse frames.
  const cycleDistance=1.5*(gait[1]+gait[2]);
  phase+=(travel===undefined?dt*gait[0]:Math.min(Math.max(0,travel)/cycleDistance*Math.PI*2,dt*18))*blend;
 }
 function applyPose(){
  stance();
  legs.forEach((leg,i)=>{
   const s=Math.sin(phase+i*Math.PI);
   leg.rotation.x=restLeg[i]+s*gait[1+i]*blend;
   shins[i].rotation.x=restShin[i]+Math.max(0,-s)*gait[3+i]*blend;
   arms[i].rotation.x=settings.arm[i]-s*(id==='lab-shield'&&i===0?.025:id==='lab-carrier'?.06:id==='lab-finalboss'?.035:.12)*blend;
  });
  torso.rotation.z+=Math.sin(phase)*(id==='lab-finalboss'?.008:id==='lab-explosionboss'?.04:.025)*blend;head.rotation.z+=Math.sin(phase*.5)*(id==='lab-finalboss'?.004:.018)*blend;
  if(id==='lab-warlord')root.getObjectByName('Command coat tails').rotation.z=Math.sin(phase)*.012*blend;
  if(id==='lab-champion')root.getObjectByName('Supervisor coat tails').rotation.z=Math.sin(phase)*.012*blend;
  if(id==='lab-warden')root.getObjectByName('Hanging restraint chain').rotation.z=Math.sin(phase)*.06*blend;
  if(id==='lab-seeker'){
   head.rotation.y+=Math.sin(phase*.55)*.18*blend;
   root.getObjectByName('Seeker coat tails').rotation.z=Math.sin(phase)*.025*blend;
  }
  if(lab){torso.rotation.x+=Math.cos(phase)*.025*blend;const tails=root.getObjectByName('Split coat tails');if(tails)tails.rotation.z=Math.sin(phase)*.015*blend;}
  ground();
 }
 function pose(seconds,walking=true,travel){advance(seconds,walking,travel);applyPose();}
 function dispose(){owned.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
 // Apply after shared anatomy corrections so neck, flesh, cloth, boots and gear are all gold.
 if(id==='lab-gilded'){const gold=root.getObjectByName('Gold specimen vest').material;root.traverse(o=>{if(o.isMesh)o.material=gold;});}
 if(id==='hollow')root.scale.y=1.055;if(id==='lab-ghost'){root.scale.y=1.07;root.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=false;});}if(id==='lab-seeker')root.scale.y=1.065;if(id==='lab-champion')root.scale.y=1.045;if(id==='lab-assistant')root.scale.y=.95;if(id==='lab-pathologist')root.scale.y=1.065;reset();return {root,head,torso,arms,legs,pose,advance,applyPose,reset,dispose,id,getMotion:()=>[previous,phase,blend],setMotion:state=>{[previous,phase,blend]=state;}};
};
