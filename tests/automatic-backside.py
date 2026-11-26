"""Synthetic registration controls: two layouts, rotations, missing/false features.
Not a Gemini inference and not evidence of recognition of a physical board.
"""
import sys,json,tempfile,subprocess,hashlib,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'.local/discovery-python'))
import numpy as np
import cv2
from PIL import Image

def run(work,rotation,expected):
 source=json.loads((work/'input-manifest.json').read_text())['sources'][0]
 choice={'schema':'backside-choice/1','mode':'gemini_proposal','sourceId':source['id'],'sourceSHA256':source['decodedSHA256'],'sourceURL':source['url'],'clockwiseRotationDeg':rotation,'note':'INJECTED SYNTHETIC TEST, not a model output'}
 (work/'choice.json').write_text(json.dumps(choice))
 start=time.perf_counter();p=subprocess.run([sys.executable,str(ROOT/'experiments/board-library/prepare-reconstruction-back.py'),str(work),source['id'],'--review',str(work/'choice.json')],capture_output=True,text=True)
 assert (p.returncode==0)==expected,(rotation,p.stderr)
 return {'rotation':rotation,'accepted':p.returncode==0,'ms':(time.perf_counter()-start)*1000,'reason':p.stderr.strip().splitlines()[-1] if p.returncode else None}

results=[]
with tempfile.TemporaryDirectory() as tmp:
 for n,(width,depth,points) in enumerate([(70,40,[(8,6),(59,9),(49,32),(17,27)]),(33,72,[(6,11),(25,18),(17,60),(9,44)])]):
  d=Path(tmp)/str(n);work=d/'reconstruction';work.mkdir(parents=True)
  W,H=round(width*10)+100,round(depth*10)+100
  a=np.full((H,W,3),255,np.uint8);cv2.rectangle(a,(50,50),(W-50,H-50),(35,85,90),-1)
  for x,y in points:cv2.circle(a,(round(W-50-x*10),round(50+y*10)),9,(255,255,255),-1)
  corners=[[50/W*1000,50/H*1000],[(W-50)/W*1000,50/H*1000],[(W-50)/W*1000,(H-50)/H*1000],[50/W*1000,(H-50)/H*1000]]
  obs={'referenceImageId':'front','board':{'widthMm':width,'depthMm':depth,'corners':corners,'holes':[{'center':[(50+x*10)/W*1000,(50+y*10)/H*1000]} for x,y in points]}}
  (work/'observations.json').write_text(json.dumps(obs))
  def save(image):
   Image.fromarray(image).save(work/'rear.png');sha=hashlib.sha256((work/'rear.png').read_bytes()).hexdigest()
   (work/'input-manifest.json').write_text(json.dumps({'sources':[{'id':'rear','file':'reconstruction/rear.png','decodedSHA256':sha,'url':'https://synthetic.example/rear.png'}]}))
  for rotation in [0,90,180,270]:
   save(np.rot90(a,rotation//90).copy());r=run(work,rotation,True);back=json.loads((work/'presentation.json').read_text())['backside'];assert max(back['independentHoleErrorsMm'])<.01
   assert 'manualReview' not in back
   # Reproject original pixels to the rotated image. The same four corners must return.
   rh,rw=np.rot90(a,rotation//90).shape[:2]
   mapped=[]
   for x,y in back['cornersPixels']:
    mapped.append({0:[x,y],90:[rh-1-y,x],180:[rw-1-x,rh-1-y],270:[y,rw-1-x]}[rotation])
   assert mapped==[[W-50,50],[50,50],[50,H-50],[W-50,H-50]],mapped
   r.update(layout=n,holeErrorsMm=back['independentHoleErrorsMm']);results.append(r)
  save(a);results.append({'layout':n,'control':'wrong_orientation',**run(work,180,False)})
  bad=a.copy();cv2.circle(bad,(round(W-50-points[0][0]*10),round(50+points[0][1]*10)),10,(35,85,90),-1);save(bad)
  results.append({'layout':n,'control':'missing_hole',**run(work,0,False)})
  obs['board']['holes']=obs['board']['holes'][:2];(work/'observations.json').write_text(json.dumps(obs));save(a)
  results.append({'layout':n,'control':'insufficient_features',**run(work,0,False)})
report={'kind':'synthetic_geometric_controls_not_AI_inference','layouts':2,'acceptedRotations':8,'rejectedControls':6,'results':results}
if len(sys.argv)>1:Path(sys.argv[1]).write_text(json.dumps(report,indent=2))
print(json.dumps(report))
