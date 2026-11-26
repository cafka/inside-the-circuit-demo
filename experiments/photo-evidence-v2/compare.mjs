// Offline evaluation of saved outputs. Never imported by the inference client.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {enrichCatalog} from '../board-library/catalog-enrichment.mjs';
import {bindPhotoComponents} from '../board-library/photo-scene.mjs';
import {photoEvidenceTrace} from '../board-library/photo-evidence-trace.mjs';
import {termPolicy} from '../board-library/component-terms.mjs';
const directory=path.resolve(process.argv[2]||'experiments/photo-evidence-v2/results/live');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const record=enrichCatalog(read('release/catalog/raspberry-pi-5/record.json'),read('experiments/board-library/catalog-enrichment.json'));
const rows=[];
for(const name of fs.readdirSync(directory).filter(n=>n.endsWith('-live.json'))){
 const file=path.join(directory,name),d=read(file),original=JSON.parse(d.raw);
 const result={file:name,artifactSHA256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  evidenceKind:'saved_live_inference_and_recorded_UI_actions',captureSHA256:d.captureSHA256,status:d.status,
  claimedModel:original.identity?.model,rawProposed:original.components.length,parsedProposed:d.proposals.length,
  identityGate:d.identityGate??null,actualCounts:d.evidenceTrace?.counts??null,
  acceptedPixelIds:d.verification?.components.filter(c=>c.verification.accepted).map(c=>c.id)??[],
  timingsMs:d.timingsMs,usageMetadata:d.usageMetadata,modelVersion:d.modelVersion,
  runtimeRoute:d.inferenceSource,modelRequested:d.requestedCloudModel};
 // Do not inject the Pi catalogue into a response for a different/undetermined board.
 if(d.status==='identified'&&d.savedBoardId==='raspberry-pi-5'){
  const bindings=bindPhotoComponents(d.proposals,record.components);
  const trace=photoEvidenceTrace(d.proposals,d.verification,bindings,record.components,bindings.filter(b=>b.componentId).map(b=>b.id));
  result.offlineBindingReplay={termPolicy,kind:'no_new_inference_no_new_pixel_test_no_UI_click',trace};
  result.seedEqualsBox=d.proposals.filter(p=>JSON.stringify(p.visiblePolygon)===JSON.stringify([[p.box[1],p.box[0]],[p.box[3],p.box[0]],[p.box[3],p.box[2]],[p.box[1],p.box[2]]])).map(p=>p.id);
 }
 rows.push(result);
}
const inputTokens=rows.reduce((s,r)=>s+(r.usageMetadata?.promptTokenCount||0),0);
const outputTokens=rows.reduce((s,r)=>s+(r.usageMetadata?.candidatesTokenCount||0),0);
const report={schema:'photo-evidence-comparison/1',rows,cost:{inputTokens,outputTokens,inputUSDPerMillion:.30,outputUSDPerMillion:2.50,
 estimatedUSD:inputTokens*.30/1e6+outputTokens*2.50/1e6,billingConsoleObservedThisRun:false,pricingSource:'https://ai.google.dev/gemini-api/docs/pricing'},
 independentSemanticGroundTruth:false,expandedFiveBoardTest:'not_started_Pi5_coverage_prerequisite_not_met'};
fs.writeFileSync('experiments/photo-evidence-v2/results/comparison.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({rows:rows.map(r=>({file:r.file,raw:r.rawProposed,actual:r.actualCounts,replay:r.offlineBindingReplay?.trace.counts})),cost:report.cost},null,2));
