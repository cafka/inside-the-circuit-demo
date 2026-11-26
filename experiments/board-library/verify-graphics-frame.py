"""Verify a native CAD-to-batched-render bridge using its recorded triangle ranges.
No estimated transformation. Every triangle, winding, multiplicity and placement
must agree within float32 round-trip error. Render colours are presentation.
"""
import sys,json,importlib.util
from pathlib import Path
import numpy as np
spec=importlib.util.spec_from_file_location('marks',Path(__file__).with_name('extract-surface-markings.py'));marks=importlib.util.module_from_spec(spec);spec.loader.exec_module(marks)
def verify(native,render,provenance,ulps=8):
 a,ah=marks.load(native);b,bh=marks.load(render)
 if provenance['glbSHA256']!=bh:raise ValueError('render_provenance_hash_mismatch')
 usedA=set();usedB=[np.zeros(len(x['indices']),dtype=bool) for x in b];count=0;maximum=0
 extent=max(float(np.max(abs(x['pos']))) for x in a);tolerance=np.finfo(np.float32).eps*extent*ulps
 for part in provenance['parts']:
  i=part['meshId']
  if i in usedA or not 0<=i<len(a):raise ValueError('duplicate_or_invalid_source_part')
  usedA.add(i);source=a[i]['pos'][a[i]['indices']];pieces=[]
  for r in part['ranges']:
   k=r['batch'];start=r['firstTriangle'];end=start+r['triangleCount']
   if not 0<=k<len(b) or not 0<=start<end<=len(b[k]['indices']) or usedB[k][start:end].any():raise ValueError('invalid_or_overlapping_triangle_range')
   usedB[k][start:end]=True;pieces.append(b[k]['pos'][b[k]['indices'][start:end]])
  actual=np.concatenate(pieces)
  if actual.shape!=source.shape:raise ValueError('triangle_count_mismatch')
  error=float(np.max(abs(actual-source)));maximum=max(maximum,error)
  if error>tolerance:raise ValueError('source_render_geometry_mismatch')
  count+=len(source)
 if len(usedA)!=len(a) or not all(x.all() for x in usedB):raise ValueError('unverified_geometry_remaining')
 return dict(status='verified',nativeGLBSHA256=ah,renderGLBSHA256=bh,trianglesChecked=count,maxErrorMeters=maximum,toleranceMeters=float(tolerance),toleranceBasis='float32 round-trip arithmetic; no geometric fitting',transform='identity_world_frame',colourCheck='presentation colours may differ; source-to-source extraction checks original colour')
if __name__=='__main__':
 native,render,report,out,ulps=sys.argv[1:];result=verify(native,render,json.loads(Path(report).read_text(encoding='utf-8')),int(ulps));Path(out).write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
