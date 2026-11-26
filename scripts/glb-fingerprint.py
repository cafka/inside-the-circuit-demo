"""Read-only portability diagnosis; never modifies or accepts a generated model."""
import hashlib,json,struct,sys
from pathlib import Path
b=Path(sys.argv[1]).read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);binary=b[28+n:]
sha=lambda x:hashlib.sha256(x).hexdigest()
out={'bytes':len(b),'sha256':sha(b),'jsonSHA256':sha(b[20:20+n]),'groups':{}}
groups={'POSITION':set(),'NORMAL':set(),'indices':set()}
for m in j['meshes']:
 for p in m['primitives']:
  for k in ['POSITION','NORMAL']:
   if k in p['attributes']:groups[k].add(p['attributes'][k])
  if 'indices' in p:groups['indices'].add(p['indices'])
for k,ids in groups.items():
 raw=bytearray();quantized=bytearray();canonical=bytearray();count=0
 for i in sorted(ids):
  a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC3':3}[a['type']];fmt={5126:'f',5125:'I',5123:'H'}[a['componentType']];size=struct.calcsize('<'+fmt);stride=v.get('byteStride',width*size);offset=v.get('byteOffset',0)+a.get('byteOffset',0)
  integer_values=[]
  for row in range(a['count']):
   data=binary[offset+row*stride:offset+row*stride+width*size];raw.extend(data);count+=width
   if fmt=='f':
    for x in struct.unpack('<'+fmt*width,data):quantized.extend(struct.pack('<q',round(x*(1e9 if k=='POSITION' else 1e6))))
   else:integer_values.extend(struct.unpack('<'+fmt*width,data))
  if integer_values:
   triangles=[]
   for t in range(0,len(integer_values),3):
    q=integer_values[t:t+3];triangles.append(min(tuple(q),tuple(q[1:]+q[:1]),tuple(q[2:]+q[:2])))
   for q in sorted(triangles):canonical.extend(struct.pack('<III',*q))
 out['groups'][k]={'scalars':count,'rawSHA256':sha(raw),'quantizedSHA256':sha(quantized) if quantized else None,'quantum':(1e-9 if k=='POSITION' else 1e-6) if quantized else None,'orientedTrianglesSHA256':sha(canonical) if canonical else None}
print(json.dumps(out,indent=2))
