"""Controlled offline A/B, never a new inference or original browser timing.

Run with the public source JPEG. Its encoding differs from the browser capture;
the input hash is recorded and no claim of byte-identical live replay is made.
"""
import json,sys,subprocess,tempfile,hashlib,platform
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
image=Path(sys.argv[1]).resolve()
output=Path(sys.argv[2]) if len(sys.argv)>2 else ROOT/'experiments/photo-evidence-v2/results/seed-replay.json'
rows=[]
for name in ['clear-live.json','clear-gated-live.json']:
    observation=json.loads((ROOT/'experiments/photo-evidence-v2/results/live'/name).read_text(encoding='utf8'))
    for mode in ['box','shape']:
        proposals=json.loads(json.dumps(observation['proposals']))
        with tempfile.TemporaryDirectory(prefix='itc-seed-replay-') as temporary:
            request=Path(temporary)/'request.json'
            payload={'image':str(image),'proposals':proposals}
            if mode=='shape':payload['experimentalVisibleShapeSeeds']=True
            request.write_text(json.dumps(payload),encoding='utf8')
            raw=subprocess.check_output([sys.executable,str(ROOT/'experiments/board-library/verify-photo-proposals.py'),str(request)],cwd=ROOT,timeout=60,text=True,encoding='utf8')
        result=json.loads(raw)
        if mode=='box':assert not any(c.get('shapeProposalUsed') for c in result['components'])
        rows.append({'observation':name,'mode':mode,'originalCaptureSHA256':observation['captureSHA256'],
            'exactLiveCaptureReplayed':result['inputSHA256']==observation['captureSHA256'],'verification':result})
report={'schema':'seed-replay/1','evidenceKind':'offline_same_source_image_AB_not_new_Gemini_inference',
    'environment':{'platform':platform.platform(),'python':platform.python_version(),'threads':1},
    'inputSHA256':hashlib.sha256(image.read_bytes()).hexdigest(),'rows':rows}
output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps([{'file':r['observation'],'mode':r['mode'],'accepted':[c['id'] for c in r['verification']['components'] if c['verification'].get('accepted')],'ms':r['verification']['totalMs']} for r in rows]))
