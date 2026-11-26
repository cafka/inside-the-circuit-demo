import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import registry from './presentation-geometry.json';
import {sharedSoldermask} from './material-library.mjs';

// Optional catalogue assets in the unchanged CAD world frame. No board names,
// guessed coordinates, colour recognition, or changes to the original GLB.
export async function loadPresentationGeometry(record,meshes,environment){
 const automatic=record.automaticSurfaces?.presentationGeometry;
 const useAutomatic=automatic?.status==='source_ecad_supplement'&&record.automaticSurfaces.registration.status==='verified'&&automatic.baseGLBSHA256===record.inventory.sourceHash;
 const entry=useAutomatic?{...automatic,sourceURL:record.automaticSurfaces.sourceURL}:registry.assets.find(a=>a.baseGLBSHA256===record.inventory.sourceHash);
 if(!entry)return null;
 const replaced=entry.replacesNodeIds.map(id=>meshes.filter(m=>m.userData.catalogNodeId===id)).flat();
 if(replaced.length!==entry.replacesNodeIds.length)throw Error('presentation_target_mismatch');
 const response=await fetch(useAutomatic?`/board-assets/${record.id}/${entry.file}`:'/presentation-geometry/'+entry.file);if(!response.ok)throw Error('presentation_geometry_unavailable');
 const bytes=await response.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',bytes);
 if([...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('')!==entry.sha256)throw Error('presentation_geometry_hash_mismatch');
 const gltf=await new GLTFLoader().parseAsync(bytes,''),object=gltf.scene;
 let unknown=false;object.traverse(m=>{if(m.isMesh&&!entry.materials[m.name])unknown=true;});
 if(unknown){object.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});throw Error('presentation_material_missing');}
 object.traverse(mesh=>{if(!mesh.isMesh)return;const finish=entry.materials[mesh.name];
  mesh.castShadow=true;mesh.receiveShadow=true;
  const reviewedId=entry.materialBindings?.[mesh.name],reviewed=reviewedId&&record.review.materials[reviewedId],source=reviewed&&replaced.find(m=>m.userData.catalogNodeId===reviewedId);
  if(source){const material=Array.isArray(source.material)?source.material[0]:source.material;mesh.material.dispose();mesh.material=material.clone();mesh.userData.presentationOnly=true;return;}
  const old=mesh.material,m=new THREE.MeshPhysicalMaterial();THREE.MeshStandardMaterial.prototype.copy.call(m,old);m.defines={STANDARD:'',PHYSICAL:''};
  Object.assign(m,finish);if(m.metalness){m.envMap=environment.texture;m.envMapIntensity=1.2;}mesh.material=finish.role==='soldermask'?sharedSoldermask(m,{evidence:entry.sourceURL}):m;if(mesh.material!==m)m.dispose();old.dispose();mesh.castShadow=true;mesh.receiveShadow=true;
  mesh.userData.presentationOnly=true; // No new component identities or selection targets.
 });
 return {object,activate(){for(const m of replaced)m.visible=false;},audit:{status:'manufacturer_pcb_details',source:entry.sourceURL,sha256:entry.sha256,replacedNodes:entry.replacesNodeIds,terminals:entry.terminals,drills:entry.drills,bytes:entry.bytes,materialComposition:'not_inferred_from_colour'},
 dispose(){object.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}};
}
