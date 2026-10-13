'use strict';
// Unarmored candidates: visible flesh, fabric, anatomy and hostile asymmetrical poses.
window.buildOrganicEnemy = (T,id) => {
 const specialist=['lab-runner','lab-brute','lab-poisoner','lab-shield','lab-bomber','lab-carrier','lab-hunter','lab-armored','lab-artillery','lab-corehunter','lab-seeker','lab-blackout'].includes(id);
 const lab=['researcher','lab-assistant','lab-pathologist'].includes(id)||specialist;
 let settings={'lab-assistant':{skin:'#969b85',cloth:'#a4ada4',pants:'#304342',width:1.15,lean:.32,arm:[-.50,-.68],elbow:[-.38,-.26],head:[.15,.06,-.10]},'lab-pathologist':{skin:'#99a08c',cloth:'#b0ab98',pants:'#3a3b35',width:.82,lean:.49,arm:[-.38,-.54],elbow:[-.14,-.31],head:[.26,-.09,-.18]},researcher:{skin:'#8f9a87',cloth:'#a5a79a',pants:'#353e3c',width:.96,lean:.43,arm:[-.38,-.95],elbow:[-.16,-.55],head:[.21,-.06,.16]},rasp:{skin:'#978f7d',cloth:'#444a45',pants:'#2e3432',width:1,lean:.20,arm:[-.30,-1.05],elbow:[-.22,-.40],head:[.18,0,-.10]},rush:{skin:'#a18a77',cloth:'#69473b',pants:'#333635',width:1.19,lean:.30,arm:[-1.15,-1.40],elbow:[-.45,-.35],head:[.15,.08,.04]},hollow:{skin:'#b1aa99',cloth:'#575954',pants:'#383b3a',width:.83,lean:.23,arm:[-.20,-1.10],elbow:[-.18,-.34],head:[.22,-.12,.16]}}[id];

 const extra={
  'lab-runner':{skin:'#9b9f8d',cloth:'#6b8781',pants:'#344945',width:.85,lean:.53,arm:[-.55,-1.20],elbow:[-.95,-.68],head:[.12,-.12,.08]},
  'lab-brute':{skin:'#a39e8c',cloth:'#686d65',pants:'#3d403a',width:1.65,lean:.22,arm:[-.38,-.47],elbow:[-.24,-.32],head:[.21,.06,-.06]},
  'lab-poisoner':{skin:'#9a9b80',cloth:'#928b63',pants:'#4d5145',width:1.02,lean:.38,arm:[-.66,-.43],elbow:[-.46,-.22],head:[.22,.09,-.10]},
  'lab-shield':{skin:'#9c9f8f',cloth:'#526469',pants:'#333f43',width:1.12,lean:.28,arm:[-.72,-.40],elbow:[-.95,-.24],head:[.18,-.09,.09]},
  'lab-bomber':{skin:'#a19b87',cloth:'#8c604a',pants:'#44423c',width:.95,lean:.46,arm:[-.58,-.85],elbow:[-.43,-.62],head:[.25,.10,-.14]},
  'lab-carrier':{skin:'#9a9d8a',cloth:'#868876',pants:'#414a41',width:1.2,lean:.40,arm:[-.34,-.51],elbow:[-.20,-.33],head:[.19,-.07,.12]},
  'lab-hunter':{skin:'#a0a28f',cloth:'#8b9290',pants:'#424b48',width:.78,lean:.57,arm:[-.92,-1.12],elbow:[-.64,-.50],head:[.13,-.06,-.12]},
  'lab-armored':{skin:'#9c9e8b',cloth:'#4d5b5b',pants:'#363f3d',width:1.3,lean:.24,arm:[-.43,-.59],elbow:[-.29,-.35],head:[.20,.08,-.06]},
  'lab-artillery':{skin:'#9d9f8a',cloth:'#74735a',pants:'#41483d',width:1.06,lean:.29,arm:[-.36,-.70],elbow:[-.26,-.58],head:[.20,-.11,.10]},
  'lab-corehunter':{skin:'#9c9e85',cloth:'#97815a',pants:'#444639',width:1.43,lean:.40,arm:[-.96,-1.01],elbow:[-.50,-.55],head:[.15,.02,-.05]},
  'lab-seeker':{skin:'#a4a497',cloth:'#8b7777',pants:'#3e4043',width:.79,lean:.25,arm:[-.72,-.32],elbow:[-.43,-.16],head:[.17,-.20,.14]},
  'lab-blackout':{skin:'#a2ab97',cloth:'#425f59',pants:'#323e3b',width:1.10,lean:.56,arm:[-.43,-.65],elbow:[-.23,-.35],head:[.26,.06,-.10]}
 }[id];
 settings=settings||extra;
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
 if(!specialist){
 const coatWidth=wide/.96;
 coatShell(torso,'Open lab coat',[[0,.30*coatWidth,.23],[.15,.32*coatWidth,.245],[.28,.38*coatWidth,.265,-.025],[.38,.415*coatWidth,.28,-.05],[.44,.32*coatWidth,.24,-.04],[.47,.16,.14]], id==='lab-assistant'?[.13,.13,.20,.36,.60,.75]:[.28,.28,.32,.46,.65,.75],cloth);
 const hemY=id==='lab-assistant'?.55:id==='lab-pathologist'?.31:.43;
 const tails=coatShell(root,'Split coat tails',[[hemY,.425*coatWidth,.29,-.014],[hemY+.10,.43*coatWidth,.30,-.008],[.77,.37*coatWidth,.275],[.93,.305*coatWidth,.235]], id==='lab-assistant'?[.20,.16,.13,.13]:[.38,.32,.28,.28],cloth,id==='lab-pathologist'?.045:.023);
 lapel(-1);lapel(1);
 if(id==='lab-assistant')for(const y of [.10,.19,.28])loft(torso,'Coat button_'+y,[[y,.008,.005,.127],[y+.008,.008,.005,.127]],pants,2.2,12);
 const badge=loft(torso,'Research ID',[[.26,.033,.006,.117,-.115],[.31,.033,.006,.112,-.115]],mat('Faded ID card','#adb4aa',.94),3.5,12);badge.rotation.z=-.07;
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
  const equipment=mat('Contamination equipment','#444d43',.87),tank=mat('Worn reagent cylinders','#74795c',.89);
  for(const side of [-1,1]){
   loft(torso,'Reagent tank_'+side,[[.06,.095,.095,-.20,side*.067],[.09,.116,.116,-.20,side*.067],[.33,.116,.116,-.20,side*.067],[.36,.09,.09,-.20,side*.067]],tank,2,24);
   loft(torso,'Tank harness_'+side,[[.03,.025,.025,.105,side*.13],[.24,.025,.025,.13,side*.13],[.42,.025,.025,.10,side*.15],[.47,.025,.025,-.03,side*.13]],equipment,2,12);
   loft(head,'Respirator filter_'+side,[[.08,.035,.04,.101,side*.049],[.115,.035,.04,.101,side*.049]],equipment,2,16);
  }
  loft(head,'Respirator cup',[[.075,.055,.032,.100],[.10,.08,.05,.112],[.13,.055,.032,.103]],equipment,2.3,24);
  loft(torso,'Coverall zipper',[[.02,.008,.005,.108],[.33,.008,.005,.117],[.40,.008,.005,.09]],equipment,2,12);
  for(const arm of arms)loft(arm,'Coverall sleeve_'+arm.name,[[-.30,.10,.12],[-.15,.13,.15],[.02,.14,.15]],cloth,2.1,24);
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
  const pack=mat('Canvas specimen carrier','#77765e',.99),strap=mat('Carrier harness','#484f43',.97),lid=mat('Carrier lid','#969780',.96);
  loft(torso,'Specimen backpack',[[-.09,.31,.23,-.235],[-.04,.37,.26,-.235],[.43,.37,.26,-.235],[.48,.30,.23,-.235]],pack,4,32);
  loft(torso,'Backpack lid',[[.405,.38,.27,-.236],[.44,.38,.27,-.236],[.49,.30,.23,-.236]],lid,4,24);
  for(const side of [-1,1]){
   loft(torso,'Carrier strap_'+side,[[.01,.038,.022,.104,side*.12],[.26,.038,.022,.115,side*.13],[.43,.038,.022,.073,side*.15],[.47,.038,.025,-.06,side*.14]],strap,2.5,16);
   loft(torso,'Side specimen pouch_'+side,[[.025,.08,.13,-.245,side*.22],[.055,.105,.15,-.245,side*.22],[.25,.105,.15,-.245,side*.22],[.275,.08,.13,-.245,side*.22]],pack,3,20);
  }
  loft(torso,'Harness bridge',[[.18,.28,.018,.129],[.20,.28,.018,.129]],strap,3,16);
 }
 if(id==='lab-hunter'){
  const band=mat('Patient wrist band','#b5b6a3',.97);
  loft(root,'Torn patient gown',[[.51,.31,.235],[.62,.32,.25],[.80,.28,.23],[.94,.235,.20]],cloth,2.2,32,.025);
  loft(torso,'Patient gown neckline',[[.405,.23,.18,-.025],[.45,.16,.135,-.008],[.47,.12,.12]],cloth,2.15,24);
  loft(elbows[1],'Patient wrist band',[[-.25,.072*wide,.085,.011],[-.23,.078*wide,.092,.011]],band,2.2,20);
  const sleeve=root.getObjectByName('Short sleeve_R');sleeve.parent.remove(sleeve);owned.delete(sleeve.geometry);sleeve.geometry.dispose();
 }
 if(id==='lab-armored'){
  const protection=mat('Worn protective textile','#69746e',.95),webbing=mat('Protective vest webbing','#3c4742',.98);
  loft(torso,'Protective vest',[[.015,.365,.235],[.10,.40,.255],[.29,.51,.265,-.025],[.38,.54,.25,-.04],[.43,.39,.23,-.03]],protection,2.6,32);
  for(const side of [-1,1])loft(torso,'Vest shoulder strap_'+side,[[.35,.065,.023,.093,side*.16],[.44,.065,.028,.075,side*.16],[.47,.065,.03,.015,side*.13]],protection,2.4,16);
  loft(torso,'Vest waist band',[[.035,.38,.25],[.075,.39,.26]],webbing,2.6,24);
  for(const arm of arms){
   const old=arm.children.find(o=>o.name.startsWith('Short sleeve_'));arm.remove(old);owned.delete(old.geometry);old.geometry.dispose();
   loft(arm,'Protective uniform sleeve_'+arm.name,[[-.305,.11*wide,.13,.008],[-.24,.12*wide,.15,.01],[-.15,.15*wide,.175,-.005],[-.06,.175*wide,.19,-.008],[.018,.155*wide,.175],[.065,.10*wide,.13]],cloth,2.1,24);
  }
  // Open face and exposed hands keep the human silhouette visible.
  loft(head,'Open face helmet',[[.205,.177,.201,-.012],[.245,.174,.195,-.014],[.282,.135,.15,-.017],[.303,.052,.066,-.017]],protection,2.2,32);
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
 const mouth=root.getObjectByName('Mouth crease');mouth.scale.y=2.6;mouth.position.y=-.162;root.getObjectByName('Lower lip').position.y=-.008;mouth.rotation.z=.09;
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
 function reset(){previous=null;phase=blend=0;stance();const tails=root.getObjectByName('Split coat tails');if(tails)tails.rotation.z=0;const seekerTails=root.getObjectByName('Seeker coat tails');if(seekerTails)seekerTails.rotation.z=0;}
 function pose(seconds,walking=true){const dt=previous===null?0:T.MathUtils.clamp(seconds-previous,0,.1);previous=seconds;blend+=((walking?1:0)-blend)*(1-Math.exp(-dt*9));phase+=dt*(id==='lab-runner'?7:id==='lab-brute'?2.2:id==='lab-shield'?2.3:id==='lab-bomber'?4.4:id==='lab-carrier'?2.5:id==='lab-hunter'?5.3:id==='lab-armored'?2.4:id==='lab-artillery'?2.6:id==='lab-corehunter'?4.1:id==='lab-seeker'?2.5:id==='lab-blackout'?2.2:id==='rush'?6:lab?2.7:3.6)*blend;stance();legs.forEach((l,i)=>{const s=Math.sin(phase+i*Math.PI);l.rotation.x=restLeg[i]+s*(id==='lab-runner'?.42:id==='lab-hunter'?.31:id==='lab-corehunter'?.30:lab?(i===0?.17:.055):.25)*blend;shins[i].rotation.x=restShin[i]+Math.max(0,-s)*(lab?(i===0?.23:.035):.38)*blend;arms[i].rotation.x=settings.arm[i]-s*(id==='lab-shield'&&i===0?.025:id==='lab-carrier'?.06:.12)*blend;});torso.rotation.z+=Math.sin(phase)*.025*blend;head.rotation.z+=Math.sin(phase*.5)*.018*blend;if(id==='lab-seeker'){head.rotation.y+=Math.sin(phase*.55)*.18*blend;root.getObjectByName('Seeker coat tails').rotation.z=Math.sin(phase)*.025*blend;}if(lab){torso.rotation.x+=Math.cos(phase)*.025*blend;const tails=root.getObjectByName('Split coat tails');if(tails)tails.rotation.z=Math.sin(phase)*.015*blend;}ground();}
 function dispose(){owned.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
 if(id==='hollow')root.scale.y=1.055;if(id==='lab-seeker')root.scale.y=1.065;if(id==='lab-assistant')root.scale.y=.95;if(id==='lab-pathologist')root.scale.y=1.065;reset();return {root,head,torso,arms,legs,pose,reset,dispose,id,getMotion:()=>[previous,phase,blend],setMotion:state=>{[previous,phase,blend]=state;}};
};
