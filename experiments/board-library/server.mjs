import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {publicRuntimeConfig} from './runtime-config.mjs';
import {serverOrigins} from './server-origin.mjs';
import {DIR,ROOT,STORE,profiles,safeId,boardDir,saveJSON,readBoard,listBoards,identifyName,saveReview} from './catalog.mjs';
import {prepareBoard} from './pipeline.mjs';
import {onboardName,nameID} from './onboard-name.mjs';
const surfaceRegistry=JSON.parse(fs.readFileSync(path.join(DIR,'surface-markings.json'))),surfaceFiles=new Set(surfaceRegistry.assets.flatMap(a=>a.layers.map(l=>l.file)));
const geometryRegistry=JSON.parse(fs.readFileSync(path.join(DIR,'presentation-geometry.json'))),geometryFiles=new Set(geometryRegistry.assets.map(a=>a.file));
const port=Number(process.env.PORT||4188),origin=`http://127.0.0.1:${port}`,jobs=new Map();let active=null;
const access=serverOrigins(port,process.env.ITC_TRUSTED_PROXY_ORIGIN||'');
const libraryLock=JSON.parse(fs.readFileSync(path.join(ROOT,'config/library-lock.json')));
const libraryRoot=path.join(ROOT,'.local/library',libraryLock.commit);
const cameraProfiles=JSON.parse(fs.readFileSync(path.join(DIR,'camera-profiles.json'))),cameraAssets=Object.assign({},...cameraProfiles.profiles.map(p=>p.assets));
const fixtureManifest=JSON.parse(fs.readFileSync(path.join(ROOT,'experiments/fixtures-manifest.json')));
const jobsDir=path.join(STORE,'_jobs');fs.mkdirSync(jobsDir,{recursive:true});
for(const f of fs.readdirSync(jobsDir).filter(f=>f.endsWith('.json'))){const j=JSON.parse(fs.readFileSync(path.join(jobsDir,f)));if(j.status==='running'){j.status='interrupted';j.error='server_restarted';saveJSON(path.join(jobsDir,f),j);}jobs.set(j.id,j);}
const json=(res,code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
async function body(req){const chunks=[];let size=0;for await(const b of req){size+=b.length;if(size>110*1024*1024)throw Error('upload_size_limit');chunks.push(b);}return JSON.parse(Buffer.concat(chunks).toString());}
function launch(profile,options={}){
  if(active)throw Error('another_import_running');
  const job={id:crypto.randomUUID(),boardId:profile.id,flow:options.discoverName?'name':'profile',status:'running',events:[],startedAt:new Date().toISOString()};jobs.set(job.id,job);active=job.id;
  const persist=()=>saveJSON(path.join(jobsDir,job.id+'.json'),job);persist();
  (options.discoverName?onboardName(options.discoverName,{onEvent:e=>{job.events.push(e);persist();}}):prepareBoard(profile,{...options,onEvent:e=>{job.events.push(e);persist();}})).then(result=>{job.status='complete';job.preparationStatus=result.preparationStatus||'ready';job.modelAvailable=result.modelAvailable!==false;job.onboardingStages=result.onboarding?.stages;job.cacheHit=!!result.cacheHit;job.totalMs=result.cacheHit?result.openPreparationMs:result.totalMs;}).catch(error=>{job.status='failed';job.error=error.message;}).finally(()=>{job.endedAt=new Date().toISOString();active=null;persist();});return job;
}
const runtime=process.env.ITC_RUNTIME_CONFIG?JSON.parse(fs.readFileSync(process.env.ITC_RUNTIME_CONFIG)):{};
const publicRuntime=publicRuntimeConfig(runtime);
const server=http.createServer(async(req,res)=>{
  try{
    if(!access.acceptsHost(req.headers.host))return json(res,403,{error:'invalid_host'});
    const url=new URL(req.url,origin),parts=url.pathname.split('/').filter(Boolean);
    if(req.method==='POST'){
      if(req.headers['x-itc-local']!=='1'||!access.acceptsOrigin(req.headers.origin))return json(res,403,{error:'same_origin_required'});
      const b=await body(req);
      if(url.pathname==='/api/identify')return json(res,200,identifyName(b.name));
      if(url.pathname==='/api/onboard'){
        if(typeof b.name!=='string'||b.name.trim().length<4||b.name.length>140||/[<>\r\n]/.test(b.name))throw Error('invalid_board_name');
        return json(res,202,launch({id:nameID(b.name)},{discoverName:b.name.trim()}));
      }
      if(url.pathname==='/api/import'){
        const p=profiles.find(p=>p.id===b.profileId);if(!p)throw Error('source_not_registered_use_manual_import');
        return json(res,202,launch(p));
      }
      if(url.pathname==='/api/manual'){
        if(!safeId(b.id)||!b.model?.trim()||!['step','glb'].includes(b.kind)||typeof b.base64!=='string')throw Error('manual_fields_required');
        if(fs.existsSync(path.join(boardDir(b.id),'record.json')))throw Error('board_already_exists');
        const bytes=Buffer.from(b.base64,'base64');if(!bytes.length||bytes.length>80*1024*1024)throw Error('upload_size_limit');
        if(b.kind==='step'&&!bytes.subarray(0,100).toString().includes('ISO-10303-21'))throw Error('not_step');
        const p={id:b.id,profileVersion:1,identity:{manufacturer:String(b.manufacturer||'Desconocido').slice(0,120),model:b.model.slice(0,120),hardwareRevision:b.revision?.slice(0,120)||null,confidence:'user_supplied_unverified'},
          source:{authority:'manual_unverified',url:b.sourceUrl?.startsWith('https://')?b.sourceUrl:null,license:{id:b.license?.slice(0,120)||null,status:'user_supplied_unverified'},coverage:'Archivo aportado manualmente; alcance y revisión pendientes de verificar.'},components:[]};
        return json(res,202,launch(p,{manualFile:{kind:b.kind,bytes}}));
      }
      if(parts[0]==='api'&&parts[1]==='boards'&&parts[3]==='review')return json(res,200,saveReview(parts[2],b));
      return json(res,404,{error:'not_found'});
    }
    if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'method_not_allowed'});
    if(url.pathname==='/api/runtime-config')return json(res,200,publicRuntime);
    if(url.pathname==='/api/catalog')return json(res,200,{boards:listBoards(),registeredSources:profiles.map(p=>({id:p.id,identity:p.identity})),cloud:{billingActivation:false,reconstructionSessionConfigured:!!process.env.ITC_RECONSTRUCTION_SESSION,usageLocation:'per-board record.cloud and private session ledger'},activeJob:active});
    if(parts[0]==='api'&&parts[1]==='jobs')return json(res,jobs.has(parts[2])?200:404,jobs.get(parts[2])||{error:'job_not_found'});
    if(parts[0]==='api'&&parts[1]==='boards'&&parts.length===3)return json(res,200,readBoard(parts[2]));
    if(cameraAssets[url.pathname]){const relative=cameraAssets[url.pathname],entry=fixtureManifest.assets.find(a=>a.localPath===relative);if(!entry)throw Error('unknown_local_recognition_asset');const bytes=fs.readFileSync(path.join(ROOT,'.local/fixtures',relative));if(crypto.createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('local_recognition_asset_hash_mismatch');res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin'});res.end(req.method==='HEAD'?undefined:bytes);return;}
    let file,contentType,gzip=false;
    if(parts[0]==='library-assets'){
      const relative=parts.slice(2).join('/'),entry=libraryLock.files.find(f=>f.path===relative);
      if(parts[1]!==libraryLock.commit||!entry)return json(res,404,{error:'unknown_library_asset'});
      const target=path.resolve(libraryRoot,relative);if(!target.startsWith(libraryRoot+path.sep))return json(res,403,{error:'invalid_library_path'});
      if(!fs.existsSync(target))return json(res,503,{error:'run_npm_library_sync'});
      const bytes=fs.readFileSync(target),hash=crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      if(hash!==entry.sha)return json(res,503,{error:'library_integrity_failed'});
      res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[path.extname(target)]||'text/plain; charset=utf-8'),'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);return;
    }
    if(parts[0]==='board-assets'&&parts.length===3&&safeId(parts[1])&&/^(top|bottom)-(silk|contacts)\.png$/.test(parts[2])){const r=readBoard(parts[1]),asset=r.automaticSurfaces?.files.find(a=>a.file===parts[2]);if(!asset)throw Error('unknown_board_asset');file=path.join(boardDir(parts[1]),'surfaces',asset.file);if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==asset.sha256)throw Error('board_asset_hash_mismatch');contentType='image/png';}
    else if(parts[0]==='surface-markings'&&parts.length===2&&surfaceFiles.has(parts[1])){file=path.join(DIR,'assets/surface-markings',parts[1]);contentType='image/png';}
    else if(parts[0]==='presentation-geometry'&&parts.length===2&&geometryFiles.has(parts[1])){file=path.join(DIR,'assets/presentation-geometry',parts[1]);contentType='model/gltf-binary';}
    else if(parts[0]==='models'&&parts.length===2&&safeId(parts[1])){file=path.join(boardDir(parts[1]),'model.glb');contentType='model/gltf-binary';if(/\bgzip\b/.test(req.headers['accept-encoding']||'')&&fs.existsSync(file+'.gz')){file+='.gz';gzip=true;}}
    else {const routes={'/':'index.html','/library/':'index.html','/themes.css':'themes.css','/app.js':'public/app.js','/style.css':'style.css','/experience.css':'experience.css','/local-worker.js':'public/local-worker.js','/roboto-latin.woff2':'assets/roboto-latin.woff2','/Roboto-OFL.txt':'assets/Roboto-OFL.txt','/app.js.LEGAL.txt':'public/app.js.LEGAL.txt'};if(routes[url.pathname])file=path.join(DIR,routes[url.pathname]);contentType={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'}[path.extname(file||'')];}
    if(!file||!fs.existsSync(file))return json(res,404,{error:'not_found'});
    res.writeHead(200,{'Content-Type':contentType,'Content-Length':fs.statSync(file).size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin',...(gzip?{'Content-Encoding':'gzip','Vary':'Accept-Encoding'}:{})});
    if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
  }catch(error){json(res,400,{error:error.message.slice(0,800)});}
});
server.listen(port,'127.0.0.1',()=>console.log(`Catálogo local: ${origin}`));
