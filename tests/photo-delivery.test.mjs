import test from 'node:test';import assert from 'node:assert/strict';
import {parseScene,bindPhotoComponents,SCENE_PROMPT,sceneResponseSchema} from '../experiments/board-library/photo-scene.mjs';
import {Schema} from 'firebase/ai';
import {educationProfileMatches} from '../experiments/board-library/education-profile.mjs';
const identity={schemaVersion:'itc-board-identity/1.0.0',manufacturer:'Test manufacturer',family:null,model:'Test board',hardwareRevision:null,boardId:null,status:'identified',visualEvidence:['printed Test board'],alternatives:[],limitations:[]};
const component={id:'c1',name:'Flash memory',marking:'AB12345',status:'proposed',box:[100,200,300,400],evidence:'Visible rectangular package and readable marking'};
test('Educational text survives a new GLB only with the exact verified CAD source',()=>{
 const entry={id:'generic-board',assetSHA256:'old-glb',stepSHA256:'same-step'},record={id:'generic-board',inventory:{sourceHash:'new-glb'},source:{authority:'official'},conversion:{sourceSHA256:'same-step'}};
 assert.equal(educationProfileMatches(record,entry),true);
 assert.equal(educationProfileMatches({...record,conversion:{sourceSHA256:'different-step'}},entry),false);
 assert.equal(educationProfileMatches({...record,source:{authority:'manual_unverified'}},entry),false);
 assert.equal(educationProfileMatches({...record,id:'different-board'},entry),false);
});
test('Scene preserves observations and enforces identity and image-coordinate contracts',()=>{
 const source={boardPresence:'present',identity,components:[component]},raw=JSON.stringify(source),out=parseScene(raw);assert.equal(out.valid,true);assert.deepEqual(out.components,[component]);assert.equal(raw,JSON.stringify(source));
 for(const box of [[100,200,100,300],[-1,2,3,4],[100,200,300,1001],[1,2,3]])assert.equal(parseScene(JSON.stringify({...source,components:[{...component,box}]})).valid,false);
 assert.equal(parseScene(JSON.stringify({...source,identity:{...identity,status:'partial'}})).valid,false);
 assert.equal(parseScene(JSON.stringify({...source,components:[component,component]})).valid,false);
});
test('Document association abstains on duplicates, ambiguity and unsupported labels',()=>{
 const docs=[{id:'flash',label:'AB12345 flash memory'},{id:'supply',label:'Power supply'}];
 assert.equal(bindPhotoComponents([component],docs)[0].componentId,'flash');
 const duplicate=bindPhotoComponents([component,{...component,id:'c2'}],docs);assert.ok(duplicate.every(p=>p.componentId===null));
 assert.equal(bindPhotoComponents([{...component,status:'ambiguous'}],docs)[0].componentId,null);
 assert.equal(bindPhotoComponents([{...component,name:'Unknown',marking:null}],docs)[0].componentId,null);
 assert.equal(bindPhotoComponents([component],[...docs,{id:'other',label:'AB12345 flash memory'}])[0].componentId,null);
});
test('Multimodal schema is accepted by the installed SDK, with no expected board in prompt',()=>{
 const schema=sceneResponseSchema(Schema).toJSON();assert.equal(schema.properties.components.type,'array');assert.ok(schema.properties.identity);assert.doesNotMatch(SCENE_PROMPT,/Raspberry|Arduino|Coral|ESP32/);
});
