import {JSON_SCHEMA,firebaseResponseSchema} from './schema.mjs';
import {PROMPT} from './prompt.mjs';
import {redactText} from './trace.mjs';
export const PROJECT_ID='itc-nano-lab-20261121';
export const CLOUD_MODEL='gemini-3.5-flash-lite';
const fail=code=>Object.assign(new Error(code),{code});
export function validateConfig(config) {
  if(!config?.firebase?.apiKey || !config.firebase.appId || /REPLACE/.test(config.firebase.apiKey+config.firebase.appId))throw fail('configuration_missing');
  if(config.firebase.projectId!==PROJECT_ID)throw fail('wrong_project');
  if(!/^1:970731928304:web:[0-9a-f]+$/i.test(config.firebase.appId))throw fail('wrong_project');
  if(!config.appCheck?.siteKey || /REPLACE/.test(config.appCheck.siteKey))throw fail('app_check_missing');
  if(config.appCheck.debugToken && !/^[a-f0-9-]{36}$/i.test(config.appCheck.debugToken))throw fail('app_check_missing');
}
export function errorCode(e) {
  const known=['configuration_missing','wrong_project','app_check_missing','app_check_failed','request_limit','timeout','cancelled','capture_changed','camera_resumed','unexpected_inference_source','lane_busy','unavailable'];
  if(known.includes(e?.code))return e.code;
  if(e?.name==='AbortError')return 'cancelled';
  if(e?.name==='TimeoutError')return 'timeout';
  if(e?.code==='ai/api-not-enabled')return 'unavailable';
  if(typeof e?.code==='string' && /^(ai|appCheck)\/[a-z-]{1,80}$/.test(e.code))return e.code;
  return 'technical_error';
}
async function loadSDK() {
  const [app,appCheck,ai]=await Promise.all([import('firebase/app'),import('firebase/app-check'),import('firebase/ai')]);
  return {...app,...appCheck,...ai};
}
export function createFirebaseAdapter(config,{sdkLoader=loadSDK,hasLanguageModel=()=>typeof globalThis.LanguageModel!=='undefined',prompt=PROMPT,responseSchema=firebaseResponseSchema,jsonSchema=JSON_SCHEMA,maxOutputTokens=1400}={}) {
  // Capture settings in memory, not localStorage or exported evidence.
  const settings=config ? structuredClone(config) : null;
  let contextPromise=null; const busy=new Set();
  const secrets=[settings?.firebase?.apiKey,settings?.appCheck?.debugToken,settings?.appCheck?.siteKey].filter(Boolean);
  async function context() {
    if(!contextPromise)contextPromise=(async()=>{
      validateConfig(settings); const sdk=await sdkLoader();
      const app=sdk.initializeApp(settings.firebase,`itc-stage2-${crypto.randomUUID()}`);
      if(settings.appCheck.debugToken)globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN=settings.appCheck.debugToken;
      const Provider=settings.appCheck.provider==='recaptcha-enterprise'?sdk.ReCaptchaEnterpriseProvider:sdk.ReCaptchaV3Provider;
      const check=sdk.initializeAppCheck(app,{provider:new Provider(settings.appCheck.siteKey),isTokenAutoRefreshEnabled:true});
      return {sdk,app,check,ai:sdk.getAI(app,{backend:new sdk.GoogleAIBackend()})};
    })();
    return contextPromise;
  }
  return {
    evidenceKind:'real_firebase',cloudModel:CLOUD_MODEL,preflight:()=>validateConfig(settings),errorCode,
    redact:text=>redactText(text,secrets),
    async infer({lane,capture,signal,onTiming=()=>{}}) {
      validateConfig(settings); signal.throwIfAborted();
      // SDK 13.4.0 creates no Chrome adapter when LanguageModel is absent.
      // In that case ONLY_ON_DEVICE can still reach the cloud transport.
      // Reject before loading the SDK; only the controller's explicit Cloud
      // opt-in may make a cloud request. Source validation remains in place.
      if(lane==='nano'&&!hasLanguageModel())throw fail('unavailable');
      if(busy.has(lane))throw fail('lane_busy'); busy.add(lane);
      try {
        const initStart=performance.now(), {sdk,check,ai}=await context(); signal.throwIfAborted();
        try {const attestation=await sdk.getToken(check,false);if(!attestation.token)throw fail('app_check_failed');}
        catch (error) {onTiming('appCheckErrorCode',errorCode(error));throw fail('app_check_failed');}
        signal.throwIfAborted();
        onTiming('firebaseMs',performance.now()-initStart);
        const params={mode:lane==='nano'?sdk.InferenceMode.ONLY_ON_DEVICE:sdk.InferenceMode.ONLY_IN_CLOUD,
          inCloudParams:{model:CLOUD_MODEL,generationConfig:{responseMimeType:'application/json',responseSchema:responseSchema(sdk.Schema),maxOutputTokens,temperature:0}}};
        if(lane==='nano')params.onDeviceParams={
          createOptions:{signal,expectedInputs:[{type:'text',languages:['en']},{type:'image'}],expectedOutputs:[{type:'text',languages:['en']}]},
          promptOptions:{responseConstraint:jsonSchema}};
        const model=sdk.getGenerativeModel(ai,params,{timeout:45000});
        if(lane==='nano'){
          let first=null,last=null;
          // SDK exposes progress events, not transfer start/end. Report an
          // observed event span, not an exact download duration.
          const deviceStart=performance.now();
          try {await model.initializeDeviceModel(progress=>{const t=performance.now();if(first===null)first=t;if(progress>=1)last=t;});}
          finally {onTiming('deviceInitializationMs',performance.now()-deviceStart);}
          if(first!==null){onTiming('downloadMs',last===null?null:last-first);onTiming('downloadMeasurement','progress_event_span_within_initialization');}
        }
        onTiming('initializationMs',performance.now()-initStart);signal.throwIfAborted();
        const inferStart=performance.now();
        // SDK 13.4 RequestOptions has timeout, but no public AbortSignal for
        // generateContent. Initializing Nano is cancellable via createOptions.
        // Cloud transport is bounded by SDK timeout. Native prompt cancellation
        // is not exposed by this SDK's public PromptOptions type; stale output
        // is ignored and this lane stays occupied until the operation settles.
        let result;
        try {result=await model.generateContent([prompt,{type:'inlineData',inlineData:{mimeType:capture.mimeType,data:capture.base64}}]);}
        finally {onTiming('inferenceMs',performance.now()-inferStart);}
        signal.throwIfAborted();
        return {text:result.response.text(),inferenceSource:result.response.inferenceSource,usageMetadata:result.response.usageMetadata??null,modelVersion:result.response.modelVersion??null};
      } finally {busy.delete(lane);}
    },
    async dispose(){if(contextPromise){const c=await contextPromise.catch(()=>null);if(c)await c.sdk.deleteApp(c.app);}}
  };
}
