// Evaluation only: this file is never imported by the detector or browser bundle.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {enrichCatalog} from '../board-library/catalog-enrichment.mjs';
import {bindPhotoComponents} from '../board-library/photo-scene.mjs';
import {photoEvidenceTrace} from '../board-library/photo-evidence-trace.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const out=path.resolve(process.argv[2]||'experiments/photo-evidence-v2/results');
fs.mkdirSync(out,{recursive:true});
const save=(p,v)=>fs.writeFileSync(path.join(out,p),JSON.stringify(v,null,2)+'\n');
const registry=read('experiments/board-library/catalog-enrichment.json');
const record=enrichCatalog(read('release/catalog/raspberry-pi-5/record.json'),registry);
const initial=read('experiments/cad-viewer/components.json').components[0];
const provenance=read('experiments/cad-viewer/public/provenance.json');
const pi=registry.assets.find(a=>a.assetSHA256===record.inventory.sourceHash);
const historical=[{id:initial.id,label:initial.label,sourceParts:[{name:initial.sourceProduct,boundsMm:initial.expectedBoundsMm}],
 source:initial.source,decision:initial.binding,commit:'095c124c619cee6cc740fbc1e36eec87c7415159',directClickEvidence:'experiments/cad-viewer/evidence/browser-results.json'},
 ...pi.components.map(c=>({id:c.id,label:c.label,sourceParts:c.sourceParts,source:c.sources,
 decision:c.bindingEvidence,commit:'521d2e04b9869c7f865f376198d6af5278dc6ae3',
 directClickEvidence:['ram','ethernet','usb3'].includes(c.id)?'docs/review-metrics/catalog-visibility.json (subset UI checks)':'not individually recorded'}))];
for(const c of historical){
 c.parts=c.sourceParts.map(p=>({name:p.name,boundsMm:p.boundsMm,meshes:provenance.parts.filter(m=>m.name===p.name||m.productPath.includes(p.name)).map(m=>({meshId:m.meshId,triangles:m.triangles,ranges:m.ranges}))}));
 c.identityDecision='human_official_photo_and_layout_review';
 c.algorithmicSteps=['STEP tessellation','source part triangle provenance','hash-pinned catalogue patch','triangle partition','raycast to exact mesh','bilingual card retrieval'];
 c.notDemonstrated=['automatic semantic attribution of anonymous solids','photo detection','independent photographic CAD registration'];
 c.automatableWithoutNewEvidence=['extract solid bounds and hierarchy','preserve and validate mesh ranges','reject overlapping ownership','build review dossier','retrieve existing documentary lesson'];
 c.missingForAutonomousSemanticBinding='A semantic CAD/ECAD designator, or independently validated reference-image-to-solid correspondences. Anonymous OBJ labels and a broad product page do not establish this link.';
}
save('historical-16.json',{schema:'historical-binding-audit/1',evaluationOnly:true,modelSHA256:record.inventory.sourceHash,sourceSHA256:provenance.sourceSHA256,
 inputs:['experiments/cad-viewer/components.json','experiments/board-library/catalog-enrichment.json','experiments/cad-viewer/public/provenance.json'].map(file=>({file,sha256:hash(file)})),
 originalMeshVerification:read('experiments/cad-viewer/evidence/model-verification.json'),associations:historical});
const replay=[];
for(const file of fs.readdirSync('docs/jury-evidence').filter(f=>/^pi5.*response.json$/.test(f))){
 const d=read('docs/jury-evidence/'+file),bindings=bindPhotoComponents(d.proposals||[],record.components);
 const trace=photoEvidenceTrace(d.proposals||[],d.verification,bindings,record.components,bindings.filter(b=>b.componentId).map(b=>b.id));
 replay.push({file,sha256:hash('docs/jury-evidence/'+file),captureSHA256:d.captureSHA256,kind:'saved_inference_replay_no_new_cloud_call',
  originalIdentity:d.validation?.identity,originalVisibleCount:d.visibleCount??null,originalBindings:d.bindings?.map(b=>({id:b.id,componentId:b.componentId,status:b.binding.status})),
  trace,newManualEvaluation:false,actualCardOpenCountKnown:false,timingsMs:d.timingsMs});
}
save('historical-losses.json',replay);
console.log(JSON.stringify({historicalAssociations:historical.length,photographs:replay.length,counts:replay.map(r=>({file:r.file,...r.trace.counts}))},null,2));
