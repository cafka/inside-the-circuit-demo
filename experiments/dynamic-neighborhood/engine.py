"""Whole-map association with variable neighborhoods and full-resolution continuity.
No file reads, evaluation annotations, board identities or component-specific rules.
Tracked observations and geometric hypotheses never certify visual identity.
"""
from time import perf_counter
import math
import cv2
import numpy as np

def project(H,points):
    q=np.c_[np.asarray(points),np.ones(len(points))]@np.asarray(H).T
    return q[:,:2]/q[:,2:]
def extent(poly):return np.maximum(np.ptp(np.asarray(poly),axis=0),1.)
def center(poly):return np.asarray(poly).mean(0)
def area(poly):return abs(float(cv2.contourArea(np.asarray(poly,np.float32)))) if len(poly)>=3 else 0.

def observations(prediction,size):
    groups={};w,h=size
    for o in prediction['objects']:
        b=o.get('capture_box_normalized')
        if o.get('status')=='matched' and b is not None:groups.setdefault(tuple(b),[]).append(o['reference_id'])
    result=[]
    for i,(b,labels) in enumerate(groups.items()):
        x0,y0,x1,y1=b[1]*w/1000,b[0]*h/1000,b[3]*w/1000,b[2]*h/1000
        result.append({'regionId':'r'+str(i),'originalLabels':labels,'originalBox':list(b),'polygon':[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],
                       'reliability':1.,'status':'original_Gemini_observation','visualIdentityConfirmed':False})
    return result

def geometry(reference,profile,H):
    objects=reference['objects'];original=[np.array(o['region_polygon']) for o in objects]
    physical=[project(profile['reference']['assetToPlane'],q) for q in original]
    projected=[project(H,q) for q in original]
    pc=np.array([center(q) for q in physical]);ec=np.array([center(q) for q in projected]);ed=np.array([np.linalg.norm(extent(q)) for q in projected])
    neighbors=[sorted([j for j in range(len(objects)) if j!=i],key=lambda j:float(np.linalg.norm(pc[j]-pc[i]))) for i in range(len(objects))]
    return projected,ec,ed,neighbors

def terms(reference,profile,regions,H,p):
    projected,ec,ed,neighbors=geometry(reference,profile,H);oc=np.array([center(r['polygon']) for r in regions]);od=np.array([np.linalg.norm(extent(r['polygon'])) for r in regions]);n=len(ec);m=len(oc)
    unary=np.zeros((n,m));pair=np.zeros((n,n,m,m));information=np.zeros((n,n));rel_records={}
    for i in range(n):
        for a in range(m):
            unary[i,a]=np.linalg.norm(ec[i]-oc[a])/max((ed[i]+od[a])/2,1)+p['sizeWeight']*np.mean(np.abs(np.log(extent(projected[i])/extent(regions[a]['polygon']))))
            if regions[a]['reliability']<p['minimumNeighborReliability']:unary[i,a]=p['unknownCost']+1
    # Every neighbor is considered. Informativeness depends on geometric separation,
    # uncertainty scale and observed reliability, never on a fixed neighborhood size.
    for i in range(n):
        for j in neighbors[i]:
            if j<=i:continue
            de=ec[j]-ec[i];le=float(np.linalg.norm(de));info=min(1.,le/max(ed[i]+ed[j],1));information[i,j]=information[j,i]=info
            for a in range(m):
                for b in range(m):
                    if a==b:continue
                    reliability=min(regions[a]['reliability'],regions[b]['reliability'])
                    if info<p['minimumNeighborInformation'] or reliability<p['minimumNeighborReliability']:continue
                    do=oc[b]-oc[a];lo=float(np.linalg.norm(do));normal=max(le,(od[a]+od[b])/2,1)
                    vector=float(np.linalg.norm(do-de)/normal);separation=abs(math.log(max(lo,1)/max(le,1)))
                    order=1-float(np.dot(de,do)/max(le*lo,1));relative_size=abs(math.log(max(od[b]/od[a],1e-6)/max(ed[j]/ed[i],1e-6)))
                    cost=info*reliability*(vector+separation+order+p['sizeWeight']*relative_size)/3
                    pair[i,j,a,b]=pair[j,i,b,a]=cost
                    rel_records[i,j,a,b]={'vectorErrorNormalized':vector,'separationLogError':separation,'directionOrderCost':order,'relativeSizeLogError':relative_size,'information':info,'reliability':reliability,'cost':cost}
    return unary,pair,projected,neighbors,information,rel_records

def solve(unary,pair,p,forbidden=None):
    n,m=unary.shape;weight=p['relationWeight']/max(n-1,1)
    # Search ordering affects speed only. The result is exact unless budget exhausts.
    order=sorted(range(n),key=lambda i:float(np.min(unary[i])));best=[p['unknownCost']*n,[-1]*n];visited=0;exhausted=False
    def dfs(depth,used,assignment,score):
        nonlocal visited,exhausted
        visited+=1
        if visited>p['maximumSearchNodes']:exhausted=True;return
        if score>=best[0]:return
        if depth==n:best[:]=[score,assignment[:]];return
        available=[a for a in range(m) if not used&(1<<a)];remaining=order[depth:];costs={}
        bound=score
        for i in remaining:
            options=[(p['unknownCost'],-1)]
            for a in available:
                if forbidden==(i,a):continue
                value=float(unary[i,a])+weight*sum(pair[i,j,a,b] for j,b in enumerate(assignment) if b>=0)
                options.append((value,a))
            costs[i]=sorted(options);bound+=costs[i][0][0]
        if bound>=best[0]:return
        i=order[depth]
        for cost,a in costs[i]:
            assignment[i]=a;dfs(depth+1,used|(1<<a) if a>=0 else used,assignment,score+cost);assignment[i]=-1
    dfs(0,0,[-1]*n,0.)
    return {'cost':float(best[0]),'assignment':best[1],'nodes':visited,'exact':not exhausted}

def associate(reference,profile,regions,H,p,margins=True):
    t=perf_counter();unary,pair,polys,neighbors,information,records=terms(reference,profile,regions,H,p);best=solve(unary,pair,p);rows=[]
    for i,o in enumerate(reference['objects']):
        a=best['assignment'][i];included=[];excluded=[];steps=[]
        for j in neighbors[i]:
            b=best['assignment'][j];why=[]
            if b<0:why.append('neighbor_without_observation')
            elif regions[b]['reliability']<p['minimumNeighborReliability']:why.append('unreliable_observation')
            if information[i,j]<p['minimumNeighborInformation']:why.append('weak_geometric_separation')
            if a<0:why.append('target_without_observation')
            if why:excluded.append({'id':reference['objects'][j]['object_id'],'reasons':why});continue
            included.append(reference['objects'][j]['object_id']);key=(i,j,a,b) if i<j else (j,i,b,a)
            steps.append({'neighbor':reference['objects'][j]['object_id'],'region':regions[b]['regionId'],'neighborhoodSize':len(included),'evidence':records.get(key,{})})
        alt=solve(unary,pair,p,forbidden=(i,a)) if margins and a>=0 else None
        margin=alt['cost']-best['cost'] if alt else None
        rows.append({'id':o['object_id'],'region':regions[a]['regionId'] if a>=0 else None,'observationIndex':a,'originalLabels':regions[a]['originalLabels'] if a>=0 else [],
                     'projectedPolygon':polys[i].tolist(),'neighborhood':included,'neighborCount':len(included),'neighborSteps':steps,'excludedNeighbors':excluded,
                     'globalAlternativeMargin':margin,'alternativeSearchExact':alt['exact'] if alt else None,
                     'status':'structurally_preferred_not_visually_confirmed' if a>=0 and margin is not None and margin>=p['associationMargin'] and best['exact'] and alt['exact'] else 'ambiguous',
                     'visualIdentityConfirmed':False})
    return {'objects':rows,'solver':best,'fullBoardReference':True,'fixedNeighborCount':None,'metricPlaneValidated':False,'timingMs':(perf_counter()-t)*1000}

def choose_initial(reference,profile,regions,seeds,p):
    t=perf_counter();rank=[]
    for seed in seeds:
        unary,pair,*_=terms(reference,profile,regions,seed['matrix'],p);s=solve(unary,pair,p)
        rank.append(dict(seed,score=s['cost'],assignment=s['assignment'],searchExact=s['exact'],nodes=s['nodes']))
    rank.sort(key=lambda r:r['score']);return {'selected':rank[0],'alternatives':rank,'selectionMs':(perf_counter()-t)*1000,'scope':'approximate_whole_board_hypothesis_not_validation'}

def dense_motion(previous,current,p):
    t=perf_counter();assert previous.shape==current.shape;assert p['flowLevels']==1
    a=cv2.cvtColor(previous,cv2.COLOR_RGB2GRAY);b=cv2.cvtColor(current,cv2.COLOR_RGB2GRAY)
    args=dict(pyr_scale=.5,levels=1,winsize=p['flowWindow'],iterations=p['flowIterations'],poly_n=p['flowPolynomialSize'],poly_sigma=p['flowPolynomialSigma'],flags=0)
    forward=cv2.calcOpticalFlowFarneback(a,b,None,**args);backward=cv2.calcOpticalFlowFarneback(b,a,None,**args)
    return forward,backward,(perf_counter()-t)*1000

def sample_flow(points,forward,backward,p):
    a=np.asarray(points,np.float32);h,w=forward.shape[:2]
    def sample(flow,xy):return cv2.remap(flow,xy[:,0].reshape(-1,1),xy[:,1].reshape(-1,1),cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT).reshape(-1,2)
    b=a+sample(forward,a);back=sample(backward,b);error=np.linalg.norm(b+back-a,axis=1)
    good=(a[:,0]>=0)&(a[:,0]<w-1)&(a[:,1]>=0)&(a[:,1]<h-1)&(b[:,0]>=0)&(b[:,0]<w-1)&(b[:,1]>=0)&(b[:,1]<h-1)&(error<=p['forwardBackwardPx'])
    return a,b,good,error

def polygon_samples(shape,polygons,p):
    mask=np.zeros(shape[:2],np.uint8)
    for poly in polygons:cv2.fillPoly(mask,[np.rint(poly).astype(np.int32)],1)
    y,x=np.mgrid[0:shape[0]:p['samplingStepPx'],0:shape[1]:p['samplingStepPx']];good=mask[y,x]>0
    return np.c_[x[good],y[good]].astype(np.float32)

def motion_fit(points,forward,backward,p):
    t=perf_counter()
    if len(points)<p['minimumFlowSamples']:return {'matrix':None,'reason':'insufficient_samples','sampleCount':len(points),'timeMs':(perf_counter()-t)*1000}
    a,b,good,fb=sample_flow(points,forward,backward,p);ids=np.flatnonzero(good);train=ids[ids%4!=0];held=ids[ids%4==0]
    result={'sampleCount':len(a),'forwardBackwardPassed':int(good.sum()),'forwardBackwardMedianPx':float(np.median(fb)),'sourcePoints':a.tolist(),'trackedPoints':b.tolist(),'validMask':good.tolist()}
    if len(train)<p['minimumFlowSamples'] or good.mean()<p['minimumFlowFraction']:return dict(result,matrix=None,reason='flow_consistency_failed',timeMs=(perf_counter()-t)*1000)
    cv2.setRNGSeed(p['seed']);M,inliers=cv2.estimateAffinePartial2D(a[train],b[train],method=cv2.RANSAC,ransacReprojThreshold=p['temporalRansacPx'])
    if M is None:return dict(result,matrix=None,reason='motion_fit_failed',timeMs=(perf_counter()-t)*1000)
    H=np.vstack([M,[0,0,1]]);errors=np.linalg.norm(project(H,a[train])-b[train],axis=1);held_err=np.linalg.norm(project(H,a[held])-b[held],axis=1)
    ratio=float(inliers.mean());hold_median=float(np.median(held_err)) if len(held) else None
    result.update(matrix=H.tolist(),inliers=int(inliers.sum()),trainingRmsPx=float(np.sqrt(np.mean(errors[inliers.ravel()>0]**2))),reservedPoints=len(held),reservedMedianPx=hold_median,
                  fraction=ratio*float(good.mean()),reason=None,timeMs=(perf_counter()-t)*1000)
    if ratio<p['minimumFlowFraction'] or hold_median is None or hold_median>p['temporalRansacPx']:result.update(matrix=None,reason='motion_not_supported')
    return result

def advance(reference,profile,regions,H,previous,current,p):
    t=perf_counter();f,b,flow_ms=dense_motion(previous,current,p)
    # Whole-board plane evidence, independent of the elevated component observations.
    source_shape=profile['reference']['dimensions'][::-1];source=np.zeros(source_shape,np.uint8)
    for poly in profile['reference']['planeMask']['includeAsset']:cv2.fillPoly(source,[np.rint(poly).astype(np.int32)],1)
    for item in profile['reference']['planeMask']['excludeAsset']:cv2.fillPoly(source,[np.rint(item['polygonAsset']).astype(np.int32)],0)
    projected_mask=cv2.warpPerspective(source,np.asarray(H),current.shape[1::-1],flags=cv2.INTER_NEAREST)
    y,x=np.mgrid[0:current.shape[0]:p['samplingStepPx'],0:current.shape[1]:p['samplingStepPx']];ok=projected_mask[y,x]>0;points=np.c_[x[ok],y[ok]]
    board=motion_fit(points,f,b,p);newH=np.asarray(board['matrix'])@H if board['matrix'] is not None else np.asarray(H);updated=[];traces=[]
    for r in regions:
        if r['status']=='tracking_lost_last_position_only':
            updated.append(dict(r));traces.append({'regionId':r['regionId'],'motion':{'matrix':None,'reason':'no_redetection_after_loss'}});continue
        sample=polygon_samples(previous.shape,[r['polygon']],p);motion=motion_fit(sample,f,b,p);q=dict(r)
        if motion['matrix'] is not None:
            q.update(polygon=project(motion['matrix'],r['polygon']).tolist(),reliability=motion['fraction'],status='temporally_tracked_not_redetected')
        else:q.update(reliability=0.,status='tracking_lost_last_position_only')
        updated.append(q);traces.append({'regionId':r['regionId'],'motion':motion})
    return newH,updated,{'boardMotion':board,'regionMotion':traces,'flowMs':flow_ms,'totalMs':(perf_counter()-t)*1000,'fullResolution':list(current.shape[1::-1]),'pyramidLevels':1,'progressiveWindows':False,'planeStillUnvalidated':True}
