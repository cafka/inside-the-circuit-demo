import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateBacksideReview,prepareReconstructionBackside} from '../experiments/board-library/reconstruction-backside.mjs';

const source={id:'image-7',url:'https://manufacturer.example/rear.png',mimeType:'image/png',decodedSHA256:'bytes'};
const review={schema:'manual-backside-source/1',mode:'manual_selection',sourceId:source.id,sourceSHA256:'bytes',sourceURL:source.url,orientation:'upright_back_view',reviewedBy:'test reviewer',note:'Manual face and orientation check'};
test('backside source requires explicit review tied to exact bytes and URL',()=>{
 assert.equal(validateBacksideReview(review,[source]),source);
 for(const change of [{sourceSHA256:'different'},{sourceURL:'https://other.example/image.png'},{mode:'automatic'},{orientation:null},{note:''}])assert.throws(()=>validateBacksideReview({...review,...change},[source]));
});
test('no manual choice clears stale calibration while preserving its evidence',async t=>{
 const work=fs.mkdtempSync(path.join(os.tmpdir(),'itc-back-review-'));t.after(()=>fs.rmSync(work,{recursive:true,force:true}));
 const previous=JSON.stringify({backside:{sourceId:'old',cornersPixels:[[1,2]]}});fs.writeFileSync(path.join(work,'presentation.json'),previous);
 fs.writeFileSync(path.join(work,'observations.json'),JSON.stringify({referenceImageId:'front'}));
 const audit=await prepareReconstructionBackside(work,[source],{propose:async()=>({status:'pending',reason:'gemini_unknown'})});
 assert.equal(audit.status,'pending');assert.equal(audit.automaticFaceIdentification,false);
 assert.equal(JSON.parse(fs.readFileSync(path.join(work,'presentation.json'))).backside,null);
 const backup=fs.readdirSync(work).find(x=>x.startsWith('previous-presentation-'));assert.equal(fs.readFileSync(path.join(work,backup),'utf8'),previous);
 fs.writeFileSync(path.join(work,'backside-review.json'),JSON.stringify({...review,sourceSHA256:'changed'}));
 assert.equal((await prepareReconstructionBackside(work,[source])).status,'blocked');
 assert.equal(JSON.parse(fs.readFileSync(path.join(work,'presentation.json'))).backside,null);
});
test('new orchestration has no trial-board dispatch or coordinates',()=>{
 for(const file of ['cad-graphics-enrichment.mjs','reconstruction-backside.mjs','verify-graphics-frame.py']){
  assert.doesNotMatch(fs.readFileSync(new URL('../experiments/board-library/'+file,import.meta.url),'utf8'),/Raspberry|Coral|Arduino|ESP32|Pimoroni|motor.?2040/i);
 }
});
