// Authenticated Cloud Shell preview only. No deployment or catalogue access.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {build} from 'esbuild';
const [dir,runtime,port='8080']=process.argv.slice(2),root=path.resolve(dir);fs.mkdirSync(path.join(root,'calls'),{recursive:true});
await build({entryPoints:['experiments/multimodal-cad/browser-client.mjs'],bundle:true,format:'esm',outfile:path.join(root,'client.js'),logLevel:'silent'});
const allowed=new Set(['candidates.json','render.json','documents.json','reference.png','front-labelled.png','back-labelled.png','target-a.jpg','target-b.jpg']);
const cases=new Set(['baseline-target-a','cad-target-a','cad-target-b']);
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://localhost'),name=u.pathname.split('/')[2];res.setHeader('Cache-Control','no-store');
 if(req.method==='POST'){
  const origin=new URL(req.headers.origin);if(!origin.hostname.endsWith('.cloudshell.dev')&&!['127.0.0.1','localhost'].includes(origin.hostname))throw Error('Origin');
  if(!cases.has(name))throw Error('Case');
  if(u.pathname.startsWith('/reserve/')){fs.writeFileSync(path.join(root,'calls',name+'.lock'),new Date().toISOString(),{flag:'wx'});res.end('reserved');return;}
  if(u.pathname.startsWith('/result/')){let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>1000000)throw Error('Size');chunks.push(c);}const value=JSON.parse(Buffer.concat(chunks));fs.writeFileSync(path.join(root,'calls',name+'.json'),JSON.stringify(value,null,2),{flag:'wx'});res.end('saved');return;}
 }
 if(req.method!=='GET')throw Error('Method');
 if(u.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="es"><meta charset="utf-8"><title>Comparación aislada CAD y foto</title><style>body{font:16px system-ui;background:#182331;color:white;padding:20px}select,button{font:inherit;padding:12px;margin:8px}pre{white-space:pre-wrap}a{color:#86cfff}</style><h1>Experimento aislado · CAD y fotografía</h1><p>Máximo tres llamadas. No cambia el catálogo ni el despliegue.</p><label>Ruta <select id="mode"><option value="baseline">Control: foto sola</option><option value="cad">CAD + documento + foto</option></select></label><label>Foto <select id="target"><option value="target-a.jpg">A</option><option value="target-b.jpg">B</option></select></label><button id="run">Enviar una llamada a Gemini</button><p id="status">Listo</p><a id="download" hidden>Descargar respuesta completa</a><pre id="output"></pre><script type="module" src="/client.js"></script></html>');return;}
 let file;if(u.pathname==='/runtime.json')file=runtime;else if(u.pathname==='/client.js')file=path.join(root,'client.js');else if(u.pathname.startsWith('/input/')&&allowed.has(name))file=path.join(root,name);else if(u.pathname.startsWith('/result/')&&cases.has(name))file=path.join(root,'calls',name+'.json');else throw Error('Path');
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.png')?'image/png':file.endsWith('.jpg')?'image/jpeg':'application/json');res.end(fs.readFileSync(file));
 }catch(e){res.writeHead(400);res.end('Isolated request rejected');}}).listen(Number(port),'0.0.0.0',()=>console.log('preview '+port));
setTimeout(()=>server.close(()=>process.exit(0)),25*60*1000).unref();
