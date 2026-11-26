"""Bake additive planar CAD graphics. No OCR, font reconstruction or board names.

Requires two native glTF exports in the same world coordinate system. Every old
physical mesh must still occur in the new export, including placement and colour.
Only additional thin surfaces supported by an unchanged planar body are accepted.
This optional presentation-asset preparation does not alter the CAD pipeline.
"""
import argparse, collections, hashlib, json, math, struct
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

def sha(b): return hashlib.sha256(b).hexdigest()
def load(file):
    raw=Path(file).read_bytes();length=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+length]);blob=raw[28+length:]
    def accessor(i):
        a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']]
        dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
        dim={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        offset=v.get('byteOffset',0)+a.get('byteOffset',0)
        size=np.dtype(dtype).itemsize
        return np.ndarray((a['count'],dim),dtype=dtype,buffer=blob,offset=offset,strides=(v.get('byteStride',size*dim),size)).copy()
    meshes=[]
    def visit(i,parent,chain):
        n=doc['nodes'][i];chain=chain+[n.get('name',str(i))]
        if 'matrix' in n:m=np.array(n['matrix']).reshape(4,4).T
        else:
            x,y,z,w=n.get('rotation',[0,0,0,1]);m=np.eye(4)
            m[:3,:3]=np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],[2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],[2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]])@np.diag(n.get('scale',[1,1,1]))
            m[:3,3]=n.get('translation',[0,0,0])
        world=parent@m
        if 'mesh' in n:
            for p in doc['meshes'][n['mesh']]['primitives']:
                assert p.get('mode',4)==4
                pos=accessor(p['attributes']['POSITION']).astype(float);pos=pos@world[:3,:3].T+world[:3,3]
                indices=accessor(p['indices']).reshape(-1,3)
                color=doc['materials'][p['material']]['pbrMetallicRoughness'].get('baseColorFactor',[1,1,1,1])
                signature=sha(np.round(pos,9).astype('<f8').tobytes()+indices.astype('<u4').tobytes()+np.array(color,dtype='<f8').tobytes())
                meshes.append(dict(name='/'.join(chain),pos=pos,indices=indices,color=color,signature=signature,lo=pos.min(0),hi=pos.max(0)))
        for child in n.get('children',[]):visit(child,world,chain)
    for i in doc['scenes'][doc.get('scene',0)]['nodes']:visit(i,np.eye(4),[])
    return meshes,sha(raw)

def extract(old_file,new_file,out,max_ink_mm=.05,resolution=1024):
    old,old_hash=load(old_file);new,new_hash=load(new_file)
    remaining=collections.Counter(m['signature'] for m in old);added=[]
    for m in new:
        if remaining[m['signature']]:remaining[m['signature']]-=1
        else:added.append(m)
    assert not sum(remaining.values()),'Physical geometry/placement/colour differs; do not overlay'
    assert added,'No additive graphics found'
    thickness=max_ink_mm/1000;groups=collections.defaultdict(list)
    for m in added:
        axis=int(np.argmin(m['hi']-m['lo']));assert m['hi'][axis]-m['lo'][axis]<=thickness,'Non-planar addition'
        groups[(axis,round(float((m['hi'][axis]+m['lo'][axis])/2),6))].append(m)
    out.mkdir(parents=True,exist_ok=True);layers=[]
    for gi,((axis,level),items) in enumerate(sorted(groups.items())):
        uv=[a for a in range(3) if a!=axis];lo=np.min([m['lo'] for m in items],axis=0);hi=np.max([m['hi'] for m in items],axis=0)
        supports=[]
        for m in old:
            if all(m['lo'][a]<=lo[a]+1e-7 and m['hi'][a]>=hi[a]-1e-7 for a in uv):
                for sign,key in [(-1,'lo'),(1,'hi')]:
                    plane=float(m[key][axis]);gap=abs(plane-level)
                    if gap<=thickness:supports.append((gap,m,sign,plane))
        assert supports,'No unchanged physical support plane'
        supports.sort(key=lambda r:r[0]);gap,support,sign,plane=supports[0]
        assert len({round(s[3],7) for s in supports if abs(s[0]-gap)<1e-8})==1,'Ambiguous support plane'
        support_plane=plane;plane=float(hi[axis] if sign>0 else lo[axis])
        low=support['lo'];high=support['hi'];size=[float(high[a]-low[a]) for a in uv]
        w,h=[max(1,round(resolution*s/max(size))) for s in size];scale=2
        image=Image.new('RGBA',(w*scale,h*scale));draw=ImageDraw.Draw(image)
        for m in items:
            # Source colours are kept. Rasterisation projects the actual triangles,
            # including holes in letters; no fonts or new text are introduced.
            linear=np.array(m['color'][:3]);srgb=np.where(linear<=.0031308,linear*12.92,1.055*np.power(linear,1/2.4)-.055)
            colour=tuple(np.round(srgb*255).astype(int))+(round(m['color'][3]*255),)
            p=m['pos'];xy=np.column_stack(((p[:,uv[0]]-low[uv[0]])/size[0]*(w*scale-1),(high[uv[1]]-p[:,uv[1]])/size[1]*(h*scale-1)))
            for tri in m['indices']:draw.polygon([tuple(xy[i]) for i in tri],fill=colour)
        image=image.resize((w,h),Image.Resampling.LANCZOS);file=out/f'official-marks-{new_hash[:12]}-{gi}.png';image.save(file,optimize=True)
        corners=[]
        for a,b in [(0,0),(1,0),(1,1),(0,1)]:
            p=[0.,0.,0.];p[axis]=plane;p[uv[0]]=float([low,high][a][uv[0]]);p[uv[1]]=float([low,high][b][uv[1]]);corners.append(p)
        normal=[0.,0.,0.];normal[axis]=sign
        layers.append(dict(file=file.name,sha256=sha(file.read_bytes()),bytes=file.stat().st_size,size=[w,h],corners=corners,normal=normal,sourceMeshes=len(items),sourceTriangles=sum(len(m['indices']) for m in items),support=support['name'],supportPlane=support_plane,maxProjectionDistanceMeters=max(abs(float(lo[axis])-plane),abs(float(hi[axis])-plane))))
    report=dict(version='additive-cad-graphics/1',oldGLBSHA256=old_hash,newGLBSHA256=new_hash,physicalMeshesUnchanged=len(old),additiveMeshes=len(added),maxInkThicknessMm=max_ink_mm,resolution=resolution,layers=layers,limitations=['Axis-aligned planar graphics in a shared verified CAD frame only. Other orientations require an explicit frame conversion.','Raster mipmaps lose detail at distance; no inscription is reconstructed.'])
    (out/'markings-extraction.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');return report

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('old');parser.add_argument('new');parser.add_argument('output');parser.add_argument('--max-ink-mm',type=float,default=.05);parser.add_argument('--resolution',type=int,default=1024);args=parser.parse_args()
    report=extract(args.old,args.new,Path(args.output),args.max_ink_mm,args.resolution);print(json.dumps({k:v for k,v in report.items() if k!='layers'}));print(json.dumps(report['layers']))
