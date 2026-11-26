import {identifyPhotoAutomatically} from './photo-onboarding.mjs';
import {CLOUD_MODEL} from '../../src/identity/firebase-adapter.mjs';
const out=document.querySelector('#result'),result={inputKind:'rendered_CAD_screenshot_not_physical_photo'};
const show=()=>out.textContent=JSON.stringify(result,null,2);
document.querySelector('#run').onclick=async event=>{
 event.target.disabled=true;
 try{
  const config=await(await fetch('/api/runtime-config')).json();if(!config.cloudEnabled)throw Error('Cloud disabled by operator');
  if(sessionStorage.getItem('itc-release-check-used'))throw Error('This integration test was already attempted in this tab');
  const start=performance.now(),response=await fetch('/release-check/reference.jpg'),bytes=await response.arrayBuffer();result.transferMs=performance.now()-start;
  out.textContent='Ejecutando inferencia real…';
  result.observation=await identifyPhotoAutomatically(new File([bytes],'neutral.jpg',{type:'image/jpeg'}),{config,cloudConsent:true,cloudUsed:false,onCloudUse:()=>sessionStorage.setItem('itc-release-check-used','1')});
 }catch(e){result.error=e.message;}show();
};
document.querySelector('#negative').onclick=async event=>{
 event.target.disabled=true;
 try{
  const c=await(await fetch('/api/runtime-config')).json();if(!c.firebase)throw Error('configuration_missing');
  const start=performance.now(),r=await fetch(`https://firebasevertexai.googleapis.com/v1beta/projects/${c.firebase.projectId}/locations/global/publishers/google/models/${CLOUD_MODEL}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':c.firebase.apiKey,'X-Firebase-AppCheck':'intentionally-invalid-test-token'},body:JSON.stringify({contents:[{role:'user',parts:[{text:'Reply OK.'}]}],generationConfig:{maxOutputTokens:4}})});
  result.invalidAppCheck={httpStatus:r.status,ms:performance.now()-start,response:await r.json()};
 }catch(e){result.invalidAppCheck={error:e.message};}show();
};
