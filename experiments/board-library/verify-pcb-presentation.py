"""Independent dimensional/pinout checks for the registered viewer asset.
No image recognition or electrical continuity inference.
"""
import hashlib,importlib.util,json,re,struct
from pathlib import Path
DIR=Path(__file__).resolve().parent; ROOT=DIR.parent.parent
spec=importlib.util.spec_from_file_location('pcb_extract',DIR/'extract-pcb-presentation.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
config=json.loads((DIR/'nano-pcb-source.json').read_text(encoding='utf-8'));data=module.extract(config)
report={'date':'2026-11-25','checks':[],'rows':[],'sourcePCBHash':data['pcbSHA256']}
def check(name,condition):
    assert condition,name
    report['checks'].append(name)
check('CAD outline matches independent datasheet 43.18 × 17.78 mm',abs(max(x for x,y in data['outlineMm'])-43.18)<1e-6 and abs(max(y for x,y in data['outlineMm'])-17.78)<1e-6)
for row in config['pinoutCheck']['rows']:
    pads=sorted([p for p in data['pads'] if p['component']==row['designator'] and min(p['size'])>p['hole']],key=lambda p:p['xy'][0])
    check(row['designator']+' 15 drilled terminals',len(pads)==15 and all(abs(p['hole']-1.016)<1e-6 for p in pads))
    check(row['designator']+' documented pin order',[int(p['pin']) for p in pads]==row['pins'])
    for pad,label,gpio in zip(pads,row['labels'],row['gpio']):
        found=re.match(r'GPIO(\d+)',pad['net'] or '')
        # TX1 is named NetJP2_1 in CAD; check its semantic role in official pinout,
        # without asserting that the CAD net itself certifies GPIO43.
        if gpio is not None and found:check(row['designator']+' '+label+' GPIO agrees',int(found.group(1))==gpio)
        report['rows'].append({'row':row['designator'],'pin':pad['pin'],'label':label,'gpioFromPinout':gpio,'netFromCAD':pad['net'],'centerMm':pad['xy'],'holeMm':pad['hole']})
holes=[p for p in data['pads'] if p['component'] is None and p['hole']>0]
check('Four mounting holes agree with independent mechanical drawing',len(holes)==4 and all(abs(p['hole']-1.651)<1e-6 for p in holes) and {tuple(round(v,2) for v in p['xy']) for p in holes}=={(1.27,1.27),(1.27,16.51),(41.91,1.27),(41.91,16.51)})
source=(ROOT/'.local/board-library/research/model.glb').read_bytes();check('Original component GLB hash unchanged',hashlib.sha256(source).hexdigest()==config['baseGLBSHA256'])
g=json.loads(source[20:20+struct.unpack_from('<I',source,12)[0]]);primitive=g['meshes'][g['nodes'][2]['mesh']]['primitives'][0]
check('Source substrate is green and undrilled (12 triangles)',g['materials'][primitive['material']]['pbrMetallicRoughness']['baseColorFactor']==[0,0.2158605009317398,0,1] and g['accessors'][primitive['indices']]['count']==36)
report['greenTrace']={'STEP':'#123303 STYLED_ITEM → #259; #123310 COLOUR_RGB(0,0.501960785193,0)','GLB':'node 2 → mesh 0 → mat_0; linear RGB [0,0.2158605009317398,0]','viewer':'appearance.mjs keeps source hue, visual-profile.json multiplies pcb_soldermask by 0.42','correction':'Presentation asset replaces only the simplified substrate with manufacturer PCB geometry; photo-guided colour is not material-composition evidence.'}
registry=json.loads((DIR/'surface-markings.json').read_text(encoding='utf-8'));markings=next(a for a in registry['assets'] if a['baseGLBSHA256']==config['baseGLBSHA256'])
for layer in markings['layers']:
    check(layer['file']+' exact artwork hash',hashlib.sha256((DIR/'assets/surface-markings'/layer['file']).read_bytes()).hexdigest()==layer['sha256'])
    check(layer['file']+' UV frame preserves Arduino X/Y handedness',layer['corners'][0][2]>layer['corners'][2][2])
report['passed']=True;out=DIR/'results/nano-education';out.mkdir(parents=True,exist_ok=True);(out/'manufacturer-checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':True,'checks':len(report['checks']),'rows':len(report['rows'])}))
