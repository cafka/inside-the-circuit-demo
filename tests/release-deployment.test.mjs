import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {serverOrigins} from '../experiments/board-library/server-origin.mjs';
import {publicRuntimeConfig} from '../experiments/board-library/runtime-config.mjs';
test('Enterprise App Check provider survives public configuration without debug credentials',()=>{
 const r=publicRuntimeConfig({appCheck:{siteKey:'public',provider:'recaptcha-enterprise',debugToken:'secret'}});
 assert.deepEqual(r.appCheck,{siteKey:'public',provider:'recaptcha-enterprise'});
});
test('Preview proxy allows only the explicit HTTPS host and origin',()=>{
 const a=serverOrigins(8080,'https://preview.example.test');
 assert.ok(a.acceptsHost('127.0.0.1:8080'));assert.ok(a.acceptsHost('preview.example.test'));
 assert.ok(a.acceptsOrigin('https://preview.example.test'));assert.ok(!a.acceptsOrigin('https://attacker.test'));
 assert.ok(!a.acceptsHost('preview.example.test.attacker.test'));assert.throws(()=>serverOrigins(8080,'http://public.test'));
 assert.throws(()=>serverOrigins(8080,'https://user:password@public.test'));
});
test('Pinned library URL matches its immutable publication lock',()=>{
 const c=JSON.parse(fs.readFileSync('config/library.json')),lock=JSON.parse(fs.readFileSync('config/library-lock.json'));
 assert.equal(c.verifiedCommit,lock.commit);assert.ok(c.url.includes(lock.commit));
 assert.ok(lock.files.every(f=>!f.path.includes('..')&&/^[a-f0-9]{40}$/.test(f.sha)));
});
