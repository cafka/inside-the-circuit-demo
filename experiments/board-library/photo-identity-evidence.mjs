// Conservative photographic entry gate, not OCR or an independent identity verifier.
// Exact names supplied by the user still use the separate name-driven route.
const words=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function photoIdentityEvidence(identity,evidence){
 if(identity?.status!=='identified')return {policy:'photo-identity-evidence/1',allowed:false,reason:'model_not_identified'};
 const full=words(identity.model),manufacturer=words(identity.manufacturer);
 const model=full.startsWith(manufacturer+' ')?full.slice(manufacturer.length+1):full;
 const printed=words(evidence?.observedText);
 const hasModel=!!model&&(' '+printed+' ').includes(' '+model+' ');
 const r=evidence?.box;
 const region=Array.isArray(r)&&r.length===4&&r.every(n=>Number.isFinite(n)&&n>=0&&n<=1000)&&r[0]<r[2]&&r[1]<r[3];
 const allowed=evidence?.basis==='readable_model_marking'&&hasModel&&region;
 return {policy:'photo-identity-evidence/1',allowed,reason:allowed?'model_text_proposed_with_image_region':'readable_model_marking_required',
  observedText:evidence?.observedText??null,box:r??null,independentOCRVerification:false,
  meaning:'A model-reported layout alone cannot select an exact catalogue entry. Reported text can still be wrong.'};
}
