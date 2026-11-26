// Diagnostic only. Never writes into a catalogue or overrides the selection gate.
import fs from 'node:fs';import path from 'node:path';
import {hash} from '../experiments/board-library/glb.mjs';
import {verifyBacksideChoice} from '../experiments/board-library/reconstruction-backside.mjs';
const [sourceWork,resultFile,out]=process.argv.slice(2);if(!out||fs.existsSync(out))throw Error('new_diagnostic_output_required');
const original=JSON.parse(fs.readFileSync(resultFile)),p=original.parsed;
if(original.status!=='completed'||original.inferenceSource!=='in_cloud'||p?.status!=='selected')throw Error('real_selected_proposal_required');
const manifest=JSON.parse(fs.readFileSync(path.join(sourceWork,'input-manifest.json'))),source=manifest.sources.find(s=>s.id===p.sourceId);
if(!source||p.mirrored||![0,90,180,270].includes(p.clockwiseRotationDeg))throw Error('unsupported_candidate');
const work=path.resolve(out,'reconstruction');fs.mkdirSync(work,{recursive:true});
const bytes=fs.readFileSync(path.resolve(sourceWork,'..',source.file));if(hash(bytes)!==source.decodedSHA256)throw Error('source_changed');
const file=`reconstruction/${source.id}.png`;fs.writeFileSync(path.resolve(out,file),bytes);
fs.writeFileSync(path.join(work,'input-manifest.json'),JSON.stringify({sources:[{...source,file}]}));
fs.copyFileSync(path.join(sourceWork,'observations.json'),path.join(work,'observations.json'));
const choice={schema:'backside-choice/1',mode:'gemini_proposal',sourceId:source.id,sourceSHA256:source.decodedSHA256,sourceURL:source.url,clockwiseRotationDeg:p.clockwiseRotationDeg,note:p.reason,faceEvidence:p.faceEvidence,orientationEvidence:p.orientationEvidence,diagnosticOnly:true,unresolvedAlternatives:p.alternatives,requestSHA256:original.requestSHA256};
const start=performance.now(),result=await verifyBacksideChoice(work,choice);
const report={diagnosticOnly:true,appliedToCatalogue:false,productionDecision:'pending; ambiguity not overridden',originalProposal:p,result,elapsedMs:performance.now()-start};
fs.writeFileSync(path.resolve(out,'diagnostic.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
