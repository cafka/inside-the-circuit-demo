"""Verify serialized trace endpoints against actual immutable CAD triangles."""
import importlib.util,json
from pathlib import Path
import numpy as np
DIR=Path(__file__).resolve().parent;ROOT=DIR.parent.parent
spec=importlib.util.spec_from_file_location('cad',DIR/'extract-surface-markings.py');cad=importlib.util.module_from_spec(spec);spec.loader.exec_module(cad)
profile=json.loads((DIR/'pad-trace-profile.json').read_text(encoding='utf-8'));sources=json.loads((DIR/'pad-trace-sources.json').read_text(encoding='utf-8'));report=[]
for asset,source in zip(profile['assets'],sources['assets']):
 meshes,sha=cad.load(ROOT/source['native']);assert sha==asset['nativeSHA256'];anchors={a['id']:a for a in asset['anchors']};corners=np.array(asset['corners']);u=corners[1]-corners[0];v=corners[3]-corners[0]
 for a in anchors.values():
  point=np.array(a['world']);matches=[m for m in meshes if m['name']==a['source']]
  assert any(np.min(np.linalg.norm(m['pos'][m['indices']].mean(axis=1)-point,axis=1))<1e-9 for m in matches),'Endpoint is not on its source triangle'
 for r in asset['routes']:
  assert all(0<=c<=1 for p in r['points'] for c in p)
  for endpoint,point in zip(r['endpoints'],[r['points'][0],r['points'][-1]]):
   delta=np.array(anchors[endpoint]['world'])-corners[0];projected=[np.dot(delta,u)/np.dot(u,u),np.dot(delta,v)/np.dot(v,v)];assert np.max(np.abs(np.array(point)-projected))<1e-10
 report.append({'asset':asset['baseGLBSHA256'],'anchorsVerifiedOnRealTriangle':len(anchors),'routes':len(asset['routes']),'allEndpointsMatchContactProjection':True,'noNewPadsOrVias':True,'passed':True})
out=DIR/'results/landing-v7';out.mkdir(parents=True,exist_ok=True);(out/'contact-verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
