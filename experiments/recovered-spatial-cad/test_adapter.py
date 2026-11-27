import sys,json,copy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'.local/discovery-python'))
import numpy as np,cv2
import engine
from unittest.mock import patch
cv2.setNumThreads(1)
def read(p):return json.loads((ROOT/p).read_text(encoding='utf8'))
G=read('experiments/visual-anchors/policy-v1.json');N=read('experiments/dynamic-neighborhood/policy.json');E=read('experiments/component-parallax/policy.json')['segmentation'];P=read('experiments/pcb-perimeter/policy.json')['priorityWeights']
def fixture(shape=(100,60),side='front'):
    width,height=shape;points=np.array([[.1,.15],[.45,.12],[.8,.2],[.14,.7],[.5,.55],[.82,.68],[.3,.85],[.68,.88]])*[width,height]
    inv={'axes':{'u':0,'v':1,'n':2},'support':{'boundsMm':[[0,0,0],[width,height,1.6]]},'candidates':[]};views={'views':[{'side':side,'objects':[]}]};items=[];rgb=np.zeros((800,1200,3),np.uint8)
    H=np.array([[6,-1,220],[1,6,100],[0,0,1.]])
    for i,(x,y) in enumerate(points):
        name='anonymous-'+str(i);dx=2+i*.2;dy=3+i*.2;c={'id':name,'boundsMm':[[x-dx,y-dy,1.6],[x+dx,y+dy,3.6]]};inv['candidates'].append(c)
        views['views'][0]['objects'].append({'id':name,'anchorMm':[x,y,3.6]});q=engine.project(H,[[x-dx,y-dy],[x+dx,y-dy],[x+dx,y+dy],[x-dx,y+dy]]);a,b=q.min(0),q.max(0);anchor=engine.project(H,[[x,y]])[0]
        cv2.polylines(rgb,[q.astype(np.int32)],True,(255,255,255),2)
        items.append({'candidateId':name,'view':side,'status':'matched','photoBox':[a[1]/.8,a[0]/1.2,b[1]/.8,b[0]/1.2],'photoAnchor':(anchor/[1.2,.8]).tolist(),'alternatives':[]})
    return inv,views,items,rgb
def run(f):return engine.run(*f,G,N,E,P)
class Contracts(unittest.TestCase):
    def test_no_texture_search_or_tracking_is_called(self):
        with patch.object(engine.models,'search',side_effect=AssertionError('NCC search forbidden')), patch.object(engine.models,'correlation',side_effect=AssertionError('NCC forbidden')), patch.object(engine.neighbors,'dense_motion',side_effect=AssertionError('Tracking forbidden')):
            self.assertTrue(run(fixture())['geometry']['reservedPassed'])
    def test_two_layouts_fit_without_names_or_historical_table(self):
        for shape in [(100,60),(80,90)]:
            r=run(fixture(shape));self.assertTrue(r['geometry']['reservedPassed']);self.assertFalse(r['metricPCBValidated']);self.assertEqual(r['verifiedPhotoCADLinks'],0)
    def test_heldout_corruption_cannot_change_model(self):
        f=fixture();a=run(f);ids=set(a['geometry']['reserveIds']);b=copy.deepcopy(f)
        for item in b[2]:
            if item['candidateId'] in ids:item['photoAnchor'][0]+=150
        altered=run(b);self.assertEqual(a['geometry']['matrix'],altered['geometry']['matrix']);self.assertFalse(altered['geometry']['reservedPassed'])
    def test_reverse_visibility_is_not_hardcoded_to_front(self):
        r=run(fixture(side='back'));self.assertTrue(r['geometry']['reservedPassed']);self.assertEqual(len(r['neighborhood']['objects']),8)
    def test_uniform_image_does_not_validate_even_with_exact_coordinates(self):
        f=list(fixture());f[3]=np.zeros_like(f[3]);r=run(f);self.assertTrue(r['geometry']['reservedPassed']);self.assertFalse(any(c['accepted'] for c in r['contours']));self.assertEqual(r['verifiedPhotoCADLinks'],0)
    def test_duplicate_boxes_and_ambiguous_identities_are_not_fit_anchors(self):
        f=list(fixture());f[2][1]['photoBox']=f[2][0]['photoBox'];f[2][2]['alternatives']=['anonymous-3'];r=run(f);self.assertEqual(len(r['anchors']),6);self.assertEqual(len(r['rejectedProposals']),2)
if __name__=='__main__':unittest.main()
