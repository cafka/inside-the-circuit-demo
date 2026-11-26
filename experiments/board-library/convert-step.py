"""Parameterised adapter of cad-viewer/convert-native.py; same installed OCCT toolchain.
No board identities, component positions or colour classification in this converter.
"""
import sys, json, time, hashlib, argparse
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / '.local/cad-native'))
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TDocStd import TDocStd_Document
from OCP.TCollection import TCollection_ExtendedString, TCollection_AsciiString
from OCP.XCAFDoc import XCAFDoc_DocumentTool
from OCP.TDF import TDF_LabelSequence
from OCP.IFSelect import IFSelect_RetDone
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRep import BRep_Tool
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_FACE
from OCP.TopoDS import TopoDS
from OCP.TopLoc import TopLoc_Location
from OCP.RWGltf import RWGltf_CafWriter
from OCP.RWMesh import RWMesh_CoordinateSystem_Zup, RWMesh_CoordinateSystem_Yup, RWMesh_NameFormat_Product
from OCP.TColStd import TColStd_IndexedDataMapOfStringString
from OCP.Message import Message_ProgressRange

p=argparse.ArgumentParser()
p.add_argument('source');p.add_argument('output');p.add_argument('--sha256',required=True)
p.add_argument('--allow-incomplete-preview',action='store_true',help='Export surviving CAD faces with an explicit incomplete report; never repair or fill missing faces.')
a=p.parse_args();source=Path(a.source);output=Path(a.output)
assert hashlib.sha256(source.read_bytes()).hexdigest()==a.sha256,'source_hash_mismatch'
start=last=time.perf_counter();timings={}
def stage(name):
    global last
    now=time.perf_counter();timings[name]=(now-last)*1000;last=now
    print(json.dumps({'stage':name,'elapsedMs':(now-start)*1000}),flush=True)
doc=TDocStd_Document(TCollection_ExtendedString('BinXCAF'))
reader=STEPCAFControl_Reader();reader.SetColorMode(True);reader.SetNameMode(True)
assert reader.ReadFile(str(source))==IFSelect_RetDone,'step_read_failure'
stage('read')
assert reader.Transfer(doc),'step_transfer_failure'
stage('transfer')
shape_tool=XCAFDoc_DocumentTool.ShapeTool_s(doc.Main());roots=TDF_LabelSequence();shape_tool.GetFreeShapes(roots)
from cad_face_diagnostics import inspect_face, classify_face
faces=triangles=missing=0;missing_details=[]
for i in range(1,roots.Length()+1):
    shape=shape_tool.GetShape_s(roots.Value(i));mesher=BRepMesh_IncrementalMesh(shape,0.05,False,0.3,True)
    assert mesher.IsDone(),'tessellation_failure'
    ex=TopExp_Explorer(shape,TopAbs_FACE)
    while ex.More():
        mesh=BRep_Tool.Triangulation_s(TopoDS.Face_s(ex.Current()),TopLoc_Location());faces+=1
        if mesh is None or mesh.NbTriangles()==0:
            missing+=1
            from OCP.BRepGProp import BRepGProp
            from OCP.GProp import GProp_GProps
            from OCP.BRepCheck import BRepCheck_Analyzer
            from OCP.BRepAdaptor import BRepAdaptor_Surface
            face=TopoDS.Face_s(ex.Current());props=GProp_GProps();BRepGProp.SurfaceProperties_s(face,props)
            try: detail=inspect_face(face)
            except Exception as error: detail={'diagnosticError':type(error).__name__,'signedAreaMm2':props.Mass(),'validTopology':BRepCheck_Analyzer(face).IsValid(),'surface':str(BRepAdaptor_Surface(face).GetType())}
            detail['index']=faces;detail['classification']=classify_face(detail);missing_details.append(detail)
        else:triangles+=mesh.NbTriangles()
        ex.Next()
unresolved=sum(not d['classification']['renderExclusionJustified'] for d in missing_details)
if unresolved and not a.allow_incomplete_preview:
    output.with_suffix('.conversion-failure.json').write_text(json.dumps({'sourceSHA256':a.sha256,'cadFaces':faces,'missingFaces':missing,'missingDetails':missing_details,'geometryComplete':False}),encoding='utf-8')
    raise AssertionError(f'{missing} missing faces')
stage('triangulation')
writer=RWGltf_CafWriter(TCollection_AsciiString(str(output)),True)
writer.SetNodeNameFormat(RWMesh_NameFormat_Product);writer.SetMeshNameFormat(RWMesh_NameFormat_Product);writer.SetMergeFaces(True)
c=writer.ChangeCoordinateSystemConverter();c.SetInputLengthUnit(.001);c.SetOutputLengthUnit(1.)
c.SetInputCoordinateSystem(RWMesh_CoordinateSystem_Zup);c.SetOutputCoordinateSystem(RWMesh_CoordinateSystem_Yup)
assert writer.Perform(doc,TColStd_IndexedDataMapOfStringString(),Message_ProgressRange()),'export_failure'
stage('export')
report={'converter':'OpenCascade 7.9.3 / cadquery-ocp 7.9.3.1.1','sourceSHA256':a.sha256,
 'parameters':{'linearDeflectionMm':.05,'angularDeflectionRad':.3,'outputUnits':'meters','up':'Y'},
 'cadFaces':faces,'missingFaces':missing,'missingDetails':missing_details,'geometryComplete':missing==0,'justifiedDegenerateFaces':missing-unresolved,'unresolvedMissingFaces':unresolved,
 'status':'complete' if missing==0 else 'renderable_with_degenerate_source_faces' if unresolved==0 else 'incomplete_cad_preview','repairsPerformed':False,
 'nativeTriangles':triangles,'timingsMs':timings,'totalMs':(time.perf_counter()-start)*1000}
output.with_suffix('.conversion.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
