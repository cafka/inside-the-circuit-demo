// Presentation contract: a CAD/electrical association is not an educational card.
// Unknown education states remain technical references until explicitly reviewed.
export function componentAvailability(component,{profileCard=false,manual=false}={}){
 const text=String(component.description||'').trim()||Object.values(component.translations||{}).some(v=>v.description?.trim());
 const state=component.educationStatus;
 const explicitlyPending=state==='technical_record_function_pending';
 const educational=(!!text||profileCard)&&!explicitlyPending&&(profileCard||manual||state==='documented_function_bilingual'||state==='ai_source_grounded_pending_review');
 const proposed=educational&&(state==='ai_source_grounded_pending_review'||manual||component.status==='provisional');
 const reference=!!text||!!component.sources?.length||!!component.facts?.length;
 return {kind:educational?'educational':reference?'technical':'none',review:educational?(proposed?'pending':'documented'):null};
}
