import {initializeApp} from 'firebase/app';
import {initializeAppCheck,ReCaptchaEnterpriseProvider,getToken} from 'firebase/app-check';
import {getAI,GoogleAIBackend,getGenerativeModel,InferenceMode,Schema} from 'firebase/ai';
import {prompt,schema,validate} from './contract.mjs';
import {SCENE_PROMPT,sceneResponseSchema,parseScene} from '../board-library/photo-scene.mjs';
const status=document.querySelector('#status'),output=document.querySelector('#output');
const sha=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');
const b64=b=>{let s='';for(const x of new Uint8Array(b))s+=String.fromCharCode(x);return btoa(s);};
let busy=false;
document.querySelector('#run').onclick=async()=>{
 if(busy)return;busy=true;document.querySelector('#run').disabled=true;
 const mode=document.querySelector('#mode').value,target=document.querySelector('#target').value,key=mode+'-'+target.replace('.jpg','');
 const started=performance.now(),state={schema:'multimodal-cad-real-call/1',mode,target,startedUTC:new Date().toISOString(),filesRead:[],generationAttempts:0,modelRequested:'gemini-3.5-flash-lite',provider:'Firebase AI Logic',configuration:{temperature:0,maxOutputTokens:8192},status:'preparing',isolation:{historicalTableServed:false,transport:'explicit_asset_allowlist'}};
 const read=async name=>{const r=await fetch('/input/'+name);if(!r.ok)throw Error('Input '+name+' HTTP '+r.status);const b=await r.arrayBuffer();state.filesRead.push({name,sha256:await sha(b),bytes:b.byteLength});return b;};
 const json=async n=>JSON.parse(new TextDecoder().decode(await read(n)));
 try{
  status.textContent='Preparando imágenes y App Check…';
  const config=await fetch('/runtime.json').then(r=>r.json());if(config.firebase.projectId!=='itc-nano-lab-20261121')throw Error('Project mismatch');
  const app=initializeApp(config.firebase,'cad-'+crypto.randomUUID());
  const check=initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(config.appCheck.siteKey),isTokenAutoRefreshEnabled:false});
  state.appCheck={tokenReceived:Boolean((await getToken(check,true)).token),provider:'recaptcha-enterprise',protectionDisabled:false};
  const docs=mode==='cad'?await json('documents.json'):{documents:[]},inventory=mode==='cad'?await json('candidates.json'):{candidates:[]},render=mode==='cad'?await json('render.json'):{views:[]};
  const ids=inventory.candidates.map(c=>c.id),body=[{text:mode==='cad'?prompt:SCENE_PROMPT}];state.prompt=body[0].text;
  if(mode==='cad'){
   body.push({text:JSON.stringify({documents:docs.documents,CADGroups:inventory.candidates.map(c=>({id:c.id,dimensionsMm:c.boundsMm[1].map((v,i)=>v-c.boundsMm[0][i]),side:c.side})),renderViews:render.views.map(v=>({side:v.side,visibleIds:v.objects.map(o=>o.id)}))})});
   for(const [label,file] of [['A official reference','reference.png'],['B anonymous CAD front','front-labelled.png'],['C anonymous CAD reverse','back-labelled.png']])body.push({text:label},{inlineData:{mimeType:'image/png',data:b64(await read(file))}});
  }
  body.push({text:'T real target photograph'},{inlineData:{mimeType:'image/jpeg',data:b64(await read(target))}});
  state.preparationMs=performance.now()-started;state.requestSHA256=await sha(new TextEncoder().encode(JSON.stringify(body)));
  const reservation=await fetch('/reserve/'+key,{method:'POST'});if(!reservation.ok)throw Error('Call limit or duplicate case');
  state.generationAttempts=1;status.textContent='Inferencia real · una llamada, sin reintentos…';
  const model=getGenerativeModel(getAI(app,{backend:new GoogleAIBackend()}),{mode:InferenceMode.ONLY_IN_CLOUD,inCloudParams:{model:state.modelRequested,generationConfig:{...state.configuration,responseMimeType:'application/json',responseSchema:mode==='cad'?schema(Schema,ids):sceneResponseSchema(Schema)}}},{timeout:90000});
  const at=performance.now(),response=(await model.generateContent(body)).response;
  state.inferenceMs=performance.now()-at;state.inferenceSource=response.inferenceSource;state.outputLiteral=response.text();state.responseOriginal=JSON.parse(JSON.stringify(response));state.usageMetadata=response.usageMetadata??null;state.modelVersion=response.modelVersion??null;
  state.parsed=JSON.parse(state.outputLiteral);state.validation=mode==='cad'?validate(state.parsed,ids,docs):parseScene(state.outputLiteral);state.status=state.validation.valid&&state.inferenceSource==='in_cloud'?'completed':'invalid_response';
  const u=state.usageMetadata;state.estimatedCostUSD=u?((u.promptTokenCount??0)*.30+((u.candidatesTokenCount??0)+(u.thoughtsTokenCount??0))*2.50)/1e6:null;
 }catch(e){state.status='failed';state.error=String(e.message).replace(/AIza[\w-]+/g,'[REDACTED]').replace(/key=[^\s&)]+/g,'key=[REDACTED]');}
 state.totalMs=performance.now()-started;state.finishedUTC=new Date().toISOString();
 await fetch('/result/'+key,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state,null,2)});
 output.textContent=JSON.stringify(state,null,2);status.textContent=state.status+' · '+(state.inferenceMs??0).toFixed(0)+' ms · '+(state.error??'');
 const link=document.querySelector('#download');link.href='/result/'+key;link.hidden=false;link.download=key+'.json';
 busy=false;document.querySelector('#run').disabled=false;
};
