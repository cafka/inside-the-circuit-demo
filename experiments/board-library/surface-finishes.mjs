import * as THREE from 'three';
import registry from './surface-finish-profile.json';
import visual from './visual-profile.json';

// Reviewed source ranges only. Attributes, indices, transforms and picking identity
// stay untouched; draw groups partition the same triangles between materials.
export function applySurfaceFinishes(meshes,record){
 const asset=registry.assets.find(a=>a.glbSHA256===record.inventory.sourceHash),audit=[];
 if(!asset)return audit;
 for(const mesh of meshes){
  if(record.review.materials[mesh.userData.catalogNodeId])continue;
  const ranges=asset.surfaces.flatMap(s=>s.ranges.filter(r=>r.batch===mesh.userData.batchId).map(r=>({...r,finish:s.finish,sourceParts:s.sourceParts})));
  if(!ranges.length)continue;
  const count=mesh.geometry.index?.count;if(!count)throw Error('surface_finish_requires_indexed_mesh');
  ranges.sort((a,b)=>a.firstTriangle-b.firstTriangle);
  let end=0;for(const r of ranges){if(!visual.finishes[r.finish]||r.firstTriangle*3<end||r.triangleCount<=0||(r.firstTriangle+r.triangleCount)*3>count)throw Error('invalid_surface_finish_range');end=(r.firstTriangle+r.triangleCount)*3;}
  const materials=Array.isArray(mesh.material)?[...mesh.material]:[mesh.material],originalGroups=mesh.geometry.groups.length?mesh.geometry.groups.map(g=>({...g})):[{start:0,count,materialIndex:0}];
  const cuts=[...new Set([0,count,...originalGroups.flatMap(g=>[g.start,g.start+g.count]),...ranges.flatMap(r=>[r.firstTriangle*3,(r.firstTriangle+r.triangleCount)*3])])].sort((a,b)=>a-b),cache=new Map(),groups=[];
  for(let i=0;i<cuts.length-1;i++){
   const start=cuts[i],length=cuts[i+1]-start,original=originalGroups.find(g=>start>=g.start&&start<g.start+g.count);if(!original)throw Error('incomplete_source_material_groups');
   const range=ranges.find(r=>start>=r.firstTriangle*3&&start<(r.firstTriangle+r.triangleCount)*3);let materialIndex=original.materialIndex;
   if(range){const key=materialIndex+':'+range.finish;if(!cache.has(key)){
     const source=materials[materialIndex],material=source.clone(),p=visual.finishes[range.finish];
     // Three Material.copy does not preserve shader callbacks; keep the existing
     // bounded optical grain instead of dropping it when splitting a finish.
     material.onBeforeCompile=source.onBeforeCompile;material.customProgramCacheKey=source.customProgramCacheKey;
     material.name=range.finish+' · '+source.name;material.userData.presentationFinish=range.finish;
     material.color.setRGB(...p.linearColor,THREE.LinearSRGBColorSpace);material.metalness=p.metalness;material.roughness=p.roughness;material.envMapIntensity=p.environmentIntensity;
     cache.set(key,materials.length);materials.push(material);
    }materialIndex=cache.get(key);
   }
   const last=groups.at(-1);if(last&&last.materialIndex===materialIndex&&last.start+last.count===start)last.count+=length;else groups.push({start,count:length,materialIndex});
  }
  mesh.geometry.clearGroups();for(const g of groups)mesh.geometry.addGroup(g.start,g.count,g.materialIndex);mesh.material=materials;
  audit.push({nodeId:mesh.userData.catalogNodeId,batch:mesh.userData.batchId,ranges,groups,geometryAttributesUnchanged:true});
 }
 return audit;
}
