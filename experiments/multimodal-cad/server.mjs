// Loopback-only artifact renderer. Does not read or write any saved catalogue.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';import {threeDirectory} from './dependencies.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),directory=path.resolve(process.argv[2]),port=Number(process.argv[3]||4214),origin='http://127.0.0.1:'+port;
await build({entryPoints:[path.join(here,'render.mjs')],bundle:true,format:'esm',outfile:path.join(directory,'render.js'),alias:{'three/addons':path.join(threeDirectory,'examples/jsm'),three:path.join(threeDirectory,'build/three.module.js')},logLevel:'silent'});
const artifacts=new Set(['front-cad.png','front-ids.png','front-labelled.png','back-cad.png','back-ids.png','back-labelled.png','render.json']);
const readable=new Set(['geometry.glb','candidates.json','render.js']);
http.createServer(async(req,res)=>{
 try{
  if(req.headers.host!==new URL(origin).host)throw Error('host');const url=new URL(req.url,origin);
  if(req.method==='POST'&&req.headers.origin===origin&&url.pathname.startsWith('/artifact/')){
   const name=url.pathname.slice(10);if(!artifacts.has(name))throw Error('artifact');const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>12*1024*1024)throw Error('size');chunks.push(c);}fs.writeFileSync(path.join(directory,name),Buffer.concat(chunks));res.end('saved');return;
  }
  if(req.method!=='GET')throw Error('method');
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="es"><meta charset="utf-8"><title>Experimento CAD anónimo</title><style>body{background:#1f2834;color:white;font:16px sans-serif;margin:16px}button{padding:12px}canvas{max-width:100%;height:auto}pre{white-space:pre-wrap}</style><h1>CAD original · extracción automática</h1><button>Renderizar y guardar vistas</button><pre id="status">Cargando…</pre><div id="view"></div><script type="module" src="/render.js"></script></html>');return;}
  const name=url.pathname.slice(1);if(!readable.has(name))throw Error('path');res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.json')?'application/json':'model/gltf-binary');fs.createReadStream(path.join(directory,name)).pipe(res);
 }catch{res.writeHead(400);res.end('Invalid isolated request');}
}).listen(port,'127.0.0.1',()=>console.log(origin));
