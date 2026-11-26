import fs from 'node:fs';
import path from 'node:path';
import {initializeApp,deleteApp} from 'firebase/app';
import {initializeAppCheck,CustomProvider,getToken} from 'firebase/app-check';
import {getAI,GoogleAIBackend,getGenerativeModel,InferenceMode} from 'firebase/ai';
import {DIR,saveJSON} from './catalog.mjs';
import {hash} from './glb.mjs';
import {reconstructionSchema} from './reconstruction-schema.mjs';
export const reconstructionPolicy=JSON.parse(fs.readFileSync(path.join(DIR,'reconstruction-policy.json')));
const clean=e=>String(e.message).replace(/key=[^&\s)]+/g,'key=[REDACTED]').replace(/AIza[\w-]+/g,'[REDACTED]');

// Consent/configuration is provisioned outside the app. This adapter can never enable billing.
export async function analyseReconstruction(parts,directory,{name="gemini-reconstruction",schema=reconstructionSchema,model=reconstructionPolicy.model,maxOutputTokens=reconstructionPolicy.maxOutputTokens}={}){
 const output=path.join(directory,name+".json"),requestSHA256=hash(JSON.stringify(parts));
 if(fs.existsSync(output)){const cached=JSON.parse(fs.readFileSync(output));if(cached.status==="completed"&&cached.requestSHA256===requestSHA256&&cached.modelRequested===model&&cached.inferenceSource==='in_cloud')return {...cached,reused:true};}
 const file=process.env.ITC_RECONSTRUCTION_SESSION;
 if(!file)throw Error('reconstruction_gemini_session_not_configured');
 const session=JSON.parse(fs.readFileSync(file)),p={...reconstructionPolicy,model,maxOutputTokens};
 if(model!==reconstructionPolicy.model){p.inputPerMillionUSD=null;p.outputPerMillionUSD=null;}
 if(session.projectId!=='itc-nano-lab-20261121'||session.consent!==true||Date.now()>=Date.parse(session.expiresUTC))throw Error('reconstruction_session_not_authorized_or_expired');
 if(session.budgetTotalUSD!==20||session.historicalReserveUSD+session.delayedReserveUSD+session.executionReserveUSD>=20)throw Error('reconstruction_budget_guard');
 if(Buffer.byteLength(JSON.stringify(parts))>p.maxInputBytes*1.4)throw Error('reconstruction_input_size_limit');
 const ledger=path.join(path.dirname(file),'calls');fs.mkdirSync(ledger,{recursive:true});
 let reservation;for(let i=0;i<Math.min(session.maxCalls,p.maxCallsPerSession);i++){try{reservation=path.join(ledger,i+'.json');fs.writeFileSync(reservation,JSON.stringify({reservedUTC:new Date().toISOString(),directory}),{flag:'wx'});break;}catch(e){if(e.code!=='EEXIST')throw e;reservation=null;}}
 if(!reservation)throw Error('reconstruction_session_request_limit');
 const result={schema:p.version,startedUTC:new Date().toISOString(),modelRequested:p.model,policy:p,requestSHA256:hash(JSON.stringify(parts)),inputParts:parts.map(x=>x.inlineData?{mimeType:x.inlineData.mimeType,sha256:hash(Buffer.from(x.inlineData.data,'base64'))}:x),status:'running',requests:0};
 const persist=()=>{saveJSON(output,result);saveJSON(reservation,{...result,inputParts:undefined});};
 const cfg=JSON.parse(fs.readFileSync(session.privateConfig));if(cfg.firebaseConfig.projectId!==session.projectId)throw Error('reconstruction_project_guard');
 const start=performance.now(),originalFetch=globalThis.fetch;let app;
 // One transport attempt per analysis; SDK retry cannot cause unbounded paid requests.
 globalThis.fetch=async(input,options)=>{
  const u=new URL(typeof input==='string'?input:input.url??input.toString());
  if(!u.pathname.endsWith(':generateContent'))return originalFetch(input,options);
  if(u.hostname!=='firebasevertexai.googleapis.com'||result.requests++)throw Error('reconstruction_one_request_guard');
  persist();const at=performance.now(),r=await originalFetch(input,{...options,signal:AbortSignal.timeout(300000)});
  result.transport={httpStatus:r.status,body:await r.clone().json(),elapsedMs:performance.now()-at};persist();return r;
 };
 try{
  app=initializeApp(cfg.firebaseConfig,'reconstruction-'+Date.now());
  const check=initializeAppCheck(app,{isTokenAutoRefreshEnabled:false,provider:new CustomProvider({getToken:async()=>{
   const r=await originalFetch(`https://firebaseappcheck.googleapis.com/v1/${cfg.appCheckParent}:exchangeDebugToken?key=${cfg.firebaseConfig.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({debugToken:cfg.debugToken}),signal:AbortSignal.timeout(30000)});
   if(!r.ok)throw Error('AppCheck HTTP '+r.status);const v=await r.json();return{token:v.token,expireTimeMillis:Date.now()+parseFloat(v.ttl)*1000};
  }})});await getToken(check,true);
  const ai=getAI(app,{backend:new GoogleAIBackend()}),generativeModel=getGenerativeModel(ai,{mode:InferenceMode.ONLY_IN_CLOUD,inCloudParams:{model:p.model,generationConfig:{maxOutputTokens:p.maxOutputTokens,responseMimeType:'application/json',responseSchema:schema}}},{timeout:300000});
  result.initializationMs=performance.now()-start;const at=performance.now(),response=(await generativeModel.generateContent(parts)).response;
  result.inferenceMs=performance.now()-at;result.inferenceSource=response.inferenceSource;result.outputLiteral=response.text();result.responseOriginal=JSON.parse(JSON.stringify(response));
  result.usageMetadata=response.usageMetadata??result.transport.body.usageMetadata;result.modelVersion=response.modelVersion??result.transport.body.modelVersion;
  const u=result.usageMetadata;result.estimatedCostUSD=u&&p.model===reconstructionPolicy.model?((u.promptTokenCount||0)*p.inputPerMillionUSD+((u.candidatesTokenCount||0)+(u.thoughtsTokenCount||0))*p.outputPerMillionUSD)/1e6:null;
  persist();result.parsed=JSON.parse(result.outputLiteral);if(result.inferenceSource!=='in_cloud')throw Error('unexpected_inference_source');result.status='completed';
 }catch(e){result.status='failed';result.error=clean(e);}finally{globalThis.fetch=originalFetch;if(app)await deleteApp(app);result.totalMs=performance.now()-start;persist();}
 if(result.status!=='completed')throw Object.assign(Error(result.error),{inferenceRecord:result});return result;
}
