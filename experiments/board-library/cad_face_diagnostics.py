"""Conservative diagnosis of non-tessellating faces. No mesh repair or source edits."""
import numpy as np
from OCP.BRep import BRep_Tool
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_EDGE
from OCP.TopoDS import TopoDS
from OCP.TopLoc import TopLoc_Location
from OCP.BRepAdaptor import BRepAdaptor_Curve,BRepAdaptor_Surface
from OCP.BRepGProp import BRepGProp
from OCP.GProp import GProp_GProps
from OCP.BRepCheck import BRepCheck_Analyzer
def inspect_face(face):
    props=GProp_GProps();BRepGProp.SurfaceProperties_s(face,props)
    edges=[];points=[];ex=TopExp_Explorer(face,TopAbs_EDGE)
    while ex.More():
        edge=TopoDS.Edge_s(ex.Current());curve=BRepAdaptor_Curve(edge);samples=[]
        for t in np.linspace(curve.FirstParameter(),curve.LastParameter(),33):
            p=curve.Value(float(t));samples.append([p.X(),p.Y(),p.Z()])
        points+=samples;edges.append(dict(type=str(curve.GetType()),degenerated=BRep_Tool.Degenerated_s(edge),toleranceMm=BRep_Tool.Tolerance_s(edge),start=samples[0],end=samples[-1]));ex.Next()
    a=np.array(points);_,sv,v=np.linalg.svd(a-a.mean(0),full_matrices=False);spans=np.ptp(a@v.T,axis=0)
    mesh=BRep_Tool.Triangulation_s(face,TopLoc_Location())
    return dict(validTopology=BRepCheck_Analyzer(face).IsValid(),surface=str(BRepAdaptor_Surface(face).GetType()),signedAreaMm2=props.Mass(),faceToleranceMm=BRep_Tool.Tolerance_s(face),triangles=mesh.NbTriangles() if mesh else 0,edgeCount=len(edges),edges=edges,samplePrincipalSpansMm=spans.tolist(),sampleSingularValues=sv.tolist(),allEdgesLinear=all('Line' in e['type'] for e in edges))

def classify_face(detail):
    span=detail.get('samplePrincipalSpansMm',[]);tol=detail.get('faceToleranceMm',0)
    planar='Plane' in detail.get('surface','');precision=min(tol,1024*np.finfo(float).eps*max(span[0],1.0)) if len(span)==3 else 0
    justified=planar and detail.get('allEdgesLinear') and len(span)==3 and tol>0 and span[0]>tol and not detail.get('validTopology',True) and max(span[1:])<=precision and abs(detail['signedAreaMm2'])<=precision*span[0]
    return dict(policy='missing-cad-face/1',status='collapsed_linear_boundary' if justified else 'unresolved',renderExclusionJustified=bool(justified),reason='All linear boundary segments lie on one line within numerical precision and the source face tolerance; no resolved two-dimensional surface.' if justified else 'No conservative degeneracy proof. Do not treat a small signed area alone as sufficient.',toleranceMm=tol,numericalCollinearityBoundMm=precision,upperPlanarAreaMm2=span[0]*max(span[1:]) if len(span)==3 else None,sourceTopologyRemainsInvalid=not detail.get('validTopology',False))
