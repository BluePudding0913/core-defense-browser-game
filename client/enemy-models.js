"use strict";
// Procedural studio candidates. Metres, +Y up, +Z forward. No game-state dependencies.
window.EnemyModels = (() => {
  const variants = [
    {id:'ash', name:'ASH', label:'一体成形', color:'#bcbcb0'},
    {id:'slate', name:'SLATE', label:'装甲', color:'#4b6265'},
    {id:'veil', name:'VEIL', label:'フード', color:'#807062'},
    {id:'rasp', name:'RASP', label:'やつれた徘徊者', color:'#444a45'},
    {id:'rush', name:'RUSH', label:'襲いかかる暴徒', color:'#69473b'},
    {id:'hollow', name:'HOLLOW', label:'痩せた異形', color:'#b1aa99'},
    {id:'researcher', name:'INFECTED', label:'感染研究員', color:'#a5a79a'},
    {id:'lab-assistant', name:'ASSISTANT', label:'感染した検査助手', color:'#a4ada4'},
    {id:'lab-pathologist', name:'PATHOLOGIST', label:'感染した病理研究員', color:'#b0ab98'},
    {id:'lab-runner', name:'RUNNER', label:'検体搬送員', color:'#6b8781'},
    {id:'lab-brute', name:'BRUTE', label:'収容担当', color:'#a5a28e'},
    {id:'lab-poisoner', name:'POISONER', label:'汚染処理員', color:'#928b63'},
    {id:'lab-shield', name:'SHIELD', label:'封鎖警備員', color:'#526469'},
    {id:'lab-bomber', name:'BOMBER', label:'解体作業員', color:'#8c604a'},
    {id:'lab-carrier', name:'CARRIER', label:'検体運搬員', color:'#868876'},
    {id:'lab-hunter', name:'HUNTER', label:'逃走した被験者', color:'#8b9290'},
    {id:'lab-armored', name:'ARMORED', label:'防護警備員', color:'#69746e'},
    {id:'lab-artillery', name:'ARTILLERY', label:'射出装置の作業員', color:'#74735a'},
    {id:'lab-corehunter', name:'CORE HUNTER', label:'コア回収員', color:'#97815a'},
    {id:'lab-seeker', name:'SEEKER', label:'誘導弾ランチャーの追跡検査員', color:'#8b7777'},
    {id:'lab-blackout', name:'BLACKOUT', label:'感染した電気技師', color:'#425f59'},
    {id:'lab-siege', name:'SIEGE', label:'大型の破砕作業員', color:'#80745b'},
    {id:'lab-champion', name:'CHAMPION', label:'感染した警備主任', color:'#4a4652'},
    {id:'lab-warden', name:'WARDEN', label:'拘束管理員', color:'#657379'},
    {id:'lab-tiny', name:'TINY', label:'小型の逃走被験者', color:'#a0a995'},
    {id:'lab-gilded', name:'GILDED', label:'金色の検体回収員', color:'#baa465'},
    {id:'lab-blueace', name:'BLUE ACE', label:'高速の青い警備員', color:'#466f9f'},
    {id:'lab-explosionboss',name:'EXPLOSION BOSS',label:'爆薬を背負う大型個体',color:'#756347'},
    {id:'lab-finalboss',name:'FINAL BOSS',label:'砲撃と衝撃波の最終実験体',color:'#82758c'},
    {id:'lab-warlord',name:'WARLORD',label:'重装の指揮個体',color:'#75434a'},
    {id:'lab-titan',name:'TITAN',label:'大型の拘束実験体',color:'#6b496f'},
    {id:'lab-artilleryelite',name:'ARTILLERY ELITE',label:'上位砲撃手',color:'#526a43'}
  ];
  function build(T,id) {
    if(!variants.some(v=>v.id===id))throw new Error('Unknown enemy model: '+id);
    if(['lab-warlord','lab-titan','lab-artilleryelite','lab-explosionboss','lab-finalboss','rasp','rush','hollow','researcher','lab-assistant','lab-pathologist','lab-runner','lab-brute','lab-poisoner','lab-shield','lab-bomber','lab-carrier','lab-hunter','lab-armored','lab-artillery','lab-corehunter','lab-seeker','lab-blackout','lab-siege','lab-champion','lab-warden','lab-tiny','lab-gilded','lab-blueace'].includes(id))return window.buildOrganicEnemy(T,id);
    const root=new T.Group();root.name='Enemy_'+id;const owned=new Set(),mats=[];
    const mat=(name,color,roughness,metalness=0)=>{const m=new T.MeshStandardMaterial({name,color,roughness,metalness});m.color.convertSRGBToLinear();m.envMapIntensity=.55;mats.push(m);return m;};
    const under=mat('Graphite textile','#20282a',.94),rubber=mat('Rubber','#161d20',.84),dark=mat('Recess','#0c1417',.54);
    const shell=mat(id==='ash'?'Warm ceramic':id==='slate'?'Blue graphite alloy':'Umber cloth',variants.find(v=>v.id===id).color,id==='veil'?.96:.42,id==='slate'?.42:.08);
    const edge=mat('Edge trim',id==='ash'?'#8b928d':id==='slate'?'#303e41':'#4d4842',.65,.2);
    const face=mat('Faceplate',id==='ash'?'#293b3c':'#283132',.28,.45);
    const accent=mat('Identity insert',id==='slate'?'#a48d65':'#aca995',.56,.3);
    // Continuous lofted surfaces with rounded rectangular cross-sections, rather than stacked primitives.
    function loft(parent,name,rings,material,power=3.1,segments=24) {
      const pos=[],indices=[];
      for(const [y,w,d,z=0,x=0]of rings)for(let j=0;j<segments;j++){
        const a=j/segments*Math.PI*2,c=Math.cos(a),s=Math.sin(a);
        pos.push(x+Math.sign(c)*Math.pow(Math.abs(c),2/power)*w/2,y,z+Math.sign(s)*Math.pow(Math.abs(s),2/power)*d/2);
      }
      for(let i=0;i<rings.length-1;i++)for(let j=0;j<segments;j++){
        const a=i*segments+j,b=i*segments+(j+1)%segments,c=a+segments,d=b+segments;indices.push(a,c,b,b,c,d);
      }
      for(const end of [0,rings.length-1]){
        const r=rings[end],center=pos.length/3;pos.push(r[4]||0,r[0],r[3]||0);
        for(let j=0;j<segments;j++){const a=end*segments+j,b=end*segments+(j+1)%segments;indices.push(...(end===0?[center,a,b]:[center,b,a]));}
      }
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(indices);g.computeVertexNormals();owned.add(g);
      const mesh=new T.Mesh(g,material);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
    }
    const joint=(parent,name,x,y,z=0)=>{const g=new T.Group();g.name=name;g.position.set(x,y,z);parent.add(g);return g;};
    function oval(parent,name,w,h,d,x,y,z,material){return loft(parent,name,[[-h/2,w*.55,d*.55,z,x],[-h*.3,w*.93,d*.92,z,x],[0,w,d,z,x],[h*.32,w*.88,d*.88,z,x],[h/2,w*.40,d*.40,z,x]],material,2.2);}
    const torso=joint(root,'Torso',0,1.02);
    loft(torso,'Undersuit',[[0,.29,.19],[.10,.31,.20],[.30,.40,.23],[.43,.39,.19],[.47,.26,.15]],under);
    loft(root,'Pelvis',[[.84,.29,.20],[.92,.33,.23],[1.04,.30,.19]],under);
    const head=joint(torso,'Head',0,.53,.018);
    loft(head,'Neck',[[-.065,.105,.105],[.02,.11,.11]],rubber,2.4);
    const arms=[],forearms=[],legs=[],shins=[];
    for(const side of [-1,1]){
      const label=side<0?'L':'R';const leg=joint(root,'Thigh_'+label,side*.095,.88);legs.push(leg);
      loft(leg,'ThighSuit_'+label,[[-.40,.115,.13,.005],[-.32,.14,.16],[-.10,.18,.19],[.015,.155,.17]],under);
      const shin=joint(leg,'Shin_'+label,0,-.40,.003);shins.push(shin);
      loft(shin,'ShinSuit_'+label,[[-.38,.085,.105],[-.28,.095,.12],[-.08,.12,.135],[0,.12,.13]],under);
      loft(shin,'Boot_'+label,[[-.48,.13,.255,.055],[-.45,.135,.26,.055],[-.39,.125,.23,.045],[-.33,.095,.14]],rubber);
      const arm=joint(torso,'UpperArm_'+label,side*.244,.385);arms.push(arm);arm.rotation.z=side*.055;arm.rotation.x=-.10;
      loft(arm,'UpperArmSuit_'+label,[[-.29,.105,.12],[-.20,.12,.14],[-.04,.14,.16],[.025,.11,.13]],under);
      const forearm=joint(arm,'Forearm_'+label,0,-.29);forearms.push(forearm);forearm.rotation.x=-.18;
      loft(forearm,'ForearmSuit_'+label,[[-.24,.075,.085],[-.17,.095,.11],[-.04,.11,.12],[.015,.10,.11]],under);
      loft(forearm,'Hand_'+label,[[-.35,.072,.07,.024],[-.33,.09,.075,.025],[-.25,.09,.09,.012],[-.235,.075,.085]],rubber,2.6);
      if(id!=='veil'){
        loft(leg,'ThighShell_'+label,[[-.32,.12,.15,.008],[-.25,.15,.18,.006],[-.09,.176,.20],[0,.14,.17]],shell);
        loft(shin,'Knee_'+label,[[-.075,.10,.055,.075],[-.025,.125,.06,.075],[.025,.10,.04,.075]],edge);
        loft(shin,'Greave_'+label,[[-.33,.09,.115,.015],[-.25,.11,.15,.01],[-.07,.13,.17,.012],[-.035,.115,.14,.018]],shell);
        loft(arm,'Shoulder_'+label,[[-.15,.145,.17],[-.07,.18,.20],[.025,.155,.17],[.055,.10,.12]],shell);
        loft(forearm,'Bracer_'+label,[[-.22,.085,.10,.007],[-.16,.115,.14],[-.05,.13,.15],[0,.095,.12]],shell);
      }else{
        loft(arm,'Sleeve_'+label,[[-.28,.12,.14],[-.13,.17,.19],[.02,.17,.18],[.06,.11,.13]],shell,2.6);
        loft(forearm,'Cuff_'+label,[[-.24,.09,.105],[-.13,.13,.15],[-.02,.14,.16],[.025,.11,.13]],shell,2.6);
      }
    }
    if(id==='ash'){
      loft(torso,'Ceramic cuirass',[[.02,.26,.19,.005],[.08,.29,.22],[.25,.39,.265],[.37,.43,.24],[.43,.32,.17]],shell,2.7);
      loft(torso,'Floating collar',[[.415,.26,.16],[.44,.23,.15],[.455,.16,.125]],edge);
      loft(head,'Ceramic head',[[0,.135,.145],[.035,.17,.19,.008],[.13,.18,.20],[.20,.15,.17,-.005],[.225,.09,.105,-.01]],shell,2.5);
      loft(head,'Inset face',[[.055,.104,.023,.103],[.11,.128,.028,.107],[.157,.116,.021,.103]],face,3.6);
      loft(torso,'Sternum inlay',[[.13,.018,.013,.126],[.31,.018,.013,.133]],edge);
    }else if(id==='slate'){
      loft(torso,'Armored thorax',[[.05,.28,.215],[.16,.35,.27],[.32,.455,.29],[.415,.405,.23],[.44,.28,.18]],shell,3.8);
      loft(torso,'Abdominal plate',[[.005,.245,.215,.014],[.09,.27,.23,.012],[.13,.29,.235,.01]],edge);
      loft(torso,'Collar',[[.43,.26,.185],[.485,.22,.155]],edge);
      loft(head,'Helmet',[[.005,.14,.17],[.04,.185,.22],[.15,.20,.235,-.01],[.205,.16,.19,-.02],[.22,.10,.13,-.025]],shell,3.5);
      loft(head,'Visor recess',[[.07,.161,.024,.112],[.135,.177,.025,.112]],dark,3.5);
      loft(head,'Smoked visor',[[.085,.148,.018,.128],[.123,.161,.018,.128]],face,3.5);
      loft(torso,'Unit insert',[[.285,.045,.012,.15,.115],[.345,.045,.012,.142,.115]],accent);
    }else{
      loft(torso,'Mantle',[[.03,.32,.23],[.21,.40,.27],[.36,.49,.28,-.008],[.46,.44,.23,-.015],[.50,.23,.18,-.01]],shell,2.8);
      // Hood is an open shell: a single swept rim with a real face cavity.
      const shape=new T.Shape();shape.moveTo(-.118,-.035);shape.quadraticCurveTo(-.145,.12,-.095,.245);shape.quadraticCurveTo(0,.33,.095,.245);shape.quadraticCurveTo(.145,.12,.118,-.035);shape.lineTo(-.118,-.035);
      const hole=new T.Path();hole.moveTo(-.073,.01);hole.lineTo(.073,.01);hole.quadraticCurveTo(.095,.13,.057,.205);hole.quadraticCurveTo(0,.25,-.057,.205);hole.quadraticCurveTo(-.095,.13,-.073,.01);shape.holes.push(hole);
      const g=new T.ExtrudeGeometry(shape,{depth:.18,steps:1,bevelEnabled:true,bevelSegments:3,bevelSize:.012,bevelThickness:.012,curveSegments:12});g.translate(0,0,-.10);owned.add(g);const hood=new T.Mesh(g,shell);hood.name='Open hood';hood.castShadow=true;head.add(hood);
      loft(head,'Shadowed mask',[[.005,.13,.13,-.01],[.06,.148,.14,-.01],[.16,.14,.14,-.015],[.205,.095,.10,-.02]],dark,2.7);
      loft(head,'Mask plane',[[.055,.085,.012,.067],[.15,.09,.012,.067]],edge,3.5);
      loft(root,'Long coat',[[.43,.47,.31,.005],[.48,.48,.32],[.72,.41,.28],[.94,.34,.245],[1.08,.32,.23]],shell,2.6);
      loft(root,'Hem seam',[[.45,.012,.008,.163],[.73,.012,.008,.145]],edge);
      loft(torso,'Closure',[[.08,.022,.012,.124],[.40,.022,.012,.137]],accent);
    }
    let previous=null,phase=0,blend=0;
    function pose(seconds,walking=true){const dt=previous==null?0:Math.max(0,Math.min(.1,seconds-previous));previous=seconds;blend+=((walking?1:0)-blend)*(1-Math.exp(-dt*9));phase+=dt*4.1*blend;
      legs.forEach((l,i)=>{const s=Math.sin(phase+i*Math.PI);l.rotation.x=s*(id==='veil'?.12:.34)*blend;shins[i].rotation.x=Math.max(0,-s)*(id==='veil'?.28:.5)*blend;arms[i].rotation.x=-.10-s*.22*blend;forearms[i].rotation.x=-.18-Math.max(0,s)*.12*blend;});
      torso.position.y=1.02+Math.cos(phase*2)*.008*blend;head.rotation.y=Math.sin(seconds*.7)*.025;
    }
    function reset(){previous=null;phase=blend=0;torso.position.y=1.02;head.rotation.set(0,0,0);legs.forEach((l,i)=>{l.rotation.x=shins[i].rotation.x=0;arms[i].rotation.x=-.10;forearms[i].rotation.x=-.18;});}
    function dispose(){owned.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());}
    return {root,head,torso,arms,legs,pose,reset,dispose,id};
  }
  return {variants,build};
})();
