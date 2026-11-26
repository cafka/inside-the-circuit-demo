import test from 'node:test';import assert from 'node:assert/strict';
import {completeDocumentedComponents} from '../experiments/board-library/documented-components.mjs';
import {bindPhotoComponents} from '../experiments/board-library/photo-scene.mjs';
import {linkedImageCaptions,explicitRearCaption} from '../experiments/board-library/source-image-captions.mjs';
const inventory={nodes:[1,2,3,4].map(i=>({id:'mesh-'+i,index:i,mesh:i,name:'anonymous-'+i}))};
function evidence(){return {surfaces:{registration:{status:'verified',heldout:2,namedPairs:[{component:0,nodes:[1,2],errorMm:.01,independent:false},{component:1,nodes:[3],errorMm:.02,independent:true},{component:2,nodes:[4],errorMm:.01,independent:true}]}},physicalData:{member:'Independent.PcbDoc',sha256:'source',components:[{designator:'Q19',description:'MOSFET N-CH 30V'},{designator:'C47',description:'CAP, CER, 10uF'},{designator:'Z8',description:'unknown package'}]},ecad:[{asset:{url:'https://maker.example/design.zip'}}]};}
test('verified multi-mesh named groups become components; reviewed ownership wins',()=>{
 const input=evidence(),old={id:'reviewed',nodeIds:['mesh-1','mesh-2'],nodeIndices:[1,2],description:'Reviewed text'},before=JSON.stringify(input);
 const r=completeDocumentedComponents(inventory,input,[old]);assert.equal(r.components.length,3);assert.deepEqual(r.components[0],old);
 assert.equal(r.completion.added,2);assert.equal(r.generatedCards,1);assert.equal(r.components[1].educationRule,'capacitor');assert.equal(r.components[2].educationStatus,'technical_record_function_pending');
 assert.equal(JSON.stringify(input),before);assert.equal(r.completion.skipped[0].reason,'existing_geometry_association_preserved');
 const all=completeDocumentedComponents(inventory,input);assert.deepEqual(all.components[0].nodeIndices,[1,2]);assert.equal(all.generatedCards,2);
});
test('failed registration, reused meshes and duplicate electrical identities cannot supply verified components',()=>{
 const bad=evidence();bad.surfaces.registration.status='ambiguous';bad.ecad=[];
 assert.equal(completeDocumentedComponents(inventory,bad).components.length,0);
 const overlap=evidence();overlap.surfaces.registration.namedPairs[1].nodes=[2];assert.equal(completeDocumentedComponents(inventory,overlap).components.length,1);
 const duplicate=evidence();duplicate.physicalData.components[1].designator='Q19';assert.equal(completeDocumentedComponents(inventory,duplicate).components.length,1);
});
test('documentary vocabulary preserves identities, repeated connectors and visual uncertainty',()=>{
 const proposal=(name,marking=null,id='p')=>({id,name,marking,status:'proposed',box:[1,2,3,4]});
 const cards=[{id:'one',label:'USB-C power input',translations:{en:{technicalReference:'USB-C · documented port'}}},{id:'two',label:'Signal controller',translations:{en:{technicalReference:'XY74'}}},{id:'three',label:'PCI Express connector'}];
 for(const [p,id] of [[proposal('USB Type-C Port'),'one'],[proposal('XY74 Chip'),'two'],[proposal('PCIe Connector'),'three']]){const r=bindPhotoComponents([p],cards)[0];assert.equal(r.componentId,id);assert.deepEqual(r.box,p.box);assert.equal(r.binding.notIndependentSemanticVerification,true);}
 assert.equal(bindPhotoComponents([proposal('USB Type-C Port')],[...cards,{id:'four',label:'USB-C data port'}])[0].componentId,null);
 assert.equal(bindPhotoComponents([proposal('USB Type-C Port','XY74')],cards)[0].componentId,null);
 assert.equal(bindPhotoComponents([{...proposal('XY74 Chip'),status:'ambiguous'}],cards)[0].componentId,null);
 assert.equal(bindPhotoComponents([proposal('unknown')],cards)[0].componentId,null);
});
test('rear captions follow exact image links across responsive and structured publisher markup',()=>{
 const base='https://maker.example/product';const html=`<p>back view elsewhere</p><img src='/a.png' alt='Product'>
 <figure><img src='/b.png'><figcaption>Rear view</figcaption></figure>
 <picture><source srcset='/c-large.png 2x, /c-small.png 1x'><img src='/c.png' alt='Underside photograph'></picture>
 <script type='application/ld+json'>{"@type":"ImageObject","contentUrl":"/d.png","caption":"Bottom side"}</script>
 <figure><img src='/x.png'><img src='/y.png'><figcaption>Back</figcaption></figure>`;
 const found=linkedImageCaptions(html,base).filter(x=>explicitRearCaption(x.caption));
 assert.deepEqual([...new Set(found.map(x=>new URL(x.url).pathname))].sort(),['/b.png','/c-large.png','/c-small.png','/c.png','/d.png']);
 assert.equal(explicitRearCaption('Front and back'),false);assert.equal(explicitRearCaption('Not the rear'),false);
 assert.equal(linkedImageCaptions('<img src="/back.png" alt="Product photo">',base).filter(x=>explicitRearCaption(x.caption)).length,0);
});
