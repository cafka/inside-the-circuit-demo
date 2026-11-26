import {t,localize,resources} from './i18n.mjs';
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
export const onboardingReason=reason=>resources['onboard.reason.'+reason]?t('onboard.reason.'+reason):localize(reason||'');
export const onboardingStage=stage=>resources['onboard.stage.'+stage]?t('onboard.stage.'+stage):t('stage.'+stage);
export function renderOnboarding(record,target){
 const onboarding=record.onboarding;if(!onboarding)return;
 target.append(node('h3',t('onboard.summary')),node('p',t(record.modelAvailable?'onboard.partialModel':'onboard.noModel')));
 if(record.automaticSurfaces)target.append(node('p',t('photoAuto.coverage',{bound:record.coverage.boundComponents,cards:record.coverage.educationalCards||0,texts:record.automaticSurfaces.details?.sourceTextLabels||0})),node('p',t('photoAuto.surfaceCaution')));
 const list=node('ul','');
 for(const s of onboarding.stages){const li=node('li',onboardingStage(s.name)+' · '+t('onboard.status.'+s.status)+' · '+(s.ms/1000).toFixed(2)+' s');li.append(node('p',onboardingReason(s.reason)));list.append(li);}
 target.append(list,node('h3',t('onboard.resources')));
 const files=node('ul','');
 for(const r of onboarding.resources.filter(r=>r.status==='downloaded')){const li=node('li',''),a=node('a',decodeURIComponent(new URL(r.url).pathname.split('/').at(-1))+' ↗');a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';li.append(a,node('small',' · '+(r.license?.id||t('unknownLicense'))));files.append(li);}
 target.append(files,node('p',record.cloud?.requests?t('reconstruction.cloud',{calls:record.cloud.requests,cost:record.cloud.costUSD?.toFixed(5)??'?' }):t('onboard.noPaidServices')));
 if(record.reconstruction)target.append(node('p',t('reconstruction.warning')));
}
