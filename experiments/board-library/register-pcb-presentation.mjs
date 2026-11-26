// Publish locally prepared, hash-checked optional viewer assets to the catalogue.
// Run explicitly after extract-pcb-presentation.py. No network or CAD conversion.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DIR} from './catalog.mjs';
const [profile,prepared]=process.argv.slice(2);if(!profile||!prepared)throw Error('profile and prepared directory required');
const config=JSON.parse(fs.readFileSync(profile)),manifest=JSON.parse(fs.readFileSync(path.join(prepared,'manifest.json'))),data=JSON.parse(fs.readFileSync(path.join(prepared,'pcb-data.json')));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const write=(file,data)=>fs.writeFileSync(path.join(DIR,file),JSON.stringify(data,null,2)+'\n');
function copy(name,sha,folder,prefix){const bytes=fs.readFileSync(path.join(prepared,name));if(hash(bytes)!==sha)throw Error('prepared_asset_hash_mismatch');const file=prefix+sha.slice(0,12)+path.extname(name);fs.mkdirSync(path.join(DIR,'assets',folder),{recursive:true});fs.writeFileSync(path.join(DIR,'assets',folder,file),bytes);return file;}
const geometryFile=copy('pcb-details.glb',manifest.geometrySHA256,'presentation-geometry','pcb-');
const geometry=JSON.parse(fs.readFileSync(path.join(DIR,'presentation-geometry.json')));
geometry.assets=geometry.assets.filter(a=>a.baseGLBSHA256!==config.baseGLBSHA256);
geometry.assets.push({baseGLBSHA256:config.baseGLBSHA256,file:geometryFile,sha256:manifest.geometrySHA256,sourceURL:config.sourceURL,bytes:manifest.bytes,terminals:manifest.terminals,drills:manifest.drills,replacesNodeIds:config.replacesNodeIds,materials:config.materials,materialBindings:config.materialBindings,provenance:{source:'Manufacturer '+config.member,pcbSHA256:data.pcbSHA256,appearance:config.appearanceEvidence,archiveSHA256:config.archiveSHA256}});write('presentation-geometry.json',geometry);
const xs=data.outlineMm.map(p=>p[0]/1000),ys=data.outlineMm.map(p=>p[1]/1000),x0=Math.min(...xs),x1=Math.max(...xs),z0=-Math.min(...ys),z1=-Math.max(...ys);
const layers=manifest.silk.map((layer,i)=>{const top=config.silkFaces[i]==='top',y=top?.000012:-config.thicknessMm/1000-.000012;
 return {...layer,file:copy(layer.file,layer.sha256,'surface-markings','official-pcb-'),corners:[[x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1]],normal:[0,top?1:-1,0]};});
const marks=JSON.parse(fs.readFileSync(path.join(DIR,'surface-markings.json')));marks.assets=marks.assets.filter(a=>a.baseGLBSHA256!==config.baseGLBSHA256);
marks.assets.push({baseGLBSHA256:config.baseGLBSHA256,sourceURL:config.sourceURL,archiveSHA256:config.archiveSHA256,license:config.license,status:'official_pcb_graphics',labelKey:'marks.pcb',layers});write('surface-markings.json',marks);
console.log(JSON.stringify({geometryFile,layers:layers.map(l=>l.file),bytes:manifest.bytes+layers.reduce((n,l)=>n+l.bytes,0)}));
