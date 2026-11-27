"""Experimental image-only anchor search. No board names, coordinates, labels or ring detector."""
import itertools
import math
import time
import cv2
import numpy as np


def project(H, points):
    p = np.c_[np.asarray(points), np.ones(len(points))] @ np.asarray(H).T
    return p[:, :2] / p[:, 2:]


def extent_diagonal(profile):
    points = np.asarray(profile['outline'])
    return float(np.linalg.norm(np.ptp(points, axis=0)))


def variant(template, pixels_per_unit, angle, policy):
    angle = float(angle % 360)
    if angle >= 180:
        base = variant(template, pixels_per_unit, angle-180, policy)
        if base is None:
            return None
        end = np.array(base['pixels'].shape[::-1])-1
        return {**base, 'pixels': np.ascontiguousarray(np.rot90(base['pixels'], 2)),
                'mask': np.ascontiguousarray(np.rot90(base['mask'], 2)),
                'offset': end-base['offset'], 'quad': end-base['quad']}
    data = template['pixels'].astype(np.float32)
    h, w = data.shape
    sigma = max(h, w) * policy['blurLongSideFraction']
    data = cv2.GaussianBlur(data, (0, 0), sigma)
    a = math.radians(angle)
    linear = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
    linear *= pixels_per_unit / template['pixelsPerUnit']
    # Numerical symmetry, not an image threshold: sin(pi) must not add a raster row.
    linear = np.round(linear, 12)
    corners = np.array([[0, 0], [w-1, 0], [w-1, h-1], [0, h-1]])
    transformed = np.round(corners @ linear.T, 10)
    low = np.floor(transformed.min(0)); high = np.ceil(transformed.max(0))
    shape = tuple((high-low+1).astype(int))
    if min(shape) < policy['minimumTemplateSide']:
        return None
    matrix = np.c_[linear, -low]
    warped = cv2.warpAffine(data, matrix, shape, flags=cv2.INTER_LINEAR)
    mask = cv2.warpAffine(np.ones((h, w), np.uint8), matrix, shape, flags=cv2.INTER_NEAREST)
    mask = cv2.erode(mask, np.ones((3, 3), np.uint8))
    if mask.sum() < policy['minimumTemplateSide']**2:
        return None
    center = linear @ np.array([(w-1)/2, (h-1)/2])-low
    return {'pixels': warped, 'mask': mask, 'offset': center,
            'quad': transformed-low, 'sigma': sigma*pixels_per_unit/template['pixelsPerUnit']}


def correlation(scene, v):
    if v is None or any(a < b for a, b in zip(scene.shape, v['pixels'].shape)):
        return None
    blurred = cv2.GaussianBlur(scene, (0, 0), max(0.1, v['sigma']))
    result = cv2.matchTemplate(blurred, v['pixels'], cv2.TM_CCOEFF_NORMED, mask=v['mask'])
    # Constant windows have undefined correlation. Never turn inf into confidence.
    result[~np.isfinite(result)] = -1
    result[(result > 1.0001) | (result < -1.0001)] = -1
    return np.clip(result, -1, 1)


def proposal(score, loc, v, ppu, angle, origin=(0, 0), ratio=1):
    xy = (np.asarray(loc)+v['offset']+origin)/ratio
    quad = (v['quad']+loc+origin)/ratio
    return {'score': float(score), 'xy': xy.tolist(), 'quad': quad.tolist(),
            'pixelsPerUnit': float(ppu/ratio), 'angleDegrees': float(angle % 360)}


def separated(proposals, factor, count):
    chosen = []
    for item in sorted(proposals, key=lambda r: -r['score']):
        size = np.linalg.norm(np.asarray(item['quad'])[2]-item['quad'][0])
        if all(np.linalg.norm(np.asarray(item['xy'])-r['xy']) > factor*size for r in chosen):
            chosen.append(item)
        if len(chosen) >= count:
            break
    return chosen


def search(scene, profile, templates, policy):
    start = time.perf_counter(); sp = policy['search']; ap = policy['appearance']
    ratio = min(1, policy['prepare']['searchLongEdge']/max(scene.shape))
    small = cv2.resize(scene, None, fx=ratio, fy=ratio, interpolation=cv2.INTER_AREA)
    board_diagonal = extent_diagonal(profile); rows = []; maps = positions = 0
    diagonal = float(np.linalg.norm(scene.shape))
    for ref in profile['anchors']:
        template = templates[ref['id']]; candidates = []; anchor_start = time.perf_counter()
        if np.std(template['pixels'])/255 < ap['minimumStd']:
            rows.append({'id': ref['id'], 'acceptedAppearance': False, 'reasons': ['reference_low_contrast'], 'candidates': []})
            continue
        for fraction, angle in itertools.product(sp['boardDiagonalFractions'], range(0, 360, sp['angleStepDegrees'])):
            ppu = max(small.shape)*fraction/board_diagonal
            v = variant(template, ppu, angle, sp); corr = correlation(small, v)
            if corr is None: continue
            maps += 1; positions += corr.size
            for _ in range(sp['peaksPerMap']):
                _, score, _, loc = cv2.minMaxLoc(corr)
                candidates.append(proposal(score, loc, v, ppu, angle, ratio=ratio))
                radius = max(1, int(np.linalg.norm(v['pixels'].shape)*sp['sceneRivalSeparationTemplateDiagonal']))
                cv2.circle(corr, loc, radius, -1, -1)
        seeds = separated(candidates, sp['sceneRivalSeparationTemplateDiagonal'], sp['refinePeaks'])
        refined = []
        for seed in seeds:
            for ds, da in itertools.product(sp['refineScaleFactors'], sp['refineAngleOffsets']):
                ppu = seed['pixelsPerUnit']*ds; angle = seed['angleDegrees']+da
                v = variant(template, ppu, angle, sp)
                if v is None: continue
                rad = max(3, int(sp['refineRadiusFraction']*diagonal))
                origin = np.maximum(0, np.floor(np.asarray(seed['xy'])-v['offset']-rad).astype(int))
                high = np.minimum(scene.shape[::-1], np.ceil(np.asarray(seed['xy'])-v['offset']+np.asarray(v['pixels'].shape[::-1])+rad).astype(int))
                corr = correlation(scene[origin[1]:high[1], origin[0]:high[0]], v)
                if corr is None: continue
                maps += 1; positions += corr.size
                _, score, _, loc = cv2.minMaxLoc(corr)
                item = proposal(score, loc, v, ppu, angle, origin)
                near = (corr >= score-ap['peakScoreDrop']).astype(np.uint8)
                _, labels = cv2.connectedComponents(near)
                yy, xx = np.where(labels == labels[loc[1], loc[0]])
                item['peakRadiusPixels'] = float(np.max(np.hypot(xx-loc[0], yy-loc[1])))
                refined.append(item)
        retained = separated(refined, sp['sceneRivalSeparationTemplateDiagonal'], sp['retainedCandidates'])
        rows.append({'id': ref['id'], 'candidates': retained, 'coarseTop': sorted(candidates, key=lambda p: -p['score'])[:sp['retainedCandidates']],
                     'searchMs': (time.perf_counter()-anchor_start)*1000})
    search_ms = (time.perf_counter()-start)*1000; rival_start = time.perf_counter()
    # Identity competition at the observed location; no profile position enters this search.
    for row in rows:
        if not row['candidates']: row.setdefault('reasons', ['no_evaluable_template_variant']); row['acceptedAppearance'] = False; continue
        best = row['candidates'][0]; rivals = []
        for ref in profile['anchors']:
            if ref['id'] == row['id']: continue
            v = variant(templates[ref['id']], best['pixelsPerUnit'], best['angleDegrees'], sp)
            if v is None: continue
            rad = max(2, int(diagonal*sp['refineRadiusFraction']))
            origin = np.maximum(0, np.floor(np.asarray(best['xy'])-v['offset']-rad).astype(int))
            high = np.minimum(scene.shape[::-1], np.ceil(np.asarray(best['xy'])-v['offset']+np.asarray(v['pixels'].shape[::-1])+rad).astype(int))
            corr = correlation(scene[origin[1]:high[1], origin[0]:high[0]], v)
            if corr is None: continue
            maps += 1; positions += corr.size
            _, score, _, loc = cv2.minMaxLoc(corr)
            rivals.append({'id': ref['id'], **proposal(score, loc, v, best['pixelsPerUnit'], best['angleDegrees'], origin)})
        scene_rival = row['candidates'][1] if len(row['candidates']) > 1 else None
        reference_rival = max(rivals, key=lambda r:r['score']) if rivals else None
        sm = best['score']-scene_rival['score'] if scene_rival else None
        rm = best['score']-reference_rival['score'] if reference_rival else None
        reasons = []
        if best['score'] < ap['minimumNCC']: reasons.append('low_appearance')
        if sm is None or sm < ap['minimumSceneMargin']: reasons.append('ambiguous_scene_location')
        if rm is None or rm < ap['minimumReferenceMargin']: reasons.append('ambiguous_reference_identity')
        if best['peakRadiusPixels'] > ap['maxPeakRadiusDiagonalFraction']*diagonal: reasons.append('imprecise_peak')
        row.update(best=best, sceneMargin=sm, referenceMargin=rm, referenceRivals=rivals,
                   acceptedAppearance=not reasons, reasons=reasons)
    return rows, {'referenceSearchMs': search_ms, 'correspondenceMs': (time.perf_counter()-rival_start)*1000,
                  'correlationMaps': maps, 'positionsEvaluated': int(positions)}


def spatial_partition(matches, profile, policy):
    """Greedy distinct/precise/spread anchors; fixed reserve cadence before any fit."""
    if not matches: return [], [], []
    association = policy['association']; diag = extent_diagonal(profile)
    pool = list(matches); ordered = []; rejected = []
    while pool:
        def utility(m):
            spread = min([np.linalg.norm(np.asarray(m['referenceXY'])-r['referenceXY'])/diag for r in ordered] or [1.0])
            return m['score']*spread/(1+m['peakRadiusPixels'])
        item = max(pool, key=utility); pool.remove(item)
        overlap = False
        for previous in ordered:
            a = np.asarray(item['quad'], np.float32); b = np.asarray(previous['quad'], np.float32)
            area, _ = cv2.intersectConvexConvex(a,b)
            if area/max(1,min(abs(cv2.contourArea(a)),abs(cv2.contourArea(b)))) > association['maxAnchorOverlap']: overlap=True
        if overlap: rejected.append({'id':item['id'],'reason':'overlapping_image_support'}); continue
        ordered.append(item)
    reserve = [m for i,m in enumerate(ordered) if (i+1)%association['reserveEvery']==0]
    fit = [m for i,m in enumerate(ordered) if (i+1)%association['reserveEvery']!=0]
    return fit, reserve, rejected


def estimate_model(name, src, dst, policy, diagonal):
    src=np.asarray(src,np.float64);dst=np.asarray(dst,np.float64);g=policy['geometry']
    if len(src)<2 or np.max(np.linalg.norm(src-src[0],axis=1))<1e-8: return None,None
    if name!='similarity' and (np.linalg.matrix_rank(np.c_[src,np.ones(len(src))])<3 or np.linalg.matrix_rank(np.c_[dst,np.ones(len(dst))])<3): return None,None
    cv2.setRNGSeed(g['seed']);threshold=g['fitErrorDiagonalFraction']*diagonal
    options=dict(ransacReprojThreshold=threshold,maxIters=g['ransacIterations'],confidence=g['confidence'])
    if name=='similarity': H,mask=cv2.estimateAffinePartial2D(src,dst,method=cv2.RANSAC,**options)
    elif name=='affine': H,mask=cv2.estimateAffine2D(src,dst,method=cv2.RANSAC,**options)
    else: H,mask=cv2.findHomography(src,dst,cv2.RANSAC,threshold,maxIters=g['ransacIterations'],confidence=g['confidence'])
    if H is None or not np.isfinite(H).all():return None,None
    if H.shape==(2,3):H=np.vstack([H,[0,0,1]])
    return H,mask.ravel().astype(bool)


def register(scene, profile, rows, policy, verify_outline):
    start=time.perf_counter();by_id={a['id']:a for a in profile['anchors']};visual=[]
    for row in rows:
        if row['acceptedAppearance']:
            ref=by_id[row['id']];visual.append({'id':row['id'],**row['best'],'referenceXY':ref['center'],
                                              'metric':ref['planeMembership']=='pcb','planeMembership':ref['planeMembership']})
    metric=[m for m in visual if m['metric']]
    # Nonplanar matches can demonstrate a correspondence failure without masquerading as PCB pose.
    groups=[('planar',metric)]
    if len(metric)<2 and len(visual)>=2:groups.append(('surface_diagnostic_only',visual))
    hypotheses=[];selection=[];geometry_ms=validation_ms=0;diagonal=float(np.linalg.norm(scene.shape))
    for kind,matches in groups:
        fit,reserve,rejected=spatial_partition(matches,profile,policy)
        selection.append({'kind':kind,'fitIds':[m['id'] for m in fit],'reserveIds':[m['id'] for m in reserve],'rejected':rejected})
        for specification in policy['models']:
            t=time.perf_counter();name=specification['name'];reason=[]
            if len(fit)<specification['fitMinimum']:
                hypotheses.append({'kind':kind,'model':name,'H':None,'reasons':['insufficient_fit_anchors'],'fitCount':len(fit),'reserveCount':len(reserve)});continue
            src=np.array([m['referenceXY'] for m in fit]);dst=np.array([m['xy'] for m in fit]);span=np.max(np.linalg.norm(src[:,None]-src[None,:],axis=2))/extent_diagonal(profile)
            if span<policy['association']['minimumSpanFraction']:reason.append('poor_anchor_separation')
            if name!='similarity':
                hull=abs(cv2.contourArea(cv2.convexHull(src.astype(np.float32))))/abs(cv2.contourArea(np.asarray(profile['outline'],np.float32)))
                if hull<policy['association']['minimumHullFraction']:reason.append('poor_anchor_hull')
            H,inliers=estimate_model(name,src,dst,policy,diagonal)
            geometry_ms+=(time.perf_counter()-t)*1000
            if H is None:
                hypotheses.append({'kind':kind,'model':name,'H':None,'reasons':reason+['degenerate_fit']});continue
            t=time.perf_counter();errors=np.linalg.norm(project(H,src)-dst,axis=1)
            if inliers.mean()<policy['geometry']['minimumFitInlierFraction']:reason.append('inconsistent_fit')
            reserved_errors=np.linalg.norm(project(H,[m['referenceXY'] for m in reserve])-np.array([m['xy'] for m in reserve]),axis=1) if reserve else np.array([])
            if len(reserve)<specification['reserveMinimum']:reason.append('insufficient_independent_anchors')
            if len(reserved_errors) and (np.median(reserved_errors)>diagonal*policy['geometry']['reserveErrorDiagonalFraction'] or max(reserved_errors)>diagonal*policy['geometry']['maximumReserveErrorDiagonalFraction']):reason.append('independent_anchors_disagree')
            if kind!='planar':reason.append('unknown_height_or_mixed_plane')
            mask=np.zeros(scene.shape,np.uint8)
            for m in fit+reserve:cv2.fillConvexPoly(mask,np.round(m['quad']).astype(np.int32),1)
            verification=verify_outline(H,mask)
            if not verification['passed']:reason.append('independent_outline_not_verified')
            validation_ms+=(time.perf_counter()-t)*1000
            hypotheses.append({'kind':kind,'model':name,'H':H.tolist(),'fitIds':[m['id'] for m in fit],
                               'reserveIds':[m['id'] for m in reserve],'inliers':inliers.tolist(),'fitErrorsPixels':errors.tolist(),
                               'reservedErrorsPixels':reserved_errors.tolist(),'spanFraction':float(span),'verification':verification,
                               'outline':project(H,profile['outline']).tolist(),'reasons':reason,'validated':not reason})
            if not reason:break  # simplest model sufficient; no promotion based on training residual
    validated=[h for h in hypotheses if h.get('validated')]
    return {'status':'validated_pose' if validated else 'geometry_undetermined','pose':validated[0] if validated else None,
            'visualMatches':visual,'metricMatches':len(metric),'selection':selection,'hypotheses':hypotheses,
            'componentGateOpen':bool(validated),'timingMs':{'anchorSelectionAndRegistrationMs':(time.perf_counter()-start)*1000,
            'geometryEstimationMs':geometry_ms,'independentValidationMs':validation_ms}}
