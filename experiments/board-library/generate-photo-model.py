"""Generate educational envelopes from source-backed observations, never from CAD.
No board identifiers, expected counts, positions, colours or package names in this engine.
Y up, metres. Missing thickness/height produces an explicitly flat observation, not a fake volume.
"""
import sys,json,math,struct,io,time,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'.local/discovery-python'))
import cv2
import numpy as np
from PIL import Image,ImageDraw

def main(work,output):
 start=time.perf_counter();obs=json.loads((work/'observations.json').read_text(encoding='utf-8'));manifest=json.loads((work/'input-manifest.json').read_text(encoding='utf-8'));policy=json.loads(Path(__file__).with_name('reconstruction-policy.json').read_text(encoding='utf-8'));visual=json.loads(Path(__file__).with_name('visual-profile.json').read_text(encoding='utf-8'));shared=json.loads(Path(__file__).with_name('material-library.json').read_text(encoding='utf-8'))
 source=next(s for s in manifest['sources'] if s['id']==obs['referenceImageId']);im=Image.open(work.parent/source['file']).convert('RGB');a=np.array(im);ih,iw=a.shape[:2];b=obs['board'];width,depth=b['widthMm'],b['depthMm'];scale=policy['textureLongSide']/max(width,depth);tw,th=round(width*scale),round(depth*scale)
 pixel=lambda p:np.array(p,dtype=np.float32)*[iw/1000,ih/1000]
 H=cv2.getPerspectiveTransform(pixel(b['corners']).astype(np.float32),np.array([[0,0],[tw,0],[tw,th],[0,th]],np.float32));inverse=np.linalg.inv(H)
 project=lambda p:cv2.perspectiveTransform(pixel(p).reshape(1,-1,2).astype(np.float32),H)[0]
 outline=project(b['outline']);holes=[(project([h['center']])[0],h['radius']*math.sqrt(iw*ih)/1000*math.sqrt(abs(np.linalg.det(H[:2,:2])))) for h in b.get('holes',[])]
 mask=np.zeros((th,tw),np.uint8);cv2.fillPoly(mask,[np.round(outline).astype(np.int32)],255)
 for c,r in holes:cv2.circle(mask,tuple(np.round(c).astype(int)),round(r),0,-1)
 rect=cv2.warpPerspective(a,H,(tw,th));Image.fromarray(rect).save(work/'rectified-reference.png')
 # Remove observed elevated objects from substrate artwork. Inpainting is cosmetic only;
 # no traces/text are generated in the removed regions, which are filled with sampled substrate.
 exclusions=np.zeros_like(mask);objects=[]
 for o in obs['objects']:
  poly=project(o['polygon']);cv2.fillPoly(exclusions,[np.round(poly).astype(np.int32)],255);objects.append((o,poly))
 sample=project([b.get('colourSamplePoint',b['corners'][0])])[0];sx,sy=np.clip(np.round(sample).astype(int),[0,0],[tw-1,th-1]);patch=rect[max(0,sy-3):sy+4,max(0,sx-3):sx+4];rgb=np.median(patch.reshape(-1,3),axis=0).astype(np.uint8)
 surface=rect.copy();surface[cv2.dilate(exclusions,np.ones((5,5),np.uint8))>0]=rgb;surface[mask==0]=rgb
 # Original observed artwork stays on the board plane; backside is unknown, never mirrored.
 Image.fromarray(surface).save(work/'substrate-artwork.png')
 gltf={'asset':{'version':'2.0','generator':policy['version'],'extras':{'source':'photographs_and_documents','cadInputs':False}},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':[],'buffers':[{}],'bufferViews':[],'accessors':[],'images':[],'textures':[],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}]};binary=bytearray()
 def buffer(data,target=None):
  while len(binary)%4:binary.append(0)
  v={'buffer':0,'byteOffset':len(binary),'byteLength':len(data)}
  if target:v['target']=target
  gltf['bufferViews'].append(v);binary.extend(data);return len(gltf['bufferViews'])-1
 def accessor(array,typ):
  array=np.array(array,dtype='<f4');v=buffer(array.tobytes(),34962);item={'bufferView':v,'componentType':5126,'count':len(array),'type':typ}
  if typ=='VEC3':item.update(min=array.min(0).tolist(),max=array.max(0).tolist())
  gltf['accessors'].append(item);return len(gltf['accessors'])-1
 textureCache={}
 # Object artwork uses the entire original photo, so overhanging connectors are not cropped to PCB bounds.
 objectArtwork=im.copy();objectArtwork.thumbnail((policy['textureLongSide'],policy['textureLongSide']))
 def texture(image):
  f=io.BytesIO();image.save(f,format='PNG');data=f.getvalue();key=hashlib.sha256(data).hexdigest()
  if key in textureCache:return textureCache[key]
  gltf['images'].append({'bufferView':buffer(data),'mimeType':'image/png'});gltf['textures'].append({'source':len(gltf['images'])-1,'sampler':0});textureCache[key]=len(gltf['textures'])-1;return textureCache[key]
 def material(name,colour,finish=None,tex=None):
  p=visual['finishes'].get(finish,{});lin=[float((c/255/12.92) if c/255<=.04045 else ((c/255+.055)/1.055)**2.4) for c in colour];m={'name':finish or name,'pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1] if tex is not None else lin+[1],'metallicFactor':p.get('metalness',0),'roughnessFactor':p.get('roughness',.65)},'doubleSided':False}
  if tex is not None:m['pbrMetallicRoughness']['baseColorTexture']={'index':tex}
  if finish=='pcb_soldermask':m['pbrMetallicRoughness'].update(metallicFactor=0,roughnessFactor=shared['finishes']['soldermask_satin']['roughness'])
  gltf['materials'].append(m);return len(gltf['materials'])-1
 def mesh(name,triangles,mat,extra=None,uvs=None):
  pts=np.array(triangles,dtype=np.float32).reshape(-1,3);norm=np.cross(pts.reshape(-1,3,3)[:,1]-pts.reshape(-1,3,3)[:,0],pts.reshape(-1,3,3)[:,2]-pts.reshape(-1,3,3)[:,0]);norm/=np.maximum(np.linalg.norm(norm,axis=1,keepdims=True),1e-20);norm=np.repeat(norm,3,axis=0)
  attrs={'POSITION':accessor(pts,'VEC3'),'NORMAL':accessor(norm,'VEC3')}
  if uvs is not None:attrs['TEXCOORD_0']=accessor(uvs,'VEC2')
  mi=len(gltf['meshes']);gltf['meshes'].append({'name':name,'primitives':[{'attributes':attrs,'material':mat}]});ni=len(gltf['nodes']);gltf['nodes'].append({'name':name,'mesh':mi,'extras':extra or {}});gltf['scenes'][0]['nodes'].append(ni);return ni
 def xyz(p,y):return [(float(p[0])/scale-width/2)*.001,y*.001,(float(p[1])/scale-depth/2)*.001]
 presentation=json.loads((work/'presentation.json').read_text(encoding='utf-8')) if (work/'presentation.json').exists() else {}
 rules=json.loads(Path(__file__).with_name('reconstruction-presentation-policy.json').read_text())
 import re
 match=re.search(r'(\d+(?:\.\d+)?)\s*mm\s*[x×]\s*(\d+(?:\.\d+)?)\s*mm\s*[x×]\s*(\d+(?:\.\d+)?)\s*mm',b.get('dimensionsEvidence',{}).get('quote',''),re.I)
 assembly=float(match.group(3)) if match else None
 educational=None;thickness=b['thicknessMm'] or 0
 if not thickness and rules['allowApproximateSubstrate']:
  thickness=rules['approximateThicknessMm']
  if assembly:thickness=min(thickness,assembly*rules['maxThicknessFractionOfAssembly'])
  educational={'valueMm':thickness,'basis':rules['basis'],'policy':rules['version'],'assemblyMaxMm':assembly,'componentHeightsInferred':False}
 if assembly and thickness>assembly:raise ValueError('substrate_exceeds_documented_assembly')
 for item in obs['objects']:
  if assembly and item['heightMm'] and thickness+item['heightMm']>assembly:raise ValueError('component_exceeds_documented_assembly')
 # Triangulate observed outline and circular holes. Raster tests reject triangles across voids.
 bounds=np.concatenate([outline]+[np.array([c+[r*math.cos(t),r*math.sin(t)] for t in np.linspace(0,2*math.pi,40,endpoint=False)]) for c,r in holes]);bounds=np.clip(bounds,[.01,.01],[tw-.01,th-.01]);sub=cv2.Subdiv2D((0,0,tw,th))
 for p in bounds:
  try:sub.insert(tuple(map(float,p)))
  except cv2.error:pass
 triangles=[]
 for tri in sub.getTriangleList().reshape(-1,3,2):
  samples=np.concatenate([tri.mean(0)[None,:],(tri+np.roll(tri,1,axis=0))/2]);s=np.clip(np.round(samples).astype(int),[0,0],[tw-1,th-1]);
  if np.all(mask[s[:,1],s[:,0]]):triangles.append(tri)
 if not triangles:raise ValueError('no_valid_substrate_triangles')
 # x/z clockwise gives +Y normals when vertex order is reversed.
 top=[xyz(p,thickness) for t in triangles for p in t[::-1]];uv=[(float(p[0])/tw,float(p[1])/th) for t in triangles for p in t[::-1]]
 dimensionEvidence={'displayThicknessMm':thickness,'measuredThicknessMm':b['thicknessMm'],'status':'illustrative' if educational else b['thicknessEvidence']['basis'],'policy':rules['version'],'sourceEvidence':b['thicknessEvidence']}
 gltf['asset']['extras']['dimensionEvidence']=dimensionEvidence
 boardmat=material('observed_substrate',rgb,'pcb_soldermask',texture(Image.fromarray(surface)));mesh('Observed PCB surface',top,boardmat,{'finish':'pcb_soldermask','role':'substrate','thicknessStatus':dimensionEvidence['status'],'dimensionEvidence':dimensionEvidence},uv)
 back=presentation.get('backside');backtex=None
 if back:
  if back.get('observationsSHA256') and back['observationsSHA256']!=hashlib.sha256((work/'observations.json').read_bytes()).hexdigest():raise ValueError('backside_registration_stale')
  if hashlib.sha256((work.parent/back['file']).read_bytes()).hexdigest()!=back['sourceSHA256']:raise ValueError('backside_image_changed')
  backim=np.array(Image.open(work.parent/back['file']).convert('RGB'));BH=cv2.getPerspectiveTransform(np.array(back['cornersPixels'],np.float32),np.array([[0,0],[tw,0],[tw,th],[0,th]],np.float32));backim=cv2.warpPerspective(backim,BH,(tw,th));Image.fromarray(backim).save(work/'rectified-back.png');backtex=texture(Image.fromarray(backim))
 bottommat=material('observed_backside' if back else 'unknown_backside',rgb,'pcb_soldermask',backtex)
 mesh('Observed PCB underside' if back else 'Unobserved PCB underside',[xyz(p,0) for t in triangles for p in t],bottommat,{'finish':'pcb_soldermask','role':'observed_backside' if back else 'unknown_backside'},[(float(p[0])/tw,float(p[1])/th) for t in triangles for p in t] if back else None)
 if thickness:
  rings=[outline]+[np.array([c+[r*math.cos(t),r*math.sin(t)] for t in np.linspace(0,2*math.pi,40,endpoint=False)]) for c,r in holes]
  walls=[]
  for ri,ring in enumerate(rings):
   for p,q in zip(ring,np.roll(ring,-1,axis=0)):
    faces=[xyz(p,0),xyz(q,thickness),xyz(q,0),xyz(p,0),xyz(p,thickness),xyz(q,thickness)]
    if ri:faces=np.array(faces).reshape(-1,3,3)[:,::-1].reshape(-1,3).tolist()
    walls.extend(faces)
  mesh('PCB approximate thickness and holes' if educational else 'PCB observed thickness and holes',walls,material('substrate_edge',rgb,'pcb_soldermask'),{'finish':'pcb_soldermask','role':'substrate'})
 report={'schema':policy['version'],'referenceSHA256':source['sha256'],'board':b,'imageToTexture':H.tolist(),'textureSize':[tw,th],'sampledRGB':rgb.tolist(),'colourBasis':'uncalibrated photo sample, not composition','objects':[],'geometrySource':'generated_primitives_from_image_observations','cadFilesRead':[],'manualCoordinates':False,'backside':back or 'not_observed_no_artwork','educationalThickness':educational,'assemblyHeightConstraintMm':assembly,'silkscreen':'source photograph retained only outside component masks; not verified vector lettering','contacts':len(obs.get('contacts',[])),'holes':len(holes),'limitations':['Object envelopes do not reproduce hidden/internal package details.','Source images and model coordinates are not independent validation.','Side dimensions and estimated heights require physical measurement.','Backside details are photographic; no unsupported solder volumes were generated.']}
 overlay=Image.fromarray(rect.copy());draw=ImageDraw.Draw(overlay);draw.line([tuple(x) for x in outline]+[tuple(outline[0])],fill=(20,240,180),width=3)
 for o,poly in objects:
  # Refine a photo box only through observed boundaries? No silent fitting here:
  # preserve the returned polygon and report local edge support separately.
  contours=np.round(poly).astype(np.int32);m=np.zeros_like(mask);cv2.fillPoly(m,[contours],255);ys,xs=np.where(m>0)
  if len(xs)<4:report['objects'].append({'id':o['id'],'status':'rejected','reason':'empty_image_region'});continue
  colour=np.median(rect[ys,xs],axis=0);height=o['heightMm'];relief=height is None and rules.get('minimumComponentReliefMm',0)>0;displayHeight=height if height is not None else min(rules.get('minimumComponentReliefMm',0),max(0,(assembly-thickness) if assembly else 200));topY=thickness+(displayHeight or .005);pts=[xyz(p,topY) for p in poly];tris=[pts[0],pts[2],pts[1],pts[0],pts[3],pts[2]];texcoords=[tuple(np.array(o['polygon'][i])/1000) for i in [0,2,1,0,3,2]]
  finish=o['visualClass'];mat=material(o['id'],colour,finish,texture(objectArtwork));extra={'componentId':o['id'],'finish':finish,'heightStatus':o['heightEvidence']['basis'],'geometry':'educational_relief_unknown_height' if relief else 'approximate_envelope' if height else 'flat_observation_height_unknown','displayHeightMm':displayHeight,'measuredHeightMm':height}
  mesh(o['id']+' observed face',tris,mat,extra,texcoords)
  if displayHeight:
   sides=[]
   for p,q in zip(poly,np.roll(poly,-1,axis=0)):sides.extend([xyz(p,thickness),xyz(q,topY),xyz(q,thickness),xyz(p,thickness),xyz(p,topY),xyz(q,topY)])
   mesh(o['id']+' approximate sides',sides,material(o['id']+' sides',colour,finish),extra)
  edge=cv2.Canny(cv2.cvtColor(rect,cv2.COLOR_RGB2GRAY),60,140);boundary=np.zeros_like(mask);cv2.polylines(boundary,[contours],True,255,2);near=cv2.dilate(edge,np.ones((7,7),np.uint8));support=float(np.mean(near[boundary>0]>0)) if np.any(boundary) else 0
  sizes=np.array([np.linalg.norm(poly[1]-poly[0]),np.linalg.norm(poly[3]-poly[0])])/scale;report['objects'].append({'id':o['id'],'status':'educational_relief_unknown_height' if relief else 'volume_approximate' if height else 'surface_only_unknown_height','displayHeightMm':displayHeight,'displayHeightBasis':rules['reliefBasis'] if relief else 'source_height','sizeMm':[float(x) for x in sizes]+[height],'polygonTexturePx':poly.tolist(),'boundarySupportWithin3px':support,'independentValidation':False,'heightEvidence':o['heightEvidence']})
  draw.line([tuple(x) for x in poly]+[tuple(poly[0])],fill=(255,190,20),width=2);draw.text(tuple(poly[0]),o['id'],fill=(255,40,60))
 # Visible contacts remain at observed positions; raised dimensions/alloys are not inferred.
 for i,c in enumerate(obs.get('contacts',[])):
  poly=project(c['polygon']);mat=material('observed_contact',np.median(rect.reshape(-1,3),0),'tin_satin' if c['appearance']=='silver' else 'gold_contacts' if c['appearance']=='gold' else None,texture(objectArtwork));tris=[];uv=[]
  for j in range(1,len(poly)-1):
   for p in [poly[0],poly[j+1],poly[j]]:tris.append(xyz(p,thickness+.008));uv.append(tuple(cv2.perspectiveTransform(np.array(p,np.float32).reshape(1,1,2),inverse)[0,0]/[iw,ih]))
  mesh('Observed contact '+str(i),tris,mat,{'role':'observed_contact','finish':None},uv)
 overlay.save(work/'projection-overlay.png')
 # Overlay in original photo coordinates for evaluation, never used as detector input.
 srcOverlay=Image.fromarray(a);d=ImageDraw.Draw(srcOverlay)
 for o,_ in objects:
  pts=[tuple(x) for x in pixel(o['polygon'])];d.line(pts+[pts[0]],fill=(255,170,20),width=3);d.text(pts[0],o['id'],fill=(255,30,30))
 srcOverlay.save(work/'source-overlay.png')
 gltf['buffers'][0]['byteLength']=len(binary);js=json.dumps(gltf,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary+=b'\0'*((-len(binary))%4);data=struct.pack('<III',0x46546c67,2,12+8+len(js)+8+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary;output.write_bytes(data)
 report.update(modelSHA256=hashlib.sha256(data).hexdigest(),bytes=len(data),meshNodes=len(gltf['nodes']),totalMs=(time.perf_counter()-start)*1000,volumes=sum(o['status']=='volume_approximate' for o in report['objects']),flatObservations=sum(o['status']=='surface_only_unknown_height' for o in report['objects']),educationalReliefVolumes=sum(o['status']=='educational_relief_unknown_height' for o in report['objects']))
 (work/'geometry.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps({k:report[k] for k in ['bytes','meshNodes','volumes','flatObservations','totalMs']}))
if __name__=='__main__':main(Path(sys.argv[1]),Path(sys.argv[2]))
