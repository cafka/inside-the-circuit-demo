// Isolated Firebase AI Logic client. No catalogue/evaluation imports or retries.
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase/app';
import {initializeAppCheck,CustomProvider,getToken} from 'firebase/app-check';
import {getAI,GoogleAIBackend,getGenerativeModel,InferenceMode,Schema} from 'firebase/ai';
import {prompt,schema,validate} from './contract.mjs';
import {SCENE_PROMPT,sceneResponseSchema,parseScene} from '../board-library/photo-scene.mjs';
const [inputDir,credentialFile,outputFile,mode='cad',target='target-a.jpg']=process.argv.slice(2);
if(!['cad','baseline'].includes(mode)||!['target-a.jpg','target-b.jpg'].includes(target))throw Error('Input contract');
const input=path.resolve(inputDir),output=path.resolve(outputFile),start=performance.now(),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const state={schema:'multimodal-cad-real-call/1',startedUTC:new Date().toISOString(),mode,target,filesRead:[],generationAttempts:0,modelRequested:'gemini-3.5-flash-lite',provider:'Firebase AI Logic',configuration:{temperature:0,maxOutputTokens:8192},status:'initializing'};
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,'',{flag:'wx'});
const persist=()=>fs.writeFile(output,JSON.stringify(state,null,2));
const read=async name=>{if(!new Set(['documents.json','candidates.json','render.json','reference.png','front-labelled.png','back-labelled.png','target-a.jpg','target-b.jpg']).has(name))throw Error('Input file allowlist');const b=await fs.readFile(path.join(input,name));state.filesRead.push({name,sha256:sha(b),bytes:b.length});return b;};
const originalFetch=globalThis.fetch;let app;
globalThis.fetch=async(url,options)=>{const u=new URL(typeof url==='string'?url:url.url??url.toString());if(u.pathname.endsWith(':generateContent')){
 if(u.hostname!=='firebasevertexai.googleapis.com'||state.generationAttempts!==0)throw Error('One generation guard');
 let reserved=false;for(let i=1;i<=3;i++){try{await fs.writeFile(path.join(path.dirname(output),'generation-'+i+'.lock'),JSON.stringify({output:path.basename(output),utc:new Date().toISOString()}),{flag:'wx'});reserved=true;break;}catch(e){if(e.code!=='EEXIST')throw e;}}
 if(!reserved)throw Error('Three-call experiment allowance exhausted');state.generationAttempts++;
 state.request={host:u.hostname,path:u.pathname,bodySHA256:sha(options.body)};await persist();}
 return originalFetch(url,options);};
try{
 if(!process.permission?.has)throw Error('Node filesystem permissions required');
 let denied=false;try{await fs.readFile(path.resolve('experiments/board-library/catalog-enrichment.json'));}catch(e){denied=e.code==='ERR_ACCESS_DENIED';}
 if(!denied)throw Error('Historical table is not isolated');state.isolation={historicalTableReadDenied:denied};
 const cfg=JSON.parse(await fs.readFile(credentialFile));if(cfg.firebaseConfig?.projectId!=='itc-nano-lab-20261121')throw Error('Authorized project mismatch');
 app=initializeApp(cfg.firebaseConfig,'isolated-cad-'+crypto.randomUUID());
 const check=initializeAppCheck(app,{isTokenAutoRefreshEnabled:false,provider:new CustomProvider({getToken:async()=>{
  const r=await originalFetch(`https://firebaseappcheck.googleapis.com/v1/${cfg.appCheckParent}:exchangeDebugToken?key=${cfg.firebaseConfig.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({debugToken:cfg.debugToken}),signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error('Existing App Check registration HTTP '+r.status);const v=await r.json();return {token:v.token,expireTimeMillis:Date.now()+parseFloat(v.ttl)*1000};}})});
 state.appCheck={tokenReceived:Boolean((await getToken(check,true)).token),provider:'existing_registered_diagnostic_token',protectionDisabled:false};
 const documents=mode==='cad'?JSON.parse(await read('documents.json')):{documents:[]},inventory=mode==='cad'?JSON.parse(await read('candidates.json')):{candidates:[]},render=mode==='cad'?JSON.parse(await read('render.json')):{views:[]};
 const ids=inventory.candidates.map(c=>c.id);const body=[];
 state.prompt=mode==='baseline'?SCENE_PROMPT:prompt;body.push({text:state.prompt});
 if(mode==='cad'){
  body.push({text:JSON.stringify({documents:documents.documents,CADGroups:inventory.candidates.map(c=>({id:c.id,dimensionsMm:c.boundsMm[1].map((v,i)=>v-c.boundsMm[0][i]),side:c.side})),renderViews:render.views.map(v=>({side:v.side,visibleIds:v.objects.map(o=>o.id)}))})});
  for(const [label,file] of [['A official reference','reference.png'],['B anonymous CAD front','front-labelled.png'],['C anonymous CAD reverse','back-labelled.png']])body.push({text:label},{inlineData:{mimeType:'image/png',data:(await read(file)).toString('base64')}});
 }
 body.push({text:'T real target photograph'},{inlineData:{mimeType:'image/jpeg',data:(await read(target)).toString('base64')}});
 state.preparationMs=performance.now()-start;
 const ai=getAI(app,{backend:new GoogleAIBackend()}),model=getGenerativeModel(ai,{mode:InferenceMode.ONLY_IN_CLOUD,inCloudParams:{model:state.modelRequested,generationConfig:{...state.configuration,responseMimeType:'application/json',responseSchema:mode==='baseline'?sceneResponseSchema(Schema):schema(Schema,ids)}}},{timeout:90000});
 const at=performance.now(),response=(await model.generateContent(body)).response;state.inferenceMs=performance.now()-at;state.inferenceSource=response.inferenceSource;state.outputLiteral=response.text();state.responseOriginal=JSON.parse(JSON.stringify(response));state.usageMetadata=response.usageMetadata??null;state.modelVersion=response.modelVersion??null;await persist();
 state.parsed=JSON.parse(state.outputLiteral);state.validation=mode==='baseline'?parseScene(state.outputLiteral):validate(state.parsed,ids,documents);
 state.status=state.validation.valid&&state.inferenceSource==='in_cloud'?'completed':'invalid_response';
 const u=state.usageMetadata;state.estimatedCostUSD=u?((u.promptTokenCount??0)*.30+((u.candidatesTokenCount??0)+(u.thoughtsTokenCount??0))*2.50)/1e6:null;
}catch(e){state.status='failed';state.error=String(e.message).replace(/AIza[\w-]+/g,'[REDACTED]').replace(/key=[^\s&)]+/g,'key=[REDACTED]');}
finally{globalThis.fetch=originalFetch;if(app)await deleteApp(app);state.totalMs=performance.now()-start;state.finishedUTC=new Date().toISOString();await persist();}
console.log(JSON.stringify({status:state.status,attempts:state.generationAttempts,inferenceMs:state.inferenceMs,costUSD:state.estimatedCostUSD,error:state.error}));process.exitCode=state.status==='completed'?0:1;
