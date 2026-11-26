import fs from 'node:fs';
import path from 'node:path';
import {DIR,ROOT,saveJSON} from './catalog.mjs';
import {hash} from './glb.mjs';
import {subprocess} from './pipeline.mjs';
import {createPublicFetcher} from './public-fetch.mjs';
const policy=JSON.parse(fs.readFileSync(path.join(DIR,'enrichment-policy.json')));

// Both sources must agree physically. Filenames rank work; they never validate it.
export async function enrichCADGraphics(directory,inventory,resources,{baseSource,baseProvenance,onEvent=()=>{}}={}){
 const start=performance.now(),work=path.join(directory,'cad-graphics'),audit={status:'not_available',candidates:[],sourceGeometryChanged:false};
 fs.mkdirSync(work,{recursive:true});
 const finish=layers=>{audit.totalMs=performance.now()-start;saveJSON(path.join(work,'audit.json'),audit);return {audit,layers:layers||[]};};
 const candidates=resources.filter(a=>a.status==='downloaded'&&['cad','step'].includes(a.kind)&&!['related_variant','part_or_template'].includes(a.role)&&a.url!==baseSource?.url).sort((a,b)=>Number(/graphics|artwork|silk/i.test(b.text+' '+b.url))-Number(/graphics|artwork|silk/i.test(a.text+' '+a.url))).slice(0,policy.maxGraphicsCandidates);
 if(!candidates.length){audit.reason='no_additive_cad_source';return finish();}
 async function convert(source,out,expected=null){
  fs.mkdirSync(out,{recursive:true});const input=path.join(out,'input.step');
  await subprocess('python',[path.join(DIR,'extract-graphics-source.py'),source,input,String(policy.maxExpandedSTEPBytes)]);
  const evidence=JSON.parse(fs.readFileSync(path.join(out,'input.source.json')));
  if(expected&&evidence.sha256!==expected)throw Error('base_step_provenance_mismatch');
  onEvent({stage:'appearance',status:'progress',detail:'converting_source_CAD_graphics'});
  const file=path.join(out,'native.glb');await subprocess('python',[path.join(DIR,'convert-step.py'),input,file,'--sha256',evidence.sha256],()=>{},{timeoutMs:policy.graphicsConversionTimeoutMs});
  return {file,evidence,conversion:JSON.parse(fs.readFileSync(path.join(out,'native.conversion.json')))};
 }
 let baseline=path.join(directory,'model.glb');
 try{
  if(baseProvenance){
   // Optional content-addressed cache holds a native source conversion, never
   // finished artwork. A full triangle bridge is checked on every generation.
   const expected=baseProvenance.nativeGLBSHA256;
   const cache=expected&&path.join(process.env.ITC_CAD_SOURCE_CACHE||path.join(ROOT,'.local/cad-source-cache'),expected+'.glb');
   if(cache&&fs.existsSync(cache)&&hash(fs.readFileSync(cache))===expected){baseline=cache;audit.baseline={mode:'verified_native_source_cache',sha256:expected};}
   else{
    if(!baseSource?.url||!baseProvenance.sourceSHA256)throw Error('native_base_source_missing');
    const client=createPublicFetcher(work,policy),download=await client.get(baseSource.url);
    const converted=await convert(path.join(work,download.file),path.join(work,'base'),baseProvenance.sourceSHA256);baseline=converted.file;audit.baseline={mode:'fresh_native_conversion',sourceURL:baseSource.url,...converted.evidence,conversion:converted.conversion};
   }
   const provenanceFile=path.join(work,'render-provenance.json');saveJSON(provenanceFile,baseProvenance);
   await subprocess('python',[path.join(DIR,'verify-graphics-frame.py'),baseline,path.join(directory,'model.glb'),provenanceFile,path.join(work,'frame.json'),String(policy.float32RoundtripULPs)]);
   audit.renderFrame=JSON.parse(fs.readFileSync(path.join(work,'frame.json')));
  }else audit.baseline={mode:'native_model_input',sha256:inventory.sourceHash};
 }catch(e){audit.status='blocked';audit.reason=e.message;return finish();}
 const accepted=[];
 for(const candidate of candidates){
  const item={url:candidate.url,sha256:candidate.sha256};audit.candidates.push(item);
  try{
   const file=path.join(directory,candidate.file);if(hash(fs.readFileSync(file))!==candidate.sha256)throw Error('graphics_source_hash_mismatch');
   const out=path.join(work,candidate.sha256.slice(0,16)),converted=await convert(file,out);item.source=converted.evidence;item.conversion=converted.conversion;
   await subprocess('python',[path.join(DIR,'extract-surface-markings.py'),baseline,converted.file,out,'--max-ink-mm',String(policy.graphicsMaxInkMm),'--resolution',String(policy.graphicsResolution)]);
   const report=JSON.parse(fs.readFileSync(path.join(out,'markings-extraction.json')));item.status='verified';item.extraction=report;accepted.push({out,report,url:candidate.url});
  }catch(e){item.status='blocked';item.reason=e.message;}
 }
 if(accepted.length!==1){audit.status='blocked';audit.reason=accepted.length?'ambiguous_additive_cad_sources':'no_verified_additive_graphics';return finish();}
 const {out,report,url}=accepted[0],target=path.join(directory,'surfaces');fs.mkdirSync(target,{recursive:true});
 const layers=report.layers.map(l=>({...l,kind:'silk',sourceType:'step_graphics',sourceURL:url}));
 for(const layer of layers)fs.copyFileSync(path.join(out,layer.file),path.join(target,layer.file));
 audit.status='verified';audit.sourceURL=url;audit.generatedLayers=layers.length;audit.physicalMeshesUnchanged=report.physicalMeshesUnchanged;
 return finish(layers);
}
