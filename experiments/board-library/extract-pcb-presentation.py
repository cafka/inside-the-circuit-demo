"""Read a documented subset of Altium PCB data for optional viewer artwork.

No CAD-import/recognition pipeline changes. Units: Altium 1/10000 mil -> mm.
Binary-field reference: KiCad pcb_io/altium/altium_parser_pcb.cpp (Pads6,
Regions6). This independent, read-only reader rejects unsupported records.
Board selection, appearance and source hashes belong in the input profile.
"""
import argparse, hashlib, io, json, math, struct, sys, zipfile
from pathlib import Path
from PIL import Image, ImageDraw

DIR = Path(__file__).resolve().parent
ROOT = DIR.parent.parent
u32 = lambda b, p=0: struct.unpack_from('<I', b, p)[0]
sha = lambda b: hashlib.sha256(b).hexdigest()

def streams(data):
    assert data[:8] == bytes.fromhex('d0cf11e0a1b11ae1'), 'Not CFB'
    size = 1 << struct.unpack_from('<H', data, 30)[0]
    block = lambda i: data[(i+1)*size:(i+2)*size]
    ids = list(struct.unpack_from('<109I', data, 76)); nxt = u32(data, 68)
    while nxt < 0xfffffffa:
        b = block(nxt); ids += list(struct.unpack_from('<'+str(size//4-1)+'I', b)); nxt = u32(b, size-4)
    fat = []
    for i in ids:
        if i < 0xfffffffa: fat += list(struct.unpack('<'+str(size//4)+'I', block(i)))
    def chain(i, table, fetch):
        chunks = []; seen = set()
        while i < 0xfffffffa:
            assert i not in seen and i < len(table), 'Invalid CFB chain'
            seen.add(i); chunks.append(fetch(i)); i = table[i]
        return b''.join(chunks)
    directory = chain(u32(data, 48), fat, block); entries = []
    for p in range(0, len(directory), 128):
        b = directory[p:p+128]; n = struct.unpack_from('<H', b, 64)[0]
        entries.append(dict(name=b[:max(0,n-2)].decode('utf-16le'), type=b[66], left=u32(b,68), right=u32(b,72), child=u32(b,76), start=u32(b,116), size=struct.unpack_from('<Q',b,120)[0]))
    mini = chain(entries[0]['start'],fat,block); raw = chain(u32(data,60),fat,block)
    mfat = struct.unpack('<'+str(len(raw)//4)+'I',raw); result = {}
    def walk(i, parent):
        if i >= len(entries): return
        e = entries[i]; walk(e['left'],parent); name = parent+'/'+e['name']
        if e['type'] == 2:
            result[name] = (chain(e['start'],mfat,lambda s:mini[s*64:(s+1)*64]) if e['size']<4096 else chain(e['start'],fat,block))[:e['size']]
        if e['type'] == 1: walk(e['child'],name)
        walk(e['right'],parent)
    walk(entries[0]['child'],''); return result

def properties(data):
    p=0; result=[]
    while p < len(data):
        n=u32(data,p); p+=4
        result.append(dict(s.split('=',1) for s in data[p:p+n].decode('latin1').strip('\0').split('|') if '=' in s)); p+=n
    assert p==len(data); return result

def records(data, tag, count):
    p=0
    while p<len(data):
        assert data[p]==tag, ('Unsupported record',p,data[p]); p+=1; parts=[]
        for _ in range(count):
            n=u32(data,p);p+=4;parts.append(data[p:p+n]);p+=n
        yield parts
    assert p==len(data)

def extract(config):
    archive=(ROOT/config['archive']).read_bytes(); assert sha(archive)==config['archiveSHA256']
    raw=zipfile.ZipFile(io.BytesIO(archive)).read(config['member'])
    s=streams(raw); board=properties(s['/Board6/Data'])[0]
    mm=lambda v: float(v.removesuffix('mil'))*.0254
    origin=[mm(board['ORIGINX']),mm(board['ORIGINY'])]
    xy=lambda values:[round(v*.00000254-o,7) for v,o in zip(values,origin)]
    outline=[];i=0
    while 'VX'+str(i) in board:
        assert board['KIND'+str(i)]=='0','Curved board outline requires a supported adapter'
        outline.append([mm(board['VX'+str(i)])-origin[0],mm(board['VY'+str(i)])-origin[1]]);i+=1
    components=properties(s['/Components6/Data']); nets=properties(s['/Nets6/Data']);pads=[]
    for parts in records(s['/Pads6/Data'],2,6):
        v=parts[4]; assert len(v)>=110; ci=struct.unpack_from('<H',v,7)[0]; ni=struct.unpack_from('<H',v,3)[0]
        pads.append(dict(layer=v[0],xy=xy(struct.unpack_from('<ii',v,13)),component=components[ci]['SOURCEDESIGNATOR'] if ci<len(components) else None,
            pin=parts[0][1:].decode('latin1'),net=nets[ni]['NAME'] if ni<len(nets) else None,
            size=[round(n*.00000254,7) for n in struct.unpack_from('<ii',v,21)],hole=round(struct.unpack_from('<i',v,45)[0]*.00000254,7),
            shape=v[49],rotation=struct.unpack_from('<d',v,52)[0],plated=bool(v[60])))
    regions=[]
    for (v,) in records(s['/Regions6/Data'],11,1):
        if v[0] not in config['silkLayers']: continue
        holecount=struct.unpack_from('<H',v,14)[0]; q=22+u32(v,18);nv=u32(v,q);q+=4
        def contour(n):
            nonlocal q
            result=[xy(struct.unpack_from('<dd',v,q+16*i)) for i in range(n)];q+=16*n;return result
        outer=contour(nv);holes=[]
        for _ in range(holecount):
            nv=u32(v,q);q+=4;holes.append(contour(nv))
        assert q==len(v), 'Unsupported extra region fields'
        regions.append(dict(layer=v[0],outer=outer,holes=holes))
    return dict(pcbSHA256=sha(raw),originMm=origin,outlineMm=outline,pads=pads,regions=regions)

def build(config, data, out):
    # Existing OpenCascade toolchain; optional presentation asset only. Original
    # component GLB is never rewritten. The new substrate uses PCB CAD drills.
    sys.path.insert(0,str(ROOT/'.local/cad-native'))
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakePolygon, BRepBuilderAPI_MakeFace
    from OCP.BRepPrimAPI import BRepPrimAPI_MakePrism, BRepPrimAPI_MakeCylinder
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Common, BRepAlgoAPI_Fuse
    from OCP.BRep import BRep_Builder
    from OCP.BRepMesh import BRepMesh_IncrementalMesh
    from OCP.gp import gp_Pnt,gp_Vec,gp_Ax1,gp_Ax2,gp_Dir,gp_Trsf
    from OCP.TopoDS import TopoDS_Compound,TopoDS
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_FACE
    from OCP.GeomAbs import GeomAbs_Cylinder
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
    from OCP.TDocStd import TDocStd_Document
    from OCP.TCollection import TCollection_ExtendedString,TCollection_AsciiString
    from OCP.XCAFDoc import XCAFDoc_DocumentTool,XCAFDoc_ColorGen
    from OCP.TDataStd import TDataStd_Name
    from OCP.Quantity import Quantity_Color,Quantity_TOC_sRGB
    from OCP.RWGltf import RWGltf_CafWriter
    from OCP.RWMesh import RWMesh_CoordinateSystem_Zup,RWMesh_CoordinateSystem_Yup
    from OCP.TColStd import TColStd_IndexedDataMapOfStringString
    from OCP.Message import Message_ProgressRange
    thickness=config['thicknessMm']; builder=BRep_Builder()
    def compound():
        shape=TopoDS_Compound();builder.MakeCompound(shape);return shape
    def cylinder(x,y,r):
        return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x,y,-thickness-1),gp_Dir(0,0,1)),r,thickness+2).Shape()
    def polygon_face(points,z):
        wire=BRepBuilderAPI_MakePolygon()
        for x,y in points:wire.Add(gp_Pnt(x,y,z))
        wire.Close();return BRepBuilderAPI_MakeFace(wire.Wire()).Face()
    footprint=polygon_face(data['outlineMm'][:-1],0)
    base=BRepPrimAPI_MakePrism(footprint,gp_Vec(0,0,-thickness)).Shape()
    # Only configured, reviewed terminal families + free mounting drills.
    pads=[p for p in data['pads'] if p['component'] in config['terminalDesignators']]
    holes=[p for p in data['pads'] if p['hole']>0 and (p['component'] in config['terminalDesignators'] or p['component'] is None)]
    cutters=compound()
    for p in holes:builder.Add(cutters,cylinder(*p['xy'],p['hole']/2))
    substrate=BRepAlgoAPI_Cut(base,cutters).Shape();contacts=compound()
    for p in pads:
        # The small edge drill pads have no annular ring (diameter < drill).
        if min(p['size'])<=p['hole']:continue
        assert p['shape']==1,'Only round/oblong terminals supported by this adapter'
        w,h=p['size'];r=min(w,h)/2;half=abs(w-h)/2
        # Circular/oblong face assembled from rectangular centre + round ends.
        points=[[-half,-r],[half,-r],[half,r],[-half,r]]
        face=polygon_face(points,0) if half>1e-9 else None
        from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge,BRepBuilderAPI_MakeWire
        from OCP.gp import gp_Circ
        for cx in sorted(set([-half,half])):
            circle=gp_Circ(gp_Ax2(gp_Pnt(cx,0,0),gp_Dir(0,0,1)),r)
            disk=BRepBuilderAPI_MakeFace(BRepBuilderAPI_MakeWire(BRepBuilderAPI_MakeEdge(circle).Edge()).Wire()).Face()
            face=BRepAlgoAPI_Fuse(face,disk).Shape() if face is not None else disk
        tr=gp_Trsf();tr.SetRotation(gp_Ax1(gp_Pnt(0,0,0),gp_Dir(0,0,1)),math.radians(p['rotation']+(90 if h>w else 0)))
        face=BRepBuilderAPI_Transform(face,tr).Shape();tr=gp_Trsf();tr.SetTranslation(gp_Vec(*p['xy'],0));face=BRepBuilderAPI_Transform(face,tr).Shape()
        face=BRepAlgoAPI_Common(face,footprint).Shape();face=BRepAlgoAPI_Cut(face,cutters).Shape()
        for z in [0.008,-thickness-0.008]: # render separation only, not plating thickness
            tr=gp_Trsf();tr.SetTranslation(gp_Vec(0,0,z));builder.Add(contacts,BRepBuilderAPI_Transform(face,tr).Shape())
    # True drill walls, including the half-cylinders of castellated contacts.
    ex=TopExp_Explorer(substrate,TopAbs_FACE); substrate_faces=compound()
    while ex.More():
        face=TopoDS.Face_s(ex.Current());surface=BRepAdaptor_Surface(face)
        metal_wall=False
        if surface.GetType()==GeomAbs_Cylinder:
            c=surface.Cylinder();loc=c.Location()
            metal_wall=any(p['plated'] and math.hypot(loc.X()-p['xy'][0],loc.Y()-p['xy'][1])<1e-4 for p in holes)
        builder.Add(contacts if metal_wall else substrate_faces,face)
        ex.Next()
    substrate=substrate_faces
    doc=TDocStd_Document(TCollection_ExtendedString('BinXCAF'));st=XCAFDoc_DocumentTool.ShapeTool_s(doc.Main());ct=XCAFDoc_DocumentTool.ColorTool_s(doc.Main())
    for name,shape,color in [('substrate',substrate,config['substrateSRGB']),('terminals',contacts,config['terminalSRGB'])]:
        label=st.AddShape(shape,False);TDataStd_Name.Set_s(label,TCollection_ExtendedString(name));ct.SetColor(label,Quantity_Color(*color,Quantity_TOC_sRGB),XCAFDoc_ColorGen)
        mesh=BRepMesh_IncrementalMesh(shape,.018,False,.2,True);assert mesh.IsDone()
    output=out/'pcb-details.glb';writer=RWGltf_CafWriter(TCollection_AsciiString(str(output)),True);writer.SetMergeFaces(True)
    c=writer.ChangeCoordinateSystemConverter();c.SetInputLengthUnit(.001);c.SetOutputLengthUnit(1);c.SetInputCoordinateSystem(RWMesh_CoordinateSystem_Zup);c.SetOutputCoordinateSystem(RWMesh_CoordinateSystem_Yup)
    assert writer.Perform(doc,TColStd_IndexedDataMapOfStringString(),Message_ProgressRange())
    width=max(x for x,y in data['outlineMm']);height=max(y for x,y in data['outlineMm']);scale=config['textureWidth']/width
    artwork=[]
    for layer in config['silkLayers']:
        im=Image.new('RGBA',(config['textureWidth'],round(height*scale)))
        for region in data['regions']:
            if region['layer']!=layer:continue
            mask=Image.new('RGBA',im.size);draw=ImageDraw.Draw(mask);pt=lambda p:(p[0]*scale,(height-p[1])*scale)
            draw.polygon([pt(p) for p in region['outer']],fill=(245,247,245,255))
            for hole in region['holes']:draw.polygon([pt(p) for p in hole],fill=(0,0,0,0))
            im.alpha_composite(mask)
        # Artwork is ink on the substrate, never a sheet across an open drill.
        draw=ImageDraw.Draw(im)
        for hole in holes:
            x,y=hole['xy'];r=hole['hole']/2
            draw.ellipse([(x-r)*scale,(height-y-r)*scale,(x+r)*scale,(height-y+r)*scale],fill=(0,0,0,0))
        file=out/('silk-'+str(layer)+'.png');im.save(file,optimize=True)
        artwork.append(dict(file=file.name,sha256=sha(file.read_bytes()),bytes=file.stat().st_size,size=list(im.size),sourceRegions=sum(r['layer']==layer for r in data['regions'])))
    return dict(geometrySHA256=sha(output.read_bytes()),bytes=output.stat().st_size,terminals=len(set((p['component'],p['pin']) for p in pads)),drills=len(holes),silk=artwork)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('profile');p.add_argument('output');a=p.parse_args()
    config=json.loads(Path(a.profile).read_text(encoding='utf-8'));out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
    data=extract(config);(out/'pcb-data.json').write_text(json.dumps(data,indent=2),encoding='utf-8')
    result=build(config,data,out);(out/'manifest.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
