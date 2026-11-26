import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {DIR,STORE,boardDir,saveJSON,readBoard,classifyMaterials} from './catalog.mjs';
import {hash,inspectGLB} from './glb.mjs';
import {subprocess} from './pipeline.mjs';
import {discoverByName,discoveryPolicy,normalizeName,assetKind,repositoryResources,resourceRole} from './discovery.mjs';
import {createPublicFetcher} from './public-fetch.mjs';
import {bindDocumentedDesignators} from './document-binding.mjs';
import {bindRegisteredBodies} from './physical-binding.mjs';
import {reconstructPhoto} from './reconstruct-photo.mjs';

export const onboardingVersion='name-onboarding/1';
export const nameID=name=>'discovered-'+hash(normalizeName(name)).slice(0,16);
export async function onboardName(name,{onEvent=()=>{},fetcherFactory=createPublicFetcher,refresh=false}={}){
 if(typeof name!=='string'||name.trim().length<4||name.length>140||/[<>\r\n]/.test(name))throw Error('invalid_board_name');
 const cacheStarted=performance.now(),id=nameID(name),directory=boardDir(id),recordFile=path.join(directory,'record.json');
 // Explicit name submission can resume a blocked dossier only with a configured session.
 if(!refresh&&process.env.ITC_RECONSTRUCTION_SESSION&&fs.existsSync(recordFile)&&readBoard(id).modelAvailable===false)refresh=true;
 if(fs.existsSync(recordFile)&&!refresh){const r=readBoard(id);if(normalizeName(r.onboarding?.input)!==normalizeName(name))throw Error('name_catalog_conflict');
   if(r.modelAvailable&&hash(fs.readFileSync(path.join(directory,'model.glb')))!==r.inventory.sourceHash)throw Error('cached_model_hash_mismatch');
   for(const a of r.automaticSurfaces?.files||[])if(hash(fs.readFileSync(path.join(directory,'surfaces',a.file)))!==a.sha256)throw Error('cached_surface_hash_mismatch');
   for(const a of r.onboarding.resources.filter(a=>a.status==='downloaded'))if(hash(fs.readFileSync(path.join(directory,a.file)))!==a.sha256)throw Error('cached_source_hash_mismatch');
   return {...r,cacheHit:true,openPreparationMs:performance.now()-cacheStarted};}
 if(refresh&&fs.existsSync(recordFile)){
   const previous=readBoard(id);if(previous.review.revision)throw Error('reviewed_catalog_entry_requires_new_version');
   const archive=path.join(directory,'attempts',new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(archive,{recursive:true});
   for(const file of ['record.json','http-log.json','binding-audit.json','model-candidates.json','model.glb','model.conversion.json','model.conversion-failure.json'])if(fs.existsSync(path.join(directory,file)))fs.copyFileSync(path.join(directory,file),path.join(archive,file));
 }
 fs.mkdirSync(directory,{recursive:true});const client=fetcherFactory(directory,discoveryPolicy),start=performance.now(),stages=[],events=[];
 const emit=(stage,status,detail)=>{const e={stage,status,detail,elapsedMs:performance.now()-start};events.push(e);onEvent(e);};
 async function stage(name,fn){emit(name,'running');const at=performance.now();let result;try{result=await fn();}catch(error){result={status:'blocked',reason:error.message};}stages.push({name,...result,ms:performance.now()-at});emit(name,result.status,result.reason);return result;}
 let discovery={resources:[],repositories:[],pages:[],errors:[]},assets=[],model=null,documents=[],ecad=[],surfaces=null,physicalData=null,binding={components:[],audit:[]};
 const discoveryStage=await stage('discovery',async()=>{discovery=await discoverByName(name,client,s=>emit('discovery','progress',s));return {status:discovery.identity?'partial':'blocked',reason:discovery.identity?'revision_not_determined':discovery.reason||'search_failed'};});
 await stage('acquisition',async()=>{
   if(!discovery.identity)return {status:'blocked',reason:'no_documented_identity'};
   const queue=[...discovery.resources],seen=new Set();
   for(let cursor=0;cursor<queue.length&&assets.filter(a=>a.status==='downloaded').length<discoveryPolicy.maxAssets;cursor++){
     const resource=queue[cursor];if(seen.has(resource.url))continue;seen.add(resource.url);resource.role=resourceRole(resource,discovery.identity);
     if(['related_variant','part_or_template'].includes(resource.role)){assets.push({...resource,status:'skipped',reason:'different_variant_or_individual_part'});continue;}
     // No programs, installers, firmware or opaque archives downloaded as CAD.
     if(/firmware|flashcard|driver|toolchain/i.test(resource.url+' '+resource.text)){assets.push({...resource,status:'skipped',reason:'not_hardware_documentation'});continue;}
     try{
       const response=await client.get(resource.url),kind=resource.kind||assetKind(resource.url,resource.text),asset={...resource,url:response.url,requestedUrl:resource.url,kind,file:response.file,sha256:response.sha256,bytes:response.bytes.length,status:'downloaded',license:resource.license||{id:resource.repositoryLicense||null,status:resource.repositoryLicense?'repository_declaration':'undetermined',redistributionAuthorized:false}};
       assets.push(asset);
       if(response.bytes.subarray(0,5).toString()==='%PDF-'||response.bytes.subarray(0,2).toString()==='PK'){
         const out=path.join(directory,'inspection-'+asset.sha256+'.json');await subprocess('python',[path.join(DIR,'inspect-documents.py'),path.join(directory,asset.file),out]);
         const inspection=JSON.parse(fs.readFileSync(out));asset.inspection=path.basename(out);
         if(inspection.type==='pdf'){
           documents.push({asset,inspection});
           const inherited=inspection.links.map(l=>({...l,parent:resource.url,parentSHA256:asset.sha256}));
           const extra=await repositoryResources(discovery,client,inherited);queue.push(...extra);
           queue.push(...inherited.filter(l=>assetKind(l.url)).map(l=>({...l,kind:assetKind(l.url,l.text)})));
         }
       }
     }catch(error){const existing=assets.find(a=>a.requestedUrl===resource.url);if(existing){existing.inspectionError=error.message;discovery.errors.push({url:resource.url,error:error.message});}else assets.push({...resource,status:'failed',reason:error.message});}
   }
   if(queue.length>seen.size)discovery.errors.push({reason:'bounded_download_limit',unvisited:queue.filter(x=>!seen.has(x.url)).map(x=>x.url)});
   return {status:assets.some(a=>a.status==='downloaded')?'partial':'blocked',downloaded:assets.filter(a=>a.status==='downloaded').length,failed:assets.filter(a=>a.status==='failed').length,reason:'license_and_revision_require_per_asset_evidence'};
 });
 await stage('model',async()=>{
   const candidates=assets.filter(a=>a.status==='downloaded'&&a.role==='requested_board'&&['step','glb'].includes(a.kind));
   for(const archive of assets.filter(a=>a.inspection)){
     const inspection=JSON.parse(fs.readFileSync(path.join(directory,archive.inspection)));
     for(const member of inspection.members||[])if(/\.(step|stp|glb)$/i.test(member.name)&&resourceRole({url:'https://archive.example/'+member.name},discovery.identity)==='requested_board')candidates.push({...archive,kind:/\.glb$/i.test(member.name)?'glb':'step',member:member.name,expandedBytes:member.bytes});
   }
   saveJSON(path.join(directory,'model-candidates.json'),candidates);
   if(discovery.authority?.status!=='reciprocal_publisher_links')return {status:'blocked',reason:'publisher_authority_not_correlated',candidates:candidates.length};
   if(candidates.length!==1)return {status:'blocked',reason:candidates.length?'ambiguous_model_files':'no_convertible_3d_asset_found',candidates:candidates.length};
   const c=candidates[0];let input=path.join(directory,c.file),bytes=fs.readFileSync(input);
   if(c.member){
     if(c.expandedBytes>256*1024*1024)throw Error('expanded_size_limit');
     // Member name is passed as an argument; never executed or used as a filesystem path.
     const code='import zipfile,sys; from pathlib import Path; z=zipfile.ZipFile(sys.argv[1]); i=z.getinfo(sys.argv[2]); assert i.file_size<=268435456; Path(sys.argv[3]).write_bytes(z.read(i))';
     const target=path.join(directory,'input.'+c.kind);await subprocess('python',['-c',code,input,c.member,target]);input=target;bytes=fs.readFileSync(input);
   }
   const output=path.join(directory,'model.glb');
   if(c.kind==='step'){if(!bytes.subarray(0,200).toString().includes('ISO-10303-21'))throw Error('not_step');await subprocess('python',[path.join(DIR,'convert-step.py'),input,output,'--sha256',hash(bytes),'--allow-incomplete-preview']);}
   else fs.writeFileSync(output,bytes);
   const inventory=inspectGLB(fs.readFileSync(output)),conversion=c.kind==='step'?JSON.parse(fs.readFileSync(path.join(directory,'model.conversion.json'))):null;
   if(conversion&&conversion.nativeTriangles!==inventory.triangles)throw Error('export_triangle_loss');
   model={inventory,conversion,source:c};return {status:conversion?.geometryComplete===false?'partial':'complete',reason:conversion?.geometryComplete===false?'incomplete_cad_preview':undefined,missingFaces:conversion?.missingFaces||0,sourceSHA256:hash(bytes),triangles:inventory.triangles,meshNodes:inventory.meshes};
 });
 if(!model&&discovery.identity)await stage('reconstruction',async()=>{
   model=await reconstructPhoto(directory,discovery,assets);binding=model.binding;
   return {status:'partial',reason:'photo_document_model_approximate',objects:binding.components.length,volumes:model.reconstruction.volumes,flatObservations:model.reconstruction.flatObservations};
 });
 await stage('appearance',async()=>{
   if(model?.reconstruction)return {status:'partial',reason:'observed_photo_appearance_uncalibrated',composition:'undetermined'};
   for(const a of assets.filter(a=>a.status==='downloaded'&&a.role==='requested_board'&&a.inspection)){
     const inspection=JSON.parse(fs.readFileSync(path.join(directory,a.inspection)));if(!inspection.members?.some(m=>/\.pcbdoc$/i.test(m.name)))continue;
     try{const target=path.join(directory,'ecad-'+a.sha256+'.json');await subprocess('python',[path.join(DIR,'inspect-ecad.py'),path.join(directory,a.file),target]);ecad.push({asset:a,data:JSON.parse(fs.readFileSync(target))});}catch(error){discovery.errors.push({url:a.url,error:error.message});}
   }
   if(model&&ecad.length===1){
     const surfaceDir=path.join(directory,'surfaces'),imageFile=path.join(directory,'appearance-images.json');
     saveJSON(imageFile,assets.filter(a=>a.kind==='image'&&a.status==='downloaded').map(a=>({url:a.url,path:path.join(directory,a.file),sha256:a.sha256})));
     try{await subprocess('python',[path.join(DIR,'prepare-board-surfaces.py'),path.join(directory,ecad[0].asset.file),path.join(directory,'model.glb'),surfaceDir,imageFile]);surfaces=JSON.parse(fs.readFileSync(path.join(surfaceDir,'surfaces.json')));surfaces.sourceURL=ecad[0].asset.url;physicalData=JSON.parse(fs.readFileSync(path.join(surfaceDir,'ecad-geometry.json')));}
     catch(error){discovery.errors.push({stage:'appearance',error:error.message});}
   }
   return {status:model?'partial':'blocked',reason:surfaces?.registration?.status==='verified'?'registered_surfaces_partial':model?'original_cad_colors_preserved_no_verified_surface_reconstruction':'requires_3d_asset',ecadObjects:ecad.reduce((n,e)=>n+e.data.components.length,0),contacts:surfaces?.files?.length?'documented_ecad_surfaces':model?'only_original_step_geometry':'not_available',silkscreen:surfaces?.details?.sourceTextLabels||'not_reconstructed',composition:'undetermined'};
 });
 await stage('components',async()=>{
   if(model&&!model.reconstruction)binding=surfaces?.registration?.status==='verified'?bindRegisteredBodies(model.inventory,physicalData,surfaces,ecad[0].asset):bindDocumentedDesignators(model.inventory,ecad);
   saveJSON(path.join(directory,'binding-audit.json'),binding);
   return {status:binding.components.length?'partial':'blocked',reason:model?.reconstruction?'image_observations_not_verified_electrical_instances':surfaces?.registration?.status==='verified'?'registered_components_partial':model?'exact_designators_only_unresolved_geometry_kept_unknown':'requires_3d_asset_and_document_to_cad_correspondences',documentedObjects:ecad.reduce((n,e)=>n+e.data.components.length,0),bound:binding.components.filter(c=>c.bindingStatus==='bound').length,error:binding.error||null};
 });
 await stage('education',async()=>({status:binding.generatedCards?'partial':'blocked',reason:binding.generatedCards?'documented_lessons_partial':'no_bilingual_function_and_example_generation_adapter',generatedCards:binding.generatedCards||0,technicalRecords:binding.components.length,sourceDocuments:documents.length}));
 const emptyInventory={sourceHash:null,bytes:0,triangles:0,nodes:[],meshes:0};
 const record={schema:onboardingVersion,id,identity:discovery.identity||{manufacturer:null,model:name.trim(),hardwareRevision:null,confidence:'unresolved'},preparedAt:new Date().toISOString(),modelAvailable:!!model,preparationStatus:model?'model_partial':'documentation_only',
   source:{authority:discovery.authority?.status==='reciprocal_publisher_links'?'linked_publisher':'unverified',pageUrl:discovery.selectedPage||null,url:model?.source.url||discovery.selectedPage||null,license:model?.source.license||{id:null,status:'per_asset_see_resources'},coverage:'Automatically discovered documentation; missing stages remain explicit.'},
   inventory:model?.inventory||emptyInventory,components:binding.components,materials:model?.materials||(model?classifyMaterials(model.inventory):[]),conversion:model?.conversion||null,appearance:'semantic-pbr',
   coverage:{boundComponents:binding.components.filter(c=>c.bindingStatus==='bound').length,documentedComponents:binding.components.filter(c=>c.bindingStatus==='bound').length,meshNodes:model?.inventory.meshes||0,unassignedMeshNodes:model?model.inventory.nodes.filter(n=>n.mesh!==null&&!binding.components.some(c=>c.nodeIndices.includes(n.index))).length:0,materialProvisional:0,materialUnknown:0},
   limitations:stages.filter(s=>s.status!=='complete').map(s=>s.name+': '+s.reason),onboarding:{version:onboardingVersion,input:name.trim(),policyVersion:discoveryPolicy.version,stages,resources:assets,discovery,network:client.stats()},cloud:{requests:0,costUSD:0},events,timingsMs:Object.fromEntries(stages.map(s=>[s.name,s.ms]))};
 const aiResult=path.join(directory,'reconstruction','gemini-reconstruction.json');
 if(fs.existsSync(aiResult)){const a=JSON.parse(fs.readFileSync(aiResult));record.cloud={requests:a.requests,costUSD:a.estimatedCostUSD??null,model:a.modelVersion??a.modelRequested,inferenceMs:a.inferenceMs??null,status:a.status};}
 record.automaticSurfaces=surfaces;record.coverage.educationalCards=binding.generatedCards||0;
 if(model?.reconstruction){record.reconstruction=model.reconstruction;record.cloud=model.cloud;record.source.kind='photo_document_reconstruction';record.source.coverage='Reconstrucción educativa aproximada desde fotografías y documentos. No es CAD del fabricante. Alturas y detalles desconocidos permanecen pendientes.';record.coverage.documentedComponents=0;record.coverage.verifiedElectricalAssociations=0;}
 record.coverage.materialProvisional=record.materials.filter(m=>m.status==='provisional').length;record.coverage.materialUnknown=record.materials.filter(m=>m.status==='unknown').length;
 await stage('store',async()=>{if(model)fs.writeFileSync(path.join(directory,'model.glb.gz'),zlib.gzipSync(fs.readFileSync(path.join(directory,'model.glb'))));saveJSON(path.join(directory,'http-log.json'),client.log);return {status:'complete',reason:model?'model_and_dossier_saved':'dossier_saved_without_fabricated_model'};});
 record.timingsMs=Object.fromEntries(stages.map(s=>[s.name,s.ms]));record.totalMs=performance.now()-start;saveJSON(recordFile,record);return record;
}
if(process.argv[1]===path.join(DIR,'onboard-name.mjs')){
 const args=process.argv.slice(2),refresh=args.includes('--refresh'),name=args.filter(a=>a!=='--refresh').join(' ');const r=await onboardName(name,{refresh,onEvent:e=>console.log(JSON.stringify(e))});console.log(JSON.stringify({id:r.id,modelAvailable:r.modelAvailable,cacheHit:!!r.cacheHit,totalMs:r.totalMs,stages:r.onboarding.stages}));
}
