"""Register a proposed/reviewed official underside photo, without board-specific coordinates.
Input is an asset/face classification, not an annotated component map. Abort on weak evidence.
Only suitable for clean, near-orthographic product photos with a uniform background.
"""
import sys,json,hashlib,argparse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'.local/discovery-python'))
import cv2
import numpy as np
from PIL import Image
parser=argparse.ArgumentParser();parser.add_argument('work');parser.add_argument('source_id');parser.add_argument('--review',required=True);args=parser.parse_args()
work=Path(args.work);source_id=args.source_id;review=json.loads(Path(args.review).read_text(encoding='utf-8'))
mode=review.get('mode');rotation=review.get('clockwiseRotationDeg',0)
if mode=='manual_selection':
 if review.get('orientation')!='upright_back_view' or not review.get('reviewedBy') or not review.get('note'):raise ValueError('manual_face_orientation_review_required')
elif review.get('schema')!='backside-choice/1' or mode not in ['verified_source_caption','gemini_proposal'] or not review.get('note'):raise ValueError('backside_choice_provenance_required')
if rotation not in [0,90,180,270]:raise ValueError('unsupported_backside_rotation')
o=json.loads((work/'observations.json').read_text(encoding='utf-8'));m=json.loads((work/'input-manifest.json').read_text(encoding='utf-8'));p=json.loads(Path(__file__).with_name('reconstruction-presentation-policy.json').read_text())
src=next(s for s in m['sources'] if s['id']==source_id);file=work.parent/src['file'];a=np.array(Image.open(file).convert('RGB'));h,w=a.shape[:2]
if review.get('sourceId')!=source_id or review.get('sourceSHA256')!=src['decodedSHA256'] or review.get('sourceURL')!=src['url']:raise ValueError('back_review_source_mismatch')
if hashlib.sha256(file.read_bytes()).hexdigest()!=src['decodedSHA256']:raise ValueError('back_source_hash_mismatch')
original_h,original_w=h,w
a=np.rot90(a,-rotation//90).copy();h,w=a.shape[:2]
bg=np.median(np.concatenate([a[:15,:15].reshape(-1,3),a[:15,-15:].reshape(-1,3),a[-15:,:15].reshape(-1,3),a[-15:,-15:].reshape(-1,3)]),axis=0)
mask=(np.linalg.norm(a.astype(float)-bg,axis=2)>p['backgroundDistance']).astype(np.uint8)
n,l,stats,_=cv2.connectedComponentsWithStats(mask)
if n<2:raise ValueError('back_foreground_not_found')
idx=1+np.argmax(stats[1:,cv2.CC_STAT_AREA]);main=(l==idx)
cols=np.where(main.sum(0)>main.sum(0).max()*p['foregroundOccupancy'])[0];rows=np.where(main.sum(1)>main.sum(1).max()*p['foregroundOccupancy'])[0]
x0,x1=int(cols.min()),int(cols.max());y0,y1=int(rows.min()),int(rows.max());width,depth=o['board']['widthMm'],o['board']['depthMm'];aspect=(x1-x0)/(y1-y0)
if abs(aspect/(width/depth)-1)>p['maxBackAspectError']:raise ValueError('back_aspect_not_supported')
# Backside viewed from below: horizontal image reversal in the shared physical x/z frame.
corners=[[x1,y0],[x0,y0],[x0,y1],[x1,y1]];dest=np.array([[0,0],[width,0],[width,depth],[0,depth]],np.float32)
H=cv2.getPerspectiveTransform(np.array(corners,np.float32),dest)
light=(np.linalg.norm(a.astype(float)-bg,axis=2)<50).astype(np.uint8);n,l,stats,centres=cv2.connectedComponentsWithStats(light)
candidates=[]
for i in range(1,n):
 x,y,bw,bh,area=stats[i];cx,cy=centres[i]
 if not(x0<cx<x1 and y0<cy<y1) or not(.65<bw/max(1,bh)<1.5) or not(.0004*w*h<area<.01*w*h):continue
 if area/(bw*bh)<.55:continue
 candidates.append([float(cx),float(cy)])
front=np.array(o['board']['corners'],np.float32);F=cv2.getPerspectiveTransform(front,dest);errors=[];used=set()
for hole in o['board'].get('holes',[]):
 target=cv2.perspectiveTransform(np.array(hole['center'],np.float32).reshape(1,1,2),F)[0,0]
 available=[(i,cv2.perspectiveTransform(np.array(c,np.float32).reshape(1,1,2),H)[0,0]) for i,c in enumerate(candidates) if i not in used]
 if not available:raise ValueError('back_reference_holes_missing')
 i,point=min(available,key=lambda v:np.linalg.norm(v[1]-target));error=float(np.linalg.norm(point-target));used.add(i);errors.append(error)
 if error>p['maxHoleRegistrationErrorMm']:raise ValueError('back_hole_registration_rejected')
if len(errors)<3:raise ValueError('insufficient_independent_back_features')
def original_pixel(point):
 x,y=point
 return {0:[x,y],90:[y,original_h-1-x],180:[original_w-1-x,original_h-1-y],270:[original_w-1-y,x]}[rotation]
basis={'manual_selection':'Manual source/face/orientation review','verified_source_caption':'Explicit manufacturer image caption; unique orientation passing geometric controls','gemini_proposal':'Gemini visual source/face/orientation proposal; not a human review'}[mode]
result={'policy':p['version'],'backside':{'sourceId':source_id,'sourceSHA256':src['decodedSHA256'],'file':src['file'],'cornersPixels':[original_pixel(c) for c in corners],'identityAndFaceBasis':basis,'selectionOrigin':mode,'selection':review,**({'manualReview':review} if mode=='manual_selection' else {}),'reviewSHA256':hashlib.sha256(Path(args.review).read_bytes()).hexdigest(),'observationsSHA256':hashlib.sha256((work/'observations.json').read_bytes()).hexdigest(),'orientation':'back_view_horizontal_reversal','clockwiseRotationDeg':rotation,'aspectError':abs(aspect/(width/depth)-1),'independentHoleErrorsMm':errors,'validation':'outline fit checked against observed hole centres; approximate registration; face and orientation evidence recorded separately','details':'Photographic silkscreen and visible rear contacts, no invented solder volumes'}}
(work/'presentation.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
