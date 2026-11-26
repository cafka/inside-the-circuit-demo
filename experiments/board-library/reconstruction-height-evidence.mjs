// A numeric answer and a source ID are not a measurement. Keep rejected values
// in the audit, never convert a remembered package standard into image evidence.
export function auditHeights(observations,{verifiedMeasurements={}}={}){
 const value=structuredClone(observations),audit=[];
 const check=(target,key,rangeKey,evidenceKey,id)=>{
  if(target[key]===null)return;
  const evidence=target[evidenceKey],verified=verifiedMeasurements[id],m=verified?.measurement;
  const documented=evidence?.basis==='documented'&&verified?.documentQuoteMatched===true&&verified.value===target[key];
  const measured=evidence?.basis==='image_estimate'&&verified?.value===target[key]&&m?.independentlyChecked===true&&m?.method&&Array.isArray(m.sourcePoints)&&m.sourcePoints.length>=2&&Number.isFinite(m.referenceMm)&&m.referenceMm>0;
  if(documented||measured){audit.push({id,status:'supported',value:target[key],evidence});return;}
  audit.push({id,status:'rejected',proposedValue:target[key],proposedRange:target[rangeKey],evidence,reason:'no_verifiable_dimension_or_pixel_measurement'});
  target[key]=null;target[rangeKey]=null;target[evidenceKey]={basis:'unknown',sourceId:evidence?.sourceId??null,reason:'Proposed height excluded: no verifiable dimension or pixel measurement.'};
 };
 check(value.board,'thicknessMm','thicknessRangeMm','thicknessEvidence','substrate');
 for(const o of value.objects)check(o,'heightMm','heightRangeMm','heightEvidence',o.id);
 return {observations:value,audit,policy:'height-evidence/1'};
}
