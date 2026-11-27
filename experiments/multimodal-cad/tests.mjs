import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {THREE} from './dependencies.mjs';import {selectCandidates} from './prepare.mjs';import {validate,prompt} from './contract.mjs';
const policy=JSON.parse(fs.readFileSync(new URL('./policy.json',import.meta.url)));
test('two different synthetic layouts use the same extractor with no board names',()=>{
 for(const size of [[70,40],[110,65]]){const scene=new THREE.Group(),pcb=new THREE.Mesh(new THREE.BoxGeometry(size[0],1.5,size[1]));pcb.name='substrate';scene.add(pcb);
 for(let i=0;i<8;i++){const x=new THREE.Mesh(new THREE.BoxGeometry(6+i%3,2+i%4,5));x.name='anonymous-'+i;x.position.set((i%4-1.5)*size[0]/5,2+i%3,(Math.floor(i/4)-.5)*size[1]/2);scene.add(x);}
 scene.updateMatrixWorld(true);const r=selectCandidates(scene,policy);assert.equal(r.candidates.length,8);assert.equal(r.meshCount,9);assert.equal(new Set(r.candidates.flatMap(c=>c.meshIds)).size,8);}
});
test('extraction explicitly abstains without a supported planar substrate',()=>{const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(4,4,4)));root.updateMatrixWorld(true);assert.throws(()=>selectCandidates(root,policy),/capability unmet/);});
test('duplicate identities and contradictory abstention coordinates are rejected',()=>{const p={candidateId:'P001',view:'front',status:'ambiguous',photoBox:[0,0,10,10],photoAnchor:null,documentLineIds:[],alternatives:[]};assert.equal(validate({boardRelation:'uncertain',items:[p,p]},['P001'],{documents:[]}).valid,false);});
test('changing evaluation files cannot affect the input packet; inference process cannot read them',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'itc-cad-isolation-')),input=path.join(root,'input'),evaluation=path.join(root,'evaluation');fs.mkdirSync(input);fs.mkdirSync(evaluation);
 fs.writeFileSync(path.join(input,'packet.json'),JSON.stringify({prompt,candidates:['P001']}));const privateFile=path.join(evaluation,'oracle.json');
 const code="const fs=require('fs'),c=require('crypto');let denied=false;try{fs.readFileSync(process.argv[2]);}catch(e){denied=e.code==='ERR_ACCESS_DENIED'}if(!denied)process.exit(9);process.stdout.write(c.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))";
 const run=()=>spawnSync(process.execPath,['--permission','--allow-fs-read='+input,'-e',code,path.join(input,'packet.json'),privateFile],{encoding:'utf8'});
 fs.writeFileSync(privateFile,'{"identities":["answer A"]}');const a=run();fs.writeFileSync(privateFile,'{"identities":["different answers and locations"]}');const b=run();assert.equal(a.status,0,a.stderr);assert.equal(b.status,0,b.stderr);assert.equal(a.stdout,b.stdout);
 assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('itc-cad-isolation-'));fs.rmSync(root,{recursive:true,force:true});
});
