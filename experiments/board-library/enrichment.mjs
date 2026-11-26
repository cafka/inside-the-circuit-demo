import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {DIR,saveJSON} from './catalog.mjs';
import {hash} from './glb.mjs';
import {subprocess} from './pipeline.mjs';
import {links,assetKind,coverage} from './discovery.mjs';
import {createPublicFetcher} from './public-fetch.mjs';
import {enrichCADGraphics} from './cad-graphics-enrichment.mjs';
export const enrichmentPolicy=JSON.parse(fs.readFileSync(path.join(DIR,'enrichment-policy.json')));
export function selfContainedVector(bytes){
 const text=bytes.toString();
 if(/<!DOCTYPE|<!ENTITY|<script|<foreignObject|@import/i.test(text))return false;
 const references=[...text.matchAll(/(?:\b(?:xlink:)?href\s*=\s*["']([^"']*)["']|\burl\(\s*["']?([^)'"\s]+))/gi)].map(m=>m[1]??m[2]);
 return references.every(v=>v.startsWith('#')||/^data:image\/(?:png|jpeg|webp);base64,/i.test(v));
}

// Known profiles supply an official product page, not a hand-authored finish recipe.
// Reuse the same link/parser and bounded HTTPS transport as name-driven discovery.
export async function acquireEnrichmentSources(directory,profile,{pageBytes=null,client=createPublicFetcher(directory,enrichmentPolicy)}={}){
 const resources=[],errors=[],url=profile.source.pageUrl;
 if(!['official','linked_publisher'].includes(profile.source.authority)||!url)return {resources,errors:['authoritative_source_page_missing']};
 try{
  const page=pageBytes?{bytes:pageBytes,url,sha256:hash(pageBytes)}:await client.get(url,6*1024*1024);
  const candidates=links(page.bytes.toString(),page.url).map(l=>({...l,kind:assetKind(l.url,l.text)})).filter(l=>l.url!==profile.source.url&&(['cad','step'].includes(l.kind)||l.kind==='image'&&coverage(profile.identity.model,l.text)>=.75));
  candidates.sort((a,b)=>Number(a.kind==='image')-Number(b.kind==='image'));
  for(const c of candidates.slice(0,enrichmentPolicy.maxLinkedAssets)){
   try{const r=await client.get(c.url);resources.push({...c,url:r.url,file:r.file,sha256:r.sha256,bytes:r.bytes.length,status:'downloaded',role:'linked_document',parent:page.url,parentSHA256:page.sha256,authority:'official_page_link',license:{id:null,status:'inspect_archive_or_pending',redistributionAuthorized:false}});}
   catch(e){errors.push({url:c.url,reason:e.message});}
  }
 }catch(e){errors.push({url,reason:e.message});}
 saveJSON(path.join(directory,'enrichment-acquisition.json'),{policy:enrichmentPolicy.version,resources,errors,network:client.stats()});return {resources,errors};
}

export async function enrichCAD(directory,inventory,resources,{authority,onEvent=()=>{},baseSource=null,baseProvenance=null}={}){
 const start=performance.now(),audit={version:enrichmentPolicy.version,sourceGLBSHA256:inventory.sourceHash,sourceGeometryChanged:false,composition:'not_inferred',presentation:{lighting:'shared_viewer_environment',finishes:'shared_visual_material_library',status:'presentation_only_not_physical_evidence'},candidates:[],errors:[]};
 const finish=async(surfaces=null,ecad=[],physicalData=null)=>{
  if(['official','linked_publisher'].includes(authority)){
   // ECAD layers already cover both faces. Preserve them and avoid duplicate ink.
   if(surfaces?.files?.some(f=>f.kind==='silk'))audit.cadGraphics={status:'not_needed',reason:'verified_ecad_artwork_retained'};
   else{
    const graphics=await enrichCADGraphics(directory,inventory,resources,{baseSource,baseProvenance,onEvent});audit.cadGraphics=graphics.audit;
    if(graphics.layers.length)surfaces={schema:'automatic-board-surfaces/2',baseGLBSHA256:inventory.sourceHash,registration:{status:'verified',policy:'additive-cad-graphics/1',bindings:[]},sourceURL:graphics.audit.sourceURL,sourceType:'step_graphics',files:graphics.layers,limitations:['Source CAD graphics in a verified shared frame; raster detail is finite.']};
   }
  }
  if(surfaces)saveJSON(path.join(directory,'surfaces','surfaces.json'),surfaces);
  if(fs.existsSync(path.join(directory,'model.glb'))&&hash(fs.readFileSync(path.join(directory,'model.glb')))!==inventory.sourceHash)throw Error('enrichment_mutated_source_CAD');
  audit.totalMs=performance.now()-start;audit.applied={surfaceLayers:surfaces?.files?.length||0,physicalDetails:surfaces?.presentationGeometry?.status||'not_available',colour:surfaces?.appearance?.status||'original_CAD_preserved',registration:surfaces?.registration?.status||'not_determined'};saveJSON(path.join(directory,'enrichment.json'),audit);return {surfaces,ecad,physicalData,audit};
 };
 if(!['official','linked_publisher'].includes(authority)){audit.errors.push({reason:'source_authority_unverified'});return finish();}
 const ecad=[],seen=new Set();
 for(const asset of resources.filter(a=>a.status==='downloaded'&&a.kind==='cad'&&!['related_variant','part_or_template'].includes(a.role))){
  try{
   const file=path.join(directory,asset.file),bytes=fs.readFileSync(file);if(hash(bytes)!==asset.sha256)throw Error('source_hash_mismatch');
   if(bytes.subarray(0,2).toString()!=='PK'){audit.errors.push({url:asset.url,reason:'ecad_format_not_supported',kind:asset.kind});continue;}
   const inspectionFile=path.join(directory,'inspection-'+asset.sha256+'.json');
   if(!fs.existsSync(inspectionFile))await subprocess('python',[path.join(DIR,'inspect-documents.py'),file,inspectionFile]);
   const inspection=JSON.parse(fs.readFileSync(inspectionFile));
   if(!inspection.members?.some(m=>/\.pcbdoc$/i.test(m.name)))continue;
   if(seen.has(asset.sha256))continue;seen.add(asset.sha256);
   if(ecad.length>=enrichmentPolicy.maxECADCandidates){audit.errors.push({reason:'ecad_candidate_budget'});break;}
   const target=path.join(directory,'ecad-'+asset.sha256+'.json');await subprocess('python',[path.join(DIR,'inspect-ecad.py'),file,target]);
   ecad.push({asset:{...asset,archiveLicenses:inspection.licenses||[]},data:JSON.parse(fs.readFileSync(target))});
  }catch(e){audit.errors.push({url:asset.url,reason:e.message});}
 }
 if(!ecad.length){audit.errors.push({reason:'no_supported_source_ECAD'});return finish();}
 const imagesFile=path.join(directory,'appearance-images.json'),images=[];
 for(const a of resources.filter(a=>a.kind==='image'&&a.status==='downloaded')){
  try{
   const file=path.join(directory,a.file),bytes=fs.readFileSync(file);if(hash(bytes)!==a.sha256)throw Error('image_source_hash_mismatch');
   const meta=await sharp(bytes,{limitInputPixels:16000000}).metadata();
   if(meta.format==='svg'){
    if(!selfContainedVector(bytes))throw Error('external_vector_content_not_supported');
    const png=await sharp(bytes,{density:144,limitInputPixels:16000000}).resize({width:640,height:640,fit:'inside'}).flatten({background:'#ffffff'}).png().toBuffer(),output=path.join(directory,'reference-'+hash(png)+'.png');fs.writeFileSync(output,png);
    images.push({url:a.url,path:output,sha256:a.sha256,decodedSHA256:hash(png),sourceKind:'official_linked_vector_drawing'});
   }else images.push({url:a.url,path:file,sha256:a.sha256,sourceKind:'official_linked_raster_reference'});
  }catch(e){audit.errors.push({url:a.url,reason:e.message});}
 }
 saveJSON(imagesFile,images);
 const accepted=[];
 for(const item of ecad){
  const out=path.join(directory,'surface-candidate-'+item.asset.sha256.slice(0,16));
  try{
   onEvent({stage:'appearance',status:'progress',detail:'source_registration_and_details'});
   await subprocess('python',[path.join(DIR,'prepare-board-surfaces.py'),path.join(directory,item.asset.file),path.join(directory,'model.glb'),out,imagesFile]);
   const surfaces=JSON.parse(fs.readFileSync(path.join(out,'surfaces.json')));surfaces.sourceURL=item.asset.url;
   audit.candidates.push({sourceSHA256:item.asset.sha256,sourceURL:item.asset.url,registration:surfaces.registration,physicalDetails:surfaces.presentationGeometry?.status||'not_available',reason:surfaces.presentationGeometry?.reason||surfaces.registration.reason});
   if(surfaces.registration.status==='verified')accepted.push({item,surfaces,out});
  }catch(e){audit.errors.push({url:item.asset.url,reason:e.message});}
 }
 if(accepted.length!==1){audit.errors.push({reason:accepted.length?'ambiguous_registered_design_sources':'no_independently_registered_design'});return finish(null,ecad);}
 const {item,surfaces,out}=accepted[0],target=path.join(directory,'surfaces');fs.mkdirSync(target,{recursive:true});
 for(const name of [...surfaces.files.map(f=>f.file),'ecad-geometry.json',...(surfaces.presentationGeometry?.status==='source_ecad_supplement'?['pcb-details.glb']:[])])fs.copyFileSync(path.join(out,name),path.join(target,name));
 saveJSON(path.join(target,'surfaces.json'),surfaces);
 if(hash(fs.readFileSync(path.join(directory,'model.glb')))!==inventory.sourceHash)throw Error('enrichment_mutated_source_CAD');
 return finish(surfaces,[item],JSON.parse(fs.readFileSync(path.join(out,'ecad-geometry.json'))));
}
