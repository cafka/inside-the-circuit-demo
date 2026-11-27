"""Display real saved proposals; never manufacture a registered CAD overlay."""
import sys,json,hashlib,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'.local/discovery-python'))
from PIL import Image,ImageDraw,ImageFont
work=Path(sys.argv[1]);out=ROOT/'experiments/multimodal-cad/results';out.mkdir(exist_ok=True);(out/'live').mkdir(exist_ok=True)
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def save(p,v):Path(p).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
font_path=Path('C:/Windows/Fonts/arial.ttf');font=ImageFont.truetype(str(font_path),19) if font_path.exists() else ImageFont.load_default(size=19)
small=ImageFont.truetype(str(font_path),15) if font_path.exists() else ImageFont.load_default(size=15)
evaluation=read(work/'evaluation/evaluation.json');save(out/'evaluation.json',evaluation)
for p in (work/'calls').glob('*target*.json'):shutil.copy2(p,out/'live'/p.name)
base=read(work/'baseline-verification.json');save(out/'baseline-verification.json',base)
summary={'schema':'multimodal-cad-summary/1','cases':[],'historicalClearCardsOpened':3,'newVerifiedCADLinks':0,'newVerifiedCards':0,'modelVersionReturned':None,'apiCostEstimateUSD':sum(c['estimatedCostUSD'] for c in evaluation['calls']),'costIsInvoice':False,'mainOrDeploymentChanged':False}
for case in ['a','b']:
 call=read(work/f'calls/cad-target-{case}.json');v=read(work/f'check-{case}/verification.json');save(out/f'verification-{case}.json',v)
 pixels={p['id']:p['verification'] for p in v['pixelVerification']['components']}
 photo=Image.open(work/f'inputs/target-{case}.jpg').convert('RGB');draw=ImageDraw.Draw(photo);w,h=photo.size
 for item in call['parsed']['items']:
  if not item['photoBox']:continue
  y0,x0,y1,x1=item['photoBox'];box=(x0*w/1000,y0*h/1000,x1*w/1000,y1*h/1000);accepted=pixels.get(item['candidateId'],{}).get('accepted',False);color='#26becf' if accepted else '#f6a85c'
  draw.rectangle(box,outline=color,width=max(3,round(w/400)));label=item['candidateId'];boxLabel=(box[0],box[1]-max(23,h/70),box[0]+max(55,w/40),box[1]);draw.rectangle(boxLabel,fill='#182b3f');draw.text((boxLabel[0]+3,boxLabel[1]+2),label,fill='white',font=font)
 photo.thumbnail((1000,770));cad=Image.open(work/'inputs/front-labelled.png').convert('RGB');cad.thumbnail((700,580));canvas=Image.new('RGB',(1740,930),'#eef2f7');d=ImageDraw.Draw(canvas)
 d.text((24,18),'CAD + foto · '+case.upper()+' · REGISTRO NO DETERMINADO',font=font,fill='#172c40')
 d.text((24,52),'Cajas originales de Gemini. Celeste: pasa control de píxeles; naranja: rechazo/ambigüedad.',font=font,fill='#172c40')
 d.text((24,82),'Ningún color confirma identidad ni vínculo foto → CAD. No se calculó una pose respaldada.',font=font,fill='#172c40')
 canvas.paste(photo,(20,145));canvas.paste(cad,(1030,145));d.text((1040,740),'CAD oficial · grupos extraídos automáticamente',font=small,fill='#172c40')
 d.text((1040,770),'Sin tabla histórica de identidades como entrada',font=small,fill='#172c40')
 d.text((24,885),'Foto A: SimonWaldherr, CC BY-SA 4.0 · Foto B: RetroEditor, CC BY 4.0 · CAD: Raspberry Pi Ltd, MIT',font=small,fill='#172c40')
 canvas.save(out/f'diagnostic-{case}.jpg',quality=93)
 rows=[]
 for p in call['parsed']['items']:
  check=pixels.get(p['candidateId']);reasons=['alternative_identity'] if p['alternatives'] else check.get('reasons',[]) if check else ['not_visible_in_declared_CAD_view']
  rows.append({'id':p['candidateId'],'name':p['name'],'pixelAccepted':bool(check and check['accepted']),'reasons':reasons,'cadLinkVerified':False,'cardStatus':'proposal_pending_geometry_and_documentary_review'})
 summary['cases'].append({'case':case,'photographSHA256':v['imageSHA256'],'proposals':len(call['parsed']['items']),'unambiguousProposals':len(v['pixelVerification']['components']),'pixelAccepted':sum(r['pixelAccepted'] for r in rows),'fitObjects':v['pose']['fitCount'],'heldoutObjects':v['pose']['holdoutCount'],'pose':v['pose'],'inferenceMs':call['inferenceMs'],'pixelAndPoseMs':v['elapsedMs'],'items':rows})
accepted={p['id'] for p in base['components'] if p['verification']['accepted']};summary['newBaseline']={'proposed':len(evaluation['baselineBindings']),'pixelAccepted':len(accepted),'cardEligibleIds':[p['componentId'] for p in evaluation['baselineBindings'] if p['componentId'] and p['id'] in accepted],'freshBrowserCardClicks':0,'note':'Same JPEG as case A; eligibility replay after real new inference, not a click measurement.'}
save(out/'summary.json',summary)
print(json.dumps(summary,ensure_ascii=True))
