import * as THREE from 'three';
import registry from './surface-markings.json';

// Manufacturer artwork in the verified original CAD world frame. No board names,
// guessed inscriptions, expected connector locations or recognition inputs.
export async function loadSurfaceMarkings(record,renderer){
 const automatic=record.automaticSurfaces?.registration?.status==='verified'&&record.automaticSurfaces.baseGLBSHA256===record.inventory.sourceHash?record.automaticSurfaces:null;
 const entry=automatic?{...automatic,layers:automatic.files,status:'verified_ecad_frame_approximate_font',labelKey:'marks.official'}:registry.assets.find(a=>a.baseGLBSHA256===record.inventory.sourceHash);
 if(!entry)return null;
 const object=new THREE.Group();object.name='official-surface-markings';
 const resources=[];
 try{
  for(const layer of entry.layers){
   const response=await fetch(automatic?`/board-assets/${record.id}/${layer.file}`:'/surface-markings/'+layer.file);if(!response.ok)throw Error('marking_asset_unavailable');
   const bytes=await response.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
   if([...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('')!==layer.sha256)throw Error('marking_hash_mismatch');
   const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}),{imageOrientation:'flipY',premultiplyAlpha:'none'});
   const texture=new THREE.Texture(bitmap);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true;
   const geometry=new THREE.BufferGeometry(),points=layer.corners.map(p=>new THREE.Vector3(...p)),normal=new THREE.Vector3(...layer.normal);
   geometry.setAttribute('position',new THREE.Float32BufferAttribute(layer.corners.flat(),3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));
   const facing=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).dot(normal);
   geometry.setIndex(facing>0?[0,1,2,0,2,3]:[0,2,1,0,3,2]);geometry.computeVertexNormals();
   const material=new THREE.MeshStandardMaterial({map:texture,metalness:layer.material?.metalness??0,roughness:layer.material?.roughness??.78,alphaTest:.2,alphaToCoverage:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
   const mesh=new THREE.Mesh(geometry,material);mesh.name=layer.file;mesh.raycast=()=>{};object.add(mesh);resources.push({texture,bitmap,geometry,material});
  }
 }catch(error){for(const r of resources){r.texture.dispose();r.bitmap.close();r.geometry.dispose();r.material.dispose();}throw error;}
 return {object,audit:{status:entry.status||'official_cad_graphics',labelKey:entry.labelKey||'marks.official',layers:entry.layers.length,bytes:entry.layers.reduce((n,l)=>n+l.bytes,0),source:entry.sourceURL,baseGLBSHA256:entry.baseGLBSHA256},
  dispose(){for(const r of resources){r.texture.dispose();r.bitmap.close();r.geometry.dispose();r.material.dispose();}}};
}
