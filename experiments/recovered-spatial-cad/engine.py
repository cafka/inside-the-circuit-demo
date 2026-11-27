"""Adapter of the existing geometry and variable-neighborhood engines.
No catalogue, board names, image-color comparisons, cloud or file inputs here.
Only approximate structural registration is possible with uncalibrated elevated anchors.
"""
import importlib.util, time, math
from pathlib import Path
import cv2
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
def module(name,path):
    s=importlib.util.spec_from_file_location(name,ROOT/path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
neighbors=module('existing_neighbors','experiments/dynamic-neighborhood/engine.py')
models=module('existing_model_estimation','src/visual-anchors/engine.py')
project=neighbors.project

def edges_for(rgb,p):
    gray=cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY)
    edges=cv2.Canny(cv2.GaussianBlur(gray,(0,0),1),p['cannyLow'],p['cannyHigh'])
    return cv2.distanceTransform((edges==0).astype(np.uint8),cv2.DIST_L2,3)

def edge_support(distance,poly,tolerance):
    h,w=distance.shape;sides=[]
    for a,b in zip(poly,np.roll(poly,-1,axis=0)):
        points=a+np.linspace(.02,.98,max(8,math.ceil(np.linalg.norm(b-a))))[:,None]*(b-a)
        xy=np.rint(points).astype(int);ok=(xy[:,0]>=0)&(xy[:,0]<w)&(xy[:,1]>=0)&(xy[:,1]<h)
        good=np.zeros(len(xy),bool);good[ok]=distance[xy[ok,1],xy[ok,0]]<=tolerance;sides.append(float(good.mean()))
    return {'support':float(np.mean(sides)),'sideSupport':sides}

def contour_check(distance,poly,p):
    # Same edge tolerance / long-side scaling as the previous pixel stage.
    tolerance=p['edgeTolerancePixels']*max(1,max(distance.shape)/640)
    own=edge_support(distance,poly,tolerance)
    # Competing positions, not alternative colors or fabricated detections.
    shift=max(3*tolerance,np.linalg.norm(np.ptp(poly,axis=0))*.02)
    competitors=[edge_support(distance,poly+np.array(d)*shift,tolerance)['support'] for d in [(1,0),(-1,0),(0,1),(0,-1)]]
    margin=own['support']-max(competitors);reasons=[]
    if own['support']<p['minimumEdgeSupport']:reasons.append('insufficient_projected_boundary')
    if min(own['sideSupport'])<p['minimumQuadrantSupport']:reasons.append('missing_or_occluded_side')
    if margin<.1:reasons.append('competing_boundary_position')
    return dict(own,tolerancePixels=tolerance,competitorSupport=competitors,margin=margin,accepted=not reasons,reasons=reasons)

def run(inventory,render,items,rgb,geometry_policy,neighbor_policy,edge_policy,priority_weights):
    start=time.perf_counter();h,w=rgb.shape[:2];diag=np.hypot(w,h);u,v=inventory['axes']['u'],inventory['axes']['v']
    lo,hi=np.array(inventory['support']['boundsMm']);outline=np.array([[lo[u],lo[v]],[hi[u],lo[v]],[hi[u],hi[v]],[lo[u],hi[v]]])
    physical_diag=np.linalg.norm(np.ptp(outline,axis=0));lookup={c['id']:c for c in inventory['candidates']}
    views={(view['side'],o['id']):o for view in render['views'] for o in view['objects']}
    distance=edges_for(rgb,edge_policy);edge_ms=(time.perf_counter()-start)*1000
    observations=[];anchors=[];rejected=[];seen=set()
    for item in items:
        ident=item['candidateId'];b=item.get('photoBox');view=views.get((item.get('view'),ident));c=lookup.get(ident)
        if not b or not c or not view or item.get('status')!='matched':rejected.append({'id':ident,'reason':'no_usable_observation'});continue
        if tuple(b) in seen:rejected.append({'id':ident,'reason':'duplicate_observed_box'});continue
        seen.add(tuple(b));y0,x0,y1,x1=b;q=np.array([[x0*w/1000,y0*h/1000],[x1*w/1000,y0*h/1000],[x1*w/1000,y1*h/1000],[x0*w/1000,y1*h/1000]])
        observations.append({'regionId':ident,'originalLabels':[ident],'polygon':q.tolist(),'reliability':1.,'status':'saved_Gemini_proposal_not_new_detection'})
        if item.get('alternatives'):rejected.append({'id':ident,'reason':'ambiguous_identity_not_an_anchor'});continue
        anchor=np.array(view['anchorMm']);dims=np.ptp(np.array(c['boundsMm']),axis=0);shape=sorted([dims[u],dims[v]])
        other=[]
        for candidate in inventory['candidates']:
            if candidate['id']==ident:continue
            d=np.ptp(candidate['boundsMm'],axis=0);other.append(abs(math.log(max(d[u],d[v])/max(min(d[u],d[v]),1e-6)/(shape[1]/max(shape[0],1e-6)))))
        anchors.append({'id':ident,'reference':anchor[[u,v]].tolist(),'xy':(np.array(item['photoAnchor'])*[w/1000,h/1000]).tolist(),'areaMm2':float(dims[u]*dims[v]),'uniqueness':min(1,min(other) if other else 1),'quality':edge_support(distance,q,edge_policy['edgeTolerancePixels']*max(1,max(h,w)/640))['support'],'heightMm':float(anchor[inventory['axes']['n']]),'metricPlaneCorrespondence':False})
    ordered=[];pool=anchors.copy()
    while pool:
        for a in pool:
            a['priorityFactors']={'size':math.sqrt(a['areaMm2']/max(x['areaMm2'] for x in anchors)),'uniqueness':a['uniqueness'],'quality':a['quality'],'reference':1.}
            spread=min([np.linalg.norm(np.array(a['reference'])-o['reference'])/physical_diag for o in ordered] or [1.])
            a['priority']=sum(priority_weights[k]*x for k,x in a['priorityFactors'].items())*spread
        best=max(pool,key=lambda x:x['priority']);pool.remove(best);ordered.append(best)
    geometry_start=time.perf_counter();attempts=[];selected=None
    for contract in geometry_policy['models']:
        minimum,reserve_min=contract['fitMinimum'],contract['reserveMinimum'];fit_count=max(minimum,len(ordered)-max(reserve_min,math.ceil(len(ordered)/3)))
        if len(ordered)<fit_count+reserve_min:
            attempts.append({'model':contract['name'],'reason':'insufficient_distinct_fit_and_reserved_objects','requiredFit':minimum,'requiredReserved':reserve_min});continue
        fit,held=ordered[:fit_count],ordered[fit_count:];src=np.array([a['reference'] for a in fit]);dst=np.array([a['xy'] for a in fit])
        span=np.max(np.linalg.norm(src[:,None]-src[None,:],axis=2))/physical_diag
        if span<geometry_policy['association']['minimumSpanFraction']:attempts.append({'model':contract['name'],'reason':'insufficient_spatial_span'});continue
        H,mask=models.estimate_model(contract['name'],src,dst,geometry_policy,diag)
        if H is None:attempts.append({'model':contract['name'],'reason':'degenerate_geometry'});continue
        err=np.linalg.norm(project(H,src)-dst,axis=1);poly=project(H,outline);reasons=[]
        if np.mean(err<=geometry_policy['geometry']['fitErrorDiagonalFraction']*diag)<geometry_policy['geometry']['minimumFitInlierFraction']:reasons.append('inconsistent_fit')
        denominators=np.c_[outline,np.ones(4)]@H[2]
        if denominators.min()*denominators.max()<=0 or not cv2.isContourConvex(poly.astype(np.float32)) or not .01*w*h<abs(cv2.contourArea(poly.astype(np.float32)))<4*w*h:reasons.append('invalid_projected_geometry')
        attempts.append({'model':contract['name'],'fitIds':[a['id'] for a in fit],'fitResidualsPx':err.tolist(),'fitRejections':reasons})
        if reasons:continue
        # First simplest model with fitting support; holdouts cannot select the model.
        he=np.linalg.norm(project(H,[a['reference'] for a in held])-np.array([a['xy'] for a in held]),axis=1)
        hp=geometry_policy['geometry'];hold_ok=np.median(he)<=hp['reserveErrorDiagonalFraction']*diag and np.max(he)<=hp['maximumReserveErrorDiagonalFraction']*diag
        selected={'model':contract['name'],'matrix':H.tolist(),'fitIds':[a['id'] for a in fit],'reserveIds':[a['id'] for a in held],'fitResidualsPx':err.tolist(),'reserveResidualsPx':he.tolist(),'reservedPassed':bool(hold_ok),'referenceSpanFraction':float(span),'outline':poly.tolist(),'orientationDegrees':math.degrees(math.atan2(H[1,0],H[0,0])),'status':'structural_candidate_not_metric' if hold_ok else 'rejected_reserved_objects','metricPCBValidated':False};break
    geometry_ms=(time.perf_counter()-geometry_start)*1000;assoc=None;contours=[]
    if selected:
        observed_views={item.get('view') for item in items if item.get('photoBox')}
        reference={'objects':[]};visible_ids={o['id'] for vi in render['views'] if vi['side'] in observed_views for o in vi['objects']}
        for c in inventory['candidates']:
            if c['id'] not in visible_ids:continue
            a,b=np.array(c['boundsMm']);reference['objects'].append({'object_id':c['id'],'region_polygon':[[a[u],a[v]],[b[u],a[v]],[b[u],b[v]],[a[u],b[v]]]})
        profile={'reference':{'assetToPlane':np.eye(3).tolist()}}
        assoc=neighbors.associate(reference,profile,observations,np.array(selected['matrix']),neighbor_policy)
        for row in assoc['objects']:
            if row['region'] is None:continue
            check=contour_check(distance,np.array(row['projectedPolygon']),edge_policy)
            check.update(id=row['id'],observedRegion=row['region'],globalMargin=row['globalAlternativeMargin'],associationStatus=row['status'],visualIdentityConfirmed=False)
            # Structural and contour support cannot certify semantic identity or metric PCB.
            check['structurallySupported']=bool(selected['reservedPassed'] and check['accepted'] and row['status']=='structurally_preferred_not_visually_confirmed')
            contours.append(check)
    return {'schema':'recovered-spatial-cad/1','physicalDimensionsFromCAD':np.ptp(outline,axis=0).tolist(),'units':'mm','historicalAnswersUsed':False,'rgbIdentityComparison':False,'grabCutUsed':False,'newPhotoDetection':False,'anchors':ordered,'rejectedProposals':rejected,'attempts':attempts,'geometry':selected,'neighborhood':assoc,'contours':contours,'verifiedPhotoCADLinks':0,'newVerifiedCards':0,'metricPCBValidated':False,'timingMs':{'edgeMap':edge_ms,'geometry':geometry_ms,'association':assoc['timingMs'] if assoc else 0,'total':(time.perf_counter()-start)*1000}}
