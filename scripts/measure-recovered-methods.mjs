// Replay identity association on preserved real responses. No images sent, no
// altered detector output and no claim that replay is a fresh AI inference.
import fs from 'node:fs';import path from 'node:path';
import * as old from '../experiments/recovered-methods/baseline-photo-scene.mjs';
import {hash} from '../experiments/board-library/glb.mjs';
import {enrichCatalog} from '../experiments/board-library/catalog-enrichment.mjs';
import {bindPhotoComponents} from '../experiments/board-library/photo-scene.mjs';
import {sourceBacksideCandidates} from '../experiments/board-library/backside-selection.mjs';
const out=process.argv[2];if(!out||fs.existsSync(out))throw Error('Usage: node scripts/measure-recovered-methods.mjs NEW_OUTPUT');fs.mkdirSync(out,{recursive:true});
const read=p=>JSON.parse(fs.readFileSync(p)),write=(p,v)=>fs.writeFileSync(path.join(out,p),JSON.stringify(v,null,2)+'\n');
const compactVerification=v=>({...v,components:v.components.map(c=>{
 const {contour,displayPolygon,...metrics}=c.verification;
 return {...c,verification:{...metrics,contourPoints:contour?.length||0,contourSHA256:contour?hash(JSON.stringify(contour)):null,displayPolygonPoints:displayPolygon?.length||0,displayPolygonSHA256:displayPolygon?hash(JSON.stringify(displayPolygon)):null}};
})});
const base='b79bfbc6e720d8ad654ecb0f3dc9f43475078f71';
const catalogue=enrichCatalog(read('release/catalog/raspberry-pi-5/record.json'),read('experiments/board-library/catalog-enrichment.json'));
const photos=[];
for(const name of ['pi5-final-response','pi5-public-response','pi5-verified-response']){
 const file='docs/jury-evidence/'+name+'.json',r=read(file),at=performance.now(),before=old.bindPhotoComponents(r.proposals,catalogue.components),baselineMs=performance.now()-at;
 const start=performance.now(),after=bindPhotoComponents(r.proposals,catalogue.components),currentMs=performance.now()-start;
 // Persist the actual verification fields as well; the verifier's schema is not guessed.
 photos.push({name,inputRecordSHA256:hash(fs.readFileSync(file)),captureSHA256:r.captureSHA256,newCloudRequests:0,baselineMs,currentMs,
  associationsBefore:before.filter(p=>p.componentId).length,associationsAfter:after.filter(p=>p.componentId).length,
  pixelBackedBefore:before.filter(p=>p.componentId&&r.verification.components.find(v=>v.id===p.id)?.verification.accepted).length,
  pixelBackedAfter:after.filter(p=>p.componentId&&r.verification.components.find(v=>v.id===p.id)?.verification.accepted).length,
  originalVisible:r.visibleCount,geometryUnchanged:true,originalEvidence:file,verification:compactVerification(r.verification),
  rows:after.map((p,i)=>({id:p.id,name:p.name,marking:p.marking,box:p.box,before:before[i].componentId,after:p.componentId,pixelAccepted:r.verification.components.find(v=>v.id===p.id)?.verification.accepted,binding:p.binding}))});
}
write('photo-replay.json',{base,evidenceKind:'real_response_replay_not_new_inference',photos});
const cases=[['nano','.local/recovered-methods/known-board-final/arduino-nano-esp32'],['coral','.local/recovered-methods/coral-source-replay/discovered-303d5ef190ffa846'],['new-board','.local/recovered-methods/new-board-catalog/discovered-b4879717341a87ec']];
const boards=[];
for(const [id,dir] of cases){if(!fs.existsSync(dir+'/record.json'))continue;const r=read(dir+'/record.json'),b=fs.existsSync(dir+'/binding-audit.json')?read(dir+'/binding-audit.json'):null;
 boards.push({case:id,identity:r.identity,recordSHA256:hash(fs.readFileSync(dir+'/record.json')),modelSHA256:r.inventory.sourceHash,modelAvailable:r.modelAvailable??true,
  boundComponents:r.components.length,generatedLessons:r.components.filter(c=>c.educationRule).length,reviewedOrOther:r.components.filter(c=>!c.educationRule).length,
  coverage:r.coverage,timingsMs:r.timingsMs,totalMs:r.totalMs,completion:b?.completion,classes:r.components.reduce((o,c)=>(o[c.educationRule||'reviewed_or_pending']=(o[c.educationRule||'reviewed_or_pending']||0)+1,o),{}),
  registration:r.automaticSurfaces?.registration?{status:r.automaticSurfaces.registration.status,fit:r.automaticSurfaces.registration.fit,heldout:r.automaticSurfaces.registration.heldout,coverage:r.automaticSurfaces.registration.coverage,maxHeldoutErrorMm:r.automaticSurfaces.registration.maxHeldoutErrorMm,policy:r.automaticSurfaces.registration.policy}:null,
  surfaces:r.automaticSurfaces?.files?.map(f=>({kind:f.kind,sha256:f.sha256})),
  sources:(r.onboarding?.resources||r.enrichment?.acquisition?.resources||[]).filter(s=>s.status==='downloaded').map(s=>({url:s.url,sha256:s.sha256,kind:s.kind})),limitations:r.limitations});
}
write('boards.json',{boards});
const work='.local/jury-demo/motor-live-catalog/discovered-1d4f241a74545d8a/reconstruction';
if(!fs.existsSync(work+'/input-manifest.json')){
 write('rear-source-replay.json',{status:'not_run',reason:'private_official_source_dossier_not_present',newCloudRequests:0});
 console.log(JSON.stringify({photos:photos.map(p=>({name:p.name,before:p.pixelBackedBefore,after:p.pixelBackedAfter})),boards:boards.length,rear:'source_dossier_required'}));
 process.exit(0);
}
const manifest=read(work+'/input-manifest.json'),observations=read(work+'/observations.json'),start=performance.now();
const candidates=sourceBacksideCandidates(work,manifest.sources,observations.referenceImageId);
write('rear-source-replay.json',{evidenceKind:'existing_official_sources_reprocessed',manifestSHA256:hash(fs.readFileSync(work+'/input-manifest.json')),candidates,ms:performance.now()-start,newCloudRequests:0,manualChoiceNotRead:true});
console.log(JSON.stringify({photos:photos.map(p=>({name:p.name,before:p.associationsBefore,after:p.associationsAfter,ms:p.currentMs})),boards:boards.map(b=>({case:b.case,bound:b.boundComponents,lessons:b.generatedLessons,totalMs:b.totalMs})),rearCaptionCandidates:candidates.length}));
