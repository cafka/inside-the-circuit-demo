import * as THREE from 'three';
import library from './material-library.json';
const definitions=new Map();
export function visualMaterialDefinition(finish,linearRGB){
 const parameters=library.finishes[finish];if(!parameters)throw Error('unknown_shared_finish');
 if(linearRGB.length!==3||linearRGB.some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('invalid_material_colour');
 const key=finish+':'+linearRGB.map(v=>v.toPrecision(8)).join(',');
 if(!definitions.has(key))definitions.set(key,Object.freeze({id:key,version:library.version,finish,linearRGB:Object.freeze([...linearRGB]),...parameters,composition:'not_inferred'}));
 return definitions.get(key);
}
export function sharedSoldermask(source,{linearRGB=source.color.toArray(),evidence='existing_catalogue_visual_source'}={}){
 const definition=visualMaterialDefinition('soldermask_satin',linearRGB),m=new THREE.MeshPhysicalMaterial();
 THREE.MeshStandardMaterial.prototype.copy.call(m,source);m.defines={STANDARD:'',PHYSICAL:''};m.onBeforeCompile=source.onBeforeCompile;m.customProgramCacheKey=source.customProgramCacheKey;
 Object.assign(m,library.finishes.soldermask_satin);m.color.setRGB(...definition.linearRGB,THREE.LinearSRGBColorSpace);
 m.userData.library={...definition,evidence};return m;
}
