import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {acquireEnrichmentSources,enrichCAD,selfContainedVector} from '../experiments/board-library/enrichment.mjs';
import {compatibleProductHeading} from '../experiments/board-library/discovery.mjs';

test('new identities acquire only observed official links without a board-specific recipe', async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'itc-enrichment-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 for(const model of ['Vector M8','Assembly 91']){
  const calls=[],client={stats:()=>({requests:calls.length}),async get(url){calls.push(url);return {url,bytes:Buffer.from('source'),file:'source.bin',sha256:'source'};}};
  const profile={identity:{model},source:{authority:'official',pageUrl:'https://manufacturer.example/product/',url:'https://manufacturer.example/base.step'}};
  const pageBytes=Buffer.from(`<a href="/design.zip">CAD design</a><img src="/board.png" alt="${model}"><img src="/other.png" alt="Other board">`);
  const result=await acquireEnrichmentSources(directory,profile,{pageBytes,client});
  assert.deepEqual(calls,['https://manufacturer.example/design.zip','https://manufacturer.example/board.png']);
  assert.equal(result.resources.length,2);
 }
});

test('missing or unverified ECAD preserves the original CAD and invents no surfaces',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'itc-enrichment-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const r=await enrichCAD(directory,{sourceHash:'original'},[],{authority:'official'});
 assert.equal(r.surfaces,null);assert.equal(r.audit.sourceGeometryChanged,false);
 assert.equal(r.audit.errors[0].reason,'no_supported_source_ECAD');
 const denied=await enrichCAD(directory,{sourceHash:'original'},[],{authority:'unverified'});
 assert.equal(denied.audit.errors[0].reason,'source_authority_unverified');
});

test('datasheet suffix is allowed but a different model remains excluded',()=>{
 assert.equal(compatibleProductHeading('Example Vector M8','Vector M8 datasheet'),true);
 assert.equal(compatibleProductHeading('Example Vector M8','Vector M8 Pro datasheet'),false);
});

test('enrichment strategies contain no trial-board dispatch',()=>{
 for(const name of ['enrichment.mjs','prepare-physical-details.py','register-named-ecad.py']){
  const text=fs.readFileSync(new URL('../experiments/board-library/'+name,import.meta.url),'utf8');
  assert.doesNotMatch(text,/Coral|Raspberry|Arduino|ESP32|dev.board.micro/);
 }
});

test('official SVG still cannot load local files, external URLs, entities or active content',()=>{
 for(const text of ['<image href="file:///private.png"/>','<image href="https://other.example/p.png"/>','<image href="/local.png"/>','<path fill="url(file:///private.svg)"/>','<!ENTITY x "y">','<script>run()</script>'])assert.equal(selfContainedVector(Buffer.from(text)),false);
 assert.equal(selfContainedVector(Buffer.from('<svg><use href="#shape"/><path fill="url(#fill)"/></svg>')),true);
});
