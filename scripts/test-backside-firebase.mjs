// Explicit local operator test. Requires a separate work folder, existing public web
// config/consent, and one user-triggered comparison. Does not provision any service.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
import {build} from 'esbuild';
import {buildBacksideRequest} from '../experiments/board-library/backside-selection.mjs';
import {publicRuntimeConfig} from '../experiments/board-library/runtime-config.mjs';
import {saveJSON,ROOT} from '../experiments/board-library/catalog.mjs';
const [workArg,configArg,portArg='4208']=process.argv.slice(2);if(!workArg||!configArg)throw Error('Usage: node scripts/test-backside-firebase.mjs ISOLATED_WORK EXISTING_RUNTIME_CONFIG [PORT]');
const work=path.resolve(workArg),port=Number(portArg),origin=process.env.ITC_OPERATOR_ORIGIN||`http://localhost:${port}`,config=publicRuntimeConfig(JSON.parse(fs.readFileSync(configArg)));
const allowedHost=new URL(origin).host;
if(!/^http:\/\/localhost:\d+$/.test(origin)&&!/^https:\/\/[a-z0-9.-]+\.cloudshell\.dev$/.test(origin))throw Error('trusted_operator_origin_required');
if(!config.cloudEnabled)throw Error('cloud_disabled_by_operator');
if(fs.existsSync(path.join(work,'gemini-backside.json')))throw Error('use_fresh_test_work_not_previous_result');
const manifest=JSON.parse(fs.readFileSync(path.join(work,'input-manifest.json'))),observations=JSON.parse(fs.readFileSync(path.join(work,'observations.json'))),request=buildBacksideRequest(work,manifest.sources,observations);
const entry=`import {compareBacksidePhotos} from './experiments/board-library/backside-firebase-browser.mjs'; const b=document.querySelector('button'),out=document.querySelector('pre');b.onclick=async()=>{b.disabled=true;try{const input=await(await fetch('/request')).json();out.textContent='Comparando fotografías oficiales mediante Firebase AI Logic…';const result=await compareBacksidePhotos(input.config,input.request.parts);const r=await fetch('/result',{method:'POST',headers:{'Content-Type':'application/json','x-itc-local':'1'},body:JSON.stringify(result)});if(!r.ok)throw Error('result_write_failed');out.textContent=JSON.stringify(result,null,2);}catch(e){out.textContent=e.message;}};`;
const bundle=await build({stdin:{contents:entry,resolveDir:ROOT,sourcefile:'backside-live-test.mjs'},bundle:true,format:'esm',write:false});let issued=false,stored=false;
http.createServer(async(req,res)=>{
 const reply=(code,v)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(v));};
 try{
  if(![allowedHost,`localhost:${port}`,`127.0.0.1:${port}`].includes(req.headers.host))return reply(403,{error:'invalid_host'});
  if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><html lang="es"><meta charset="utf-8"><title>Prueba aislada de reverso · Firebase</title><body><h1>Comparar fotografías oficiales</h1><p>Una solicitud real; sin revisión manual del reverso, sin coordenadas previas. No modifica el catálogo original.</p><button>Comparar con Gemini una vez</button><pre id="result"></pre><script type="module" src="/bundle.js"></script></body></html>');return;}
  if(req.method==='GET'&&req.url==='/bundle.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(bundle.outputFiles[0].contents);return;}
  if(req.method==='GET'&&req.url==='/request'){if(issued)return reply(409,{error:'single_attempt_already_issued'});issued=true;return reply(200,{config,request});}
  if(req.method==='POST'&&req.url==='/result'){
   if(req.headers.origin!==origin||req.headers['x-itc-local']!=='1'||!issued||stored)return reply(403,{error:'invalid_result_submission'});
   const chunks=[];let size=0;for await(const b of req){size+=b.length;if(size>256000)throw Error('result_too_large');chunks.push(b);}
   const result=JSON.parse(Buffer.concat(chunks));if(result.modelRequested!==request.model||result.requests>1)throw Error('unexpected_test_result');
   saveJSON(path.join(work,'gemini-backside.json'),{...result,requestSHA256:request.requestSHA256,inputParts:request.parts.map(p=>p.inlineData?{mimeType:p.inlineData.mimeType,bytes:Buffer.from(p.inlineData.data,'base64').length}:p)});stored=true;return reply(200,{saved:true});
  }
  reply(404,{error:'not_found'});
 }catch(e){reply(400,{error:e.message});}
}).listen(port,'127.0.0.1',()=>console.log(origin));
