"""Optional presentation assets: route between existing exposed CAD contacts.
No images, AI, electrical inference, random starts or added vias. Solid geometry
is read only. Unknown/occluded contacts are omitted. This does not prepare CAD.
"""
import argparse, hashlib, heapq, importlib.util, json, math, time
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
DIR=Path(__file__).resolve().parent;ROOT=DIR.parent.parent
spec=importlib.util.spec_from_file_location('cad_graphics',DIR/'extract-surface-markings.py');cad=importlib.util.module_from_spec(spec);spec.loader.exec_module(cad)
policy=json.loads((DIR/'pad-trace-policy.json').read_text())
def read(p):return json.loads((ROOT/p).read_text(encoding='utf-8-sig'))
def prepare(source):
 started=time.perf_counter();meshes,sha=cad.load(ROOT/source['native']);assert sha==source['nativeSHA256'],'Native CAD changed'
 hidden=set(source.get('hiddenPaths',[]))
 if 'provenance' in source:
  provenance=read(source['provenance']);assert provenance['nativeGLBSHA256']==sha
  classes=read(source['materialProfile'])['batches'];assert len(meshes)==len(provenance['parts'])
  for m,p in zip(meshes,provenance['parts']):
   leaf=m['name'].split('/')[-1];assert (leaf==p['name'] or leaf==p['name'].rsplit('_',1)[0]) and len(m['indices'])==p['triangles'],'Provenance primitive/order differs'
   labels={classes.get(str(r['batch'])) for r in p['ranges']};m['finish']=next(iter(labels)) if len(labels)==1 else None
 else:
  record=read(source['record']);labels={m['nodeId']:m['finish'] for m in record['materials']}
  paths={'/'.join(n['path']):labels.get(n['id']) for n in record['inventory']['nodes']}
  for m in meshes:m['finish']=paths.get(m['name'])
 meshes=[m for m in meshes if m['name'] not in hidden]
 substrates=[m for m in meshes if m['finish']=='pcb_soldermask'];assert substrates,'No documented PCB material'
 board=max(substrates,key=lambda m:np.prod(np.sort(m['hi']-m['lo'])[-2:]));axis=int(np.argmin(board['hi']-board['lo']));uv=[a for a in range(3) if a!=axis]
 above=sum(np.prod((m['hi']-m['lo'])[uv]) for m in meshes if m['lo'][axis]>=board['hi'][axis]-1e-6)
 below=sum(np.prod((m['hi']-m['lo'])[uv]) for m in meshes if m['hi'][axis]<=board['lo'][axis]+1e-6);sign=1 if above>=below else -1
 plane=float(board['hi'][axis] if sign>0 else board['lo'][axis]);low=board['lo'][uv];span=(board['hi']-board['lo'])[uv];thickness=float(board['hi'][axis]-board['lo'][axis]);cell=max(span)/policy['gridMax'];w,h=[int(math.ceil(s/cell))+1 for s in span]
 def xy(p):return (p[uv]-low)/cell
 def rect(m):
  a=np.floor(xy(m['lo'])).astype(int);b=np.ceil(xy(m['hi'])).astype(int);return [int(max(0,a[0])),int(max(0,a[1])),int(min(w-1,b[0])),int(min(h-1,b[1]))]
 surface=Image.new('1',(w,h));draw=ImageDraw.Draw(surface)
 for t in board['indices']:
  p=board['pos'][t]
  if max(abs(p[:,axis]-plane))<1e-6:draw.polygon([tuple(xy(v)) for v in p],fill=1)
 valid=np.array(surface,dtype=bool);counts=np.zeros((h,w),dtype=np.uint16);candidates=[]
 all_lo=np.array([m['lo'] for m in meshes]);all_hi=np.array([m['hi'] for m in meshes]);all_top=np.maximum(sign*(all_lo[:,axis]-plane),sign*(all_hi[:,axis]-plane))
 for mi,m in enumerate(meshes):
  if m is board:continue
  near=min(sign*(m['lo'][axis]-plane),sign*(m['hi'][axis]-plane));far=max(sign*(m['lo'][axis]-plane),sign*(m['hi'][axis]-plane))
  if far< -1e-6:continue
  r=rect(m);x0,y0,x1,y1=r
  if x1<x0 or y1<y0:continue
  counts[y0:y1+1,x0:x1+1]+=1
  size=(m['hi']-m['lo'])[uv]
  if m['finish'] not in ['gold_contacts','tin_satin'] or min(size)<=0 or max(size)>max(span)*policy['maxContactSpanFraction'] or max(size)/min(size)>policy['maxContactAspect']:continue
  if near>thickness*policy['maxSurfaceHeightInPCBThicknesses'] or far>thickness*policy['maxSurfaceHeightInPCBThicknesses']:continue
  # Pick the centroid of an actual outward-facing triangle near the top of the
  # contact, rather than inventing a pad at a bounding-box centre.
  triangles=m['pos'][m['indices']];normals=np.cross(triangles[:,1]-triangles[:,0],triangles[:,2]-triangles[:,0]);length=np.linalg.norm(normals,axis=1)
  ids=np.flatnonzero((sign*normals[:,axis]>length*.95)&(length>1e-14))
  if not len(ids):continue
  for i in sorted(ids,key=lambda i:length[i],reverse=True):
   point=triangles[i].mean(0);pixel=np.round(xy(point)).astype(int)
   if not (0<=pixel[0]<w and 0<=pixel[1]<h and valid[pixel[1],pixel[0]]):continue
   covered=np.all(all_lo[:,uv]<=point[uv],axis=1)&np.all(all_hi[:,uv]>=point[uv],axis=1)&(all_top>sign*(point[axis]-plane)+1e-7);covered[mi]=False
   if covered.any():continue
   # A terminal may enclose a lower internal body. It does not occlude its own
   # upper metal face; clear only contained solids in this terminal footprint.
   contained=np.all(all_lo[:,uv]>=m['lo'][uv]-1e-7,axis=1)&np.all(all_hi[:,uv]<=m['hi'][uv]+1e-7,axis=1)&(all_top<=sign*(point[axis]-plane)+1e-7)&(all_top>=-1e-6)
   clear=[dict(mesh=int(j),rect=rect(meshes[j])) for j in np.flatnonzero(contained) if meshes[j] is not board]
   candidates.append(dict(id=len(candidates),source=m['name'],world=point.tolist(),uv=xy(point).tolist(),pixel=pixel.tolist(),rect=r,terminalMasks=clear));break
 # Reserve the exact manufacturer print so illustrative routes do not cross it.
 ink=np.zeros((h,w),dtype=bool)
 for layer in source.get('printLayers',[]):
  image=Image.open(ROOT/layer).getchannel('A').transpose(Image.Transpose.FLIP_TOP_BOTTOM).resize((w,h));ink|=np.array(image)>32
 exposed=[c for c in candidates if not ink[c['pixel'][1],c['pixel'][0]]]
 occupied=np.zeros((h,w),dtype=bool);routes=[];used=set();attempts=0
 pairs=sorted((math.dist(a['uv'],b['uv']),a['id'],b['id']) for i,a in enumerate(exposed) for b in exposed[i+1:] if math.dist(a['uv'],b['uv'])*cell<max(span)*policy['maximumPairDistanceFraction'])
 by_id={c['id']:c for c in exposed}
 def search(allowed,start,end):
  start=tuple(start);end=tuple(end);heap=[(0,start)];cost={start:0};prev={};visited=set()
  while heap and len(visited)<policy['maxSearchCells']:
   _,p=heapq.heappop(heap)
   if p in visited:continue
   visited.add(p)
   if p==end:
    path=[p]
    while p!=start:p=prev[p];path.append(p)
    return path[::-1]
   for dx,dy in [(1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)]:
    q=(p[0]+dx,p[1]+dy)
    if not(0<=q[0]<w and 0<=q[1]<h and allowed[q[1],q[0]]):continue
    if dx and dy and not(allowed[p[1],q[0]] and allowed[q[1],p[0]]):continue
    g=cost[p]+math.hypot(dx,dy)
    if g<cost.get(q,math.inf):cost[q]=g;prev[q]=p;heapq.heappush(heap,(g+math.dist(q,end),q))
  return None
 for distance,aid,bid in pairs:
  if len(routes)>=policy['maxRoutes'] or attempts>=policy['maxPairAttempts']:break
  if aid in used or bid in used:continue
  attempts+=1;ends=[by_id[aid],by_id[bid]];blocked=counts.copy()
  cleared=set()
  for c in ends:
   for mask in c['terminalMasks']:
    key=mask['mesh'];r=mask['rect']
    if key in cleared:continue
    cleared.add(key);x0,y0,x1,y1=r;blocked[y0:y1+1,x0:x1+1]=np.maximum(blocked[y0:y1+1,x0:x1+1].astype(int)-1,0)
  obstacles=(blocked>0)|ink|occupied|~valid
  obstacles=np.array(Image.fromarray(obstacles).filter(ImageFilter.MaxFilter(policy['clearanceCells']*2+1)),dtype=bool)
  allowed=~obstacles
  if not all(allowed[c['pixel'][1],c['pixel'][0]] for c in ends):continue
  route=search(allowed,ends[0]['pixel'],ends[1]['pixel'])
  if not route:continue
  # Exact material points replace grid endpoints. No new pads/vias are drawn.
  points=[ends[0]['uv']]+[list(p) for p in route[1:-1]]+[ends[1]['uv']]
  routes.append(dict(endpoints=[aid,bid],points=[[p[0]*cell/span[0],p[1]*cell/span[1]] for p in points]));used.update([aid,bid])
  for x,y in route:occupied[y,x]=True
 corners=[]
 for a,b in [(0,0),(1,0),(1,1),(0,1)]:
  p=[0.,0.,0.];p[axis]=plane;p[uv[0]]=float(low[0]+a*span[0]);p[uv[1]]=float(low[1]+b*span[1]);corners.append(p)
 normal=[0.,0.,0.];normal[axis]=sign
 return dict(baseGLBSHA256=source['baseGLBSHA256'],nativeSHA256=sha,version=policy['version'],status='illustrative_pad_routes' if routes else 'no_evaluable_pad_pairs',corners=corners,normal=normal,size=[round(policy['textureMax']*s/max(span)) for s in span],anchors=[c for c in exposed if c['id'] in used],routes=routes,audit=dict(candidateContacts=len(candidates),visibleContacts=len(exposed),routes=len(routes),attempts=attempts,totalMs=(time.perf_counter()-started)*1000,method='Existing classified CAD contact surfaces, conservative component boxes, actual PCB support and printed-art exclusion; bounded A* with both endpoints on contacts. No electrical correspondence inferred.'))
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('sources');parser.add_argument('output');args=parser.parse_args();sources=read(args.sources);assets=[]
 for source in sources['assets']:
  result=prepare(source);assets.append(result);print(json.dumps(result['audit']))
 Path(args.output).write_text(json.dumps(dict(version=1,assets=assets),indent=2)+'\n',encoding='utf-8')
