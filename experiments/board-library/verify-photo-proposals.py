"""Reuse the unchanged visible-region verifier; never load CAD coordinates or an oracle."""
import sys,json,time,importlib.util,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'.local/discovery-python'))
import cv2
import numpy as np
from PIL import Image,ImageOps
cv2.setNumThreads(1)
spec=importlib.util.spec_from_file_location('parallax_visible_region',ROOT/'src/component-parallax/engine.py')
engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)
policy=json.loads((ROOT/'experiments/component-parallax/policy.json').read_text())
adapter=json.loads((ROOT/'experiments/board-library/photo-verification-policy.json').read_text())
start=time.perf_counter();request=json.loads(Path(sys.argv[1]).read_text());image=Path(request['image']);rgb=np.asarray(ImageOps.exif_transpose(Image.open(image)).convert('RGB'));h,w=rgb.shape[:2]
if w*h>16_000_000:raise ValueError('image_pixel_limit')
# Match the historical verifier's 640-pixel analysis budget, not the displayed
# capture or the image sent to Gemini. Record the reversible coordinate mapping.
analysis_scale=min(1.,adapter['maximumAnalysisLongSide']/max(w,h));aw,ah=max(1,round(w*analysis_scale)),max(1,round(h*analysis_scale))
analysis=cv2.resize(rgb,(aw,ah),interpolation=cv2.INTER_AREA) if analysis_scale<1 else rgb
sx,sy=aw/w,ah/h
rows=[]
for p in request['proposals']:
 y0,x0,y1,x1=p['box'];quad=np.array([[x0*w/1000,y0*h/1000],[x1*w/1000,y0*h/1000],[x1*w/1000,y1*h/1000],[x0*w/1000,y1*h/1000]])
 if p['status']!='proposed':region={'accepted':False,'reasons':['semantic_proposal_ambiguous']}
 else:
  region=engine.visible_region(analysis,quad*np.array([sx,sy]),policy)
  if region.get('contour'):region['contour']=(np.asarray(region['contour'])/np.array([sx,sy])).tolist()
 if region.get('accepted'):
  polygon=cv2.approxPolyDP(np.float32(region['contour']),1.0,True).reshape(-1,2)
  lo=polygon.min(0);hi=polygon.max(0)
  region['displayPolygon']=polygon.tolist();region['displayBox']=[float(lo[1]),float(lo[0]),float(hi[1]),float(hi[0])]
 rows.append({'id':p['id'],'proposalBox':p['box'],'verification':region})
# Competing proposals may seed the same physical silhouette. Do not pick an identity by order.
for i,a in enumerate(rows):
 for b in rows[i+1:]:
  va,vb=a['verification'],b['verification']
  if not (va.get('displayPolygon') and vb.get('displayPolygon')):continue
  ma=engine.polygon_mask((h,w),va['displayPolygon']);mb=engine.polygon_mask((h,w),vb['displayPolygon']);iou=float(np.logical_and(ma,mb).sum()/max(1,np.logical_or(ma,mb).sum()))
  if iou>=adapter['maximumOverlappingMaskIoU']:
   for v in [va,vb]:v['accepted']=False;v['reasons'].append('overlapping_component_proposals')
print(json.dumps({'schema':'photo-proposal-verification/1','inputSHA256':hashlib.sha256(image.read_bytes()).hexdigest(),'width':w,'height':h,'analysis':{'width':aw,'height':ah,'scaleX':sx,'scaleY':sy,'edgeToleranceInOriginalPixels':[policy['segmentation']['edgeTolerancePixels']/sx,policy['segmentation']['edgeTolerancePixels']/sy],'basis':'historical component-parallax prepared long side 640; original capture and Gemini input unchanged'},'algorithm':'src/component-parallax/engine.py:visible_region','policy':policy['version'],'semanticIdentityVerified':False,'cadCoordinatesUsed':False,'components':rows,'totalMs':(time.perf_counter()-start)*1000},allow_nan=False))
