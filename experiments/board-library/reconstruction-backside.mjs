import fs from 'node:fs';
import path from 'node:path';
import {DIR,saveJSON} from './catalog.mjs';
import {hash} from './glb.mjs';
import {subprocess} from './pipeline.mjs';
import {sourceBacksideCandidates,proposeBackside} from './backside-selection.mjs';
import {backsidePolicy} from './backside-contract.mjs';

export function validateBacksideReview(review,sources){
 if(review?.schema!=='manual-backside-source/1'||review.mode!=='manual_selection'||!review.note?.trim()||!review.reviewedBy?.trim())throw Error('backside_manual_review_required');
 if(review.orientation!=='upright_back_view')throw Error('backside_orientation_review_required');
 const source=sources.find(s=>s.id===review.sourceId);
 if(!source||source.mimeType!=='image/png'||source.decodedSHA256!==review.sourceSHA256||source.url!==review.sourceURL)throw Error('backside_review_source_mismatch');
 return source;
}

export async function verifyBacksideChoice(work,choice){
 // Keep the filename short enough for existing Windows catalogue paths.
 // The full proposal digest remains in the recorded choice/audit.
 const file=path.join(work,'back-choice-'+hash(JSON.stringify(choice)).slice(0,16)+'.json');saveJSON(file,choice);
 saveJSON(path.join(work,'presentation.json'),{backside:null});
 try{await subprocess('python',[path.join(DIR,'prepare-reconstruction-back.py'),work,choice.sourceId,'--review',file]);return {status:'verified',registration:JSON.parse(fs.readFileSync(path.join(work,'presentation.json'))).backside};}
 catch(e){return {status:'rejected',reason:e.message};}
}

export async function prepareReconstructionBackside(work,sources,{propose=proposeBackside,verify=verifyBacksideChoice}={}){
 const at=performance.now(),file=path.join(work,'backside-review.json'),presentation=path.join(work,'presentation.json');
 if(fs.existsSync(presentation)){const bytes=fs.readFileSync(presentation);fs.copyFileSync(presentation,path.join(work,'previous-presentation-'+hash(bytes)+'.json'));}
 saveJSON(presentation,{backside:null});
 const audit={policy:backsidePolicy.version,status:'pending',automaticFaceIdentification:false,attempts:[]};let accepted=null;
 const attempt=async choice=>{const result=await verify(work,choice);audit.attempts.push({sourceId:choice.sourceId,mode:choice.mode,clockwiseRotationDeg:choice.clockwiseRotationDeg??0,...result});return result;};
 try{
  if(fs.existsSync(file)){
   const review=JSON.parse(fs.readFileSync(file));validateBacksideReview(review,sources);
   const result=await attempt(review);audit.selectionOrigin='manual_selection';
   if(result.status==='verified')accepted=result.registration;else audit.reason=result.reason;
  }else{
   const observations=JSON.parse(fs.readFileSync(path.join(work,'observations.json'))),front=observations.referenceImageId;
   const candidates=sourceBacksideCandidates(work,sources,front);audit.sourceCandidates=candidates.map(c=>({sourceId:c.source.id,evidence:c.evidence}));
   if(candidates.length===1){
    const c=candidates[0],passed=[];
    for(const clockwiseRotationDeg of backsidePolicy.rotations){
     const choice={schema:'backside-choice/1',mode:'verified_source_caption',sourceId:c.source.id,sourceSHA256:c.source.decodedSHA256,sourceURL:c.source.url,clockwiseRotationDeg,note:'Explicit linked image caption; orientation independently tested',evidence:c.evidence};
     const result=await attempt(choice);if(result.status==='verified')passed.push(result.registration);
    }
    if(passed.length===1){accepted=passed[0];audit.selectionOrigin='verified_source_caption';}
    else audit.sourceReason=passed.length?'source_orientation_ambiguous':'source_alignment_rejected';
   }else audit.sourceReason=candidates.length?'multiple_source_backside_candidates':'no_explicit_source_backside_caption';
   if(!accepted){
    const proposed=await propose(work,sources,observations);audit.inference=proposed.inference;audit.proposal=proposed.proposal;audit.selectionOrigin='gemini_proposal';
    if(proposed.status==='proposed'){const result=await attempt(proposed.choice);if(result.status==='verified')accepted=result.registration;else audit.reason=result.reason;}
    else audit.reason=proposed.reason;
   }
  }
 }catch(e){audit.reason=e.message;audit.status='blocked';}
 if(accepted){audit.status='applied';audit.registration=accepted;audit.sourceId=accepted.sourceId;audit.sourceURL=accepted.selection?.sourceURL;audit.sourceSHA256=accepted.sourceSHA256;audit.automaticFaceIdentification=audit.selectionOrigin!=='manual_selection';audit.reason='selection_followed_by_geometric_verification';}
 // Only the accepted result reaches the generator. Trial poses cannot leak.
 saveJSON(presentation,{policy:backsidePolicy.version,backside:accepted});
 audit.totalMs=performance.now()-at;saveJSON(path.join(work,'backside-audit.json'),audit);return audit;
}
