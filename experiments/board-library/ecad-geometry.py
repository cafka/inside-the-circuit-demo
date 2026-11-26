"""Read-only Altium geometry. Format fields follow KiCad's Altium reader.
No board recipe, model names, selected designators or photograph coordinates.
Coordinates are mm relative to the document origin; top is positive Z.
"""
import importlib.util, json, math, struct, zipfile, hashlib,zlib
from pathlib import Path
import numpy as np
spec=importlib.util.spec_from_file_location('pcb_reader',Path(__file__).with_name('extract-pcb-presentation.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
mm=lambda x:float(str(x).replace('mil',''))*.0254
unit=.00000254
def embedded_fonts(archive):
 with zipfile.ZipFile(archive) as z:
  entries=[i for i in z.infolist() if i.filename.lower().endswith('.pcbdoc')]
  if len(entries)!=1:return {}
  data=r.streams(z.read(entries[0])).get('/EmbeddedFonts6/Data',b'')
 result={};q=0
 while q<len(data):
  names=[]
  for _ in range(3):
   n=r.u32(data,q);q+=4;assert n<=1024 and q+n<=len(data),'invalid_embedded_font_name';names.append(data[q:q+n].decode('utf-16le').rstrip('\0'));q+=n
  q+=3;n=r.u32(data,q);q+=4;assert n<4*1024**2 and q+n<=len(data),'invalid_embedded_font_size'
  stream=zlib.decompressobj();font=stream.decompress(data[q:q+n],4*1024**2);q+=n;assert stream.eof and font[:4] in [b'\0\1\0\0',b'OTTO'],'invalid_embedded_font'
  result[names[1]]=font
 return result
def read_ecad(archive):
 with zipfile.ZipFile(archive) as z:
  entries=[i for i in z.infolist() if i.filename.lower().endswith('.pcbdoc')]
  assert len(entries)==1 and entries[0].file_size<64*1024**2,'pcb_document_ambiguous_or_too_large'
  data=z.read(entries[0]);s=r.streams(data)
 board=r.properties(s['/Board6/Data'])[0];origin=np.array([mm(board['ORIGINX']),mm(board['ORIGINY'])])
 xy=lambda v:(np.array(v)*unit-origin).tolist()
 components=r.properties(s['/Components6/Data']);nets=r.properties(s['/Nets6/Data'])
 safe=[]
 for i,c in enumerate(components):
  safe.append(dict(index=i,designator=c.get('SOURCEDESIGNATOR'),description=c.get('SOURCEDESCRIPTION'),footprint=c.get('PATTERN'),side=c.get('LAYER'),center=[mm(c['X'])-origin[0],mm(c['Y'])-origin[1]],rotation=float(c.get('ROTATION',0)),height=mm(c.get('HEIGHT','0mil'))))
 outline=[];i=0
 while 'VX'+str(i) in board:
  outline.append([mm(board['VX'+str(i)])-origin[0],mm(board['VY'+str(i)])-origin[1]]);i+=1
 # Vertices are registration landmarks only, never a replacement for curved CAD edges.
 bodies=[]
 for (v,) in r.records(s.get('/ComponentBodies6/Data',b''),12,1):
  ci=struct.unpack_from('<H',v,7)[0];p=r.properties(v[18:22+r.u32(v,18)])[0];q=22+r.u32(v,18);n=r.u32(v,q);q+=4
  points=[xy(struct.unpack_from('<dd',v,q+16*j)) for j in range(n)]
  if ci>=len(safe) or not points:continue
  ident=p.get('IDENTIFIER','');ident=''.join(chr(int(a)) for a in ident.split(',') if a.isdigit())
  bodies.append(dict(component=ci,polygon=points,modelType=p.get('MODEL.MODELTYPE'),modelName=p.get('MODEL.NAME'),identifier=ident,minZ=mm(p.get('MODEL.EXTRUDED.MINZ',p.get('STANDOFFHEIGHT','0mil'))),maxZ=mm(p.get('MODEL.EXTRUDED.MAXZ',p.get('OVERALLHEIGHT','0mil')))))
 pads=[]
 for parts in r.records(s.get('/Pads6/Data',b''),2,6):
  v=parts[4];ci=struct.unpack_from('<H',v,7)[0];ni=struct.unpack_from('<H',v,3)[0]
  pads.append(dict(layer=v[0],center=xy(struct.unpack_from('<ii',v,13)),component=ci if ci<len(safe) else None,pin=parts[0][1:].decode('latin1'),net=nets[ni].get('NAME') if ni<len(nets) else None,size=[n*unit for n in struct.unpack_from('<ii',v,21)],hole=struct.unpack_from('<i',v,45)[0]*unit,shape=v[49],rotation=struct.unpack_from('<d',v,52)[0],plated=bool(v[60])))
 regions=[]
 for (v,) in r.records(s.get('/Regions6/Data',b''),11,1):
  if v[0] not in (33,34):continue # Altium Top/Bottom Overlay, format constants.
  nh=struct.unpack_from('<H',v,14)[0];q=22+r.u32(v,18);contours=[]
  for _ in range(nh+1):
   n=r.u32(v,q);q+=4;contours.append([xy(struct.unpack_from('<dd',v,q+16*j)) for j in range(n)]);q+=16*n
  assert q==len(v),'unsupported_region_fields'
  regions.append(dict(layer=v[0],contours=contours))
 tracks=[];arcs=[];texts=[]
 for (v,) in r.records(s.get('/Tracks6/Data',b''),4,1):
  if v[0] in (33,34):tracks.append(dict(layer=v[0],start=xy(struct.unpack_from('<ii',v,13)),end=xy(struct.unpack_from('<ii',v,21)),width=struct.unpack_from('<i',v,29)[0]*unit))
 for (v,) in r.records(s.get('/Arcs6/Data',b''),1,1):
  if v[0] in (33,34):arcs.append(dict(layer=v[0],center=xy(struct.unpack_from('<ii',v,13)),radius=struct.unpack_from('<i',v,21)[0]*unit,start=struct.unpack_from('<d',v,25)[0],end=struct.unpack_from('<d',v,33)[0],width=struct.unpack_from('<i',v,41)[0]*unit))
 for v,text in r.records(s.get('/Texts6/Data',b''),5,2):
  if v[0] not in (33,34):continue
  ci=struct.unpack_from('<H',v,7)[0];value=text[1:].decode('latin1').rstrip('\0')
  if len(v)>43 and ci<len(components):
   if v[41] and components[ci].get('NAMEON')=='FALSE':continue
   if v[40] and components[ci].get('COMMENTON')=='FALSE':continue
  texts.append(dict(layer=v[0],center=xy(struct.unpack_from('<ii',v,13)),height=struct.unpack_from('<i',v,21)[0]*unit,rotation=struct.unpack_from('<d',v,27)[0],mirrored=bool(v[35]),font=v[46:110].decode('utf-16le').split('\0')[0] if len(v)>110 else None,fontType=v[43] if len(v)>110 else 0,textBoundsMm=[n*unit for n in struct.unpack_from('<ii',v,124)] if len(v)>132 else None,text=value,component=ci if ci<len(safe) else None))
 return dict(sha256=hashlib.sha256(data).hexdigest(),member=entries[0].filename,origin=origin.tolist(),outline=outline,curvedOutline=any(board.get('KIND'+str(j))!='0' for j in range(i)),components=safe,bodies=bodies,pads=pads,regions=regions,tracks=tracks,arcs=arcs,texts=texts)

def read_glb(file):
 raw=Path(file).read_bytes();n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);binary=raw[28+n:];nodes=[]
 def accessor(index):
  a=g['accessors'][index];v=g['bufferViews'][a['bufferView']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];dims={'SCALAR':1,'VEC3':3,'VEC2':2,'VEC4':4}[a['type']];stride=v.get('byteStride',np.dtype(dtype).itemsize*dims)
  return np.ndarray((a['count'],dims),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(stride,np.dtype(dtype).itemsize)).copy()
 def visit(index,parent):
  node=g['nodes'][index];matrix=np.array(node.get('matrix',np.eye(4).T.flatten())).reshape(4,4).T
  if 'rotation' in node:raise ValueError('unsupported_glb_quaternion_use_cad_matrix')
  if 'translation' in node:matrix[:3,3]=node['translation']
  if 'scale' in node:matrix[:3,:3]@=np.diag(node['scale'])
  matrix=parent@matrix
  if 'mesh' in node:
   points=[];triangles=[];offset=0
   for p in g['meshes'][node['mesh']]['primitives']:
    a=accessor(p['attributes']['POSITION']);world=(np.c_[a,np.ones(len(a))]@matrix.T)[:,:3]*1000
    idx=accessor(p['indices']).reshape(-1,3) if 'indices' in p else np.arange(len(a)).reshape(-1,3)
    points.extend(world.tolist());triangles.extend((idx+offset).tolist());offset+=len(a)
   points=np.array(points);nodes.append(dict(index=index,name=node.get('name'),min=points.min(0).tolist(),max=points.max(0).tolist(),points=points,triangles=np.array(triangles)))
  for c in node.get('children',[]):visit(c,matrix)
 for index in g['scenes'][g.get('scene',0)]['nodes']:visit(index,np.eye(4))
 return nodes
