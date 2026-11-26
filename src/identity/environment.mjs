// Read-only availability probe. Does not initialize/download a model, authenticate
// to Firebase, send an image, or infer the Nano generation from a browser version.
export async function inspectEnvironment(){
  const result={schemaVersion:'itc-identity-environment/1.0.0',evidenceKind:'real_environment_no_inference',observedAtUTC:new Date().toISOString(),
    secureContext:globalThis.isSecureContext===true,userAgent:navigator.userAgent,logicalCPU:navigator.hardwareConcurrency,
    reportedDeviceMemoryGiB:navigator.deviceMemory??null,promptAPIPresent:typeof globalThis.LanguageModel!=='undefined',
    imageAvailability:null,nanoGeneration:'UNVERIFIED',modelCalls:0,modelDownloadsStarted:0};
  if(result.promptAPIPresent){try{result.imageAvailability=await globalThis.LanguageModel.availability({expectedInputs:[{type:'text',languages:['en']},{type:'image'}],expectedOutputs:[{type:'text',languages:['en']}]});}catch{result.imageAvailability='probe_error';}}
  else result.imageAvailability='api_not_exposed';
  return result;
}
