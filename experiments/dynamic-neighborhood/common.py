import hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'.local/discovery-python'))
import cv2,numpy as np
from PIL import Image
import engine
cv2.setNumThreads(1);Image.init();np.unique(np.array([0,1]))
def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p,value):
    Path(p).parent.mkdir(parents=True,exist_ok=True)
    def convert(x):
        if isinstance(x,np.generic):return x.item()
        raise TypeError(type(x).__name__)
    with Path(p).open('x',encoding='utf-8',newline='\n') as f:json.dump(value,f,ensure_ascii=False,allow_nan=False,separators=(',',':'),default=convert);f.write('\n')
def initial_seeds(reference,prediction,baseline,prior,size):
    hs=[h for h in baseline['hypotheses'] if h['eligible']];n=max(len(h['supportIds']) for h in hs);hs=[h for h in hs if len(h['supportIds'])==n]
    seeds=[{'id':'similarity-'+str(i),'matrix':h['model']['matrix2x3']+[[0,0,1]],'origin':'saved_Gemini_correspondences','supportIds':h['supportIds']} for i,h in enumerate(hs)]
    refs={o['object_id']:engine.center(o['region_polygon']) for o in reference['objects']};w,h=size;obs={}
    for o in prediction['objects']:
        b=o['capture_box_normalized']
        if b is not None:obs[o['reference_id']]=[(b[1]+b[3])*w/2000,(b[0]+b[2])*h/2000]
    for index,ids in enumerate(sorted({tuple(h['supportIds']) for h in hs})):
        src=np.array([refs[k] for k in ids]);dst=np.array([obs[k] for k in ids]);A=np.c_[src,np.ones(len(src))];coef,_,rank,_=np.linalg.lstsq(A,dst,rcond=None)
        if rank==3:seeds.append({'id':'affine-coherent-'+str(index),'matrix':np.vstack([coef.T,[0,0,1]]).tolist(),'origin':'affine_fit_of_coherent_Gemini_group_approximate_not_metric','supportIds':list(ids)})
    if prior['matrix'] is not None:seeds.append({'id':'previous-440-hypothesis','matrix':prior['matrix'],'origin':'previous_pixel_homography_REJECTED_not_validation','supportIds':[]})
    return seeds
