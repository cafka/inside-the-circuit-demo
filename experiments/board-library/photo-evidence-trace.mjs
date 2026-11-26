// Counts describe distinct gates. Catalogue knowledge cannot certify photo identity.
export function photoEvidenceTrace(proposals, verification, bindings, components, cardIds=[], openedIds=[]){
 const rows=proposals.map(p=>{
  const pixel=verification?.components?.find(c=>c.id===p.id)?.verification;
  const binding=bindings.find(c=>c.id===p.id);
  const component=components.find(c=>c.id===binding?.componentId);
  const reasons=[];
  if(p.status!=='proposed')reasons.push('ambiguous_visual_proposal');
  if(!pixel?.accepted)reasons.push(...(pixel?.reasons||['pixels_not_evaluated']));
  if(!binding?.componentId)reasons.push('document_link_'+(binding?.binding?.status||'not_evaluated'));
  const cad=!!component?.nodeIds?.length;
  if(component&&!cad)reasons.push('cad_association_missing');
  if(component&&!cardIds.includes(p.id))reasons.push('usable_card_missing');
  return {id:p.id,name:p.name,marking:p.marking,box:p.box,visiblePolygon:p.visiblePolygon??null,
   semanticStatus:'model_proposal_not_independently_verified',pixelAccepted:pixel?.accepted===true,
   documentCandidates:binding?.binding?.candidates||[],componentId:binding?.componentId||null,
   cadAssociation:cad?'existing_catalogue_link_not_photo_registration':'none',
   cardAvailable:cardIds.includes(p.id),displayed:pixel?.accepted===true&&cardIds.includes(p.id),
   cardOpened:openedIds.includes(p.id),firstBlockingStage:reasons[0]||null,reasons};
 });
 return {schema:'photo-evidence-trace/1',rows,counts:{
  proposed:rows.length,pixelAccepted:rows.filter(r=>r.pixelAccepted).length,
  documentLinked:rows.filter(r=>r.componentId).length,
  cadLinked:rows.filter(r=>r.cadAssociation!=='none').length,
  displayed:rows.filter(r=>r.displayed).length,opened:rows.filter(r=>r.cardOpened).length,
  independentlyConfirmedIdentities:null,
 },planeRegistration:'not_computed',independentEvaluationRequired:true};
}
