import sys,json,time,hashlib,copy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'.local/discovery-python'))
def deny_evaluation(event,args):
    if event=='open' and isinstance(args[0],(str,bytes)):
        name=str(args[0]).replace('\\','/').lower()
        if any(token in name for token in ['historical-16.json','catalog-enrichment.json','oracle.json','/evaluation-only/']):raise PermissionError('Evaluation input prohibited during inference')
sys.addaudithook(deny_evaluation)
import cv2,numpy as np
from PIL import Image,ImageDraw,ImageFont
import engine
cv2.setNumThreads(1)
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=False)
base=ROOT/'experiments/multimodal-cad';inventory=read(base/'fixtures/candidates.json');render=read(base/'fixtures/render.json')
g=read(ROOT/'experiments/visual-anchors/policy-v1.json');n=read(ROOT/'experiments/dynamic-neighborhood/policy.json');e=read(ROOT/'experiments/component-parallax/policy.json')['segmentation'];p=read(ROOT/'experiments/pcb-perimeter/policy.json')['priorityWeights']
rows=[]
for name,target,operation in [('a','a','original'),('b','b','original'),('a-180','a','rotate180'),('blank','a','uniform_negative')]:
    image=base/f'fixtures/target-{target}.jpg';callfile=base/f'results/live/cad-target-{target}.json';call=read(callfile);items=copy.deepcopy(call['parsed']['items']);rgb=np.array(Image.open(image).convert('RGB'));h,w=rgb.shape[:2]
    if operation=='rotate180':
        rgb=rgb[::-1,::-1].copy()
        for item in items:
            if item.get('photoBox'):
                a,b,c,d=item['photoBox'];item['photoBox']=[1000-c,1000-d,1000-a,1000-b];item['photoAnchor']=[1000-x for x in item['photoAnchor']]
    if operation=='uniform_negative':rgb=np.full_like(rgb,127)
    result=engine.run(inventory,render,items,rgb,g,n,e,p)
    result.update(case=name,operation=operation,imageSHA256=sha(image),processedPixelsSHA256=hashlib.sha256(rgb.tobytes()).hexdigest(),responseSHA256=sha(callfile),proposalCount=len(items),newInferenceCalls=0,newCloudCostUSD=0,officialReferenceSHA256=next(x['sha256'] for x in call['filesRead'] if x['name']=='reference.png'))
    (out/f'{name}.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n',encoding='utf8')
    canvas=Image.fromarray(rgb);d=ImageDraw.Draw(canvas);width=max(2,w//400)
    for item in items:
        if item.get('photoBox'):
            y0,x0,y1,x1=item['photoBox'];d.rectangle((x0*w/1000,y0*h/1000,x1*w/1000,y1*h/1000),outline='#64c8e6',width=width)
    if result['geometry']:
        H=np.array(result['geometry']['matrix']);poly=result['geometry']['outline'];d.line([tuple(x) for x in poly]+[tuple(poly[0])],fill='#ffad45',width=width+1)
        for row in result['neighborhood']['objects']:
            if row['region']:
                poly=row['projectedPolygon'];d.line([tuple(x) for x in poly]+[tuple(poly[0])],fill='#e16bda',width=width)
    canvas.thumbnail((1200,950));panel=Image.new('RGB',(max(canvas.width,800),canvas.height+140),'#102333');panel.paste(canvas,(0,120));d=ImageDraw.Draw(panel)
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',18) if Path('C:/Windows/Fonts/arial.ttf').exists() else ImageFont.load_default(size=18)
    status=result['geometry']['status'] if result['geometry'] else 'sin transformación'
    for y,text in enumerate([name+' · '+status+' · NO es registro métrico validado','Celeste: observaciones Gemini conservadas. Naranja: PCB estimado; magenta: regiones proyectadas.','Proyección ≠ detección. No se corrigen las cajas originales.','Foto A: SimonWaldherr CC BY-SA 4.0 · B: RetroEditor CC BY 4.0']):d.text((12,8+y*26),text,font=font,fill='white')
    panel.save(out/f'{name}.jpg',quality=92)
    row={'case':name,'proposals':len(items),'anchors':len(result['anchors']),'geometry':result['geometry'],'neighborhoodAssigned':sum(x['region'] is not None for x in result['neighborhood']['objects']) if result['neighborhood'] else 0,'contoursPassing':sum(x['accepted'] for x in result['contours']),'structurallySupported':sum(x['structurallySupported'] for x in result['contours']),'verifiedLinks':0,'timeMs':result['timingMs']};rows.append(row);print(json.dumps(row),flush=True)
paths=['experiments/recovered-spatial-cad/engine.py','experiments/recovered-spatial-cad/PROTOCOL.md','experiments/dynamic-neighborhood/engine.py','src/visual-anchors/engine.py','experiments/visual-anchors/policy-v1.json','experiments/dynamic-neighborhood/policy.json','experiments/component-parallax/policy.json','experiments/pcb-perimeter/policy.json']
(out/'summary.json').write_text(json.dumps({'cases':rows,'codeAndPolicies':{p:sha(ROOT/p) for p in paths},'newCloudCostUSD':0,'inferenceType':'saved Gemini replay; new geometry computation','historicalTableRead':False},indent=2)+'\n',encoding='utf8')
