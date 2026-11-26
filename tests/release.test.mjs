import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {identifyPhotoAutomatically} from '../experiments/board-library/photo-onboarding.mjs';
import {pi5,unknown} from './helpers/identity.mjs';
import {publicRuntimeConfig} from '../experiments/board-library/runtime-config.mjs';
const config={firebase:{apiKey:'unit-test-not-a-key',projectId:'itc-nano-lab-20261121',appId:'1:970731928304:web:abcdef'},appCheck:{siteKey:'unit-test-not-a-key'}};
const file=()=>new File([new Uint8Array([255,216,255,1])],'neutral.jpg',{type:'image/jpeg'});
test('Runtime endpoint omits operator secrets and respects a zero request allowance',()=>{
 const result=publicRuntimeConfig({firebase:{projectId:'test',private_key:'do-not-export'},appCheck:{siteKey:'public',debugToken:'do-not-export'},maxCloudCallsPerSession:0,privateConfig:'/private/file'});
 assert.equal(result.maxCloudCallsPerSession,0);assert.deepEqual(result.firebase,{projectId:'test'});assert.deepEqual(result.appCheck,{siteKey:'public'});assert.ok(!JSON.stringify(result).includes('do-not-export'));
});
test('Controlled double: authorized fallback follows local technical failure, preserving both attempts',async()=>{
 const calls=[];let allowance=0;
 const r=await identifyPhotoAutomatically(file(),{config,cloudConsent:true,onCloudUse:()=>allowance++,environmentProbe:async()=>({imageAvailability:'available'}),adapterFactory:()=>({preflight(){},redact:s=>s,dispose:async()=>{},infer:async({lane})=>{calls.push(lane);if(lane==='nano')throw Error('unavailable');return{text:JSON.stringify(pi5()),inferenceSource:'in_cloud',usageMetadata:{totalTokenCount:100}};}})});
 assert.deepEqual(calls,['nano','cloud']);assert.equal(allowance,1);assert.equal(r.status,'identified');assert.equal(r.attempts[0].status,'failed');assert.equal(r.costUSD,null);
});
test('Controlled double: unknown local identity does not spend Cloud allowance',async()=>{
 const calls=[];const r=await identifyPhotoAutomatically(file(),{config,cloudConsent:true,environmentProbe:async()=>({imageAvailability:'available'}),adapterFactory:()=>({preflight(){},redact:s=>s,dispose:async()=>{},infer:async({lane})=>{calls.push(lane);return{text:JSON.stringify(unknown()),inferenceSource:'on_device'};}})});
 assert.deepEqual(calls,['nano']);assert.equal(r.status,'unknown');assert.equal(r.costUSD,0);
});
test('Every frozen catalogue association resolves to original geometry without a duplicate owner',()=>{
 const manifest=JSON.parse(fs.readFileSync('release/catalog-manifest.json'));let total=0;
 for(const p of manifest.boards){const r=JSON.parse(fs.readFileSync(path.join('release/catalog',p.id,'record.json'))),nodes=new Map(r.inventory.nodes.map(n=>[n.id,n])),owners=new Set();
  for(const c of r.components){assert.ok(c.nodeIds.length);for(const id of c.nodeIds){assert.ok(nodes.has(id),id);assert.ok(!owners.has(id),'multiple owners '+id);owners.add(id);}total++;}
 }
 assert.equal(total,247); // Frozen release data assertion, not a recognition-engine prior.
});
test('Educational height is explicitly policy-driven and does not invent physical measurements',()=>{
 const policy=JSON.parse(fs.readFileSync('experiments/board-library/reconstruction-presentation-policy.json'));assert.equal(policy.minimumComponentReliefMm,.6);
 const manifest=JSON.parse(fs.readFileSync('release/catalog-manifest.json'));
 for(const p of manifest.boards.filter(p=>p.generator==='photo')){const r=JSON.parse(fs.readFileSync(path.join('release/catalog',p.id,'record.json')));assert.equal(r.reconstruction.volumes,0);assert.equal(r.reconstruction.educationalReliefVolumes,13);assert.ok(r.reconstruction.educationalThickness.valueMm+policy.minimumComponentReliefMm<r.reconstruction.educationalThickness.assemblyMaxMm);}
});
test('Library compatibility does not treat all ESP32 boards as pin-compatible',()=>{
 const c=JSON.parse(fs.readFileSync('config/library.json'));assert.ok(c.books.find(b=>b.model==='Raspberry Pi 5').compatibility.startsWith('exact_'));assert.equal(c.books.find(b=>b.id==='esp32').compatibility,'not_Arduino_Nano_ESP32');
});
