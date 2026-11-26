"""Pose and pixel checks without access to the historical identities.
All geometry is in the native CAD world (mm); elevated anchors keep their z.
Camera intrinsics remain an explicit focal hypothesis, never a calibration claim.
"""
import sys,json,hashlib,time,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'.local/discovery-python'))
import numpy as np,cv2
from PIL import Image,ImageOps
cv2.setNumThreads(1);cv2.setRNGSeed(20261126)
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def write(p,v):Path(p).write_text(json.dumps(v,indent=2,allow_nan=False)+'\n',encoding='utf8')
def camera_for_focal(f,w,h):return np.array([[f,0,w/2],[0,f,h/2],[0,0,1]],np.float64)
def fit_pose(objects,pixels,roles,width,height,policy):
    diagonal=float(np.hypot(width,height));fit=[i for i,r in enumerate(roles) if r=='fit'];held=[i for i,r in enumerate(roles) if r=='holdout'];models=[]
    if len(fit)<policy['minimumFitObjects']:return {'status':'undetermined','reason':'insufficient_fit_objects','fitCount':len(fit),'holdoutCount':len(held)}
    a=np.asarray(objects,dtype=np.float64);b=np.asarray(pixels,dtype=np.float64)
    for multiplier in policy['focalDiagonalMultipliers']:
        k=camera_for_focal(diagonal*multiplier,width,height)
        ok,r,t,inliers=cv2.solvePnPRansac(a[fit],b[fit],k,None,iterationsCount=1000,reprojectionError=diagonal*policy['ransacPixelDiagonalRatio'],confidence=.999,flags=cv2.SOLVEPNP_EPNP)
        if not ok or inliers is None or len(inliers)<policy['minimumFitObjects']:continue
        chosen=[fit[int(i)] for i in inliers.flatten()]
        r,t=cv2.solvePnPRefineLM(a[chosen],b[chosen],k,None,r,t)
        projected=cv2.projectPoints(a,r,t,k,None)[0].reshape(-1,2);res=np.linalg.norm(projected-b,axis=1)
        rotation=cv2.Rodrigues(r)[0];depth=(a@rotation.T+t.reshape(1,3))[:,2]
        if np.any(depth<=0):continue
        hull=cv2.convexHull(b[chosen].astype(np.float32));coverage=float(cv2.contourArea(hull)/(width*height))
        models.append({'focalMultiplier':multiplier,'K':k.tolist(),'rvec':r.flatten().tolist(),'tvec':t.flatten().tolist(),'R':rotation.tolist(),'fitIndices':chosen,'discardedFitIndices':[i for i in fit if i not in chosen],'heldoutIndices':held,'residualsPx':res.tolist(),'projectedAnchors':projected.tolist(),'fitRmsPx':float(np.sqrt(np.mean(res[chosen]**2))),'coverageImageFraction':coverage})
    if not models:return {'status':'undetermined','reason':'no_supported_camera_model','fitCount':len(fit),'holdoutCount':len(held)}
    # No heldout residual participates in model selection.
    models.sort(key=lambda m:(-len(m['fitIndices']),m['fitRmsPx']));m=models[0]
    good=[i for i in held if m['residualsPx'][i]<=diagonal*policy['maximumHoldoutDiagonalRatio']]
    m.update(status='candidate_not_pixel_validated',intrinsics='focal_grid_hypothesis_not_calibrated',heldoutPassingIndices=good,
        heldoutCheck=len(good)>=policy['minimumHoldoutObjects'],coverageCheck=m['coverageImageFraction']>=policy['minimumSpatialCoverage'],alternatives=[{k:v for k,v in x.items() if k in ['focalMultiplier','fitRmsPx','coverageImageFraction']} for x in models[1:]])
    return m
if __name__=='__main__':
    start=time.perf_counter();inputs=Path(sys.argv[1]);call=read(sys.argv[2]);out=Path(sys.argv[3]);out.mkdir(parents=True,exist_ok=True)
    inventory=read(inputs/'candidates.json');render=read(inputs/'render.json');policy=inventory['policy'];raw=call['parsed'];image=inputs/call['target']
    photo=np.asarray(ImageOps.exif_transpose(Image.open(image)).convert('RGB'));h,w=photo.shape[:2]
    candidates={c['id']:c for c in inventory['candidates']};views={(v['side'],o['id']):o for v in render['views'] for o in v['objects']}
    selected=[p for p in raw.get('items',[]) if p['status']=='matched' and not p['alternatives'] and (p['view'],p['candidateId']) in views]
    proposals=[{'id':p['candidateId'],'box':p['photoBox'],'status':'proposed'} for p in selected]
    with tempfile.TemporaryDirectory(prefix='itc-cad-pixels-') as directory:
        req=Path(directory)/'request.json';write(req,{'image':str(image.resolve()),'proposals':proposals})
        pixels=json.loads(subprocess.check_output([sys.executable,str(ROOT/'experiments/board-library/verify-photo-proposals.py'),str(req)],cwd=ROOT,text=True,encoding='utf8',timeout=90))
    # Fit anchors only use proposals that pass the pre-existing independent pixel check.
    accepted={p['id'] for p in pixels['components'] if p['verification'].get('accepted')}
    matched=[p for p in selected if p['candidateId'] in accepted]
    points3=[views[(p['view'],p['candidateId'])]['anchorMm'] for p in matched]
    points2=[[p['photoAnchor'][0]*w/1000,p['photoAnchor'][1]*h/1000] for p in matched]
    roles=[candidates[p['candidateId']]['evaluationRole'] for p in matched]
    pose=fit_pose(points3,points2,roles,w,h,policy)
    result={'schema':'independent-cad-photo-check/1','imageSHA256':hashlib.sha256(image.read_bytes()).hexdigest(),'width':w,'height':h,'policy':policy,'historicalTableUsed':False,'pixelVerification':pixels,'correspondences':matched,'anchorIds':[p['candidateId'] for p in matched],'roles':roles,'pose':pose,'elapsedMs':(time.perf_counter()-start)*1000,'metricPCBRegistrationValidated':False}
    write(out/'verification.json',result);write(inputs/'pose.json',result)
    print(json.dumps({'proposed':len(raw.get('items',[])),'matched':len(selected),'pixelAccepted':len(accepted),'pose':{k:v for k,v in pose.items() if k in ['status','reason','fitRmsPx','heldoutCheck','coverageCheck','fitCount','holdoutCount','residualsPx']},'elapsedMs':result['elapsedMs']}))
