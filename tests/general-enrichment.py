"""Independent synthetic layouts and contradiction controls for frame registration."""
import sys,json,importlib.util,copy,math,tempfile,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'.local/discovery-python'))
import numpy as np
spec=importlib.util.spec_from_file_location('named',ROOT/'experiments/board-library/register-named-ecad.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def sample(width,depth,translation):
 coords=[(.12,.16),(.18,.74),(.75,.83),(.81,.21),(.25,.87),(.7,.12),(.8,.43),(.42,.62)]
 data={'outline':[[0,0],[width,0],[width,depth],[0,depth]],'components':[],'bodies':[]}
 shift=np.array(translation);nodes=[dict(index=0,name='substrate',min=(shift+[0,-1,-depth]).tolist(),max=(shift+[width,0,0]).tolist())]
 for i,(x,y) in enumerate(coords):
  x*=width;y*=depth;w=1+i*.04;h=1.4+i*.07;name='P'+str(i)
  p=[[x-w,y-h],[x+w,y-h],[x+w,y+h],[x-w,y+h]];data['components'].append(dict(designator=name,side='TOP'));data['bodies'].append(dict(component=i,modelType='1',polygon=p,minZ=0,maxZ=1))
  nodes.append(dict(index=i+1,name='shape',chain=((100+i,name),(i+1,'shape')),min=(shift+[x-w,0,-y-h]).tolist(),max=(shift+[x+w,1,-y+h]).tolist()))
 return data,nodes

for size,shift in [((80,31),[0,0,0]),((53,97),[142,17,-29])]:
 data,nodes=sample(*size,shift);r=m.register(data,nodes);assert r['status']=='verified',r;assert r['fit']==4 and r['heldout']==4
 contradictory=copy.deepcopy(nodes)
 for i in [2,4,6,8]:contradictory[i]['min'][0]+=4;contradictory[i]['max'][0]+=4
 assert m.register(data,contradictory)['status']!='verified'
 ambiguous=copy.deepcopy(nodes);ambiguous[1]['chain']=((102,'P2'),(1,'shape'))
 assert m.register(data,ambiguous)['status']!='verified'
print(json.dumps({'differentSyntheticLayouts':2,'verified':2,'contradictoryHoldoutControlsRejected':2,'ambiguousDesignatorControlsRejected':2,'realBoardGeneralityClaim':False}))

# Independent colour control: a small saturated island must not replace the substrate.
from PIL import Image,ImageDraw
spec=importlib.util.spec_from_file_location('surfaces',ROOT/'experiments/board-library/prepare-board-surfaces.py');surfaces=importlib.util.module_from_spec(spec);spec.loader.exec_module(surfaces)
with tempfile.TemporaryDirectory() as tmp:
 im=Image.new('RGB',(320,180),'white');d=ImageDraw.Draw(im);d.rectangle((10,20,300,140),fill=(20,90,160));d.rectangle((260,60,280,110),fill=(80,140,20));f=Path(tmp)/'reference.png';im.save(f)
 r=surfaces.observed_colour([dict(url='https://manufacturer.example/board.png',path=str(f),sha256='synthetic')],2.4)
 assert r['selected']['rgb'][2]>.5 and r['selected']['rgb'][0]<.1,r
 # A monochrome mechanical illustration supplies no reliable mask colour.
 Image.new('RGB',(320,180),'gray').save(f)
 assert surfaces.observed_colour([dict(url='https://manufacturer.example/board.png',path=str(f),sha256='synthetic')],2.4)['status']=='undetermined'
print(json.dumps({'colourIslandRejected':True,'monochromeAbstained':True}))

# A source CAD node using glTF TRS must align identically to a matrix node.
with tempfile.TemporaryDirectory() as tmp:
 points=np.array([[1,0,0],[0,1,0],[0,0,0]],dtype='<f4').tobytes()
 g={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':'assembly','translation':[.01,.02,.03],'rotation':[0,0,math.sqrt(.5),math.sqrt(.5)],'children':[1]},{'name':'body','mesh':0}], 'meshes':[{'primitives':[{'attributes':{'POSITION':0}}]}], 'buffers':[{'byteLength':len(points)}], 'bufferViews':[{'buffer':0,'byteLength':len(points)}], 'accessors':[{'bufferView':0,'componentType':5126,'count':3,'type':'VEC3'}]}
 def write_glb(g):
  js=json.dumps(g).encode();js+=b' '*((-len(js))%4);f=Path(tmp)/'trs.glb';f.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(points))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(points),0x004e4942)+points);return f
 r=m.reg.ec.read_glb(write_glb(g));assert np.allclose(r[0]['points'],[[10,1020,30],[-990,20,30],[10,20,30]]);assert r[0]['chain']==((0,'assembly'),(1,'body'))
 g['nodes'][0]['rotation']=[0,0,1,1]
 try:m.reg.ec.read_glb(write_glb(g));raise AssertionError('invalid quaternion accepted')
 except ValueError as e:assert str(e)=='invalid_glb_unit_quaternion'
print(json.dumps({'sourceTRSAndAncestryVerified':True,'invalidQuaternionRejected':True}))
