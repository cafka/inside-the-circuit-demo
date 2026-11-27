// EVALUATION ONLY. Run after saving the original inference. Never imported by a client.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {GLTFLoader} from './dependencies.mjs';
import {bindPhotoComponents} from '../board-library/photo-scene.mjs';
import {enrichCatalog} from '../board-library/catalog-enrichment.mjs';
const [inputs,calls,out,historicalFile,geometryFile,educationalFile,registryFile]=process.argv.slice(2);
const read=p=>JSON.parse(fs.readFileSync(p)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const inventory=read(path.join(inputs,'candidates.json')),history=read(historicalFile);
const bytes=fs.readFileSync(geometryFile),scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'')).scene;
let meshes=[];scene.traverse(o=>{if(o.isMesh){let names=[],node=o;while(node){names.push(node.name);node=node.parent;}meshes.push(names);}});
const groups=inventory.candidates.map(c=>{
 const names=new Set(c.meshIds.flatMap(i=>meshes[i]));return {candidateId:c.id,historicalOverlap:history.associations.filter(h=>h.sourceParts.some(p=>names.has(p.name))).map(h=>({id:h.id,label:h.label,sourcePartsFound:h.sourceParts.filter(p=>names.has(p.name)).map(p=>p.name),sourcePartsMissing:h.sourceParts.filter(p=>!names.has(p.name)).map(p=>p.name)}))};
});
const rows=[];for(const name of ['baseline-target-a','cad-target-a','cad-target-b']){
 const b=fs.readFileSync(path.join(calls,name+'.json')),call=JSON.parse(b);
 rows.push({case:name,responseSHA256:sha(b),status:call.status,inferenceMs:call.inferenceMs,totalMs:call.totalMs,estimatedCostUSD:call.estimatedCostUSD,proposed:call.parsed.items?.length??call.parsed.components?.length,items:call.parsed.items?.map(p=>({candidateId:p.candidateId,name:p.name,status:p.status,alternatives:p.alternatives,documentLineIds:p.documentLineIds,...groups.find(g=>g.candidateId===p.candidateId)}))});
}
const catalogue=registryFile?enrichCatalog(read(educationalFile),read(registryFile)):read(educationalFile);const baseline=read(path.join(calls,'baseline-target-a.json'));
const components=Array.isArray(catalogue)?catalogue:catalogue.components;
const baselineBindings=bindPhotoComponents(baseline.parsed.components,components);
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'evaluation.json'),JSON.stringify({schema:'cad-association-evaluation/1',evaluationOnly:true,historicalTableSHA256:sha(fs.readFileSync(historicalFile)),responsesFrozenBeforeEvaluation:true,groupCoverage:groups,calls:rows,baselineBindings,limits:['Historical curated associations are a reference, not independent truth.','CAD overlap does not prove a semantic identity or correct photo location.','Coarse identity and localization require post-inference review recorded separately.']},null,2));
console.log(JSON.stringify(rows.map(r=>({case:r.case,proposed:r.proposed,cost:r.estimatedCostUSD}))));
