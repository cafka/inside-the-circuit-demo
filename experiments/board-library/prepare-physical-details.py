"""Supplement only the substrate with source ECAD outline and through-drills.
Rigid registration is required. Original CAD components are never rewritten.
Unsupported curved outlines remain untouched instead of being polygonised.
"""
import json,struct,importlib.util,hashlib
from pathlib import Path
import numpy as np
spec=importlib.util.spec_from_file_location('builder',Path(__file__).with_name('extract-pcb-presentation.py'))
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)

def build(data,registration,model,out,appearance):
 if data['curvedOutline']:return dict(status='blocked',reason='curved_outline_adapter_not_available')
 if not any(p['hole']>0 and p['layer']==74 for p in data['pads']):return dict(status='not_applicable',reason='no_documented_through_drills')
 raw=Path(model).read_bytes();n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);node=g['nodes'][registration['boardNode']]
 colours=[g['materials'][p['material']].get('pbrMetallicRoughness',{}).get('baseColorFactor',[.5,.5,.5,1])[:3] for p in g['meshes'][node['mesh']]['primitives'] if 'material' in p]
 if not colours:return dict(status='blocked',reason='missing_substrate_source_colour')
 lin=colours[0];rgb=[12.92*x if x<=.0031308 else 1.055*x**(1/2.4)-.055 for x in lin]
 chosen=appearance.get('selected');rgb=chosen['rgb'] if chosen else rgb
 config=dict(thicknessMm=registration['thickness'],selection='documented_through_drills',substrateSRGB=rgb,terminalSRGB=[.74,.76,.78],textureWidth=2048,silkLayers=[])
 # The existing tessellator takes the same documented fields under older names.
 outline=data['outline'];outline=outline if outline[0]==outline[-1] else outline+[outline[0]]
 legacy=dict(outlineMm=outline,pads=[dict(p,xy=p['center']) for p in data['pads']],regions=[])
 info=builder.build(config,legacy,out);f=out/'pcb-details.glb';raw=f.read_bytes();n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);tail=raw[20+n:]
 T=np.array(registration['transform']);R=np.zeros((3,3));R[:,:2]=T[:,:2];R[registration['normal'],2]=registration['topSign'];G=np.array([[1,0,0],[0,0,1],[0,-1,0]])
 A=np.eye(4);A[:3,:3]=R@G.T;A[:3,3]=T[:,2]/1000
 roots=g['scenes'][g.get('scene',0)]['nodes'];g['nodes'].append(dict(name='documented-substrate-frame',matrix=A.T.flatten().tolist(),children=roots));g['scenes'][g.get('scene',0)]['nodes']=[len(g['nodes'])-1]
 js=json.dumps(g,separators=(',',':')).encode();js+=b' '*((-len(js))%4);f.write_bytes(struct.pack('<III',0x46546c67,2,20+len(js)+len(tail))+struct.pack('<II',len(js),0x4e4f534a)+js+tail)
 base=hashlib.sha256(Path(model).read_bytes()).hexdigest();target=f'{base[:16]}:node:{registration["boardNode"]}'
 return dict(status='source_ecad_supplement',baseGLBSHA256=base,file=f.name,sha256=hashlib.sha256(f.read_bytes()).hexdigest(),bytes=f.stat().st_size,replacesNodeIds=[target],materialBindings={'substrate':target},materials={'substrate':dict(role='soldermask',metalness=0,roughness=.42,clearcoat=.45,clearcoatRoughness=.28),'terminals':dict(metalness=1,roughness=.32)},terminals=info['terminals'],drills=info['drills'],dimensions=dict(thicknessMm=registration['thickness'],thicknessBasis='original_manufacturer_CAD',outlineBasis='manufacturer_ECAD',drillsBasis='manufacturer_multilayer_pad_records',illustrativeDimensions=False),renderOffsetsMm=dict(contacts=.008,meaning='render_separation_not_manufacturing_measure'),colourBasis='official_reference_visual_approximation' if chosen else 'original_CAD_colour',terminalFinish='neutral_satin_visual_approximation_not_alloy',componentGeometryChanged=False)
