import {t,locale,message,clearMessage,onLocaleChange,localize} from './i18n.mjs';
import {imageTransform,originalPolygon} from '../../src/local/coordinates.mjs';
import {CARDS,CARD_SOURCE} from '../../src/local/cards.mjs';
import capabilities from './camera-profiles.json';
const $=s=>document.querySelector(s),NS='http://www.w3.org/2000/svg';
const state=p=>p.subtipo==='sin_geometria'?t('camera.insufficient'):p.estado==='confirmado'?t('camera.confirmed'):p.estado==='probable'?t('camera.probable'):t('camera.unknown');
// Camera, pixel preparation and display adapter only. The existing worker is unchanged.
export function createCameraExperience({onCard,onClear,onLayout,onCapture,onInvalidate=()=>{}}){
  const video=$('#live-camera'),frozen=$('#frozen-camera'),overlay=$('#capture-overlay'),stage=$('#camera-stage');
  let identityObservation=null,inputSource=null,photoCards=null;
  let stream=null,worker=null,epoch=0,ready=false,capture=false,result=null,selected=null,profile=null,transform=null,busy=false,observation=null,pendingCancel=null;
  for(const p of capabilities.profiles){const o=document.createElement('option');o.value=p.id;o.textContent=p.label.split(' · ')[0]+' · '+t('experimental');$('#recognition-profile').append(o);}
  function clearSelection(){selected=null;for(const p of overlay.querySelectorAll('polygon'))p.classList.remove('selected');for(const b of $('#camera-components').children)b.setAttribute('aria-pressed','false');}
  function stopStream(){stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;ready=false;$('#capture-button').disabled=true;}
  function cancel(){epoch++;worker?.terminate();worker=null;pendingCancel?.();pendingCancel=null;busy=false;$('#camera-busy').hidden=true;}
  function clearResult(){onClear();clearSelection();result=null;photoCards=null;identityObservation=null;observation=null;overlay.replaceChildren();overlay.setAttribute('hidden','');$('#camera-components').replaceChildren();$('#camera-components').hidden=true;}
  function suspend(){onInvalidate();const interrupted=busy;cancel();stopStream();if(interrupted)message($('#capture-status'),'camera.interrupted');}
  async function start({fresh=false}={}){
    if(fresh)onInvalidate();
    cancel();stopStream();if(capture&&!fresh){$('#camera-empty').hidden=true;return;}
    clearResult();capture=false;frozen.hidden=true;video.hidden=false;$('#retake').disabled=true;clearMessage('#capture-status');message($('#camera-instruction'),'ui.point_at_your_board');$('#camera-empty').hidden=false;
    message($('#camera-error'),'ui.allow_camera_access_to_get_started');const token=epoch;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw Error(t('camera.secure'));
      const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
      if(token!==epoch){media.getTracks().forEach(t=>t.stop());return;}stream=media;video.srcObject=media;await video.play();if(token!==epoch)return;
      ready=video.videoWidth>0;$('#capture-button').disabled=!ready;$('#camera-empty').hidden=ready;
    }catch(e){if(token!==epoch)return;const messages={NotAllowedError:'camera.denied',NotFoundError:'camera.absent',NotReadableError:'camera.occupied'};message('#camera-error',messages[e.name]||'camera.failed');$('#camera-empty').hidden=false;}
  }
  function imageRect(){const scale=Math.min(stage.clientWidth/frozen.width,stage.clientHeight/frozen.height),w=frozen.width*scale,h=frozen.height*scale;return{x:(stage.clientWidth-w)/2,y:(stage.clientHeight-h)/2,w,h,scale};}
  function polygon(id){const p=result?.piezas[id];return result?.geometria.ok&&p?(photoCards?p.poligono:originalPolygon(p.poligono,transform)):null;}
  function selectedBounds(){const pts=polygon(selected);if(!pts)return null;const r=imageRect(),xs=pts.map(p=>r.x+p[0]*r.scale),ys=pts.map(p=>r.y+p[1]*r.scale);return{left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};}
  function select(id,refresh=false){const p=result?.piezas[id];if(!p)return;clearSelection();selected=id;for(const poly of overlay.querySelectorAll('polygon'))poly.classList.toggle('selected',poly.dataset.id===id);for(const b of $('#camera-components').children)b.setAttribute('aria-pressed',String(b.dataset.id===id));
    if(photoCards){onCard(photoCards[id],refresh);return;}
    // Keep the technical descriptions, evidence text and source used by the old photo demo.
    onCard({label:`${profile.labels[id]||id} · ${state(p)}`,description:CARDS[id]?.[locale()]||'',statusText:p.motivo?localize(p.motivo):t('camera.coherent'),facts:[
      t('camera.caveat'),
      p.ncc?t('camera.ncc',{value:p.ncc.local??t('camera.noData'),margin:p.ncc.margen??t('camera.noData')}):t('camera.noNcc')
    ],sources:[{url:CARD_SOURCE,locator:t('camera.cardSource')}]},refresh);
  }
  function draw(){overlay.replaceChildren();$('#camera-components').replaceChildren();overlay.setAttribute('viewBox',`0 0 ${frozen.width} ${frozen.height}`);overlay.setAttribute('preserveAspectRatio','xMidYMid meet');overlay.removeAttribute('hidden');
    for(const [id,p]of Object.entries(result.piezas)){
      if(photoCards)profile.labels[id]=photoCards[id].label;
      const b=document.createElement('button');b.textContent=profile.labels[id]||id;b.dataset.id=id;b.title=state(p);b.onclick=()=>select(id);$('#camera-components').append(b);
      const pts=polygon(id);if(!pts)continue;
      const poly=document.createElementNS(NS,'polygon');poly.setAttribute('points',pts.map(p=>p.join(',')).join(' '));poly.setAttribute('class',p.estado);poly.dataset.id=id;poly.setAttribute('role','button');poly.setAttribute('tabindex','0');poly.setAttribute('aria-label',`${profile.labels[id]||id} · ${state(p)}`);poly.onclick=()=>select(id);poly.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(id);}};overlay.append(poly);
      const text=document.createElementNS(NS,'text');text.setAttribute('x',pts[0][0]);text.setAttribute('y',pts[0][1]-8);text.textContent=`${p.estado==='confirmado'?'✓':p.estado==='probable'?'△':'?'} ${profile.labels[id]||id}`;overlay.append(text);
    }
    $('#camera-components').hidden=!Object.keys(result.piezas).length;resize();
  }
  function resize(){if(!capture)return;const r=imageRect();for(const text of overlay.querySelectorAll('text'))text.setAttribute('font-size',String(13/r.scale));onLayout();}
  async function analyze(identitySource='manual_profile_selection'){cancel();clearResult();profile=capabilities.profiles.find(p=>p.id===$('#recognition-profile').value);if(!capture)return;
    if(!profile){message($('#capture-status'),'camera.choose');return;}
    const token=epoch,start=performance.now();busy=true;$('#camera-busy').hidden=false;message($('#capture-status'),'camera.analyzing');
    try{
      transform=imageTransform(frozen.width,frozen.height);const canvas=document.createElement('canvas');canvas.width=transform.width;canvas.height=transform.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(frozen,0,0,canvas.width,canvas.height);const img={width:canvas.width,height:canvas.height,channels:4,data:ctx.getImageData(0,0,canvas.width,canvas.height).data},preparationMs=performance.now()-start;
      worker=new Worker(profile.worker,{type:'module'});const w=worker,id=crypto.randomUUID();
      const output=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{w.terminate();pendingCancel=null;reject(Error(t('camera.timeout')));},60000);pendingCancel=()=>{clearTimeout(timer);reject(Error('cancelled'));};w.onmessage=({data})=>{if(data.id!==id)return;clearTimeout(timer);pendingCancel=null;data.error?reject(Error(data.error)):resolve(data);};w.onerror=e=>{clearTimeout(timer);pendingCancel=null;reject(Error(e.message));};w.postMessage({id,img},[img.data.buffer]);});
      if(token!==epoch)return;result=output.result;observation={kind:'actual_existing_local_worker',identitySource,profileId:profile.id,input:{width:frozen.width,height:frozen.height,source:inputSource},transform,matrix:output.matrix,preparationMs,totalMs:performance.now()-start,result,phases:output.phases};
      draw();message('#capture-status',result.geometria.ok?'camera.pose':'camera.noGeometry');
    }catch(e){if(token!==epoch)return;message('#capture-status',e.message==='private_assets_missing'?'camera.missing':'camera.analysisFailed');observation={kind:'local_worker_error',error:e.message};}
    finally{if(token===epoch){busy=false;$('#camera-busy').hidden=true;worker?.terminate();worker=null;}}
  }
  async function take(){if(!ready||!video.videoWidth)return;frozen.width=video.videoWidth;frozen.height=video.videoHeight;frozen.getContext('2d').drawImage(video,0,0);capture=true;frozen.hidden=false;video.hidden=true;$('#retake').disabled=false;message($('#camera-instruction'),'camera.frozen');stopStream();inputSource='camera_media_stream';const blob=await new Promise(resolve=>frozen.toBlob(resolve,'image/jpeg',.94));await onCapture(new File([blob],'capture.jpg',{type:'image/jpeg'}),{source:inputSource});}
  async function loadFile(file){
    if(!file||!['image/jpeg','image/png'].includes(file.type)||file.size>8*1024*1024)throw Error('photoSize');
    onInvalidate();cancel();stopStream();clearResult();const token=epoch,bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});if(token!==epoch){bitmap.close();return;}
    if(bitmap.width*bitmap.height>16000000){bitmap.close();throw Error('photoSize');}
    frozen.width=bitmap.width;frozen.height=bitmap.height;frozen.getContext('2d').drawImage(bitmap,0,0);bitmap.close();capture=true;inputSource='uploaded_photo';frozen.hidden=false;video.hidden=true;$('#camera-empty').hidden=true;$('#retake').disabled=false;message('#camera-instruction','camera.frozen');
    // Send the same EXIF-oriented pixel matrix that the user sees, without a second resize.
    const blob=await new Promise(resolve=>frozen.toBlob(resolve,'image/jpeg',.94));if(token!==epoch)return;await onCapture(new File([blob],'capture.jpg',{type:'image/jpeg'}),{source:inputSource});
  }
  async function applyIdentity(identity,trace){identityObservation=trace;const normal=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');const candidate=capabilities.profiles.find(p=>normal(p.identity?.manufacturer)===normal(identity.manufacturer)&&normal(p.identity?.model)===normal(identity.model));
    if(!candidate){message('#capture-status','release.noPhotoGeometry');return;}
    $('#recognition-profile').value=candidate.id;await analyze('validated_visual_identity');
  }
  function applyProposals(verification,bindings,cards,trace){
    clearResult();identityObservation=trace;photoCards=cards;profile={id:'gemini-proposals-local-pixel-verification',labels:{}};result={geometria:{ok:true,meaning:'component_regions_only_no_pcb_pose'},piezas:{}};
    for(const row of verification.components){const p=bindings.find(p=>p.id===row.id);if(!row.verification.accepted||!p?.componentId||!cards[row.id])continue;const [y0,x0,y1,x1]=row.verification.displayBox;profile.labels[row.id]=cards[row.id].label;result.piezas[row.id]={estado:'probable',poligono:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]};}
    observation={kind:'gemini_proposals_verified_against_capture_pixels',verification,bindings,visibleCount:Object.keys(result.piezas).length,input:{width:frozen.width,height:frozen.height,source:inputSource}};draw();return observation.visibleCount;
  }
  $('#capture-button').onclick=()=>take();$('#retake').onclick=$('#camera-retry').onclick=()=>start({fresh:true});$('#recognition-profile').onchange=()=>{if(capture)analyze();};
  new ResizeObserver(resize).observe(stage);
  onLocaleChange(()=>{for(const option of $('#recognition-profile').options){const p=capabilities.profiles.find(p=>p.id===option.value);if(p)option.textContent=p.label.split(' · ')[0]+' · '+t('experimental');}if(result){const id=selected;draw();if(id)select(id,true);}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){suspend();if(!capture){$('#camera-empty').hidden=false;message($('#camera-error'),'camera.paused');}}});
  window.addEventListener('pagehide',suspend);
  return {start,suspend,loadFile,applyIdentity,applyProposals,clearSelection,selectedBounds,select,state:()=>({ready,capture,busy,selected,epoch,profileId:profile?.id||null,identityObservation,inputSource,tracks:stream?.getTracks().map(t=>t.readyState)||[],observation}),reset(){identityObservation=null;inputSource=null;suspend();clearResult();capture=false;profile=null;transform=null;$('#recognition-profile').value='';frozen.hidden=true;frozen.width=frozen.height=1;clearMessage('#capture-status');message('#camera-instruction','ui.point_at_your_board');}};
}
