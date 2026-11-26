import {compatibleBook as findCompatibleBook, libraryDestination, screenURL} from './navigation.mjs';
import {inspectEnvironment} from '../../src/identity/environment.mjs';
import {initTheme} from './theme.mjs';
import libraryConfig from '../../config/library.json';
import {identifyHostedName} from './hosted-catalog.mjs';
import {t,locale,message,clearMessage,onLocaleChange,initLanguage,localize,componentText,errorText,errorMessage} from './i18n.mjs';
import {createSelectionOutline} from './selection-outline.mjs';
import {createEducationalOutline} from './educational-outline.mjs';
import {educationalSurface} from './educational-surfaces.mjs';
import {partitionGeometry} from './geometry-partitions.mjs';
import {frameInViewport} from './viewer-framing.mjs';
import {createComponentHover} from './component-hover.mjs';
import {selectionIndex,tapTracker,illuminateSelection} from './selection-state.mjs';
import {POINTER_POLICY,orbitGestureGate,nearbyChoices} from './selection-pointer.mjs';
import baseRepresentation from './base-representation.json';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {appearance} from './appearance.mjs';
import {fitDepthRange} from './viewer-depth.mjs';
import {loadSurfaceMarkings} from './surface-markings.mjs';
import {loadPresentationGeometry} from './presentation-geometry.mjs';
import {createPadTraces} from './pad-traces.mjs';
import {onboardingReason,onboardingStage} from './onboarding-ui.mjs';
import {renderBoardEducation,componentHeading,educationalCard,componentEvidence,componentInfo} from './education.mjs';
import {createFirebaseAdapter} from '../../src/identity/firebase-adapter.mjs';
import {createCapture} from '../../src/identity/capture.mjs';
import {identifyPhotoAutomatically,resolvePhotoIdentity} from './photo-onboarding.mjs';
import {bindPhotoComponents} from './photo-scene.mjs';
import {photoOutcome} from './photo-outcome.mjs';
import {displayText} from './display-text.mjs';
import {createExplorerUI} from './explorer-ui.mjs';
import {createCameraExperience} from './camera-experience.mjs';
import visual from './visual-profile.json';
const $=s=>document.querySelector(s),el=(tag,text)=>{const n=document.createElement(tag);n.textContent=displayText(text);return n;};
let selectionMap={byId:new Map(),byNode:new Map(),issues:[]},selectionLight=null;
let educationalOutline=null,noInfoTimer=null,hoverHint=null,frameLayout=null;
let lastError=null;const fail=e=>{lastError=e;$('#error').textContent=errorText(e);ui.error(errorText(e));};
let hostedCapabilities=null;
async function api(url,data){
 if(data!==undefined&&hostedCapabilities?.readOnlyCatalog){
  if(url==='/api/identify')return identifyHostedName(data.name,(await api('/api/catalog')).boards);
  if(url!=='/api/photo/verify')throw Error('hosted.preparationPending');
  if(!hostedCapabilities.photoVerification)throw Error('hosted.verificationPending');
 }
 const r=await fetch(url,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-ITC-Local':'1'},body:JSON.stringify(data)});
 const b=await r.json();if(!r.ok)throw Error(b.error);return b;
}
function link(source,label){const a=el('a',label||source);if(/^https:\/\//.test(source)){a.href=source;a.target='_blank';a.rel='noopener noreferrer';}return a;}
let record,model,meshes=[],selected=null,originals=new Map(),metrics={ready:false,errors:[]},generation=0,environment,decoration,markings,markingIssue=null,pcbDetails,pcbIssue=null,cameraExperience,outline,explorationEpoch=0,catalogBoards=[],catalogLimit=50,lastIdentity=null,lastJob=null;
initLanguage();initTheme();
let libraryReturn=null;
let runtimeConfig=await api('/api/runtime-config').catch(()=>({cloudEnabled:false}));hostedCapabilities=runtimeConfig.hostedCapabilities||null;let capturedBoardId=null;$('#photo-consent').hidden=runtimeConfig.cloudEnabled!==true;
// Optional illustrations have existing CAD contacts at both ends; never a netlist.
const canvas=$('#viewer'),renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=visual.exposure;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.info.autoReset=false;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.00001,100),controls=new OrbitControls(camera,canvas);
const ui=createExplorerUI({getSelectedBounds:()=>document.body.dataset.screen==='camera'?cameraExperience?.selectedBounds():selectedBounds(),getBoardBounds:()=>document.body.dataset.screen==='explorer'&&model?projectedBounds(new THREE.Box3().setFromObject(model)):null,onCloseCard:closeCard});
cameraExperience=createCameraExperience({onCard:presentCard,onClear:closeCard,onLayout:()=>ui.placeCard(),onCapture:processCapturedPhoto,onInvalidate:invalidatePhoto});
controls.enableDamping=false;let dirty=true;controls.addEventListener('change',()=>{dirty=true;hoverHint?.clear();$('#nearby-selection').hidden=true;});
const room=new RoomEnvironment(),gen=new THREE.PMREMGenerator(renderer),env=gen.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=visual.environmentIntensity;gen.dispose();room.dispose();
scene.add(new THREE.HemisphereLight(0xe7f1ff,0x182233,visual.hemisphereIntensity));const key=new THREE.DirectionalLight(0xfff5df,visual.keyIntensity);key.position.fromArray(visual.keyDirection);key.castShadow=true;key.shadow.mapSize.setScalar(visual.shadowMapSize);key.shadow.autoUpdate=false;scene.add(key);scene.add(key.target);const fill=new THREE.DirectionalLight(0xc5ddff,visual.fillIntensity);fill.position.fromArray(visual.fillDirection);scene.add(fill);
const testObservation=new URLSearchParams(location.search).has('diagnostic')?Object.assign(document.createElement('output'),{id:'execution-observation',hidden:true}):null;if(testObservation)document.body.append(testObservation);
let frameSamples=null;
new ResizeObserver(()=>{const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;const aspect=r.width/r.height,changed=Math.abs(camera.aspect-aspect)>.01;renderer.setSize(r.width,r.height,false);outline?.resize(r.width,r.height);educationalOutline?.resize(r.width,r.height);camera.aspect=aspect;camera.updateProjectionMatrix();if(model&&changed)fit(false,true);dirty=true;}).observe(canvas);
function loop(at){requestAnimationFrame(loop);if(document.body.dataset.screen==='explorer'){if(dirty){const start=performance.now();fitDepthRange(camera,model);renderer.info.reset();renderer.render(scene,camera);educationalOutline?.render(renderer);outline?.render(renderer);ui.placeCard();if(frameSamples&&at<=frameSamples.until)frameSamples.samples.push({at,cpuMs:performance.now()-start});if(testObservation&&window.boardLibraryDiagnostic)testObservation.textContent=JSON.stringify({state:window.boardLibraryDiagnostic.state(),bindings:window.boardLibraryDiagnostic.selectionAudit(),renderCpuMs:performance.now()-start,at});dirty=false;}}}requestAnimationFrame(loop);
function allComponents(){if(!record)return[];const manual=record.review.components;return [...record.components.filter(c=>!manual.some(m=>m.id===c.id)),...manual];}
function closeCard(){$('#nearby-selection').hidden=true;selectionLight?.restore();selectionLight=null;if(outline){outline.dispose();outline=null;}for(const m of meshes){if(m.material!==originals.get(m)){for(const a of Array.isArray(m.material)?m.material:[m.material])a.dispose();m.material=originals.get(m);}}selected=null;cameraExperience?.clearSelection();$('#card').hidden=true;refreshEducationalOutline();dirty=true;}
function presentCard({label,description,example='',technicalReference='',statusText='',facts=[],sources=[],original=null,confidence=null,informationKind=null,reviewStatus=null},refresh=false){
  $('#component-availability').hidden=informationKind!=='technical'&&reviewStatus!=='pending';delete $('#card').dataset.informationKind;if(!$('#component-availability').hidden)message('#component-availability',informationKind==='technical'?'discovery.pending':'discovery.proposed');
  $('#card').hidden=false;$('#selection-legend').hidden=true;$('#component-title').textContent=displayText(label);$('#component-description').textContent=displayText(description);
  $('#component-example').textContent=example;$('#component-example').hidden=!example;$('#component-reference').textContent=technicalReference;$('#component-reference').hidden=!technicalReference;
  $('#component-confidence').textContent=statusText;$('#component-confidence').hidden=!statusText;
  const evidence=confidence||{identity:t('confidence.cameraIdentity'),association:t('confidence.cameraGeometry')};
  $('#confidence-identity').textContent=t('confidence.identity')+': '+evidence.identity;
  $('#confidence-geometry').textContent=t('confidence.geometry')+': '+evidence.association;
  $('#confidence-basis').textContent=t('card.uncalibrated');
  $('#facts').replaceChildren(...facts.map(f=>el('li',f)));$('#sources').replaceChildren(...sources.map(s=>link(s.url,s.translations?.[locale()]?.locator||localize(s.locator)||t('technicalSource'))));
  $('#original-content').hidden=!original;$('#original-content p').textContent=original||'';
  if(!refresh)ui.selected();else ui.placeCard();dirty=true;
}
function selectComponent(id,refresh=false,source='model'){
  const selectionStarted=performance.now();hoverHint?.clear();
  const entry=selectionMap.byId.get(id);if(!entry)return;const {component:c,targets}=entry;const info=componentInfo(record,c);clearTimeout(noInfoTimer);if(info.kind==='none'){closeCard();notifyNoInfo();return;}message('#viewer-message','viewerHelp');
  if(!refresh){closeCard();if(!targets.length){message('#viewer-message','selection.noGeometry');return;}
    selectionLight=illuminateSelection(targets);outline=createSelectionOutline(targets,canvas.clientWidth,canvas.clientHeight,scene,camera);selected=id;
  }
  presentCard({sources:c.sources,...educationalCard(record,c),confidence:componentEvidence(record,c),facts:(c.facts||[]).map(f=>`${f.translations?.[locale()]?.text||localize(f.text)} · ${t(f.status==='documented'?'documented':'provisional')}`)},refresh);
  const badge=$('#component-availability');badge.hidden=info.kind==='educational'&&info.review!=='pending';if(!badge.hidden)message(badge,info.kind==='technical'?'discovery.pending':'discovery.proposed');badge.dataset.kind=info.kind;$('#card').dataset.informationKind=info.kind;
  refreshEducationalOutline();
  $('#selection-legend').hidden=false;
  // Selection never writes to the camera, OrbitControls or model transform.
  dirty=true;
  if(!refresh){metrics.selectionWorkMs=performance.now()-selectionStarted;requestAnimationFrame(()=>requestAnimationFrame(()=>{if(selected===id){metrics.selectionToFrameMs=performance.now()-selectionStarted;if(testObservation){const o=JSON.parse(testObservation.textContent||'{}');o.state=window.boardLibraryDiagnostic.state();testObservation.textContent=JSON.stringify(o);}}}));}
}
function refreshEducationalOutline(){
 educationalOutline?.dispose();educationalOutline=null;
 const entries=[...selectionMap.byId.values()].filter(e=>record&&componentInfo(record,e.component).kind==='educational'&&e.targets.length);
 if(!model||!metrics.ready||!$('#show-educational').checked)return;
 const targets=[...new Set(entries.filter(e=>e.component.id!==selected).flatMap(e=>e.targets.filter(m=>selectionMap.byNode.get(m.userData.catalogNodeId)===e.component.id&&educationalSurface(m,e.component))))];
 if(targets.length)educationalOutline=createEducationalOutline(targets,canvas.clientWidth,canvas.clientHeight,scene,camera);
 dirty=true;
}
function notifyNoInfo(){clearTimeout(noInfoTimer);message('#viewer-message','discovery.none');noInfoTimer=setTimeout(()=>{if(!selected&&$('#nearby-selection').hidden)message('#viewer-message','viewerHelp');},4000);}
$('#show-educational').onchange=()=>{refreshEducationalOutline();dirty=true;};
function selectedBounds(){if(!selected||!record)return null;const c=allComponents().find(c=>c.id===selected);if(!c)return null;const box=new THREE.Box3();for(const m of meshes.filter(m=>c.nodeIds.includes(m.userData.catalogNodeId)))box.expandByObject(m);return projectedBounds(box);}
function projectedBounds(box){const points=[];
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z).project(camera);points.push([(p.x+1)*canvas.clientWidth/2,(1-p.y)*canvas.clientHeight/2]);}
  return{left:Math.min(...points.map(p=>p[0])),right:Math.max(...points.map(p=>p[0])),top:Math.min(...points.map(p=>p[1])),bottom:Math.max(...points.map(p=>p[1]))};
}
function fit(top=false,preserveDirection=false){if(!model)return;
  // Consume and clear residual orbit/pan damping before a deliberate reframe.
  // Otherwise the new board inherits tiny rotations from the previous one.
  const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;
  const direction=camera.position.clone().sub(controls.target).normalize(),box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),radius=size.length()/2;controls.target.set(0,0,0);
  // Reuse the existing viewer's corner-based camera fit, scaled by this model's bounds.
  const outward=preserveDirection?direction:new THREE.Vector3(...(top?[0,1,.00001]:[.65,2,1])).normalize();camera.position.copy(outward);camera.lookAt(controls.target);camera.updateMatrixWorld(true);
  const rect=canvas.getBoundingClientRect(),heading=$('.board-heading').getBoundingClientRect();
  const obstacles=['#view-controls','#model-warning','#viewer-message'].map(s=>$(s)).filter(n=>!n.hidden).map(n=>n.getBoundingClientRect());
  const insetTop=Math.max(16,heading.bottom-rect.top+16),bottom=Math.max(insetTop+80,Math.min(rect.height-16,...obstacles.map(r=>r.top-rect.top-16)));
  frameLayout=frameInViewport(camera,box,outward,{width:rect.width,height:rect.height,left:16,right:rect.width-16,top:insetTop,bottom});
  controls.minDistance=radius*.7;controls.maxDistance=radius*20;controls.update();hoverHint?.clear();dirty=true;
}
function cleanup(){if(!model)return;closeCard();educationalOutline?.dispose();educationalOutline=null;hoverHint?.clear();clearTimeout(noInfoTimer);if(markings){model.remove(markings.object);markings.dispose();markings=null;}markingIssue=null;if(pcbDetails){model.remove(pcbDetails.object);pcbDetails.dispose();pcbDetails=null;}pcbIssue=null;if(decoration){if(decoration.object)model.remove(decoration.object);decoration.dispose();decoration=null;}scene.remove(model);const geometries=new Set(),materials=new Set(),textures=new Set();model.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);if(m.envMap&&m.envMap!==env.texture)textures.add(m.envMap);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());environment?.dispose();originals.clear();meshes=[];selectionMap=selectionIndex([],[]);model=null;}
async function openBoard(id){setScreen('explorer');$('#board-experiments').hidden=true;$('#explorer-library').disabled=true;const token=++generation;lastError=null;$('#error').textContent='';ui.error('');ui.loading();metrics={ready:false,errors:[]};message($('#viewer-message'),'loadingSaved');const start=performance.now();
  try{const loaded=await api('/api/boards/'+id);if(token!==generation)return;if(loaded.modelAvailable===false){cleanup();$('#model-warning').hidden=true;record=loaded;metrics={ready:false,id,documentationOnly:true,errors:[]};$('#loading-state').hidden=true;$('#empty-state').hidden=false;$('.board-heading').hidden=true;$('#view-controls').hidden=true;$('#viewer-message').hidden=true;$('#components-toggle').disabled=true;renderBoardEducation(record,metrics);ui.open('board-dialog');return;}const before=performance.now();const gltf=await new GLTFLoader().loadAsync('/models/'+id);if(token!==generation)return;cleanup();record=loaded;model=gltf.scene;const loadMs=performance.now()-before;
    model.traverse(o=>{if(!o.isMesh)return;let p=o,association;while(p&&association===undefined){association=gltf.parser.associations.get(p)?.nodes;p=p.parent;}
      const n=record.inventory.nodes.find(n=>n.index===association);if(!n)throw Error('mesh_node_mapping_missing');o.userData.catalogNodeId=n.id;o.userData.catalogNodeIndex=n.index;meshes.push(o);
    });
    const presentation=baseRepresentation.assets.find(a=>a.sha256===record.inventory.sourceHash);const hidden=new Set(presentation?.optionalNodeIds||[]);for(const mesh of meshes)mesh.visible=!hidden.has(mesh.userData.catalogNodeId);
    environment=appearance(model,renderer,record,meshes);
    try{const details=await loadPresentationGeometry(record,meshes,environment);if(token!==generation){details?.dispose();return;}pcbDetails=details;if(details){details.activate();model.add(details.object);}}catch(error){if(token!==generation)return;pcbIssue=error.message;}
    meshes=partitionGeometry(meshes,record.geometryPartitions);
    for(const m of meshes)originals.set(m,m.material);
    const box=new THREE.Box3().setFromObject(model);model.position.sub(box.getCenter(new THREE.Vector3()));scene.add(model);fit();model.updateMatrixWorld(true);
    const radius=box.getSize(new THREE.Vector3()).length()/2;key.position.fromArray(visual.keyDirection).normalize().multiplyScalar(radius*6);key.shadow.camera.left=key.shadow.camera.bottom=-radius*1.2;key.shadow.camera.right=key.shadow.camera.top=radius*1.2;key.shadow.camera.near=radius*.1;key.shadow.camera.far=radius*15;key.shadow.camera.updateProjectionMatrix();key.shadow.bias=-.0003;key.shadow.normalBias=radius*.003;for(const m of meshes)m.castShadow=true;key.shadow.needsUpdate=true;
    const targetModel=model;try{const artwork=await loadSurfaceMarkings(record,renderer);if(token!==generation){artwork?.dispose();return;}markings=artwork;if(markings)targetModel.add(markings.object);}catch(error){if(token!==generation)return;markingIssue=error.message;}
    decoration=createPadTraces(record);if(decoration?.object)model.add(decoration.object);
    fitDepthRange(camera,model);renderer.info.reset();renderer.render(scene,camera);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(token!==generation)return;
    metrics={ready:true,id,loadMs,firstFrameMs:performance.now()-start,meshes:meshes.length,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,modelBytes:record.inventory.bytes,selection:null,errors:[],hiddenOptionalMeshCount:meshes.filter(m=>hidden.has(m.userData.catalogNodeId)).length,hiddenOptionalNodes:[...hidden],pcbDetails:pcbDetails?.audit||{status:pcbIssue?'unavailable':'not_registered',reason:pcbIssue},boundsMeters:box.getSize(new THREE.Vector3()).toArray(),decoration:decoration?.audit||{status:'disabled'},surfaceMarkings:markings?.audit||{status:markingIssue?'unavailable':'not_registered',reason:markingIssue},presentation:environment?.presentation};
    renderModelText();
    renderRecord();ui.loaded();fit();
  }catch(e){if(token!==generation)return;metrics.errors.push(e.message);message($('#viewer-message'),'modelFailed');ui.loadFailed(!!model);fail(e);}finally{if(token===generation)$('#explorer-library').disabled=false;}
}
function renderModelText(){if(!record)return;$('#board-experiments').hidden=!metrics.ready||!compatibleBook(record.identity);const resolved=(record.cadAudit?.unresolvedMissingFaces??record.conversion?.unresolvedMissingFaces)===0;$('#model-warning').hidden=record.conversion?.geometryComplete!==false||resolved;if(!$('#model-warning').hidden)message('#model-warning','onboard.incompleteGeometry',{count:record.conversion.missingFaces});$('#title').textContent=displayText(record.identity.model);message('#authority',record.reconstruction?'reconstruction.authority':record.source.authority==='official'?'manufacturerCAD':record.source.authority==='linked_publisher'?'onboard.linkedCAD':'manualCAD');message('#viewer-message',record.onboarding&&!record.coverage.boundComponents?'onboard.viewerNoComponents':'viewerHelp');
  $('#viewer-stats').removeAttribute('data-i18n');$('#viewer-stats').textContent=t('viewerStats',{size:(record.inventory.bytes/1048576).toFixed(2),time:(metrics.firstFrameMs/1000).toFixed(2),count:meshes.filter(m=>m.visible).length})+(decoration?.object?' · '+t('decorative'):'');
}
function renderRecord(){if(!record)return;selectionMap=selectionIndex(allComponents(),meshes);const bound=allComponents().filter(c=>c.nodeIndices.length),unassigned=record.inventory.nodes.filter(n=>n.mesh!==null&&!bound.some(c=>c.nodeIndices.includes(n.index))).length;message('#coverage','coverage',{groups:bound.length,nodes:unassigned});
  message($('#components-dialog .subtle'),record.reconstruction?'reconstruction.components':'education.components');message($('#components-dialog .local-note'),record.reconstruction?'reconstruction.tap':'ui.you_can_also_tap_a_documented_part_directly_on_the_model');
  $('#component-list').replaceChildren(...bound.map(c=>{const b=el('button',componentHeading(record,c)),info=componentInfo(record,c),status=el('span',t(info.kind==='technical'?'discovery.pending':info.kind==='none'?'discovery.none':info.review==='pending'?'discovery.proposed':'discovery.available'));status.className='component-availability';if(info.kind!=='educational'||info.review==='pending')b.append(status);b.dataset.informationKind=info.kind;b.dataset.componentId=c.id;b.onclick=()=>selectComponent(c.id,false,'menu');return b;}));
  refreshEducationalOutline();renderCatalog();
  renderBoardEducation(record,metrics);
  const p=$('#provenance');p.replaceChildren(el('p',t('provenanceIdentity',{manufacturer:record.identity.manufacturer,model:record.identity.model,revision:record.identity.hardwareRevision||t('undetermined')})),el('p',localize(record.source.coverage)),el('p',t('license',{id:record.source.license.id||t('unknownLicense'),status:localize(record.source.license.status)})),el('p',t('materialsReview',{provisional:record.coverage.materialProvisional,unknown:record.coverage.materialUnknown})));
  if(markings){p.append(el('p',t(markings.audit.labelKey)),link(markings.audit.source,t('marks.source')));}else p.append(el('p',t(markingIssue?'marks.failed':'marks.absent')));
  if(pcbDetails)p.append(el('p',t('presentation.pcb')));else if(pcbIssue)p.append(el('p',t('presentation.failed')));
  if(decoration)p.append(el('p',t(decoration.object?'traces.contactIllustration':'traces.insufficientContacts')));
  if(metrics.hiddenOptionalNodes?.length)p.append(el('p',t('baseVariant',{count:metrics.hiddenOptionalMeshCount})));
  if(record.cadAudit||record.conversion?.justifiedDegenerateFaces)p.append(el('p',t('cad.degenerateDetails')));
  if(record.source.url)p.append(link(record.source.url,t('sourceModel')));for(const l of record.limitations)p.append(el('p',localize(l)));
  const node=$('#node-select').value,group=$('#component-group').value;
  $('#node-select').replaceChildren(...record.inventory.nodes.filter(n=>n.mesh!==null).map(n=>{const o=el('option',n.path.join(' / '));o.value=n.id;return o;}));
  const none=el('option',t('ui.use_selected_node'));none.value='';$('#component-group').replaceChildren(none,...record.inventory.nodes.filter(n=>n.mesh===null).map(n=>{const o=el('option',n.path.join(' / '));o.value=String(n.index);return o;}));
  if([...$('#node-select').options].some(o=>o.value===node))$('#node-select').value=node;if([...$('#component-group').options].some(o=>o.value===group))$('#component-group').value=group;
}
const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();function hit(x,y){const r=canvas.getBoundingClientRect();mouse.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1);scene.updateMatrixWorld(true);ray.setFromCamera(mouse,camera);const physical=meshes.filter(m=>m.visible);pcbDetails?.object.traverse(m=>{if(m.isMesh&&m.visible)physical.push(m);});return ray.intersectObjects(physical,false)[0];}
hoverHint=createComponentHover({
 resolve(point){if(!record||!metrics.ready||document.querySelector('dialog[open]'))return null;const node=hit(point.x,point.y)?.object.userData.catalogNodeId,id=selectionMap.byNode.get(node),entry=selectionMap.byId.get(id);return entry&&componentInfo(record,entry.component).kind==='educational'?entry.component:null;},
 show(component,point){const label=$('#component-hover'),r=canvas.getBoundingClientRect();label.textContent=componentHeading(record,component)+' ⓘ';label.hidden=false;label.style.left=Math.max(8,Math.min(r.width-label.offsetWidth-8,point.x-r.left+14))+'px';label.style.top=Math.max(8,Math.min(r.height-label.offsetHeight-8,point.y-r.top-36))+'px';},
 hide(){$('#component-hover').hidden=true;}
});
canvas.addEventListener('pointermove',e=>hoverHint.move(e));
// A mouse released after orbiting may already be stationary over a piece.
// Re-arm the same raycast/dwell; a real click below clears it when opening a card.
canvas.addEventListener('pointerup',e=>hoverHint.move(e));
for(const event of ['pointerdown','pointerleave','pointercancel','wheel'])canvas.addEventListener(event,()=>hoverHint.clear(),{passive:true});
window.addEventListener('blur',()=>hoverHint.clear());
$('#viewer-options').addEventListener('toggle',()=>hoverHint.clear());
const gesture=tapTracker(),orbitGate=orbitGestureGate();
canvas.addEventListener('pointerdown',e=>orbitGate.down(e),true);
canvas.addEventListener('pointermove',e=>{gesture.move(e);if(orbitGate.move(e))e.stopImmediatePropagation();},true);
canvas.addEventListener('pointerup',e=>orbitGate.up(e),true);
canvas.addEventListener('pointercancel',()=>orbitGate.cancel(),true);
canvas.addEventListener('pointerdown',e=>gesture.down(e));
canvas.addEventListener('pointermove',e=>gesture.move(e));
canvas.addEventListener('pointerup',e=>{if(!gesture.up(e)||!record||!metrics.ready)return;lastPick=null;const h=hit(e.clientX,e.clientY),id=h?.object.userData.catalogNodeId;
 if($('#review-mode').checked&&id){$('#node-select').value=id;message('#review-state','selectedNode',{id});}
 else {const component=selectionMap.byNode.get(id);if(component)selectComponent(component);else {closeCard();showNearby(e);if(!lastPick?.candidates.length){if(h)notifyNoInfo();else message('#viewer-message','viewerHelp');}}}});
canvas.addEventListener('pointercancel',()=>gesture.cancel());
function showNearby(e){
 const started=performance.now();
 const r=canvas.getBoundingClientRect(),point={x:e.clientX,y:e.clientY},radius=e.pointerType==='touch'?POINTER_POLICY.touchRadius:POINTER_POLICY.mouseRadius;
 const entries=[...selectionMap.byId.values()].filter(v=>v.targets.length).map(v=>{const b=new THREE.Box3();v.targets.forEach(m=>b.expandByObject(m));const p=projectedBounds(b);return {id:v.component.id,bounds:{left:p.left+r.left,right:p.right+r.left,top:p.top+r.top,bottom:p.bottom+r.top}};});
 const candidates=nearbyChoices(entries,point,radius,id=>componentHitPoints(id,Infinity)),panel=$('#nearby-selection');lastPick={point,radius,candidates,searchMs:performance.now()-started};
 if(!candidates.length){panel.hidden=true;return;}
 message('#viewer-message','viewerHelp');
 $('#nearby-choices').replaceChildren(...candidates.map(c=>{const b=el('button',componentHeading(record,selectionMap.byId.get(c.id).component));b.dataset.nearbyId=c.id;b.onclick=()=>selectComponent(c.id);return b;}));panel.hidden=false;
 panel.style.left=Math.min(Math.max(12,e.clientX-r.left),Math.max(12,r.width-260))+'px';panel.style.top=Math.max(8,Math.min(e.clientY-r.top+20,r.height-220))+'px';
}
let lastPick=null;$('#close-nearby').onclick=()=>{$('#nearby-selection').hidden=true;};

$('#reset').onclick=()=>fit();$('#top-view').onclick=()=>fit(true);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]'))closeCard();});
function zoom(factor){if(!model)return;const offset=camera.position.clone().sub(controls.target);offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance));camera.position.copy(controls.target).add(offset);controls.update();dirty=true;}$('#zoom-in').onclick=()=>zoom(.82);$('#zoom-out').onclick=()=>zoom(1/.82);
const normalizeSearch=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function renderCatalog(){const query=normalizeSearch($('#saved-search').value),filtered=catalogBoards.filter(b=>normalizeSearch(b.identity.manufacturer+' '+b.identity.model).includes(query)),shown=filtered.slice(0,catalogLimit);
 $('#catalog').replaceChildren(...shown.map(b=>{const d=el('button','');d.type='button';d.className='catalog-item';d.dataset.boardId=b.id;if(record?.id===b.id)d.setAttribute('aria-current','true');d.onclick=()=>openBoard(b.id);const icon=el('span','');icon.className='catalog-symbol';icon.innerHTML='<svg class="icon" aria-hidden="true"><use href="#i-chip"/></svg>';const text=el('span','');text.append(el('strong',b.identity.model));text.className='catalog-copy';text.append(el('span',b.identity.manufacturer||t('unknown')),el('span',b.modelAvailable===false?t('onboard.dossier'):t('savedCards',{count:b.coverage.boundComponents})));const arrow=el('span','›');arrow.className='catalog-arrow';arrow.setAttribute('aria-hidden','true');d.append(icon,text,arrow);return d;}));
 if(!shown.length)$('#catalog').append(el('p',t(catalogBoards.length?'noSearchResults':'emptyCatalog')));message('#catalog-count','catalogCount',{shown:shown.length,total:filtered.length});$('#catalog-more').hidden=shown.length>=filtered.length;
}
$('#saved-search').oninput=()=>{catalogLimit=50;$('#saved-list-scroll').scrollTop=0;renderCatalog();};$('#catalog-more').onclick=()=>{catalogLimit+=50;renderCatalog();};
async function refreshCatalog(){const c=await api('/api/catalog');catalogBoards=c.boards;renderCatalog();return c;}
function renderJob(j){ui.progress(j.status);const completed=new Set(j.events.filter(e=>['complete','partial','blocked'].includes(e.status)).map(e=>e.stage));$('#progress').max=j.flow==='name'?7:6;$('#progress').value=j.cacheHit?$('#progress').max:completed.size;$('#job-state').removeAttribute('data-i18n');$('#job-state').textContent=j.status==='complete'&&j.preparationStatus==='documentation_only'?t('onboard.dossierSaved'):j.status==='complete'&&j.preparationStatus==='model_partial'?t('onboard.partialSaved',{time:(j.totalMs/1000).toFixed(2)}):j.status==='complete'?t('jobSaved',{time:(j.totalMs/1000).toFixed(2),cache:j.cacheHit?t('cacheVerified'):''}):j.status==='failed'?t('jobFailed',{error:errorText(j.error)}):t('preparing');$('#stages').replaceChildren(...j.events.map(e=>el('li',`${onboardingStage(e.stage)}: ${['running','complete','progress'].includes(e.status)?t(e.status):t('onboard.status.'+e.status)}${e.detail?' · '+onboardingReason(e.detail):''}`)));}

async function track(job,epoch=explorationEpoch,{open=true,onProgress=()=>{}}={}){
 while(epoch===explorationEpoch){const j=await api('/api/jobs/'+job.id);if(epoch!==explorationEpoch)return;lastJob=j;renderJob(j);onProgress(j);
  if(j.status==='running'){await new Promise(r=>setTimeout(r,350));continue;}
  if(j.status!=='complete')throw Error(j.error||j.status);await refreshCatalog();if(open&&epoch===explorationEpoch)await openBoard(j.boardId);return j;
 }
}
function identityResult(r){lastIdentity=r;const d=$('#identity-result');d.replaceChildren(el('p',r.status==='identified'?t('identifiedName'):r.status==='ambiguous'?t('ambiguousName'):t('unknownName')));
  if(r.discoveredNames)for(const name of r.discoveredNames){const b=el('button',t('onboard.searchDocuments',{name}));b.onclick=async()=>{b.disabled=true;try{await track(await api('/api/onboard',{name}));}catch(e){fail(e);}finally{b.disabled=false;}};d.append(b);}
  for(const c of r.candidates){const b=el('button',c.saved?t(c.modelAvailable===false?'reconstruction.resume':'onboard.openSaved'):t('prepareModel',{manufacturer:c.manufacturer,model:c.model}));b.onclick=async()=>{const epoch=explorationEpoch;try{b.disabled=true;if(c.saved&&c.modelAvailable===false)await track(await api('/api/onboard',{name:$('#board-name').value}),epoch);else if(c.saved)await openBoard(c.id);else await track(await api('/api/import',{profileId:c.id}),epoch);}catch(e){if(epoch===explorationEpoch)fail(e);}finally{b.disabled=false;}};d.append(b);}
}
$('#name-form').onsubmit=async e=>{e.preventDefault();const epoch=explorationEpoch,button=e.target.querySelector('button');try{button.disabled=true;const name=$('#board-name').value,result=await api('/api/identify',{name});if(epoch!==explorationEpoch)return;if(result.status==='unknown'&&!result.candidates.length)await track(await api('/api/onboard',{name}),epoch);else identityResult(result);}catch(e){if(epoch===explorationEpoch)fail(e);}finally{button.disabled=false;}};
function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
$('#manual-form').onsubmit=async e=>{e.preventDefault();const epoch=explorationEpoch,button=e.target.querySelector('button');try{button.disabled=true;const form=new FormData(e.target),file=form.get('asset');if(file.size>80*1024*1024)throw Error('maxFile');const kind=file.name.toLowerCase().endsWith('.glb')?'glb':'step';const b=Object.fromEntries(form);delete b.asset;b.kind=kind;b.base64=base64(new Uint8Array(await file.arrayBuffer()));await track(await api('/api/manual',b),epoch);}catch(e){if(epoch===explorationEpoch)fail(e);}finally{button.disabled=false;}};
async function review(patch){if(!record)throw Error('openFirst');const id=record.id,epoch=explorationEpoch;try{await api(`/api/boards/${id}/review`,{revision:record.review.revision,...patch});if(epoch!==explorationEpoch)return;await openBoard(id);if(epoch===explorationEpoch)message('#review-state','reviewSaved');}catch(e){if(epoch===explorationEpoch)throw e;}}
$('#material-form').onsubmit=async e=>{e.preventDefault();try{await review({material:{...Object.fromEntries(new FormData(e.target)),nodeId:$('#node-select').value}});}catch(e){fail(e);}};
$('#component-form').onsubmit=async e=>{e.preventDefault();try{const c=Object.fromEntries(new FormData(e.target)),group=$('#component-group').value;
  const nodeIds=group===''?[$('#node-select').value]:record.inventory.nodes.filter(n=>n.mesh!==null&&n.chain.includes(Number(group))).map(n=>n.id);
  if(!c.description.trim()&&!c.descriptionEN.trim())throw Error('descriptionNote');await review({component:{id:c.id,label:c.label,description:c.description||c.descriptionEN,sourceLanguage:c.description?'es':'en',translations:{es:{label:c.label,description:c.description},en:{label:c.labelEN||c.label,description:c.descriptionEN}},nodeIds,sources:[{url:c.source,status:'user_supplied_unverified'}]}});}catch(e){fail(e);}};
let photoObservation=null,photoGeneration=0,pendingPhoto=null,photoRunning=false,activePhotoInference=null;
function invalidatePhoto(){photoGeneration++;pendingPhoto=null;photoRunning=false;capturedBoardId=null;$('#open-capture-model').hidden=true;$('#photo-manual').hidden=true;}
function publishPhotoObservation(){if(photoObservation)$('#photo-result').textContent=JSON.stringify(photoObservation,null,2);}
async function processCapturedPhoto(file,{source='uploaded_photo'}={}){
 const epoch=explorationEpoch,photoToken=++photoGeneration,started=performance.now(),stale=()=>epoch!==explorationEpoch||photoToken!==photoGeneration;pendingPhoto={file,source};photoRunning=true;capturedBoardId=null;$('#open-capture-model').hidden=true;message('#capture-status','release.identifying');$('#camera-busy').hidden=false;
 try{
  // A retake may replace the UI while the SDK's bounded Cloud request settles.
  // Serialize transports and read the allowance afterwards; never spend twice
  // from the same stale session counter or run inference on live video frames.
  if(activePhotoInference)await activePhotoInference.catch(()=>{});if(stale())return;
  let config=runtimeConfig.firebase?runtimeConfig:null; // Operator-supplied public web configuration, not a user engine choice.
  if(!config){try{config=JSON.parse($('#firebase-config').value);}catch{}}
  const consent=$('#cloud-consent').checked,used=Number(sessionStorage.getItem('itc-cloud-count')||0),allowance=runtimeConfig.maxCloudCallsPerSession??1;
  const request=identifyPhotoAutomatically(file,{config,cloudConsent:runtimeConfig.cloudEnabled===true&&consent,cloudUsed:used>=allowance,withComponents:true,onCloudUse:()=>sessionStorage.setItem('itc-cloud-count',String(used+1))});activePhotoInference=request;
  let observation;try{observation=await request;}finally{if(activePhotoInference===request)activePhotoInference=null;}
  if(stale())return;observation.inputKind=source;photoObservation=observation;publishPhotoObservation();
  if(observation.status!=='identified'){message('#capture-status',photoOutcome(observation)|| (observation.route.reason==='photoAuto.consentMissing'?'delivery.consent':observation.status==='ambiguous'||observation.status==='partial'?'delivery.ambiguous':'release.photoBlocked'),{reason:observation.validation?.identity?.limitations?.join(' ')||observation.error||observation.validation?.errors?.join(', ')||observation.route.reason});$('#photo-manual').hidden=observation.validation?.boardPresence==='absent';return;}
  pendingPhoto=null;$('#photo-manual').hidden=true;message('#capture-status','delivery.catalogue');
  const preparationStart=performance.now(),photoTrack=async job=>track(job,epoch,{open:false,onProgress:j=>{if(stale())return;observation.preparation=j;publishPhotoObservation();const e=j.events.at(-1);if(e)message('#capture-status','delivery.stage',{stage:onboardingStage(e.stage),status:['running','complete','progress'].includes(e.status)?t(e.status):t('onboard.status.'+e.status)});}});
  observation.catalogue=await resolvePhotoIdentity(observation,{identify:name=>api('/api/identify',{name}),open:async id=>{capturedBoardId=id;},prepareKnown:async id=>{capturedBoardId=(await photoTrack(await api('/api/import',{profileId:id})))?.boardId;},prepareNew:async name=>{capturedBoardId=(await photoTrack(await api('/api/onboard',{name})))?.boardId;}});
  observation.timingsMs.cataloguePreparation=performance.now()-preparationStart;observation.savedBoardId=capturedBoardId;
  if(stale())return;
  if(!capturedBoardId){message('#capture-status','photoAuto.missing');return;}
  const saved=await api('/api/boards/'+capturedBoardId);$('#open-capture-model').hidden=false;message('#open-capture-model',saved.modelAvailable===false?'delivery.openDocumentation':'release.exploreModel');
  message('#capture-status','delivery.verifying');const verificationStart=performance.now(),capture=await createCapture(new Uint8Array(await file.arrayBuffer()),file.type);
  const verification=await api('/api/photo/verify',{mimeType:capture.mimeType,base64:capture.base64,sha256:capture.sha256,proposals:observation.proposals});if(stale())return;
  const components=[...saved.components.filter(c=>!saved.review.components.some(m=>m.id===c.id)),...saved.review.components],bindings=bindPhotoComponents(observation.proposals,components),cards={};
  for(const p of bindings){const c=components.find(c=>c.id===p.componentId);if(!c||componentInfo(saved,c).kind==='none')continue;Object.defineProperty(cards,p.id,{enumerable:true,get:()=>({...educationalCard(saved,c),label:componentHeading(saved,c),sources:c.sources,informationKind:componentInfo(saved,c).kind,reviewStatus:componentInfo(saved,c).review,statusText:t('delivery.proposal'),confidence:{identity:t('delivery.identityBasis'),association:t('delivery.pixelBasis')}})});}
  observation.verification=verification;observation.bindings=bindings;observation.visibleCount=cameraExperience.applyProposals(verification,bindings,cards,observation);observation.timingsMs.componentVerification=performance.now()-verificationStart;
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));if(stale())return;observation.timingsMs.captureToRectangles=performance.now()-started;publishPhotoObservation();message('#capture-status',saved.modelAvailable===false?'delivery.documentationOnly':'delivery.finished',{board:observation.validation.identity.model,count:observation.visibleCount,total:observation.proposals.length});
 }catch(e){if(!stale()){if(photoObservation){photoObservation.flowError=e.message;publishPhotoObservation();}message('#capture-status','release.photoBlocked',{reason:errorText(e)});}}
 finally{if(!stale()){$('#camera-busy').hidden=true;photoRunning=false;}}
}
$('#cloud-consent').onchange=()=>{if($('#cloud-consent').checked&&pendingPhoto&&!photoRunning)processCapturedPhoto(pendingPhoto.file,{source:pendingPhoto.source});};
$('#photo-manual').onclick=()=>ui.open('catalog-dialog','tab-add');
async function runPhotoOnboarding(){const file=$('#photo').files[0];if(!file)return;ui.closeMenus();setScreen('camera');cameraExperience.suspend();try{await cameraExperience.loadFile(file);}catch(e){errorMessage('#capture-status',e);}}
async function trackWrapper(url,data,epoch){await track(await api(url,data),epoch);}
$('#identify-photo').onclick=runPhotoOnboarding;
$('#photo').onchange=()=>{if($('#photo').files.length)runPhotoOnboarding();};
$('#camera-upload').onclick=()=>$('#camera-photo').click();
if(runtimeConfig.testPhotoAvailable&&new URLSearchParams(location.search).has('diagnostic')){const b=el('button',locale()==='es'?'Prueba local: fotografía guardada':'Local test: saved photograph');b.id='delivery-test-photo';b.className='camera-upload';b.style.top='210px';$('#camera-stage').append(b);b.onclick=async()=>{b.disabled=true;try{const response=await fetch('/api/test-photo'),blob=await response.blob();await cameraExperience.loadFile(new File([blob],'input.jpg',{type:'image/jpeg'}));if(photoObservation){photoObservation.testInput='saved_photograph_not_live_camera';publishPhotoObservation();}}finally{b.disabled=false;}};}
$('#camera-photo').onchange=async()=>{try{await cameraExperience.loadFile($('#camera-photo').files[0]);}catch(e){errorMessage('#capture-status',e);}};
$('#open-capture-model').onclick=()=>{if(capturedBoardId)openBoard(capturedBoardId);};

function componentHitPoints(id,maxPoints=3){
 const entry=selectionMap.byId.get(id);if(!entry)return [];scene.updateMatrixWorld(true);const r=canvas.getBoundingClientRect(),found=[];
 for(const m of entry.targets){const p=m.geometry.attributes.position,indices=m.geometry.index,limit=indices?.count||p.count;
  for(let j=0;j<limit;j+=Math.max(3,Math.floor(limit/POINTER_POLICY.maxTriangleSamplesPerMesh/3)*3)){
   const v=new THREE.Vector3();for(let k=0;k<3&&j+k<limit;k++)v.add(new THREE.Vector3().fromBufferAttribute(p,indices?indices.getX(j+k):j+k));v.multiplyScalar(1/3).applyMatrix4(m.matrixWorld).project(camera);
   const x=r.left+(v.x+1)*r.width/2,y=r.top+(1-v.y)*r.height/2;if(v.z<-1||v.z>1||x<r.left||x>r.right||y<r.top||y>r.bottom)continue;
   if(hit(x,y)?.object.userData.catalogNodeId===m.userData.catalogNodeId&&document.elementFromPoint(x,y)===canvas){found.push({x,y,node:m.userData.catalogNodeId});if(found.length>=maxPoints)return found;}
  }
 }return found;
}
function outlinePixelEvidence(){
 if(!outline||!selected)return {changedPixels:0};const b=selectedBounds(),ratio=renderer.getPixelRatio(),W=canvas.width,H=canvas.height;
 const x=Math.max(0,Math.floor((b.left-10)*ratio)),y=Math.max(0,H-Math.ceil((b.bottom+10)*ratio)),w=Math.min(W-x,Math.ceil((b.right+10)*ratio)-x),h=Math.min(H-y,H-Math.floor((b.top-10)*ratio)-y);
 if(w<=0||h<=0)return {changedPixels:0,outside:true};const gl=renderer.getContext(),a=new Uint8Array(w*h*4),c=new Uint8Array(w*h*4);renderer.render(scene,camera);gl.readPixels(x,y,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);outline.render(renderer);gl.readPixels(x,y,w,h,gl.RGBA,gl.UNSIGNED_BYTE,c);let changed=0,yellow=0;
 for(let i=0;i<a.length;i+=4)if(Math.max(...[0,1,2,3].map(k=>Math.abs(a[i+k]-c[i+k])))>8){changed++;if(c[i]>140&&c[i+1]>95&&c[i+2]<c[i+1]*.8)yellow++;}
 return {changedPixels:changed,yellowPixels:yellow,rectangle:[x,y,w,h]};
}
window.boardLibraryDiagnostic={lastPick:()=>lastPick,componentBounds:id=>{const e=selectionMap.byId.get(id);if(!e)return null;const b=new THREE.Box3();e.targets.forEach(m=>b.expandByObject(m));return projectedBounds(b);},surfaceRayAudit:()=>({layers:markings?.object.children.map(m=>{const hits=[];m.raycast(ray,hits);return {name:m.name,hits:hits.length,nativeSelectionTarget:meshes.includes(m)};})||[],presentationOccluders:(()=>{let count=0;pcbDetails?.object.traverse(m=>{if(m.isMesh)count++;});return count;})()}),outlinePixelEvidence,componentHitPoints,materialLibrary:()=>{const out=[];model?.traverse(m=>{if(m.material)for(const v of Array.isArray(m.material)?m.material:[m.material])if(v.userData.library)out.push({mesh:m.name,...v.userData.library});});return out;},selectionAudit:()=>({issues:selectionMap.issues,bindings:[...selectionMap.byId.values()].map(e=>({id:e.component.id,nodes:e.targets.map(m=>m.userData.catalogNodeId),missing:e.missing,education:e.component.educationStatus||'catalogue'})),light:selectionLight?.count||0}),materialAudit:()=>meshes.map(m=>({node:m.userData.catalogNodeId,materials:(Array.isArray(m.material)?m.material:[m.material]).map(v=>({uuid:v.uuid,color:v.color.toArray(),emissive:v.emissive?.toArray(),emissiveIntensity:v.emissiveIntensity,roughness:v.roughness,metalness:v.metalness,clearcoat:v.clearcoat,library:v.userData.library}))})),photoObservation:()=>photoObservation,surfaceLayers:()=>markings?.object.children.map(m=>({name:m.name,positions:Array.from(m.geometry.attributes.position.array),uv:Array.from(m.geometry.attributes.uv.array),matrixWorld:m.matrixWorld.toArray()}))||[],state:()=>({...metrics,frameLayout,modelScreenBounds:model?projectedBounds(new THREE.Box3().setFromObject(model)):null,educationalDiscovery:{enabled:$('#show-educational').checked,markedNodes:educationalOutline?.nodeIds||[],components:[...selectionMap.byId.values()].map(e=>({id:e.component.id,...componentInfo(record,e.component),nodes:e.targets.map(m=>m.userData.catalogNodeId)}))},selection:selected,selectedBounds:selectedBounds(),camera:camera.position.toArray(),target:controls.target.toArray(),cameraQuaternion:camera.quaternion.toArray(),cameraZoom:camera.zoom,cameraProjection:camera.projectionMatrix.toArray(),modelMatrix:model?.matrix.toArray(),controlLimits:[controls.minDistance,controls.maxDistance],calls:renderer.info.render.calls,outline:outline?{kind:outline.kind,nodeIds:outline.nodeIds}:null,depthRange:[camera.near,camera.far],antialias:renderer.getContext().getContextAttributes().antialias,locale:locale(),explorationEpoch}),measureFrames:ms=>{frameSamples={until:performance.now()+Math.min(ms,10000),samples:[]};},frames:()=>frameSamples?.samples||[],componentScreen:id=>{const c=allComponents().find(c=>c.id===id),box=new THREE.Box3();for(const m of meshes.filter(m=>c.nodeIds.includes(m.userData.catalogNodeId)))box.expandByObject(m);const v=box.getCenter(new THREE.Vector3()).project(camera),r=canvas.getBoundingClientRect();return{x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2};},hit:(x,y)=>hit(x,y)?.object.userData.catalogNodeId};
function clearExploration(){$('#explorer-library').disabled=false;$('#board-experiments').hidden=true;hoverHint?.clear();explorationEpoch++;generation++;cleanup();$('#model-warning').hidden=true;record=null;metrics={ready:false,errors:[]};lastIdentity=null;lastJob=null;lastError=null;cameraExperience.reset();
 for(const id of ['component-list','provenance','coverage','identity-result','photo-result','node-select','component-group','stages','error','review-state','component-title','component-description','component-example','component-reference','component-confidence','facts','sources','board-education','confidence-identity','confidence-geometry','confidence-basis'])clearMessage('#'+id);
 message('#board-education','education.empty');message('#provenance','ui.open_a_board_to_see_its_sources_license_and_limitations');message('#viewer-stats','ui.no_model_loaded');message('#job-state','ui.no_preparation_in_progress');message('#photo-state','ui.no_inference_has_run_does_not_activate_billing_or_services');message('#title','ui.choose_a_board');
 $('#original-content').hidden=true;$('#original-content p').textContent='';$('#photo').value='';$('#board-name').value='';$('#component-form').reset();$('#material-form').reset();$('#review-mode').checked=false;$('#components-toggle').disabled=true;$('.board-heading').hidden=true;$('#view-controls').hidden=true;$('#viewer-message').hidden=true;$('#preparation-panel').hidden=true;$('#preparation-status').hidden=true;$('#loading-state').hidden=true;$('#empty-state').hidden=false;ui.error('');
}
function placePreferences(screen){
 const slot=document.querySelector(`[data-preferences="${screen}"]`);
 (slot||document.body).append($('#language-control'));
}
function route(screen,book=null){
 const index=(history.state?.itcIndex||0)+1;
 history.pushState({screen,itcIndex:index,bookId:book?.id||null},'',screenURL(screen,location.href,book));
}
function hideLibrary(){
 $('#library-screen').hidden=true;
 // replace avoids creating an extra browser-history step for the embedded page.
 $('#library-frame').contentWindow.location.replace('about:blank');
}
function setScreen(screen,push=true,{startCamera=true}={}){
 if(!['home','camera','explorer'].includes(screen))screen='home';
 const previous=document.body.dataset.screen;
 if(previous==='library')hideLibrary();
 closeCard();ui.closeMenus();hoverHint?.clear();
 if(previous==='camera'&&screen!=='camera')cameraExperience.suspend();
 if(screen==='home'||(screen==='camera'&&previous!=='camera'))clearExploration();
 document.body.dataset.screen=screen;placePreferences(screen);
 (screen==='camera'?$('#camera-stage'):$('#stage')).append($('#card'));
 if(screen==='camera'&&startCamera)cameraExperience.start();
 if(push&&(previous!==screen||location.pathname==='/library/'))route(screen);
 dirty=true;
}
function back(){
 if(history.state?.itcIndex>0)history.back();
 else if(document.body.dataset.screen==='library')closeLibrary(true);
 else setScreen('home');
}
for(const button of document.querySelectorAll('[data-home]'))button.onclick=()=>setScreen('home');
for(const link of document.querySelectorAll('a[href="#home"]'))link.onclick=event=>{event.preventDefault();setScreen('home');};
$('#enter-camera').onclick=()=>ui.open('explore-dialog');
$('#explore-camera').onclick=()=>setScreen('camera');
$('#explore-photo').onclick=()=>{setScreen('camera',true,{startCamera:false});$('#camera-photo').click();};
$('#explore-catalog').onclick=()=>{ui.open('catalog-dialog');refreshCatalog().catch(fail);};
$('#camera-back').onclick=$('#explorer-back').onclick=back;
$('#explorer-library').onclick=()=>openLibrary();
$('#camera-catalog').onclick=()=>{ui.open('catalog-dialog');refreshCatalog().catch(fail);};
$('#camera-settings').onclick=()=>ui.open('details-dialog');
function restoreRoute(){
 const screen=location.pathname==='/library/'?'library':location.hash.slice(1)||'home';
 if(screen==='library')openLibrary(libraryConfig.books.find(b=>b.id===new URLSearchParams(location.search).get('book')),false);
 else if(document.body.dataset.screen==='library'&&screen===(libraryReturn?.screen||'home'))closeLibrary(false);
 else if(screen!==document.body.dataset.screen)setScreen(screen,false);
}
window.addEventListener('popstate',restoreRoute);
window.addEventListener('hashchange',restoreRoute);
history.replaceState({screen:location.pathname==='/library/'?'library':location.hash.slice(1)||'home',itcIndex:0},'',location.href);
window.cameraExperienceDiagnostic={state:()=>cameraExperience.state()};
if(location.pathname==='/library/')openLibrary(libraryConfig.books.find(b=>b.id===new URLSearchParams(location.search).get('book')),false);else setScreen(new URLSearchParams(location.search).get('view')==='explorer'?'explorer':location.hash.slice(1)||'home',false);
await refreshCatalog();

onLocaleChange(()=>{renderCatalog();if(record){if(record.modelAvailable===false)renderBoardEducation(record,metrics);else {renderModelText();renderRecord();}if(selected)selectComponent(selected,true);}if(lastIdentity)identityResult(lastIdentity);if(lastJob)renderJob(lastJob);if(lastError)fail(lastError);dirty=true;});

function compatibleBook(identity){return findCompatibleBook(identity,libraryConfig.books);}
function openLibrary(book=null,push=true){
 if(document.body.dataset.screen!=='library')libraryReturn={screen:document.body.dataset.screen||'home',url:location.pathname+location.search+location.hash};
 cameraExperience.suspend();ui.closeMenus();hoverHint?.clear();
 document.body.dataset.screen='library';placePreferences('library');$('#library-screen').hidden=false;
 const url=libraryDestination(libraryConfig.url,location.origin,book);
 $('#library-external').href=libraryDestination(libraryConfig.localPatch?libraryConfig.url:(libraryConfig.externalUrl||libraryConfig.url),location.origin,book);
 $('#library-frame').contentWindow.location.replace(url);
 if(push)route('library',book);
}
function closeLibrary(replace=false){
 hideLibrary();const screen=libraryReturn?.screen||'home';
 // Do not unload the model, reset OrbitControls, reselect or collapse the card.
 document.body.dataset.screen=screen;placePreferences(screen);
 if(replace)history.replaceState({screen,itcIndex:0},'',libraryReturn?.url||screenURL(screen,location.href));
 if(screen==='camera'&&startCamera)cameraExperience.start();dirty=true;
}
$('#library-back').onclick=back;
$('#board-experiments').onclick=()=>{const book=compatibleBook(record?.identity);if(book)openLibrary(book);};

$('#check-ai').onclick=async()=>{const environment=await inspectEnvironment();$('#ai-status').textContent=JSON.stringify({environment,configurationPresent:!!runtimeConfig.firebase,cloudEnabled:runtimeConfig.cloudEnabled,modelCalls:0},null,2);};
