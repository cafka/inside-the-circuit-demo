import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {publicAddress,publicURL} from './public-fetch.mjs';
import {resourceRole,links,matchedModel,discoverByName,repositoryResources,compatibleProductHeading} from './discovery.mjs';
import {bindDocumentedDesignators} from './document-binding.mjs';
import {ROOT,profiles} from './catalog.mjs';
import {hash} from './glb.mjs';

test('Public fetch rejects local endpoints and credentials, including alternate IPv4 syntax',()=>{
 for(const u of ['http://example.com/file','https://127.0.0.1/file','https://2130706433/','https://user:pass@example.com','https://service.local/file','https://example.com:4433/file'])assert.throws(()=>publicURL(u));
 for(const ip of ['127.0.0.1','169.254.169.254','10.2.3.4','172.16.1.1','192.168.0.1','100.64.1.2','::1'])assert.equal(publicAddress(ip),false);
 assert.equal(publicAddress('8.8.8.8'),true);
});
test('An image does not swallow subsequent anchors or turn page prose into its label',()=>{
 const ls=links('<img src="/photo.png" alt="Board"><p>unrelated prose</p><a href="/manual.pdf">Manual</a>','https://manufacturer.example/');
 assert.deepEqual(ls.map(l=>[l.text,l.type]),[['Board','img'],['Manual','a']]);
});
test('Generic model selection excludes enclosures, accessories and library parts',()=>{
 for(const identity of [{manufacturer:'Example Labs',model:'Vector M8'},{manufacturer:'Other Vendor',model:'Proto 77'}]){
  const item=name=>({url:'https://publisher.example/'+encodeURIComponent(name)});
  assert.equal(resourceRole(item(identity.model+'.step'),identity),'requested_board');
  assert.equal(resourceRole(item(identity.manufacturer+' '+identity.model+' Altium.zip'),identity),'requested_board');
  assert.equal(resourceRole(item(identity.model+' Case.step'),identity),'related_variant');
  assert.equal(resourceRole(item(identity.model+' Wireless Add-on.step'),identity),'related_variant');
  assert.equal(resourceRole({url:'https://publisher.example/3dmodels/part.step'},identity),'part_or_template');
 }
});
test('Tutorial titles are not mistaken for model names',()=>{
 assert.equal(matchedModel('Example Labs Vector M8','Get started with Vector M8'),'Vector M8');
 assert.equal(matchedModel('Example Labs Vector M8','An unrelated board'),null);
});
test('Document identity rejects added variant tokens even with complete query coverage',()=>{
 assert.equal(compatibleProductHeading('Example Vector M8','Vector M8'),true);
 assert.equal(compatibleProductHeading('Example Vector M8','Example Vector M8 Display'),false);
 assert.equal(compatibleProductHeading('Example Vector M8','Vector M9'),false);
});
test('Name-only search does not need a prepared manufacturer profile',async()=>{
 const requested=[];const responses=new Map();
 responses.set('https://api.github.com/search/repositories?q='+encodeURIComponent('"Example Vector M8" in:readme')+'&per_page=8&sort=stars',{items:[{full_name:'hobby/project',html_url:'https://github.com/hobby/project'}],total_count:1});
 responses.set('https://api.github.com/repos/hobby/project/readme',{content:Buffer.from('[Example Vector M8](https://manufacturer.example/products/vector-m8/)').toString('base64')});
 responses.set('https://manufacturer.example/products/vector-m8/','<title>Vector M8 | Example</title><h1>Vector M8</h1><a href="/Vector-M8.step">CAD</a>');
 const client={log:[],get:async url=>{requested.push(url);assert.ok(responses.has(url),'Unexpected URL: '+url);const body=responses.get(url),bytes=Buffer.from(typeof body==='string'?body:JSON.stringify(body));return {url,bytes,sha256:hash(bytes),file:'fixture'};}};
 const d=await discoverByName('Example Vector M8',client);
 assert.equal(d.identity.model,'Vector M8');assert.equal(d.identity.hardwareRevision,null);assert.equal(d.resources[0].kind,'step');assert.equal(d.authority.status,'unverified');
 assert.equal(requested.length,3);assert.equal(profiles.some(p=>p.identity.model==='Vector M8'),false);
});
test('Repository links preserve their requested branch and pin raw assets to a commit, not a tree object',async()=>{
 const commit='a'.repeat(40),tree='b'.repeat(40),calls=[],client={log:[],get:async url=>{
  calls.push(url);let data;
  if(url.endsWith('/repos/vendor/hardware'))data={default_branch:'main'};
  else if(url.endsWith('/commits/release'))data={sha:commit};
  else if(url.includes('/git/trees/'+commit))data={sha:tree,tree:[{type:'blob',path:'boards/Vector M8.step',sha:'blob',size:20}]};
  else if(url.endsWith('/users/vendor'))data={type:'Organization'};
  else throw Error('unexpected_url');return {bytes:Buffer.from(JSON.stringify(data)),sha256:'response'};
 }};
 const evidence={identity:{model:'Vector M8'},repositories:[],errors:[],selectedPage:'https://manufacturer.example/products/vector-m8'};
 const assets=await repositoryResources(evidence,client,[{url:'https://github.com/vendor/hardware/tree/release/boards'}]);
 assert.equal(evidence.repositories[0].commit,commit);assert.equal(evidence.repositories[0].treeResponseSHA,tree);assert.ok(assets[0].url.includes(commit));assert.ok(calls.some(u=>u.endsWith('/commits/release')));
});
const inventory={nodes:[{index:0,name:'board',path:['board'],chain:[0],mesh:null,id:'root'},{index:1,name:'X7',path:['board','X7'],chain:[0,1],mesh:0,id:'n1'}]};
const document=ref=>({asset:{url:'https://manufacturer.example/design.zip'},data:{sha256:'source',member:'board.PcbDoc',components:[{SOURCEDESIGNATOR:ref,SOURCEDESCRIPTION:'Publisher description',PATTERN:'Package',LAYER:'TOP'}]}});
test('Exact documented designator binds using the original binder; no invented example',()=>{
 const r=bindDocumentedDesignators(inventory,[document('X7')]);assert.equal(r.components.length,1);assert.deepEqual(r.components[0].nodeIds,['n1']);assert.equal(r.components[0].description,'Publisher description');assert.equal(r.components[0].example,undefined);
});
test('Missing, repeated and near-matching designators do not gain identities',()=>{
 assert.equal(bindDocumentedDesignators(inventory,[document('X8')]).components.length,0);
 assert.equal(bindDocumentedDesignators(inventory,[document('X7'),document('X7')]).components.length,0);
 assert.equal(bindDocumentedDesignators(inventory,[document('X7-guess')]).components.length,0);
 const duplicate={nodes:[...inventory.nodes,{...inventory.nodes[1],index:2,id:'n2'}]};assert.equal(bindDocumentedDesignators(duplicate,[document('X7')]).components.length,0);
});
test('New engines contain no trial board name, manual profile or source coordinates',()=>{
 const files=['discovery.mjs','public-fetch.mjs','onboard-name.mjs','document-binding.mjs','inspect-ecad.py'];
 for(const file of files){const text=fs.readFileSync(path.join(ROOT,'experiments/board-library',file),'utf8');assert.doesNotMatch(text,/Coral|Raspberry|Arduino|ESP32|dev.board.micro/);}
});
