"""Independent checks against actual CAD triangles and source pad/text records.
No measurements here change the generated geometry, textures or registrations.
"""
import json,sys,math,importlib.util
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
spec=importlib.util.spec_from_file_location('reg',Path(__file__).with_name('register-ecad.py'));reg=importlib.util.module_from_spec(spec);spec.loader.exec_module(reg)
d=Path(sys.argv[1]);record=json.loads((d/'record.json').read_text(encoding='utf-8'));s=record['automaticSurfaces'];e=json.loads((d/'surfaces/ecad-geometry.json').read_text(encoding='utf-8'));n=next(n for n in reg.ec.read_glb(d/'model.glb') if n['index']==s['boardNode']);t=np.array(s['registration']['transform']);axis=s['registration']['normal'];p=(n['points']-t[:,2])@np.linalg.pinv(t[:,:2]).T;lo=np.min(e['outline'],axis=0);hi=np.max(e['outline'],axis=0);scale=120 # pixels per mm; finer than the display textures.
mask=Image.new('1',tuple(np.ceil((hi-lo)*scale).astype(int)));draw=ImageDraw.Draw(mask)
xy=lambda a:tuple((np.array(a)-lo)*scale)
for tri in n['triangles']:
 if max(abs(n['points'][tri,axis]-t[axis,2]))<.002:draw.polygon([xy(p[i]) for i in tri],fill=1)
pixels=np.array(mask);checks=[]
for pad in e['pads']:
 if pad['hole']<=0:continue
 center=np.array(xy(pad['center']));r=pad['hole']/2*scale;err=[]
 for a in np.linspace(0,2*math.pi,16,endpoint=False):
  direction=np.array([math.cos(a),math.sin(a)])
  for distance in np.arange(max(0,r*.4),r*1.6+1):
   point=np.round(center+distance*direction).astype(int)
   if min(point)<0 or point[0]>=pixels.shape[1] or point[1]>=pixels.shape[0]:break
   if pixels[point[1],point[0]]:err.append(abs(distance-r)/scale);break
 point=np.round(center).astype(int);empty=0<=point[0]<pixels.shape[1] and 0<=point[1]<pixels.shape[0] and not pixels[point[1],point[0]]
 checks.append(dict(component=pad['component'],pin=pad['pin'],centerMm=pad['center'],diameterMm=pad['hole'],centerIsActualCadHole=bool(empty),evaluatedDirections=len(err),maxBoundaryErrorMm=max(err,default=None)))
textRecords=[x for x in e['texts'] if x['text'].strip() and all(32<=ord(c)<=126 for c in x['text'].strip())]
result=dict(kind='independent_source_geometry_check_not_fit_input',drills=checks,allDrillCentresMatch=all(c['centerIsActualCadHole'] for c in checks),maximumBoundaryErrorMm=max((c['maxBoundaryErrorMm'] or 0) for c in checks),textLabels=len(textRecords),trueTypeLabels=sum(t['fontType']==1 for t in textRecords),strokeLabelsApproximate=sum(t['fontType']!=1 for t in textRecords),sourceTextSizesUsed=True,originalGLBSHA256=s['baseGLBSHA256'])
Path(sys.argv[2]).write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps({k:v for k,v in result.items() if k!='drills'}));assert result['allDrillCentresMatch'];assert result['maximumBoundaryErrorMm']<.06
