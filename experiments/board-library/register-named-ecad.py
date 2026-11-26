"""Optional registration capability: unique named assembly + physical body bounds.
No photographic detections. No fit to names alone. Independently reserved parts,
dimensions, side, coverage and a competing orientation must also agree.
"""
import importlib.util
from pathlib import Path
import numpy as np
spec=importlib.util.spec_from_file_location('reg',Path(__file__).with_name('register-ecad.py'))
reg=importlib.util.module_from_spec(spec);spec.loader.exec_module(reg)

def register(data,nodes):
 original=reg.register(data,nodes)
 if original['status']=='verified':return original
 policy=reg.policy;names={c['designator'] for c in data['components'] if c.get('designator')}
 groups={}
 for n in nodes:
  # Outer documented assembly owns its internals; repeated R1 inside a module
  # cannot impersonate R1 on the board. Ambiguous outer roots are rejected.
  owner=next(((i,name) for i,name in n.get('chain',[]) if name in names),None)
  if owner:groups.setdefault(owner,[]).append(n)
 hypotheses=[]
 for candidate in original.get('hypotheses',[]):
  h=dict(candidate);T=np.array(h['transform']);normal=h['normal'];plane=h['plane'];pairs=[]
  for ci,c in enumerate(data['components']):
   matches=[v for (i,name),v in groups.items() if name==c['designator']]
   bodies=[b for b in data['bodies'] if b['component']==ci]
   if len(matches)!=1 or len(bodies)!=1 or c['side'] not in ['TOP','BOTTOM']:continue
   meshes=matches[0];actualLo=np.min([n['min'] for n in meshes],axis=0);actualHi=np.max([n['max'] for n in meshes],axis=0)
   points=np.c_[bodies[0]['polygon'],np.ones(len(bodies[0]['polygon']))]@T.T
   error=max(np.max(abs(actualLo[plane]-points.min(0)[plane])),np.max(abs(actualHi[plane]-points.max(0)[plane])))
   sideDistance=((actualLo[normal]+actualHi[normal])/2-T[normal,2])*h['topSign']
   sideOK=sideDistance>=0 if c['side']=='TOP' else sideDistance<=-h['thickness']
   if error<=policy['bodyTolerance'] and sideOK:pairs.append(dict(component=ci,designator=c['designator'],nodes=[n['index'] for n in meshes],errorMm=float(error),independent=ci%2==1,center=((actualLo+actualHi)/2).tolist()))
  fit=[p for p in pairs if not p['independent']];hold=[p for p in pairs if p['independent']];board=next(n for n in nodes if n['index']==h['boardNode'])
  coverage=(np.ptp([p['center'] for p in fit],axis=0)[plane]/(np.array(board['max'])-board['min'])[plane]).tolist() if len(fit)>1 else [0,0]
  h.update(fit=len(fit),heldout=len(hold),coverage=coverage,namedPairs=pairs);hypotheses.append(h)
 if not hypotheses:return original
 hypotheses.sort(key=lambda h:(h['fit'],min(h['coverage'])),reverse=True);best=hypotheses[0];runner=hypotheses[1]['fit'] if len(hypotheses)>1 else 0
 valid=best['fit']>=policy['minFitBodies'] and best['heldout']>=policy['minIndependentBodies'] and min(best['coverage'])>=policy['minAxisCoverage'] and best['fit']>runner*2
 return dict(**best,status='verified' if valid else 'ambiguous',reason=None if valid else 'named_groups_lack_independent_spatial_support',policy='ecad-named-groups/1',thresholdPolicy=policy['version'],bindings=[],hypotheses=[{k:v for k,v in h.items() if k!='namedPairs'} for h in hypotheses],maxHeldoutErrorMm=max([p['errorMm'] for p in best['namedPairs'] if p['independent']],default=None),alignmentDoesNotRepairMissingCadFaces=True,previousCapabilityStatus=original['status'])
