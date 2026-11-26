import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {subprocess} from '../experiments/board-library/pipeline.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'release/catalog-manifest.json')));
const store=path.resolve(process.env.ITC_BOARD_STORE||path.join(root,'.local/release/catalog'));
const cache=process.env.ITC_RESOURCE_CACHE?path.resolve(process.env.ITC_RESOURCE_CACHE):null;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const safe=(base,relative)=>{const p=path.resolve(base,relative.replaceAll('\\','/'));if(!p.startsWith(path.resolve(base)+path.sep))throw Error('unsafe_resource_path');return p;};
const report={schema:'catalog-restoration/1',cloudCalls:0,boards:[]};
for(const plan of manifest.boards){
 const start=performance.now(),dest=safe(store,plan.id),seed=safe(root,'release/catalog/'+plan.id),result={id:plan.id,downloads:0,cacheReads:0};
 if(fs.existsSync(path.join(dest,'record.json'))){
  if(sha(fs.readFileSync(path.join(dest,'model.glb')))!==plan.modelSHA256)throw Error('existing_catalog_conflict:'+plan.id);
  result.status='existing_verified';result.ms=performance.now()-start;report.boards.push(result);continue;
 }
 fs.mkdirSync(dest,{recursive:true});
 for(const a of plan.downloads){
  let bytes;
  const cached=cache&&path.join(cache,a.sha256);
  if(cached&&fs.existsSync(cached)){bytes=fs.readFileSync(cached);result.cacheReads++;}
  else{
   // Downloads are pinned official resources, never arbitrary runtime model output.
   const u=new URL(a.url);if(u.protocol!=='https:')throw Error('https_required');
   const response=await fetch(u,{signal:AbortSignal.timeout(60000),redirect:'error'});
   if(!response.ok)throw Error('resource_http_'+response.status);
   const chunks=[];let size=0;for await(const b of response.body){size+=b.length;if(size>128*1024*1024)throw Error('resource_size_limit');chunks.push(b);}bytes=Buffer.concat(chunks);result.downloads++;
  }
  if(sha(bytes)!==a.sha256)throw Error('resource_changed:'+a.sha256);
  if(a.decodePNG){bytes=await sharp(bytes).rotate().png().toBuffer();if(sha(bytes)!==a.decodedSHA256)throw Error('image_decoder_version_mismatch');}
  const file=safe(dest,a.file);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);
 }
 for(const a of plan.files){const bytes=fs.readFileSync(safe(seed,a.file));if(sha(bytes)!==a.sha256)throw Error('seed_asset_hash_mismatch');const to=safe(dest,a.file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,bytes);}
 if(plan.modelCopy)fs.copyFileSync(safe(root,plan.modelCopy),path.join(dest,'model.glb'));
 if(plan.generator==='step'){
  await subprocess(process.env.ITC_PYTHON||'python',['experiments/board-library/extract-step.py',safe(dest,plan.step.archive),plan.step.member,path.join(dest,'input.step'),plan.step.sha256]);
  await subprocess(process.env.ITC_PYTHON||'python',['experiments/board-library/convert-step.py',path.join(dest,'input.step'),path.join(dest,'model.glb'),'--sha256',plan.step.sha256]);
 }
 if(plan.generator==='photo'){
  fs.cpSync(path.join(seed,'reconstruction'),path.join(dest,'reconstruction'),{recursive:true});
  await subprocess(process.env.ITC_PYTHON||'python',['experiments/board-library/generate-photo-model.py',path.join(dest,'reconstruction'),path.join(dest,'model.glb')]);
 }
 const model=fs.readFileSync(path.join(dest,'model.glb'));if(sha(model)!==plan.modelSHA256)throw Error('generated_model_differs_review_required:'+plan.id);
 // Publication snapshots explicitly preserve provenance but do not pretend to be a new discovery.
 const record=JSON.parse(fs.readFileSync(path.join(seed,'record.json')));record.releaseRestoration={schema:manifest.schema,verifiedModelSHA256:sha(model),sourceAcquisition:'pinned_catalogue_restore',cloudCalls:0};
 fs.writeFileSync(path.join(dest,'model.glb.gz'),zlib.gzipSync(model));
 if(fs.existsSync(path.join(seed,'cad-audit.json')))fs.copyFileSync(path.join(seed,'cad-audit.json'),path.join(dest,'cad-audit.json'));
 for(const a of record.onboarding?.resources||[])if(a.status==='downloaded'&&!fs.existsSync(safe(dest,a.file))){a.originalAcquisitionStatus=a.status;a.status='reference_only_not_cached';}
 fs.writeFileSync(path.join(dest,'record.json'),JSON.stringify(record,null,2));
 result.status='restored_verified';result.ms=performance.now()-start;report.boards.push(result);
 console.log(JSON.stringify(result));
}
fs.mkdirSync(store,{recursive:true});fs.writeFileSync(path.join(store,'restoration-receipt.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
