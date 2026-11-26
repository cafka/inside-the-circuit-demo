"""Independent image stage. Input PCB registration is immutable; no model-specific rules."""
import copy
import math
import time
import cv2
import numpy as np


def project(H, points):
    q = np.c_[points, np.ones(len(points))] @ np.asarray(H).T
    if np.any(np.abs(q[:, 2]) < 1e-9):
        raise ValueError('projection_at_infinity')
    return q[:, :2] / q[:, 2:]


def polygon_mask(shape, polygon):
    mask = np.zeros(shape, np.uint8)
    cv2.fillPoly(mask, [np.rint(polygon).astype(np.int32)], 1)
    return mask


def calibrated_volume(component, camera, H, outline, units, policy):
    """Use only supplied metric vertices and an explicit calibrated camera in the PCB frame."""
    volume = component.get('volume')
    if volume is None or camera is None:
        return {'status': 'unavailable', 'reason': 'missing_metric_volume_or_calibrated_camera'}
    if not volume.get('source') or not camera.get('source'):
        return {'status': 'rejected', 'reason': 'missing_3d_provenance'}
    if camera.get('units') != units or volume.get('units') != units or camera.get('frame') != 'pcb' or volume.get('frame') != 'pcb' or camera.get('imageModel') != 'undistorted':
        return {'status': 'rejected', 'reason': 'incompatible_camera_or_volume_frame'}
    try:
        K = np.asarray(camera['K'], float); R = np.asarray(camera['R'], float); t = np.asarray(camera['t'], float)
        vertices = np.asarray(volume['vertices'], float)
        if K.shape != (3,3) or R.shape != (3,3) or t.shape != (3,) or vertices.ndim != 2 or vertices.shape[1] != 3 or len(vertices) < 4:
            raise ValueError('invalid_calibration_shape')
        if not all(np.isfinite(a).all() for a in [K,R,t,vertices]) or not np.allclose(R.T@R,np.eye(3),atol=1e-5) or not np.isclose(np.linalg.det(R),1,atol=1e-5) or K[0,0]<=0 or K[1,1]<=0 or not np.allclose(K[2],[0,0,1]):
            raise ValueError('invalid_calibration_values')
        plane3 = np.c_[outline, np.zeros(len(outline))]
        def camera_project(p):
            xyz=p@R.T+t
            if np.min(xyz[:,2])<=0: raise ValueError('behind_camera')
            q=xyz@K.T
            return q[:,:2]/q[:,2:]
        error=float(np.max(np.linalg.norm(camera_project(plane3)-project(H,outline),axis=1)))
        if error>policy['camera']['maximumPlaneDisagreementPixels']:
            return {'status':'rejected','reason':'camera_disagrees_with_frozen_pcb','maximumPlaneErrorPixels':error}
        points=camera_project(vertices); hull=cv2.convexHull(points.astype(np.float32)).reshape(-1,2)
        return {'status':'projected_not_observed','vertices':points.tolist(),'hull':hull.tolist(),'maximumPlaneErrorPixels':error,'source':volume['source'],'cameraSource':camera['source']}
    except (KeyError, ValueError, np.linalg.LinAlgError) as e:
        return {'status':'rejected','reason':str(e)}


def warped_template(template, quad, scale, angle, minimum_side, blur_fraction):
    data=np.asarray(template, np.float32); h,w=data.shape
    if min(h,w)<2: return None
    center=quad.mean(0); a=math.radians(angle)
    A=scale*np.array([[math.cos(a),-math.sin(a)],[math.sin(a),math.cos(a)]])
    q=(quad-center)@A.T+center; lo=np.floor(q.min(0)); hi=np.ceil(q.max(0)); size=tuple((hi-lo+1).astype(int))
    if min(size)<minimum_side or max(size)>4096: return None
    T=cv2.getPerspectiveTransform(np.float32([[0,0],[w-1,0],[w-1,h-1],[0,h-1]]),np.float32(q-lo))
    data=cv2.GaussianBlur(data,(0,0),max(.1,max(data.shape)*blur_fraction))
    pixels=cv2.warpPerspective(data,T,size); mask=cv2.warpPerspective(np.ones((h,w),np.uint8),T,size,flags=cv2.INTER_NEAREST)
    mask=cv2.erode(mask,np.ones((3,3),np.uint8))
    if mask.sum()<minimum_side**2:return None
    return {'pixels':pixels,'mask':mask,'offset':center-lo,'quad':q-lo,'sigma':max(.1,max(size)*blur_fraction)}


def local_appearance(gray, component, quad, search_center, profile, templates, H, low, old, policy):
    start=time.perf_counter(); sp=old['search']; ap=old['appearance']; lp=policy['localSearch']
    size=float(np.linalg.norm(np.ptp(quad,axis=0))); radius=float(np.clip(size*lp['radiusDiagonalFraction'],lp['minimumRadiusPixels'],lp['maximumRadiusPixels']))
    center=np.asarray(search_center); candidates=[]; maps=positions=0
    def evaluate(template, target_quad, factor, angle, target, rad, peaks):
        nonlocal maps,positions
        v=warped_template(template,target_quad,factor,angle,sp['minimumTemplateSide'],sp['blurLongSideFraction'])
        if v is None:return []
        lo=np.maximum(0,np.floor(target-v['offset']-rad).astype(int)); hi=np.minimum(gray.shape[::-1],np.ceil(target-v['offset']+np.array(v['pixels'].shape[::-1])+rad).astype(int))
        if np.any(hi<=lo):return []
        corr=low.correlation(gray[lo[1]:hi[1],lo[0]:hi[0]],v)
        if corr is None:return []
        maps+=1;positions+=int(corr.size)
        # The location constraint is a search budget, not a height estimate.
        yy,xx=np.indices(corr.shape); centers=np.stack([xx,yy],-1)+v['offset']+lo
        corr[np.linalg.norm(centers-target,axis=2)>rad]=-1
        rows=[]
        for _ in range(peaks):
            _,score,_,loc=cv2.minMaxLoc(corr)
            if score<=-1:break
            xy=np.array(loc)+lo+v['offset']; q=v['quad']+loc+lo
            rows.append({'score':float(score),'xy':xy.tolist(),'quad':q.tolist(),'scaleFactor':factor,'angleOffsetDegrees':angle})
            cv2.circle(corr,loc,max(1,int(np.linalg.norm(v['pixels'].shape)*sp['sceneRivalSeparationTemplateDiagonal'])),-1,-1)
        return rows
    template=templates[component['id']]; reasons=[]
    if float(np.std(template))/255<ap['minimumStd']:reasons.append('reference_low_contrast')
    for factor in lp['scaleFactors']:
        for angle in lp['angleOffsetsDegrees']:
            candidates.extend(evaluate(template,quad,factor,angle,center,radius,lp['peaksPerVariant']))
    retained=low.separated(candidates,sp['sceneRivalSeparationTemplateDiagonal'],sp['retainedCandidates'])
    if not retained:return {'accepted':False,'reasons':reasons+['no_evaluable_local_template'],'timeMs':(time.perf_counter()-start)*1000,'searchRadiusPixels':radius}
    best=retained[0]; rivals=[]
    for other in profile['components']:
        if other['id']==component['id']:continue
        oq=project(H,other['footprint']); oq=oq-oq.mean(0)+np.array(best['xy'])
        rows=evaluate(templates[other['id']],oq,best['scaleFactor'],best['angleOffsetDegrees'],np.array(best['xy']),max(2,old['search']['refineRadiusFraction']*np.linalg.norm(gray.shape)),1)
        if rows:rivals.append({'id':other['id'],'score':rows[0]['score']})
    scene_margin=best['score']-retained[1]['score'] if len(retained)>1 else None
    identity_margin=best['score']-max(r['score'] for r in rivals) if rivals else None
    if best['score']<ap['minimumNCC']:reasons.append('low_appearance')
    if scene_margin is None or scene_margin<ap['minimumSceneMargin']:reasons.append('ambiguous_local_location')
    if identity_margin is None or identity_margin<ap['minimumReferenceMargin']:reasons.append('ambiguous_reference_identity')
    shift=np.array(best['xy'])-quad.mean(0)
    if np.linalg.norm(np.array(best['xy'])-center)>=radius-1:reasons.append('search_limit_reached')
    return {'accepted':not reasons,'reasons':reasons,'best':best,'candidates':retained,'referenceRivals':rivals,'sceneMargin':scene_margin,'referenceMargin':identity_margin,
            'searchCenterPixels':center.tolist(),'searchRadiusPixels':radius,'displacementFromPlanePixels':shift.tolist(),'height':None,'causalAttribution':'unresolved: parallax, approximate map, registration error, or appearance mismatch',
            'timeMs':(time.perf_counter()-start)*1000,'work':{'correlationMaps':maps,'positionsEvaluated':positions}}


def visible_region(rgb, quad, policy):
    """Seeded image segmentation, accepted only with boundary and seed-stability evidence."""
    start=time.perf_counter(); p=policy['segmentation']; q=np.asarray(quad); center=q.mean(0)
    padding=max(p['minimumPaddingPixels'],int(np.linalg.norm(np.ptp(q,axis=0))*p['paddingDiagonalFraction']))
    lo=np.maximum(0,np.floor(q.min(0)-padding).astype(int));hi=np.minimum(rgb.shape[1::-1],np.ceil(q.max(0)+padding).astype(int)); crop=rgb[lo[1]:hi[1],lo[0]:hi[0]]
    if min(crop.shape[:2],default=0)<3:return {'accepted':False,'reasons':['segmentation_roi_too_small'],'timeMs':(time.perf_counter()-start)*1000}
    masks=[]; dominance=[]; failures=[]
    for fraction in p['seedFractions']:
        seed=np.full(crop.shape[:2],cv2.GC_PR_BGD,np.uint8)
        cv2.fillPoly(seed,[np.rint(q-lo).astype(np.int32)],cv2.GC_PR_FGD)
        cv2.fillPoly(seed,[np.rint(center+(q-center)*fraction-lo).astype(np.int32)],cv2.GC_FGD)
        seed[[0,-1],:]=cv2.GC_BGD;seed[:,[0,-1]]=cv2.GC_BGD
        try:
            cv2.setRNGSeed(p['randomSeed']);cv2.grabCut(crop,seed,None,np.zeros((1,65)),np.zeros((1,65)),p['iterations'],cv2.GC_INIT_WITH_MASK)
        except cv2.error:
            failures.append('segmentation_failed');continue
        fg=np.isin(seed,[cv2.GC_FGD,cv2.GC_PR_FGD]).astype(np.uint8)
        count,labels,stats,_=cv2.connectedComponentsWithStats(fg)
        if count<2:failures.append('no_segmented_foreground');continue
        biggest=1+int(np.argmax(stats[1:,cv2.CC_STAT_AREA]));mask=(labels==biggest).astype(np.uint8)
        dominance.append(float(mask.sum()/max(1,fg.sum())));masks.append(mask)
    if len(masks)!=len(p['seedFractions']):return {'accepted':False,'reasons':failures,'timeMs':(time.perf_counter()-start)*1000}
    mask=masks[0];iou=float(np.logical_and(*masks).sum()/max(1,np.logical_or(*masks).sum()))
    contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE);contour=max(contours,key=cv2.contourArea).reshape(-1,2)
    gray=cv2.cvtColor(crop,cv2.COLOR_RGB2GRAY);edges=cv2.Canny(cv2.GaussianBlur(gray,(0,0),1),p['cannyLow'],p['cannyHigh'])
    distances=cv2.distanceTransform((edges==0).astype(np.uint8),cv2.DIST_L2,3);supported=distances[contour[:,1],contour[:,0]]<=p['edgeTolerancePixels']
    support=float(supported.mean()); quadrants=(contour[:,0]>=center[0]-lo[0]).astype(int)+2*(contour[:,1]>=center[1]-lo[1]).astype(int)
    distributed=[float(supported[quadrants==i].mean()) if np.any(quadrants==i) else 0 for i in range(4)]
    area_ratio=float(mask.sum()/max(1,abs(cv2.contourArea(q.astype(np.float32)))))
    reasons=[]
    if iou<p['minimumStabilityIoU']:reasons.append('unstable_with_seed_change')
    if support<p['minimumEdgeSupport'] or min(distributed)<p['minimumQuadrantSupport']:reasons.append('insufficient_observed_boundary')
    if not p['minimumAreaRatio']<=area_ratio<=p['maximumAreaRatio']:reasons.append('segmented_area_incompatible')
    if min(dominance)<p['minimumDominantFraction']:reasons.append('fragmented_foreground')
    if np.any(mask[1,:]) or np.any(mask[-2,:]) or np.any(mask[:,1]) or np.any(mask[:,-2]):reasons.append('segmentation_reaches_search_limit')
    if cv2.pointPolygonTest(contour.astype(np.float32),tuple((center-lo).astype(float)),False)<0:reasons.append('observed_texture_outside_segment')
    return {'accepted':not reasons,'reasons':reasons,'contour':(contour+lo).tolist(),'seedStabilityIoU':iou,'boundaryEdgeSupport':support,'quadrantEdgeSupport':distributed,'areaToTemplateRatio':area_ratio,'dominantForegroundFractions':dominance,
            'meaning':'visible appearance region; not a measured 3D silhouette or confirmed semantic identity','timeMs':(time.perf_counter()-start)*1000}


def recognize(rgb, pcb, profile, templates, low, old, policy, camera=None):
    start=time.perf_counter(); plane=copy.deepcopy({k:pcb[k] for k in ['geometry','perimeter','matches']});H=plane['geometry'].get('matrix')
    result={'pcb':plane,'components':[],'pcbModified':False,'heightInferred':False,'timingsMs':{'projection':0,'appearance':0,'segmentation':0,'occlusion':0}}
    if H is None:
        result.update(status='not_evaluable',reason='no_compatible_pcb_geometry',totalMs=(time.perf_counter()-start)*1000);return result
    H=np.asarray(H);gray=cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY).astype(np.float32); pcb_mask=polygon_mask(rgb.shape[:2],plane['geometry']['outline'])
    border=np.zeros(rgb.shape[:2],np.uint8);cv2.polylines(border,[np.rint(plane['geometry']['outline']).astype(np.int32)],True,1,1)
    for c in profile['components']:
        t=time.perf_counter(); quad=project(H,c['footprint']); volume=calibrated_volume(c,camera,H,profile['outline'],profile['units'],policy)
        expected_center=np.array(volume['hull']).mean(0) if volume['status']=='projected_not_observed' else quad.mean(0)
        row={'id':c['id'],'label':c.get('label',c['id']),'mapProjection':quad.tolist(),'projectionStatus':'estimated_from_frozen_pcb','mapUncertainty':c['uncertainty'],'volumeProjection':volume,'height':None,'identity':'profile_label_not_visually_confirmed'}
        result['timingsMs']['projection']+=(time.perf_counter()-t)*1000
        appearance=local_appearance(gray,c,quad,expected_center,profile,templates,H,low,old,policy);row['appearance']=appearance;result['timingsMs']['appearance']+=appearance['timeMs']
        if appearance['accepted']:
            region=visible_region(rgb,appearance['best']['quad'],policy);result['timingsMs']['segmentation']+=region['timeMs'];row['visibleRegion']=region
            row['status']='visible_region_supported' if region['accepted'] else 'appearance_supported_contour_uncertain'
            row['identity']='reference_appearance_supported_not_semantically_verified'
        else:
            row['status']='map_estimate_only';row['visibleRegion']={'accepted':False,'reasons':['appearance_not_unambiguous']}
        # A conditional interpretation, never feedback into the PCB pose or its validator.
        t=time.perf_counter();region=row['visibleRegion']
        mask=polygon_mask(rgb.shape[:2],region['contour']) if region['accepted'] else polygon_mask(rgb.shape[:2],quad)
        yy,xx=np.where((mask>0)&(border>0))
        row['occlusion']={'status':'possible_not_depth_verified','basis':'supported_visible_region' if region['accepted'] else 'map_projection_only',
                          'region':region['contour'] if region['accepted'] else quad.tolist(),'pcbOverlapPixels':int(np.count_nonzero(mask&pcb_mask)),
                          'outsideEstimatedPcbPixels':int(np.count_nonzero(mask&(1-pcb_mask))),'possiblyHiddenBorderPixels':np.c_[xx,yy].tolist(),
                          'doesNotValidatePcb':True,'doesNotProveHeight':True}
        result['timingsMs']['occlusion']+=(time.perf_counter()-t)*1000;result['components'].append(row)
    result.update(status='independent_component_stage',totalMs=(time.perf_counter()-start)*1000)
    return result
