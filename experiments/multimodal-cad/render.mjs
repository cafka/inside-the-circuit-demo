import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const status=document.querySelector('#status'),button=document.querySelector('button');
const inventory=await fetch('/candidates.json').then(r=>r.json()),policy=inventory.policy;
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.setSize(policy.renderWidth,policy.renderHeight);renderer.setClearColor(0xd9e0e7);
document.querySelector('#view').append(renderer.domElement);
const scene=new THREE.Scene(),model=(await new GLTFLoader().loadAsync('/geometry.glb')).scene;
model.scale.multiplyScalar(inventory.gltfScale);scene.add(model);model.updateMatrixWorld(true);
const meshes=[];model.traverse(o=>{if(o.isMesh)meshes.push(o);});
if(meshes.length!==inventory.meshCount)throw Error('Mesh traversal does not match extraction');
const owner=new Map();for(const c of inventory.candidates)for(const i of c.meshIds){if(owner.has(i))throw Error('Duplicate CAD ownership');owner.set(i,c.id);}
const originals=meshes.map(m=>m.material),raycaster=new THREE.Raycaster();
scene.add(new THREE.HemisphereLight(0xffffff,0x687484,2.1));const key=new THREE.DirectionalLight(0xffffff,2.4);key.position.set(40,100,60);scene.add(key);const fill=new THREE.DirectionalLight(0xffffff,1.5);fill.position.set(-40,-100,-60);scene.add(fill);
const [lo,hi]=inventory.boundsMm,center=new THREE.Vector3().fromArray(lo).add(new THREE.Vector3().fromArray(hi)).multiplyScalar(.5);
const span=new THREE.Vector3().fromArray(hi).sub(new THREE.Vector3().fromArray(lo)),diagonal=span.length(),unit=i=>new THREE.Vector3(...[0,1,2].map(k=>i===k?1:0));
const {u,v,n}=inventory.axes,normal=unit(n),up=unit(v).negate(),aspect=policy.renderWidth/policy.renderHeight;
const half=Math.max(span.getComponent(v),span.getComponent(u)/aspect)*.62;
const camera=new THREE.OrthographicCamera(-half*aspect,half*aspect,half,-half,diagonal*.01,diagonal*6);
camera.up.copy(up);const views=[];
const save=async(name,body,type='image/png')=>{const r=await fetch('/artifact/'+name,{method:'POST',headers:{'Content-Type':type},body});if(!r.ok)throw Error('Artifact export failed '+r.status);};
const blob=canvas=>new Promise(r=>canvas.toBlob(r,'image/png'));
async function renderSide(side){
 camera.position.copy(center).addScaledVector(normal,diagonal*3*(side==='front'?1:-1));camera.lookAt(center);camera.updateMatrixWorld(true);
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0xd9e0e7);meshes.forEach((m,i)=>{m.material=originals[i];});renderer.render(scene,camera);
 const clean=document.createElement('canvas');clean.width=policy.renderWidth;clean.height=policy.renderHeight;clean.getContext('2d').drawImage(renderer.domElement,0,0);
 await save(side+'-cad.png',await blob(clean));
 renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.setClearColor(0x000000);
 const mats=new Map();for(let i=0;i<meshes.length;i++){
  const id=owner.get(i),number=id?Number(id.slice(1)):0;
  if(!mats.has(number))mats.set(number,new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB((number&255)/255,((number>>8)&255)/255,0),toneMapped:false,side:THREE.FrontSide}));
  meshes[i].material=mats.get(number);
 }
 renderer.render(scene,camera);await save(side+'-ids.png',await blob(renderer.domElement));
 const pixels=new Uint8Array(policy.renderWidth*policy.renderHeight*4);renderer.getContext().readPixels(0,0,policy.renderWidth,policy.renderHeight,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,pixels);
 const stats=new Map();for(let y=0;y<policy.renderHeight;y++)for(let x=0;x<policy.renderWidth;x++){
  const q=((policy.renderHeight-1-y)*policy.renderWidth+x)*4,id=pixels[q]+pixels[q+1]*256;if(!id)continue;
  if(!stats.has(id))stats.set(id,{count:0,sumX:0,sumY:0,box:[y,x,y,x]});const s=stats.get(id);s.count++;s.sumX+=x;s.sumY+=y;s.box=[Math.min(s.box[0],y),Math.min(s.box[1],x),Math.max(s.box[2],y),Math.max(s.box[3],x)];
 }
 const ctx=clean.getContext('2d'),objects=[];ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
 for(const candidate of inventory.candidates){
  const id=Number(candidate.id.slice(1)),s=stats.get(id);if(!s||s.count<policy.minimumVisiblePixels)continue;
  const cx=s.sumX/s.count,cy=s.sumY/s.count;let nearest=null,best=Infinity;
  for(let y=s.box[0];y<=s.box[2];y++)for(let x=s.box[1];x<=s.box[3];x++){
   const q=((policy.renderHeight-1-y)*policy.renderWidth+x)*4;if(pixels[q]+pixels[q+1]*256!==id)continue;
   const d=(x-cx)**2+(y-cy)**2;if(d<best){best=d;nearest=[x,y];}
  }
  const [x,y]=nearest;raycaster.setFromCamera(new THREE.Vector2(x/policy.renderWidth*2-1,1-y/policy.renderHeight*2),camera);
  const hit=raycaster.intersectObjects(meshes,false)[0];if(!hit||owner.get(meshes.indexOf(hit.object))!==candidate.id)continue;
  ctx.fillStyle='#093d60';ctx.fillRect(x-24,y-10,48,20);ctx.fillStyle='#fff';ctx.fillText(candidate.id,x,y);ctx.strokeStyle='#31eaff';ctx.lineWidth=2;ctx.strokeRect(x-25,y-11,50,22);
  objects.push({id:candidate.id,visiblePixels:s.count,box:s.box,anchorPixel:[x,y],anchorMm:hit.point.toArray(),evaluationRole:candidate.evaluationRole});
 }
 await save(side+'-labelled.png',await blob(clean));views.push({side,objects,camera:{position:camera.position.toArray(),up:camera.up.toArray(),target:center.toArray(),projection:camera.projectionMatrix.toArray(),worldInverse:camera.matrixWorldInverse.toArray()}});
 mats.forEach(m=>m.dispose());meshes.forEach((m,i)=>{m.material=originals[i];});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0xd9e0e7);renderer.render(scene,camera);
 return objects.length;
}
button.addEventListener('click',async()=>{button.disabled=true;const start=performance.now();try{status.textContent='Renderizando geometría real y referencias neutras…';const a=await renderSide('front'),b=await renderSide('back');await save('render.json',JSON.stringify({schema:'CAD-render/1',inputSHA256:inventory.inputSHA256,width:policy.renderWidth,height:policy.renderHeight,views,elapsedMs:performance.now()-start,renderer:renderer.info.render,annotationsFromHistory:false}), 'application/json');status.textContent=`Exportado: ${a} referencias visibles en frente, ${b} en reverso. Sin identidades preasignadas.`;}catch(e){status.textContent=e.stack;}finally{button.disabled=false;}});
camera.position.copy(center).addScaledVector(normal,diagonal*3);camera.lookAt(center);renderer.render(scene,camera);status.textContent='CAD original cargado. '+inventory.candidates.length+' grupos extraídos automáticamente.';
