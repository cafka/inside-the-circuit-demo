"""Read-only audit and isolated generic healing attempt on untessellated faces."""
import sys,json,time,hashlib
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[2];sys.path.insert(0,str(root/'.local/cad-native'))
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TDocStd import TDocStd_Document
from OCP.TCollection import TCollection_ExtendedString
from OCP.XCAFDoc import XCAFDoc_DocumentTool
from OCP.TDF import TDF_LabelSequence
from OCP.IFSelect import IFSelect_RetDone
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRep import BRep_Tool
from OCP.TopoDS import TopoDS
from OCP.TopLoc import TopLoc_Location
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_FACE,TopAbs_EDGE
from OCP.BRepAdaptor import BRepAdaptor_Curve,BRepAdaptor_Surface
from OCP.BRepGProp import BRepGProp
from OCP.GProp import GProp_GProps
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.BRepBuilderAPI import BRepBuilderAPI_Copy
from OCP.ShapeFix import ShapeFix_Face

from cad_face_diagnostics import inspect_face, classify_face

start=time.perf_counter();source=Path(sys.argv[1]);doc=TDocStd_Document(TCollection_ExtendedString('BinXCAF'));reader=STEPCAFControl_Reader();assert reader.ReadFile(str(source))==IFSelect_RetDone;assert reader.Transfer(doc)
st=XCAFDoc_DocumentTool.ShapeTool_s(doc.Main());roots=TDF_LabelSequence();st.GetFreeShapes(roots);count=0;failed=[]
for i in range(1,roots.Length()+1):
    shape=st.GetShape_s(roots.Value(i));BRepMesh_IncrementalMesh(shape,.05,False,.3,True);ex=TopExp_Explorer(shape,TopAbs_FACE)
    while ex.More():
        face=TopoDS.Face_s(ex.Current());count+=1;mesh=BRep_Tool.Triangulation_s(face,TopLoc_Location())
        if mesh is None or mesh.NbTriangles()==0:
            before=inspect_face(face);copy=TopoDS.Face_s(BRepBuilderAPI_Copy(face).Shape());fix=ShapeFix_Face(copy);changed=fix.Perform();healed=fix.Face();BRepMesh_IncrementalMesh(healed,.05,False,.3,True);after=inspect_face(healed)
            failed.append(dict(index=count,before=before,classification=classify_face(before),repairAttempt=dict(method='ShapeFix_Face on isolated copy; same tessellation parameters',changed=changed,after=after),sourceUnchanged=True))
        ex.Next()
result=dict(sourceSHA256=hashlib.sha256(source.read_bytes()).hexdigest(),cadFaces=count,missingFaces=failed,totalMs=(time.perf_counter()-start)*1000,sourceModified=False)
result['policy']='missing-cad-face/1';result['justifiedDegenerateFaces']=sum(f['classification']['renderExclusionJustified'] for f in failed);result['unresolvedMissingFaces']=len(failed)-result['justifiedDegenerateFaces']
Path(sys.argv[2]).write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
