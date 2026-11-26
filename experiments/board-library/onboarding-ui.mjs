import {t,localize,resources} from './i18n.mjs';
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
export const onboardingReason=reason=>resources['onboard.reason.'+reason]?t('onboard.reason.'+reason):localize(reason||'');
export const onboardingStage=stage=>resources['onboard.stage.'+stage]?t('onboard.stage.'+stage):t('stage.'+stage);
export function renderOnboarding(record,target){
 if(record.enrichment){
  const details=node('details','');details.append(node('summary',t('enrichment.title')));
  const applied=record.enrichment.applied,geometry=record.automaticSurfaces?.presentationGeometry;
  details.append(node('p',t('enrichment.visual')),node('p',t('enrichment.details',{layers:applied?.surfaceLayers||0,drills:geometry?.status==='source_ecad_supplement'?geometry.drills:0})),node('p',t('enrichment.evidence')));
  if(record.automaticSurfaces?.sourceType==='step_graphics')details.append(node('p',t('enrichment.cadGraphics')));
  const url=record.automaticSurfaces?.sourceURL;if(url){const a=node('a',t('education.sources')+' ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';details.append(a);}
  target.append(details);
 }
 const onboarding=record.onboarding;if(!onboarding)return;
 if(record.reconstruction){
  const details=node('details','');details.id='generation-information';details.append(node('summary',t('generation.title')));
  const thickness=record.reconstruction.educationalThickness?.valueMm;
  const relief=[...new Set((record.reconstruction.objects||[]).map(o=>o.displayHeightMm).filter(v=>Number.isFinite(v)))].join('–');
  details.append(node('p',thickness&&relief?t('generation.illustrative',{thickness,relief}):t('reconstruction.warning')));
  const back=record.reconstruction.backsideAudit;
  if(back)details.append(node('p',t(back.status!=='applied'?'generation.backsidePending':back.selectionOrigin==='gemini_proposal'?'generation.backsideGemini':back.selectionOrigin==='verified_source_caption'?'generation.backsideSource':'generation.backsideReviewed')));
  target.append(details);
 }
 target.append(node('h3',t('onboard.summary')),node('p',t(record.reconstruction?'generation.photoModel':record.modelAvailable?'onboard.partialModel':'onboard.noModel')));
 if(record.automaticSurfaces)target.append(node('p',t('photoAuto.coverage',{bound:record.coverage.boundComponents,cards:record.coverage.educationalCards||0,texts:record.automaticSurfaces.details?.sourceTextLabels||0})),node('p',t('photoAuto.surfaceCaution')));
 const list=node('ul','');
 for(const s of onboarding.stages){const li=node('li',onboardingStage(s.name)+' · '+t('onboard.status.'+s.status)+' · '+(s.ms/1000).toFixed(2)+' s');li.append(node('p',onboardingReason(s.reason)));list.append(li);}
 target.append(list,node('h3',t('onboard.resources')));
 const files=node('ul','');
 for(const r of onboarding.resources.filter(r=>r.status==='downloaded')){const li=node('li',''),a=node('a',decodeURIComponent(new URL(r.url).pathname.split('/').at(-1))+' ↗');a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';li.append(a,node('small',' · '+(r.license?.id||t('unknownLicense'))));files.append(li);}
 target.append(files,node('p',record.cloud?.requests?t('reconstruction.cloud',{calls:record.cloud.requests,cost:record.cloud.costUSD?.toFixed(5)??'?' }):t('onboard.noPaidServices')));
}
