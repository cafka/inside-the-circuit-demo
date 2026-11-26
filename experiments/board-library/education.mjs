import {t,locale,componentText} from './i18n.mjs';
import content from './board-education.json';
import {renderOnboarding} from './onboarding-ui.mjs';

// Presentation data only: no influence on identification, CAD import or bindings.
const node=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
function profile(record){return content.boards.find(b=>b.id===record.id&&b.assetSHA256===record.inventory.sourceHash);}
export function componentHeading(record,c){return profile(record)?.componentHeadings?.[c.id]?.[locale()]||componentText(c).label;}
export function educationalCard(record,c){
 const entry=profile(record)?.componentCards?.[c.id];
 if(c.educationPolicy&&!record.review.components.some(m=>m.id===c.id))return {...componentText(c),...c.translations?.[locale()],sources:c.sources};
 // Reviewed/manual overrides retain their own text and evidence.
 if(!entry||record.review.components.some(m=>m.id===c.id))return componentText(c);
 return {...entry[locale()],sources:entry.sources||c.sources};
}
export function componentEvidence(record,c){
 const entry=profile(record)?.componentCards?.[c.id];
 if(entry&&!record.review.components.some(m=>m.id===c.id))return entry.evidence[locale()];
 return c.evidence?.[locale()]||componentConfidence(c);
}
export function componentConfidence(c){
 return {identity:t(c.status==='documented'?'confidence.documented':'confidence.manual'),association:t(c.bindingEvidence?'confidence.binding':'confidence.bindingUnknown')};
}
export function renderBoardEducation(record,metrics){
 const target=document.querySelector('#board-education');target.removeAttribute('data-i18n');target.replaceChildren();
 target.append(node('h3',record.identity.model));target.firstChild.className='education-model';
 target.append(node('p',record.identity.manufacturer));
 const p=profile(record),text=p?.[locale()];
 if(text){
  target.append(node('p',text.description),node('h3',t('education.processor')),node('p',text.processor));
  for(const [key,values]of [['education.specs',text.features],['education.uses',text.applications]]){const list=node('ul','');for(const v of values)list.append(node('li',v));target.append(node('h3',t(key)),list);}
  target.append(node('h3',t('education.sources')));
  for(const source of p.sources){const a=node('a',source.label[locale()]+' ↗');a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';target.append(a);}
 }else if(!record.onboarding)target.append(node('p',t('education.unknown')));
 renderOnboarding(record,target);
 if(record.conversion?.geometryComplete===false){const resolved=(record.cadAudit?.unresolvedMissingFaces??record.conversion?.unresolvedMissingFaces)===0;target.append(node('p',t(resolved?'cad.degenerateWarning':'onboard.incompleteGeometry',{count:record.conversion.missingFaces})));if(resolved)target.append(node('p',t('cad.degenerateDetails')));}
 target.append(node('p',t('selection.legend')));
 const caution=node('p',t('education.caution'));caution.className='accuracy-note';target.append(caution);
 if(metrics.hiddenOptionalNodes?.length)target.append(node('p',t('education.optional')));
}
