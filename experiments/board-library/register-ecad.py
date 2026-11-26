"""Register a source PCB document to unmodified mechanical geometry.
Fit: board extents and even-index extruded bodies. Independent check: odd bodies.
No reference photographs, designators or catalog recipe enter registration.
"""
import importlib.util,json,itertools
from pathlib import Path
import numpy as np
spec=importlib.util.spec_from_file_location('ec',Path(__file__).with_name('ecad-geometry.py'));ec=importlib.util.module_from_spec(spec);spec.loader.exec_module(ec)
policy=json.loads(Path(__file__).with_name('physical-registration-policy.json').read_text())
def register(data,nodes):
 outline=np.array(data['outline']);emin=outline.min(0);emax=outline.max(0);espan=emax-emin
 candidates=[]
 for node in nodes:
  size=np.array(node['max'])-node['min'];normal=int(size.argmin());plane=[a for a in range(3) if a!=normal]
  if size[normal]<=0 or size[normal]>min(size[plane])*.15:continue
  if min(max(abs(size[plane]-espan)),max(abs(size[plane]-espan[::-1])))<=policy['extentTolerance']:candidates.append((node,normal,plane))
 hypotheses=[]
 for board,normal,plane in candidates:
  for perm in [(0,1),(1,0)]:
   if max(abs((np.array(board['max'])-board['min'])[plane]-espan[list(perm)]))>policy['extentTolerance']:continue
   for signs in itertools.product([-1,1],repeat=2):
    transform=np.zeros((3,3));transform[normal,2]=board['max'][normal]
    for j,axis in enumerate(plane):
     source=perm[j];transform[axis,source]=signs[j];transform[axis,2]=((board['min'][axis]+board['max'][axis])-signs[j]*(emin[source]+emax[source]))/2
    # Proper oriented plane: transformed ECAD X cross Y defines its top face.
    topSign=float(np.cross(transform[:,0],transform[:,1])[normal]);transform[normal,2]=board['max'][normal] if topSign>0 else board['min'][normal]
    thickness=board['max'][normal]-board['min'][normal];pairs=[]
    for bi,b in enumerate(data['bodies']):
     if b['modelType']!='0':continue # Imported model silhouette may not be the body bound.
     p=np.c_[b['polygon'],np.ones(len(b['polygon']))]@transform.T;lo=p.min(0);hi=p.max(0);side=data['components'][b['component']]['side']
     if side not in ['TOP','BOTTOM']:continue
     z=[b['minZ'],b['maxZ']] if side=='TOP' else [-thickness-b['maxZ'],-thickness-b['minZ']]
     lo[normal]=min(transform[normal,2]+topSign*np.array(z));hi[normal]=max(transform[normal,2]+topSign*np.array(z))
     distances=sorted((max(np.max(abs(np.array(n['min'])-lo)),np.max(abs(np.array(n['max'])-hi))),n['index']) for n in nodes if n['index']!=board['index'])
     best=distances[0];margin=distances[1][0]-best[0] if len(distances)>1 else 1e9
     if best[0]<=policy['bodyTolerance'] and margin>=policy['alternativeMargin']:pairs.append(dict(body=bi,component=b['component'],node=best[1],errorMm=float(best[0]),marginMm=float(margin),independent=bi%2==1,center=((lo+hi)/2).tolist()))
    fit=[p for p in pairs if not p['independent']];hold=[p for p in pairs if p['independent']]
    coverage=(np.ptp([p['center'] for p in fit],axis=0)[plane]/(np.array(board['max'])-board['min'])[plane]).tolist() if len(fit)>1 else [0,0]
    hypotheses.append(dict(boardNode=board['index'],normal=normal,plane=plane,topSign=topSign,thickness=thickness,transform=transform.tolist(),fit=len(fit),heldout=len(hold),coverage=coverage,pairs=pairs))
 hypotheses.sort(key=lambda h:(h['fit'],min(h['coverage'])),reverse=True)
 if not hypotheses:return dict(status='blocked',reason='no_dimensionally_compatible_planar_mesh',hypotheses=[])
 best=hypotheses[0];runner=hypotheses[1]['fit'] if len(hypotheses)>1 else 0
 valid=best['fit']>=policy['minFitBodies'] and best['heldout']>=policy['minIndependentBodies'] and min(best['coverage'])>=policy['minAxisCoverage'] and best['fit']>runner*2
 # A node or electrical part cannot be assigned twice.
 used={};bindings=[]
 for p in best['pairs']:used.setdefault(p['node'],[]).append(p)
 for p in best['pairs']:
  if len(used[p['node']])==1 and sum(q['component']==p['component'] for q in best['pairs'])==1:bindings.append(p)
 return dict(status='verified' if valid else 'ambiguous',reason=None if valid else 'insufficient_independent_body_support_or_ambiguous_orientation',policy=policy['version'],**{k:v for k,v in best.items() if k!='pairs'},bindings=bindings if valid else [],hypotheses=[{k:v for k,v in h.items() if k!='pairs'} for h in hypotheses],maxHeldoutErrorMm=max([p['errorMm'] for p in best['pairs'] if p['independent']],default=None),alignmentDoesNotRepairMissingCadFaces=True)

if __name__=='__main__':
 import sys
 data=ec.read_ecad(sys.argv[1]);result=register(data,ec.read_glb(sys.argv[2]));Path(sys.argv[3]).write_text(json.dumps(result,indent=2));print(json.dumps({k:v for k,v in result.items() if k not in ['bindings','hypotheses']}))
