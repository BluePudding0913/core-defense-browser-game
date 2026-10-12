'use strict';
(() => {
const T=THREE,scene=new T.Scene();scene.background=new T.Color('#191d20');
let renderer;try{renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});}catch(e){document.body.insertAdjacentHTML('beforeend','<p id="error">3D表示にはWebGL対応ブラウザが必要です。</p>');throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;document.body.appendChild(renderer.domElement);
// Broad studio cards create subdued highlights on ceramic, metal and visor.
const studio=new T.Scene();studio.background=new T.Color('#535e66').convertSRGBToLinear();
for(const [x,y,z,w,h,color]of [[-3,3,2,2,5,'#e3e9e6'],[3,2,1,2,4,'#9aaeb7'],[0,4,-3,4,2,'#f4e7d1']]){const p=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color,side:T.DoubleSide}));p.position.set(x,y,z);p.lookAt(0,1,0);studio.add(p);}
const pmrem=new T.PMREMGenerator(renderer);const environment=pmrem.fromScene(studio,.12);scene.environment=environment.texture;pmrem.dispose();studio.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
scene.add(new T.HemisphereLight('#c5d5dd','#33302b',.72));
for(const [color,intensity,x,y,z]of [['#f4ecdb',1.7,-3,6,5],['#bad5e4',.55,4,3,2],['#d2e2df',1.3,1,4,-4]]){const l=new T.DirectionalLight(color,intensity);l.position.set(x,y,z);scene.add(l);if(x===-3){l.castShadow=true;l.shadow.mapSize.set(2048,2048);Object.assign(l.shadow.camera,{left:-5,right:5,top:4,bottom:-4,near:.1,far:20});l.shadow.bias=-.0003;l.shadow.normalBias=.012;l.shadow.radius=3;}}
const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:'#171d20',roughness:.9}));floor.rotation.x=-Math.PI/2;floor.position.y=-.008;floor.receiveShadow=true;floor.material.color.convertSRGBToLinear();scene.add(floor);scene.fog=new T.Fog('#191d20',10,26);
const models=EnemyModels.variants.map(v=>EnemyModels.build(T,v.id));models.forEach(m=>scene.add(m.root));
const camera=new T.PerspectiveCamera(33,1,.05,70);let selected='all',yaw=.27,pitch=.13,distance=7.1,walking=false,drag=null;
function select(id){selected=id;document.body.classList.toggle('solo',id!=='all');models.forEach((m,i)=>{m.root.visible=id==='all'||id===m.id;m.root.position.x=id==='all'?(i-1)*1.8:0;});document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id));document.querySelectorAll('.label').forEach(b=>b.classList.toggle('selected',b.dataset.id===id));distance=id==='all'?7.1:4.9;yaw=.27;pitch=.13;}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>select(b.dataset.view));
document.querySelector('#motion').onclick=e=>{walking=!walking;e.target.classList.toggle('active',walking);e.target.textContent=walking?'停止':'歩行';};
document.querySelector('#download').onclick=()=>{const chosen=selected==='all'?models:models.filter(m=>m.id===selected);chosen.forEach(m=>{const copy=EnemyModels.build(T,m.id);const data=exportEnemyGLB(T,copy.root),url=URL.createObjectURL(new Blob([data],{type:'model/gltf-binary'})),a=document.createElement('a');a.href=url;a.download='enemy-'+m.id+'.glb';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);copy.dispose();});};
const canvas=renderer.domElement;canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);};canvas.onpointerup=canvas.onpointercancel=()=>drag=null;canvas.onpointermove=e=>{if(!drag)return;yaw-=(e.clientX-drag.x)*.008;pitch=T.MathUtils.clamp(pitch+(e.clientY-drag.y)*.004,-.12,1.05);drag={x:e.clientX,y:e.clientY};};canvas.onwheel=e=>{e.preventDefault();distance=T.MathUtils.clamp(distance*Math.exp(e.deltaY*.001),selected==='all'?4.7:2.6,12);};
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();select('all');
function draw(ms){requestAnimationFrame(draw);models.forEach(m=>{if(walking)m.pose(ms/1000,true);else m.reset();m.root.rotation.y=yaw;});const adjusted=distance*Math.max(1,1.35/camera.aspect);camera.position.set(0,.96+Math.sin(pitch)*adjusted,Math.cos(pitch)*adjusted);camera.lookAt(0,.94,0);renderer.render(scene,camera);}requestAnimationFrame(draw);
window.enemyStudio={models,scene,renderer,camera,select,get selected(){return selected;}};
})();


