// Curated, history-free Firebase Hosting payload. No input photos, sessions or arbitrary files.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {build} from 'esbuild';
import {ROOT,DIR,STORE,listBoards,readBoard} from '../experiments/board-library/catalog.mjs';
import {publicRuntimeConfig} from '../experiments/board-library/runtime-config.mjs';
const [output,configFile]=process.argv.slice(2);if(!output||!configFile)throw Error('Usage: ITC_BOARD_STORE=... node scripts/build-jury-hosting.mjs NEW_OUTPUT PUBLIC_RUNTIME_CONFIG');
const dest=path.resolve(output);if(fs.existsSync(dest))throw Error('output_must_be_new');
fs.mkdirSync(dest,{recursive:true});
const hashes=[],sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function write(relative,bytes){const to=path.resolve(dest,relative);if(!to.startsWith(dest+path.sep))throw Error('unsafe_export');fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,bytes);hashes.push({file:relative,sha256:sha(bytes),bytes:Buffer.byteLength(bytes)});}
const clean=value=>{
 if(typeof value==='string')return /(?:[A-Z]:[\\/]|\/(?:home|Users|tmp)\/)/.test(value)?'[private local path omitted]':value;
 if(Array.isArray(value))return value.map(clean);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!/(?:token|secret|privateConfig|authorization|sessionFile)/i.test(k)).map(([k,v])=>[k,clean(v)]));
 return value;
};
const json=(p,v)=>write(p,JSON.stringify(clean(v)));
for(const name of ['index.html','style.css','experience.css','themes.css'])write(name,fs.readFileSync(path.join(DIR,name)));
for(const name of ['roboto-latin.woff2','Roboto-OFL.txt'])write(name,fs.readFileSync(path.join(DIR,'assets',name)));
const bundled=await build({entryPoints:[path.join(DIR,'app.mjs')],nodePaths:[path.join(ROOT,'experiments/cad-viewer/node_modules')],bundle:true,format:'esm',minify:true,legalComments:'linked',target:['es2022'],outfile:'app.js',write:false});
for(const f of bundled.outputFiles)write(path.basename(f.path),f.contents);
write('local-worker.js',fs.readFileSync(path.join(DIR,'public/local-worker.js')));
const runtime=publicRuntimeConfig(JSON.parse(fs.readFileSync(configFile)));
json('api/runtime-config',{...runtime,hostedCapabilities:{readOnlyCatalog:true,photoVerification:false},deploymentCommit:process.env.ITC_BUILD_SHA||null});
const surface=JSON.parse(fs.readFileSync(path.join(DIR,'surface-markings.json'))),geometry=JSON.parse(fs.readFileSync(path.join(DIR,'presentation-geometry.json')));
const boards=listBoards().flatMap(b=>{
 const pinned=path.join(ROOT,'release/catalog',b.id,'record.json');
 const seed=fs.existsSync(pinned)?JSON.parse(fs.readFileSync(pinned)):null;
 const current=readBoard(b.id);
 if(seed?.inventory?.sourceHash===current.inventory.sourceHash&&seed?.source?.url===b.source.url&&seed.source.license?.redistributionAuthorized===true)b.source={...b.source,license:seed.source.license};
 return ['MIT','Apache-2.0'].includes(b.source?.license?.id)&&(b.source.license.status==='verified'||b.source.license.redistributionAuthorized===true)?[b]:[];
});
if(!boards.length)throw Error('no_redistributable_boards');
for(const b of boards){
 const rec=readBoard(b.id),folder=path.join(STORE,b.id);
 write('models/'+b.id,fs.readFileSync(path.join(folder,'model.glb')));
 json('api/boards/'+b.id,{...rec,source:b.source});
 const a=rec.automaticSurfaces;
 for(const f of [...(a?.files||[]),a?.presentationGeometry].filter(f=>f?.file)){
  const bytes=fs.readFileSync(path.join(folder,'surfaces',f.file));if(sha(bytes)!==f.sha256)throw Error('surface_hash_mismatch');
  write('board-assets/'+b.id+'/'+f.file,bytes);
 }
 if(!a?.files?.length)for(const f of (surface.assets.find(a=>a.baseGLBSHA256===rec.inventory.sourceHash)?.layers||[]))write('surface-markings/'+f.file,fs.readFileSync(path.join(DIR,'assets/surface-markings',f.file)));
 const g=geometry.assets.find(a=>a.baseGLBSHA256===rec.inventory.sourceHash);if(g)write('presentation-geometry/'+g.file,fs.readFileSync(path.join(DIR,'assets/presentation-geometry',g.file)));
}
json('api/catalog',{boards,registeredSources:[],cloud:{billingActivation:false,reconstructionSessionConfigured:false},activeJob:null});
for(const f of ['LICENSE','THIRD_PARTY_NOTICES.md'])write(f,fs.readFileSync(path.join(ROOT,f)));
write('CAD_LICENSE.txt',fs.readFileSync(path.join(ROOT,'experiments/cad-viewer/CAD_LICENSE.txt')));
for(const b of boards){const seed=path.join(ROOT,'release/catalog',b.id);if(fs.existsSync(seed))for(const f of fs.readdirSync(seed).filter(f=>/license|notice/i.test(f)))write('licenses/'+b.id+'/'+f,fs.readFileSync(path.join(seed,f)));}
json('build-manifest.json',{schema:'jury-hosting/1',boards:boards.map(b=>b.id),savedCatalogueReadOnly:true,files:hashes.slice()});
fs.writeFileSync(path.join(path.dirname(dest),'firebase.json'),JSON.stringify({hosting:{site:runtime.firebase.projectId,public:path.basename(dest),ignore:['firebase.json','**/.*','**/node_modules/**'],headers:[{source:'/api/**',headers:[{key:'Content-Type',value:'application/json; charset=utf-8'},{key:'Cache-Control',value:'no-store'}]},{source:'/**',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'no-referrer'}]},{source:'/models/**',headers:[{key:'Content-Type',value:'model/gltf-binary'}]}],rewrites:[{source:'/library/**',destination:'/index.html'}]}},null,2));
console.log(JSON.stringify({output:dest,boards:boards.map(b=>b.identity.model),files:hashes.length,bytes:hashes.reduce((n,f)=>n+f.bytes,0)}));
