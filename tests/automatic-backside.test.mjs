import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {hash} from '../experiments/board-library/glb.mjs';
import {sourceBacksideCandidates,buildBacksideRequest,proposeBackside} from '../experiments/board-library/backside-selection.mjs';
import {validateBacksideProposal} from '../experiments/board-library/backside-contract.mjs';
import {prepareReconstructionBackside} from '../experiments/board-library/reconstruction-backside.mjs';
import {Schema} from 'firebase/ai';
import {backsideSchema} from '../experiments/board-library/backside-contract.mjs';
const selected={status:'selected',sourceId:'b',clockwiseRotationDeg:90,mirrored:false,faceEvidence:'Solder-side pads are visible.',orientationEvidence:'Asymmetric cutout and connector order agree.',alternatives:[],reason:'Distinct reverse face and orientation.'};
function fixture(t,caption=''){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'itc-back-auto-')),work=path.join(dir,'reconstruction');fs.mkdirSync(work);t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const html=`<p>Back of the board.</p><img src="/b.png" alt="${caption}"><img src="/a.png" alt="front view">`;fs.writeFileSync(path.join(dir,'page.html'),html);
 const sources=[{id:'page',url:'https://maker.example/product',file:'page.html',sha256:hash(html),mimeType:'text/html'},...['a','b'].map(id=>{const bytes=Buffer.from('fixture '+id);fs.writeFileSync(path.join(work,id+'.png'),bytes);return {id,url:`https://maker.example/${id}.png`,file:`reconstruction/${id}.png`,mimeType:'image/png',decodedSHA256:hash(bytes)};})];
 const observations={referenceImageId:'a',board:{corners:[[0,0],[1000,0],[1000,1000],[0,1000]]}};fs.writeFileSync(path.join(work,'observations.json'),JSON.stringify(observations));
 return {work,sources,observations};
}
const registration=choice=>({sourceId:choice.sourceId,selectionOrigin:choice.mode,selection:choice,sourceSHA256:choice.sourceSHA256,cornersPixels:[[1,1],[2,1],[2,2],[1,2]]});
const saved=work=>JSON.parse(fs.readFileSync(path.join(work,'presentation.json'))).backside;
test('only a caption attached to the exact image may identify a source face',t=>{
 for(const caption of ['', 'Product photo', 'Front and back', 'Pinout bottom', 'Not the back']){const f=fixture(t,caption);assert.equal(sourceBacksideCandidates(f.work,f.sources,'a').length,0);}
 const f=fixture(t,'Rear view');assert.equal(sourceBacksideCandidates(f.work,f.sources,'a')[0].source.id,'b');
 fs.appendFileSync(path.join(f.work,'..','page.html'),'changed');assert.throws(()=>sourceBacksideCandidates(f.work,f.sources,'a'),/document_changed/);
});
test('Gemini can abstain; unknown/front/mirrored/ambiguous choices cannot apply',t=>{
 const f=fixture(t);assert.equal(validateBacksideProposal(selected,f.sources,'a').id,'b');
 assert.equal(validateBacksideProposal({...selected,status:'unknown',sourceId:null,clockwiseRotationDeg:null},f.sources,'a'),null);
 for(const patch of [{sourceId:'a'},{sourceId:'x'},{mirrored:true},{clockwiseRotationDeg:42},{orientationEvidence:''},{alternatives:['a']},{status:'unknown'}])assert.throws(()=>validateBacksideProposal({...selected,...patch},f.sources,'a'));
});
test('request uses full hashed images and front axes; no manual review or old registration',t=>{
 const f=fixture(t),before=buildBacksideRequest(f.work,f.sources,f.observations);
 fs.writeFileSync(path.join(f.work,'backside-review.json'),'{"sourceId":"b"}');fs.writeFileSync(path.join(f.work,'presentation.json'),'{"backside":{"cornersPixels":[[444,333]]}}');
 assert.deepEqual(buildBacksideRequest(f.work,f.sources,f.observations),before);assert.equal(before.parts.filter(p=>p.inlineData).length,2);
 fs.appendFileSync(path.join(f.work,'b.png'),'modified');assert.throws(()=>buildBacksideRequest(f.work,f.sources,f.observations),/image_changed/);
});
test('unique source orientation applies without invoking Gemini',async t=>{
 const f=fixture(t,'Reverse PCB rear view');let cloud=0;
 const audit=await prepareReconstructionBackside(f.work,f.sources,{propose:async()=>{cloud++;throw Error('must_not_call');},verify:async(_,c)=>c.clockwiseRotationDeg===90?{status:'verified',registration:registration(c)}:{status:'rejected',reason:'geometry'}});
 assert.equal(cloud,0);assert.equal(audit.attempts.length,4);assert.equal(audit.status,'applied');assert.equal(audit.selectionOrigin,'verified_source_caption');assert.equal(saved(f.work).selection.clockwiseRotationDeg,90);
});
test('multiple passing source orientations fall back once; uncertainty leaves no texture',async t=>{
 const f=fixture(t,'Rear view');let cloud=0;
 const audit=await prepareReconstructionBackside(f.work,f.sources,{propose:async()=>{cloud++;return {status:'pending',reason:'gemini_ambiguous'};},verify:async(_,c)=>({status:'verified',registration:registration(c)})});
 assert.equal(cloud,1);assert.equal(audit.sourceReason,'source_orientation_ambiguous');assert.equal(audit.status,'pending');assert.equal(saved(f.work),null);
});
test('Gemini proposal always goes through registration, never through a human label',async t=>{
 const f=fixture(t),choice={schema:'backside-choice/1',mode:'gemini_proposal',sourceId:'b',sourceSHA256:f.sources[2].decodedSHA256,sourceURL:f.sources[2].url,clockwiseRotationDeg:90,note:'Model proposal'};let checks=0;
 const audit=await prepareReconstructionBackside(f.work,f.sources,{propose:async()=>({status:'proposed',choice}),verify:async(_,c)=>{checks++;assert.deepEqual(c,choice);return {status:'verified',registration:registration(c)};}});
 assert.equal(checks,1);assert.equal(audit.status,'applied');assert.equal(audit.automaticFaceIdentification,true);assert.equal(saved(f.work).manualReview,undefined);
 const failed=await prepareReconstructionBackside(f.work,f.sources,{propose:async()=>({status:'proposed',choice}),verify:async()=>({status:'rejected',reason:'back_hole_registration_rejected'})});
 assert.equal(failed.status,'pending');assert.equal(saved(f.work),null);assert.equal(failed.reason,'back_hole_registration_rejected');
});
test('invalid Gemini content retains measured request evidence while abstaining',async t=>{
 const f=fixture(t),result=await proposeBackside(f.work,f.sources,f.observations,{analyse:async()=>({parsed:{...selected,sourceId:'invented'},requests:1,inferenceMs:125,inferenceSource:'in_cloud'})});
 assert.equal(result.status,'pending');assert.equal(result.inference.newRequests,1);assert.equal(result.inference.inferenceMs,125);
});
test('manual choice takes precedence and remains explicitly manual',async t=>{
 const f=fixture(t),s=f.sources[2],review={schema:'manual-backside-source/1',mode:'manual_selection',sourceId:s.id,sourceSHA256:s.decodedSHA256,sourceURL:s.url,orientation:'upright_back_view',reviewedBy:'fixture',note:'Test manual path'};
 fs.writeFileSync(path.join(f.work,'backside-review.json'),JSON.stringify(review));
 const audit=await prepareReconstructionBackside(f.work,f.sources,{propose:async()=>{throw Error('must_not_call');},verify:async(_,c)=>({status:'verified',registration:registration(c)})});
 assert.equal(audit.status,'applied');assert.equal(audit.selectionOrigin,'manual_selection');assert.equal(audit.automaticFaceIdentification,false);
});
test('Firebase SDK accepts the proposal schema including nullable abstention',()=>{
 assert.ok(backsideSchema(Schema));
});
test('failed real adapter preserves transport accounting without applying artwork',async t=>{
 const f=fixture(t),r=await proposeBackside(f.work,f.sources,f.observations,{analyse:async()=>{throw Object.assign(Error('transport_failed'),{inferenceRecord:{requests:1,totalMs:400,status:'failed'}});}});
 assert.equal(r.status,'pending');assert.equal(r.reason,'transport_failed');assert.equal(r.inference.newRequests,1);assert.equal(r.choice,undefined);
});
