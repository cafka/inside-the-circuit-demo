// Optional operator test transport using the same Firebase AI Logic + App Check SDKs.
// No camera code, API-key service, billing operation or alternative model provider.
import {initializeApp,deleteApp} from 'firebase/app';
import {initializeAppCheck,ReCaptchaEnterpriseProvider,ReCaptchaV3Provider,getToken} from 'firebase/app-check';
import {getAI,GoogleAIBackend,getGenerativeModel,InferenceMode,Schema} from 'firebase/ai';
import {validateConfig} from '../../src/identity/firebase-adapter.mjs';
import {backsidePolicy,backsideSchema} from './backside-contract.mjs';
export async function compareBacksidePhotos(config,parts){
 validateConfig(config);if(!config.cloudEnabled||config.maxCloudCallsPerSession<1)throw Error('backside_cloud_not_enabled');
 const start=performance.now(),result={evidenceKind:'real_firebase_browser',modelRequested:backsidePolicy.model,requests:0,estimatedCostUSD:null,status:'running',startedUTC:new Date().toISOString()},originalFetch=globalThis.fetch;
 const app=initializeApp(config.firebase,'backside-'+crypto.randomUUID());
 globalThis.fetch=async(input,options)=>{const url=new URL(typeof input==='string'?input:input.url??input.toString());if(url.pathname.endsWith(':generateContent')){if(url.hostname!=='firebasevertexai.googleapis.com'||result.requests>=1)throw Error('backside_one_request_guard');result.requests++;}return originalFetch(input,options);};
 try{
  const Provider=config.appCheck.provider==='recaptcha-enterprise'?ReCaptchaEnterpriseProvider:ReCaptchaV3Provider;
  const check=initializeAppCheck(app,{provider:new Provider(config.appCheck.siteKey),isTokenAutoRefreshEnabled:false});await getToken(check,false);result.initializationMs=performance.now()-start;
  const ai=getAI(app,{backend:new GoogleAIBackend()}),model=getGenerativeModel(ai,{mode:InferenceMode.ONLY_IN_CLOUD,inCloudParams:{model:backsidePolicy.model,generationConfig:{temperature:0,maxOutputTokens:backsidePolicy.maxOutputTokens,responseMimeType:'application/json',responseSchema:backsideSchema(Schema)}}},{timeout:60000});
  const at=performance.now(),response=(await model.generateContent(parts)).response;result.inferenceMs=performance.now()-at;result.inferenceSource=response.inferenceSource;
  result.outputLiteral=response.text();result.responseOriginal=JSON.parse(JSON.stringify(response));result.modelVersion=response.modelVersion??null;result.usageMetadata=response.usageMetadata??null;
  result.parsed=JSON.parse(result.outputLiteral);if(result.inferenceSource!=='in_cloud')throw Error('unexpected_inference_source');result.status='completed';
 }catch(e){result.status='failed';result.error=String(e.message).replace(/AIza[\w-]+/g,'[REDACTED]');}
 finally{globalThis.fetch=originalFetch;await deleteApp(app);result.totalMs=performance.now()-start;}
 return result;
}
