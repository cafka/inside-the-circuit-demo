"""Synthetic negative control, never counted as a physical-board test."""
import sys,json,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.local/discovery-python'))
from PIL import Image
with tempfile.TemporaryDirectory(prefix='itc-photo-negative-') as directory:
 p=Path(directory);image=p/'blank.png';Image.new('RGB',(960,720),(160,160,160)).save(image)
 request=p/'request.json';request.write_text(json.dumps({'image':str(image),'proposals':[{'id':'neutral','status':'proposed','box':[200,200,600,600]}]}))
 r=json.loads(subprocess.check_output([sys.executable,str(ROOT/'experiments/board-library/verify-photo-proposals.py'),str(request)],cwd=ROOT,text=True,timeout=60))
 assert r['cadCoordinatesUsed'] is False and r['semanticIdentityVerified'] is False
 assert r['width']==960 and r['analysis']['width']==640
 assert not r['components'][0]['verification']['accepted']
 print(json.dumps({'evidenceKind':'synthetic_uniform_background','accepted':False,'reasons':r['components'][0]['verification']['reasons'],'totalMs':r['totalMs']}))
