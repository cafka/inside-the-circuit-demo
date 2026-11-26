import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {enrichCatalog} from '../experiments/board-library/catalog-enrichment.mjs';
import {componentAvailability} from '../experiments/board-library/component-availability.mjs';
import {educationalSurface} from '../experiments/board-library/educational-surfaces.mjs';
const require=createRequire(new URL('../experiments/cad-viewer/package.json',import.meta.url));
const THREE=require('three'),root=new URL('../',import.meta.url);
const read=p=>JSON.parse(fs.readFileSync(new URL(p,root)));
const data=read('experiments/board-library/catalog-enrichment.json');
const education=read('experiments/board-library/board-education.json');

test('Pinned review replaces automatic ECAD ownership without duplicate selectable geometry',()=>{
 const record={inventory:{sourceHash:'asset',nodes:[{id:'mesh',index:1,mesh:0,path:['root','body']}]},components:[{id:'auto',nodeIds:['mesh'],geometryEvidence:{status:'verified'},educationPolicy:'documented-component-lessons/2'}]};
 const patches={version:'test',assets:[{assetSHA256:'asset',components:[{id:'reviewed',selector:{path:['root','body']}}]}]};
 const before=JSON.stringify(record),result=enrichCatalog(record,patches);
 assert.deepEqual(result.components.map(c=>c.id),['reviewed']);assert.deepEqual(result.components[0].nodeIds,['mesh']);
 assert.equal(result.catalogueEnrichment.replacedAutomatic.length,1);assert.equal(JSON.stringify(record),before);
 const conflict=structuredClone(record);delete conflict.components[0].educationPolicy;
 assert.throws(()=>enrichCatalog(conflict,patches),/reviewed_catalogue_geometry_conflict/);
});
test('Pinned reviewed lessons preserve pending and technical entries on all four boards',()=>{
 for(const [id,count,technical,pending] of [['raspberry-pi-5',16,0,0],['arduino-nano-esp32',9,0,0],['discovered-303d5ef190ffa846',9,220,0],['discovered-1d4f241a74545d8a',13,0,13]]){
  const input=read(`release/catalog/${id}/record.json`),before=JSON.stringify(input),record=enrichCatalog(input,data),cards=education.boards.find(p=>p.id===id)?.componentCards||{};
  const states=record.components.map(c=>componentAvailability(c,{profileCard:!!cards[c.id]}));
  assert.equal(states.filter(s=>s.kind==='educational').length,count);assert.equal(states.filter(s=>s.kind==='technical').length,technical);assert.equal(states.filter(s=>s.review==='pending').length,pending);
  assert.equal(JSON.stringify(input),before);const nodes=record.components.flatMap(c=>c.nodeIds);assert.equal(new Set(nodes).size,nodes.length);
  for(const patch of data.assets.find(a=>a.assetSHA256===input.inventory.sourceHash)?.components||[]){assert.ok(patch.bindingEvidence);for(const lang of ['es','en'])for(const key of ['label','description','example','technicalReference'])assert.ok(patch.translations[lang][key]);assert.ok(patch.sources.every(s=>s.url.startsWith('https://')));}
  const changed=structuredClone(input);changed.inventory.sourceHash='different asset';assert.equal(enrichCatalog(changed,data),changed);
 }
});
test('CAD partitions exactly match the original source-part provenance and never overlap',()=>{
 const p=read('experiments/cad-viewer/public/provenance.json'),asset=data.assets[0],seen=new Set();
 for(const c of asset.components)for(const r of c.geometryRanges){const source=p.parts.find(x=>x.name===r.part);assert.ok(source.ranges.some(s=>s.batch===r.batch&&s.firstTriangle===r.firstTriangle&&s.triangleCount===r.triangleCount));for(let i=r.firstTriangle;i<r.firstTriangle+r.triangleCount;i++){const key=r.batch+':'+i;assert.ok(!seen.has(key));seen.add(key);}}
});
test('Triangle partition keeps every face once, with original attributes, material and placement',async()=>{
 const b=await build({entryPoints:[fileURLToPath(new URL('experiments/board-library/geometry-partitions.mjs',root))],bundle:true,write:false,format:'esm',platform:'node',nodePaths:[fileURLToPath(new URL('experiments/cad-viewer/node_modules',root))]});
 const {partitionGeometry}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
 const g=new THREE.BoxGeometry(3,2,1),m=new THREE.Mesh(g,Array.from({length:6},()=>new THREE.MeshStandardMaterial()));m.userData.catalogNodeId='original';m.position.set(3,4,5);new THREE.Group().add(m);
 const indices=Array.from(g.index.array),attrs=g.attributes,materials=m.material;
 const meshes=partitionGeometry([m],[{sourceNodeId:'original',nodeId:'a',nodeIndex:1,ranges:[{firstTriangle:2,triangleCount:2}]},{sourceNodeId:'original',nodeId:'b',nodeIndex:2,ranges:[{firstTriangle:8,triangleCount:1}]}]);
 assert.equal(meshes.reduce((n,m)=>n+m.geometry.index.count,0),indices.length);
 const faces=meshes.flatMap(m=>Array.from({length:m.geometry.index.count/3},(_,i)=>Array.from(m.geometry.index.array.slice(i*3,i*3+3)).join(','))).sort();
 assert.deepEqual(faces,Array.from({length:indices.length/3},(_,i)=>indices.slice(i*3,i*3+3).join(',')).sort());
 for(const mesh of meshes){assert.equal(mesh.geometry.attributes.position,attrs.position);for(let i=0;i<materials.length;i++)assert.equal(mesh.material[i],materials[i]);assert.deepEqual(mesh.position.toArray(),[3,4,5]);assert.ok(!mesh.geometry.boundingBox.isEmpty());}
 assert.deepEqual(meshes[1].geometry.groups,[{start:0,count:6,materialIndex:1}]);
 assert.throws(()=>partitionGeometry([m],[{sourceNodeId:'original',ranges:[{firstTriangle:0,triangleCount:1},{firstTriangle:0,triangleCount:1}]}]),/overlap/);
});
test('Illustrative relief marks only the observed planar face, not invented sides',()=>{
 const face=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:new THREE.Texture()}));
 const side=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),face.material),c={geometryEvidence:{status:'educational_relief_unknown_height'}};
 assert.equal(educationalSurface(face,c),true);assert.equal(educationalSurface(side,c),false);assert.equal(educationalSurface(side,{}),true);
 face.material.map=null;assert.equal(educationalSurface(face,c),false);
});
