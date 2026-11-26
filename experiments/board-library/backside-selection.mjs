import fs from 'node:fs';
import path from 'node:path';
import {Schema} from 'firebase/ai';
import {hash} from './glb.mjs';
import {analyseReconstruction} from './reconstruction-gemini.mjs';
import {backsidePolicy,backsidePrompt,backsideSchema,validateBacksideProposal} from './backside-contract.mjs';
import {linkedImageCaptions,explicitRearCaption} from './source-image-captions.mjs';

// Only explicit captions attached to the exact image in downloaded authoritative pages.
// Filename suffixes, gallery order and a generic page mentioning "back" are not evidence.
export function sourceBacksideCandidates(work,sources,frontId){
 const candidates=[];
 for(const s of sources.filter(s=>s.mimeType==='image/png'&&s.id!==frontId)){
  const evidence=[];let contradicted=false;
  for(const page of sources.filter(p=>p.mimeType==='text/html')){
   const file=path.resolve(work,'..',page.file),bytes=fs.readFileSync(file);if(hash(bytes)!==page.sha256)throw Error('backside_document_changed');
   const linked=linkedImageCaptions(bytes.toString(),page.url).filter(item=>item.url===s.url);
   // Conflicting captions on the same image do not become a rear-face assertion.
   const conflict=linked.some(item=>/\b(front|top|frente|anverso)\b/i.test(item.caption));
   contradicted ||= conflict;
   for(const item of linked){
    if(!conflict&&explicitRearCaption(item.caption))evidence.push({pageURL:page.url,pageSHA256:page.sha256,imageURL:s.url,caption:item.caption,method:item.method});
   }
  }
  if(evidence.length&&!contradicted)candidates.push({source:s,evidence});
 }
 return candidates;
}
export function buildBacksideRequest(work,sources,observations){
 const images=sources.filter(s=>s.mimeType==='image/png');if(images.length<2||images.length>backsidePolicy.maxImages)throw Error('backside_image_count_unsupported');
 const parts=[{text:backsidePrompt},{text:JSON.stringify({policy:backsidePolicy.version,frontImageId:observations.referenceImageId,frontCornersNormalized:observations.board.corners,imageCoordinates:'0..1000 after EXIF normalization'})}];
 for(const s of images){const bytes=fs.readFileSync(path.resolve(work,'..',s.file));if(hash(bytes)!==s.decodedSHA256)throw Error('backside_image_changed');parts.push({text:JSON.stringify({sourceId:s.id,url:s.url,sha256:s.decodedSHA256})},{inlineData:{mimeType:s.mimeType,data:bytes.toString('base64')}});}
 return {parts,requestSHA256:hash(JSON.stringify(parts)),model:backsidePolicy.model,policy:backsidePolicy};
}
export async function proposeBackside(work,sources,observations,{analyse=analyseReconstruction}={}){
 const request=buildBacksideRequest(work,sources,observations);
 let result,failure;
 try{result=await analyse(request.parts,work,{name:'gemini-backside',schema:backsideSchema(Schema),model:backsidePolicy.model,maxOutputTokens:backsidePolicy.maxOutputTokens});}
 catch(e){if(!e.inferenceRecord)throw e;result=e.inferenceRecord;failure=e.message;}
 const inference={modelRequested:result.modelRequested,modelVersion:result.modelVersion??null,inferenceSource:result.inferenceSource,newRequests:result.reused?0:result.requests,requests:result.requests,reused:!!result.reused,inferenceMs:result.inferenceMs,totalMs:result.totalMs,usageMetadata:result.usageMetadata,estimatedCostUSD:result.estimatedCostUSD??null,requestSHA256:request.requestSHA256,responseFile:'gemini-backside.json',evidenceKind:result.evidenceKind||'firebase_ai_logic'};
 if(failure)return {status:'pending',reason:failure,inference};
 let source;try{source=validateBacksideProposal(result.parsed,sources,observations.referenceImageId);}catch(e){return {status:'pending',reason:e.message,inference,proposal:result.parsed};}
 if(!source)return {status:'pending',reason:'gemini_'+result.parsed.status,inference,proposal:result.parsed};
 return {status:'proposed',inference,proposal:result.parsed,choice:{schema:'backside-choice/1',mode:'gemini_proposal',sourceId:source.id,sourceSHA256:source.decodedSHA256,sourceURL:source.url,clockwiseRotationDeg:result.parsed.clockwiseRotationDeg,note:result.parsed.reason,faceEvidence:result.parsed.faceEvidence,orientationEvidence:result.parsed.orientationEvidence,proposalSHA256:hash(JSON.stringify(result.parsed)),requestSHA256:request.requestSHA256}};
}
