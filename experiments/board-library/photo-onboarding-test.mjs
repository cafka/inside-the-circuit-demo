import test from 'node:test';
import assert from 'node:assert/strict';
import {choosePhotoRoute,identifyPhotoAutomatically,resolvePhotoIdentity,PHOTO_PROMPT} from './photo-onboarding.mjs';
const config={firebase:{apiKey:'unit-test-not-a-key',projectId:'itc-nano-lab-20261121',appId:'1:970731928304:web:abcdef'},appCheck:{siteKey:'unit-test-not-a-key'}};
const environment={imageAvailability:'available'};
test('Automatic route prefers installed multimodal local; never downloads a model',()=>{
 assert.equal(choosePhotoRoute({environment,config,cloudConsent:true}).lane,'nano');
 assert.equal(choosePhotoRoute({environment:{imageAvailability:'downloadable'},config,cloudConsent:true}).lane,'cloud');
 assert.equal(choosePhotoRoute({environment:{imageAvailability:'downloadable'},config,cloudConsent:false}).lane,null);
});
test('Cloud requires existing configuration, explicit consent and remaining request allowance',()=>{
 for(const options of [{config:null,cloudConsent:true},{config,cloudConsent:false},{config,cloudConsent:true,cloudUsed:true}])assert.equal(choosePhotoRoute({environment:{imageAvailability:'unavailable'},...options}).lane,null);
});
test('Blocked real path never constructs an inference adapter and retains input hash',async()=>{
 const file=new File([new Uint8Array([255,216,255,1])],'no-model.jpg',{type:'image/jpeg'});
 const result=await identifyPhotoAutomatically(file,{environmentProbe:async()=>({imageAvailability:'api_not_exposed'}),adapterFactory:()=>{throw Error('must_not_construct');}});
 assert.equal(result.modelCalls,0);assert.equal(result.status,'blocked');assert.match(result.captureSHA256,/^[a-f0-9]{64}$/);assert.equal(result.inputFileNameSent,false);
});
const identity={manufacturer:'Vector Labs',model:'Vector M8',hardwareRevision:null};
test('Known identity opens saved record; new identity launches discovery automatically',async()=>{
 let action=null;
 const callbacks={identify:async()=>({status:'identified',candidates:[{...identity,id:'saved-test',saved:true}]}),open:async id=>action=id,prepareNew:async name=>action=name};
 assert.equal((await resolvePhotoIdentity({status:'identified',validation:{identity}},callbacks)).status,'cache');assert.equal(action,'saved-test');
 callbacks.identify=async()=>({status:'unknown',candidates:[]});assert.equal((await resolvePhotoIdentity({status:'identified',validation:{identity}},callbacks)).status,'new_board');assert.equal(action,'Vector Labs Vector M8');
});
test('Ambiguity, invalid responses and manufacturer conflicts do not start preparation',async()=>{
 const callbacks={identify:async()=>({status:'identified',candidates:[{id:'wrong',manufacturer:'Different',model:'Vector M8'}]}),open:()=>{throw Error('must_not_open');},prepareNew:()=>{throw Error('must_not_prepare');}};
 for(const status of ['ambiguous','invalid_response','identified'])assert.equal((await resolvePhotoIdentity({status,validation:{identity}},callbacks)).status,'needs_evidence');
});
test('Neutral prompt contains no trial board or fixed catalogue',()=>{
 assert.doesNotMatch(PHOTO_PROMPT,/Raspberry|Arduino|Coral|ESP32/);assert.match(PHOTO_PROMPT,/visible evidence/);
});
test('An incomplete saved dossier resumes only its exact previously requested identity',async()=>{
 let prepared=null;const observation={status:'identified',validation:{identity}};
 const callbacks={identify:async()=>({status:'identified',candidates:[{id:'dossier',saved:true,modelAvailable:false,manufacturer:null,model:'Vector M8',requestedName:'Vector Labs Vector M8'}]}),prepareNew:async name=>prepared=name,open:()=>{throw Error('dossier_is_not_a_model');}};
 assert.equal((await resolvePhotoIdentity(observation,callbacks)).status,'saved_dossier_resume');assert.equal(prepared,'Vector Labs Vector M8');
 callbacks.identify=async()=>({status:'identified',candidates:[{id:'other',saved:true,modelAvailable:false,manufacturer:null,model:'Vector M8',requestedName:'Another board'}]});prepared=null;
 assert.equal((await resolvePhotoIdentity(observation,callbacks)).status,'needs_evidence');assert.equal(prepared,null);
});
test('A failed Cloud attempt leaves cost unknown rather than claiming zero charge',async()=>{
 const file=new File([new Uint8Array([255,216,255,1])],'input.jpg',{type:'image/jpeg'});
 const result=await identifyPhotoAutomatically(file,{config,cloudConsent:true,environmentProbe:async()=>({imageAvailability:'unavailable'}),adapterFactory:()=>({preflight(){},infer:async()=>{throw Error('network_timeout');},dispose:async()=>{}})});
 assert.equal(result.status,'failed');assert.equal(result.modelCalls,1);assert.equal(result.costUSD,null);
});
