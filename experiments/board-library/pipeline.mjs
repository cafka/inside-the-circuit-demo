import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {spawn} from 'node:child_process';
import {hash,inspectGLB,bindComponents} from './glb.mjs';
import {DIR,ROOT,STORE,profiles,boardDir,saveJSON,readBoard,classifyMaterials,materialPolicy} from './catalog.mjs';
import {acquireEnrichmentSources,enrichCAD,enrichmentPolicy} from './enrichment.mjs';
import {completeDocumentedComponents} from './documented-components.mjs';
export const PIPELINE_VERSION='board-onboarding/2';
export function subprocess(command,args,onLine=()=>{},{timeoutMs=180000}={}) {
  return new Promise((resolve,reject)=>{
    const runtimeCommand=command==='python'&&process.env.ITC_PYTHON?process.env.ITC_PYTHON:command;
    const child=spawn(runtimeCommand,args,{cwd:ROOT,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',err='';
    const timer=setTimeout(()=>{child.kill();reject(Error('conversion_timeout'));},timeoutMs);
    child.stdout.on('data',b=>{output+=b;for(const l of b.toString().split('\n'))if(l.trim())onLine(l.trim());});child.stderr.on('data',b=>{err=(err+b).slice(-3000);});
    child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve(output):reject(Error(`converter_failed_${code}: ${err.slice(-500)}`));});
  });
}
const sourcePolicy=JSON.parse(fs.readFileSync(path.join(DIR,'source-policy.json')));
const allowedHost=h=>sourcePolicy.allowedHosts.includes(h);
export async function download(url,maxBytes=32*1024*1024,redirects=0) {
  const u=new URL(url);if(u.protocol!=='https:'||!allowedHost(u.hostname)||u.port||u.username||u.password||redirects>3)throw Error('source_host_not_registered');
  const response=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(response.status>=300&&response.status<400)return download(new URL(response.headers.get('location'),u).href,maxBytes,redirects+1);
  if(!response.ok)throw Error(`source_http_${response.status}`);
  if(Number(response.headers.get('content-length'))>maxBytes)throw Error('source_size_limit');
  const chunks=[];let count=0;for await(const b of response.body){count+=b.length;if(count>maxBytes){await response.body.cancel().catch(()=>{});throw Error('source_size_limit');}chunks.push(b);}
  return Buffer.concat(chunks);
}
export async function prepareBoard(profile,{onEvent=()=>{},manualFile=null}={}) {
  const started=performance.now(),d=boardDir(profile.id),timings={},events=[],notes=[];
  fs.mkdirSync(d,{recursive:true});
  const fingerprint=hash(JSON.stringify({profile,version:PIPELINE_VERSION,materialPolicy,enrichment:enrichmentPolicy.version,manualHash:manualFile?hash(manualFile.bytes):null}));
  const emit=(stage,status,detail)=>{const event={stage,status,detail,elapsedMs:performance.now()-started};events.push(event);onEvent(event);};
  if(fs.existsSync(path.join(d,'record.json'))){const saved=readBoard(profile.id);
    if(saved.fingerprint===fingerprint&&fs.existsSync(path.join(d,'model.glb'))&&hash(fs.readFileSync(path.join(d,'model.glb')))===saved.inventory.sourceHash){emit('cache','complete','Modelo y catálogo existentes verificados; sin descarga, conversión ni IA.');return{...saved,cacheHit:true,openPreparationMs:performance.now()-started};}
    throw Error('catalog_version_conflict_import_as_new_id');
  }
  async function stage(name,fn){emit(name,'running',null);const t=performance.now();const result=await fn();timings[name]=performance.now()-t;emit(name,'complete',null);return result;}
  try {
    const identity=await stage('identity',()=>({...profile.identity,basis:manualFile?'user_supplied_manual':'registered_name',probability:null}));
    let source={...profile.source},conversion=null,bytes,sourcePage=null;
    await stage('source',async()=>{
      if(manualFile){source={...source,authority:'manual_unverified',inputSHA256:hash(manualFile.bytes)};fs.writeFileSync(path.join(d,manualFile.kind==='step'?'input.step':'model.glb'),manualFile.bytes);return;}
      if(profile.preparedAsset){const file=path.resolve(ROOT,profile.preparedAsset.path);bytes=fs.readFileSync(file);if(hash(bytes)!==profile.preparedAsset.sha256)throw Error('prepared_asset_hash_mismatch');fs.copyFileSync(file,path.join(d,'model.glb'));source.acquisition='reused_verified_existing_asset';return;}
      const page=await download(source.pageUrl,6*1024*1024);sourcePage=page;const html=page.toString();
      const links=[...html.matchAll(/(?:href|url)\s*[=:]\s*["']([^"']+\.(?:zip|step|stp)(?:\?[^"']*)?)["']/gi)].map(m=>new URL(m[1].replace(/&amp;/g,'&'),source.pageUrl).href);
      // The registered manufacturer/model mapping is reviewed data, not guessed from an archive filename.
      if(!links.includes(source.url)&&!html.includes(new URL(source.url).pathname))throw Error('official_cad_link_no_longer_present');
      source.discovery={pageSHA256:hash(page),cadLinks:[...new Set(links)],selectedUrl:source.url,modelVerification:'reviewed_source_registry',revisionVerified:false};
      const archive=await download(source.url);if(hash(archive)!==source.archiveSHA256)throw Error('official_asset_changed_review_required');
      fs.writeFileSync(path.join(d,'source.zip'),archive);
      await subprocess('python',[path.join(DIR,'extract-step.py'),path.join(d,'source.zip'),source.stepMember,path.join(d,'input.step'),source.stepSHA256]);
      source.acquisition='official_page_link_and_archive_download';
    });
    await stage('conversion',async()=>{
      const input=path.join(d,'input.step');
      if(manualFile?.kind==='glb'||profile.preparedAsset){notes.push('Se reutilizó GLB: no se ejecutó conversión STEP.');return;}
      await subprocess('python',[path.join(DIR,'convert-step.py'),input,path.join(d,'model.glb'),'--sha256',hash(fs.readFileSync(input))],line=>{try{const v=JSON.parse(line);emit('conversion','progress',v.stage);}catch{}});
      conversion=JSON.parse(fs.readFileSync(path.join(d,'model.conversion.json')));
    });
    const inventory=await stage('inventory',()=>inspectGLB(fs.readFileSync(path.join(d,'model.glb'))));
    if(conversion&&inventory.triangles!==conversion.nativeTriangles)throw Error('export_triangle_loss');
    const reviewed=await stage('documentation',()=>bindComponents(inventory,profile.components||[]));
    const acquired=manualFile?{resources:[],errors:['manual_source_authority_unverified']}:await stage('enrichment_sources',()=>acquireEnrichmentSources(d,profile,{pageBytes:sourcePage}));
    const enriched=await stage('appearance',()=>enrichCAD(d,inventory,acquired.resources,{authority:source.authority,onEvent,baseSource:source,baseProvenance:profile.preparedAsset?.report?JSON.parse(fs.readFileSync(path.resolve(ROOT,profile.preparedAsset.report))):null}));
    const binding=await stage('components',()=>completeDocumentedComponents(inventory,enriched,reviewed));
    const components=binding.components;saveJSON(path.join(d,'binding-audit.json'),binding);
    const materials=profile.preparedAsset?.appearance?[]:classifyMaterials(inventory);
    const record={schema:PIPELINE_VERSION,id:profile.id,identity,source,fingerprint,preparedAt:new Date().toISOString(),profileVersion:profile.profileVersion,
      appearance:profile.preparedAsset?.appearance||'semantic-pbr',inventory,components,materials,conversion,automaticSurfaces:enriched.surfaces,enrichment:{...enriched.audit,acquisition:acquired},
      coverage:{boundComponents:components.filter(c=>c.bindingStatus==='bound').length,documentedComponents:components.filter(c=>c.bindingStatus==='bound'&&c.status==='documented').length,educationalCards:binding.generatedCards,
        meshNodes:inventory.meshes,unassignedMeshNodes:inventory.nodes.filter(n=>n.mesh!==null&&!components.some(c=>c.nodeIndices.includes(n.index))).length,
        materialProvisional:materials.filter(m=>m.status==='provisional').length,materialUnknown:materials.filter(m=>m.status==='unknown').length},
      limitations:[...(profile.limitations||[]),...notes],cloud:{requests:0,costUSD:0},timingsMs:timings,events};
    await stage('store',()=>{fs.writeFileSync(path.join(d,'model.glb.gz'),zlib.gzipSync(fs.readFileSync(path.join(d,'model.glb')),{level:9}));});
    record.totalMs=performance.now()-started;saveJSON(path.join(d,'record.json'),record);return record;
  }catch(error){saveJSON(path.join(d,'failure.json'),{error:error.message,events,timings,totalMs:performance.now()-started});throw error;}
}
if(process.argv[1]===fileURL()){
  const p=profiles.find(p=>p.id===process.argv[2]);if(!p)throw Error('unknown_profile');
  const r=await prepareBoard(p,{onEvent:e=>console.log(JSON.stringify(e))});console.log(JSON.stringify({id:r.id,cacheHit:!!r.cacheHit,coverage:r.coverage,totalMs:r.totalMs,conversion:r.conversion}));
}
function fileURL(){return path.join(DIR,'pipeline.mjs');}
