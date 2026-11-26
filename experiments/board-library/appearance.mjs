import * as THREE from 'three';
import base from '../cad-viewer/metal-profile.json';
import polished from '../cad-viewer/metal-polished-profile.json';
import {applyMetalAppearance} from '../cad-viewer/metal-materials.mjs';
import visual from './visual-profile.json';
import {applySurfaceFinishes} from './surface-finishes.mjs';
import {sharedSoldermask} from './material-library.mjs';
export function appearance(model,renderer,record,meshes) {
  // Migration adapter calls the existing renderer unchanged for already reviewed batches.
  if(record.appearance==='cad-viewer-metal-v2')applyMetalAppearance(model,renderer,'metal-v2');
  const e={...base.environment,...polished.environment,...visual.metalEnvironment},studio=new THREE.Scene();studio.background=new THREE.Color().setRGB(e.background,e.background,e.background);
  for(const p of e.panels){const m=new THREE.Mesh(new THREE.PlaneGeometry(...p.size),new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(p.radiance,p.radiance,p.radiance),side:THREE.DoubleSide}));m.position.set(...p.position);m.lookAt(0,0,0);studio.add(m);}
  const gen=new THREE.PMREMGenerator(renderer),environment=gen.fromScene(studio,e.blurRadians,.1,20,{size:e.faceSize});gen.dispose();studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  const finishes={...base.finishes,...polished.finishes};
  for(const mesh of meshes){const nodeId=mesh.userData.catalogNodeId,review=record.review.materials[nodeId],automatic=record.materials.find(m=>m.nodeId===nodeId),name=review?.finish||automatic?.finish,p=finishes[name];
    if(!p)continue;
    const transform=old=>{const m=old.clone();m.metalness=p.metalness;m.roughness=p.roughness;
      if(p.linearColor)m.color.setRGB(...p.linearColor,THREE.LinearSRGBColorSpace);
      if(p.metalness===1){m.envMap=environment.texture;m.envMapIntensity=e.intensity;}return m;};
    mesh.material=Array.isArray(mesh.material)?mesh.material.map(transform):transform(mesh.material);
  }
  // Presentation-only refinement of already assigned semantic materials, including migrated CAD.
  for(const mesh of meshes){const id=mesh.userData.catalogNodeId,review=record.review.materials[id],automatic=record.materials.find(m=>m.nodeId===id);mesh.receiveShadow=false;
    const coat=old=>{const finish=review?.finish||automatic?.finish||old.name.split(' · ')[0],p=visual.finishes[finish];if(!p?.clearcoat)return old;
      const m=new THREE.MeshPhysicalMaterial();THREE.MeshStandardMaterial.prototype.copy.call(m,old);m.defines={STANDARD:'',PHYSICAL:''};
      m.clearcoat=p.clearcoat;m.clearcoatRoughness=p.clearcoatRoughness;return m;};
    mesh.material=Array.isArray(mesh.material)?mesh.material.map(coat):coat(mesh.material);
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){const finish=review?.finish||automatic?.finish||material.name.split(' · ')[0],p=visual.finishes[finish];if(finish==='pcb_soldermask')mesh.receiveShadow=true;if(!p)continue;material.roughness=p.roughness;if(p.metalness!==undefined)material.metalness=p.metalness;if(p.linearColor)material.color.setRGB(...p.linearColor,THREE.LinearSRGBColorSpace);if(p.colorScale)material.color.multiplyScalar(p.colorScale);
      // Every already-classified metal uses the same restrained reflection studio,
      // including migrated materials. White CAD regions are never classified by colour.
      if(material.metalness===1){material.envMap=environment.texture;material.envMapIntensity=p.environmentIntensity??visual.metalEnvironmentIntensity;}
    }
  }
  const surfaceFinishes=applySurfaceFinishes(meshes,record);
  for(const mesh of meshes){const id=mesh.userData.catalogNodeId;if(record.review.materials[id])continue;
    const finish=record.materials.find(r=>r.nodeId===id)?.finish;
    const use=m=>finish==='pcb_soldermask'||m.name.split(' · ')[0]==='pcb_soldermask'?sharedSoldermask(m):m;
    mesh.material=Array.isArray(mesh.material)?mesh.material.map(use):use(mesh.material);
  }
  const automatic=record.automaticSurfaces;
  if(automatic?.registration?.status==='verified'&&automatic.baseGLBSHA256===record.inventory.sourceHash){
    const boardId=`${record.inventory.sourceHash.slice(0,16)}:node:${automatic.boardNode}`;
    for(const mesh of meshes){
      if(record.review.materials[mesh.userData.catalogNodeId])continue;
      const substrate=mesh.userData.catalogNodeId===boardId,c=record.components.find(c=>c.nodeIds.includes(mesh.userData.catalogNodeId));
      if(!substrate&&!['flash','ram','usb_controller'].includes(c?.educationRule))continue;
      const convert=old=>{const m=new THREE.MeshPhysicalMaterial();THREE.MeshStandardMaterial.prototype.copy.call(m,old);m.defines={STANDARD:'',PHYSICAL:''};m.metalness=0;m.roughness=substrate?.42:.58;
        if(substrate){const rgb=automatic.appearance?.selected?.rgb;if(rgb)m.color.setRGB(...rgb,THREE.SRGBColorSpace);const shared=sharedSoldermask(m,{evidence:automatic.appearance?.selected?.url||'source_cad_colour'});m.dispose();return shared;}return m;};
      mesh.material=Array.isArray(mesh.material)?mesh.material.map(convert):convert(mesh.material);
    }
  }
  const finishesAudit=new Map();
  for(const mesh of meshes)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
    const id=mesh.userData.catalogNodeId,finish=m.userData.presentationFinish||record.review.materials[id]?.finish||record.materials.find(r=>r.nodeId===id)?.finish||m.name.split(' · ')[0];
    if(!visual.finishes[finish])continue;
    const key=JSON.stringify([finish,m.color.toArray(),m.roughness,m.metalness]);const entry=finishesAudit.get(key)||{finish,color:m.color.toArray(),roughness:m.roughness,metalness:m.metalness,clearcoat:m.clearcoat||0,count:0};entry.count++;finishesAudit.set(key,entry);
  }
  environment.presentation={version:visual.version,finishes:[...finishesAudit.values()],environmentFaceSize:e.faceSize,surfaceFinishes};
  // New CAD uses semantic/provisional classes; no colour-only metal inference or displacement.
  return environment;
}
