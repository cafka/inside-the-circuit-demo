// Explicit public web configuration allowlist; private operator/session fields never cross HTTP.
export function publicRuntimeConfig(runtime={}){
 const fields=['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId','measurementId'];
 const firebase=runtime.firebase?Object.fromEntries(fields.filter(k=>typeof runtime.firebase[k]==='string').map(k=>[k,runtime.firebase[k]])):null;
 const calls=runtime.maxCloudCallsPerSession??1;
 const appCheck=typeof runtime.appCheck?.siteKey==='string'?{siteKey:runtime.appCheck.siteKey,...(runtime.appCheck.provider==='recaptcha-enterprise'?{provider:'recaptcha-enterprise'}:{})}:null;
 return {firebase,appCheck,cloudEnabled:runtime.cloudEnabled===true,maxCloudCallsPerSession:Number.isInteger(calls)?Math.max(0,Math.min(5,calls)):0,cloudConsentVersion:typeof runtime.cloudConsentVersion==='string'?runtime.cloudConsentVersion:'photo-upload-v1'};
}
