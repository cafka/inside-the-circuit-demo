import copy,itertools,unittest
import common as c
e=c.engine;np=c.np;P=c.read(c.HERE/'policy.json')

def fixture():
    xy=[[30,40],[180,30],[330,70],[40,220],[210,180],[340,240],[160,350]]
    objects=[{'object_id':'part-'+str(i),'region_polygon':[[x,y],[x+35,y],[x+35,y+25],[x,y+25]]} for i,(x,y) in enumerate(xy)]
    r={'objects':objects};profile={'reference':{'assetToPlane':np.eye(3).tolist()}}
    regions=[{'regionId':'r'+str(i),'polygon':o['region_polygon'],'originalLabels':['untrusted'],'reliability':1.} for i,o in enumerate(objects)]
    return r,profile,regions

class DynamicContracts(unittest.TestCase):
    def test_more_than_five_neighbors(self):
        r,p,o=fixture();v=e.associate(r,p,o,np.eye(3),P)
        self.assertTrue(v['solver']['exact']);self.assertTrue(all(x['neighborCount']==6 for x in v['objects']))
        self.assertEqual([x['observationIndex'] for x in v['objects']],list(range(7)))
    def test_missing_neighbors_do_not_force_assignment(self):
        r,p,o=fixture();v=e.associate(r,p,o[:4],np.eye(3),P)
        self.assertTrue(all(x['neighborCount']<=3 for x in v['objects']));self.assertEqual(sum(x['region'] is not None for x in v['objects']),4)
    def test_no_catalog_size_cap_thirteen_objects_twelve_neighbors(self):
        r,p,o=fixture()
        for i in range(7,13):
            x=30+(i-7)*90;y=500
            polygon=[[x,y],[x+35,y],[x+35,y+25],[x,y+25]]
            r['objects'].append({'object_id':'additional-'+str(i),'region_polygon':polygon})
            o.append({'regionId':'r'+str(i),'polygon':polygon,'originalLabels':[],'reliability':1.})
        v=e.associate(r,p,o,np.eye(3),P)
        self.assertTrue(v['solver']['exact']);self.assertTrue(all(x['neighborCount']==12 for x in v['objects']))
    def test_exact_solver_matches_bruteforce(self):
        unary=np.array([[.2,.8],[.7,.1],[.5,.9]]);pair=np.ones((3,3,2,2))*.2
        result=e.solve(unary,pair,P);best=1e9
        for a in itertools.product([-1,0,1],repeat=3):
            used=[i for i in a if i>=0]
            if len(used)!=len(set(used)):continue
            score=sum(P['unknownCost'] if k<0 else unary[i,k] for i,k in enumerate(a))
            score+=P['relationWeight']/2*sum(pair[i,j,a[i],a[j]] for i in range(3) for j in range(i+1,3) if a[i]>=0 and a[j]>=0)
            best=min(best,score)
        self.assertAlmostEqual(result['cost'],best)
    def test_rotation_and_renaming(self):
        r,p,o=fixture();H=np.array([[-1,0,450],[0,-1,450],[0,0,1]])
        for x in o:x['polygon']=e.project(H,x['polygon']).tolist()
        for i,x in enumerate(r['objects']):x['object_id']='renamed-'+str(30-i)
        v=e.associate(r,p,o,H,P);self.assertEqual(v['solver']['assignment'],list(range(7)))
    def test_duplicate_boxes_one_region(self):
        pred={'objects':[{'reference_id':i,'status':'matched','capture_box_normalized':[10,20,50,70]} for i in ['a','b']]};before=copy.deepcopy(pred)
        self.assertEqual(len(e.observations(pred,[480,860])),1);self.assertEqual(pred,before)
    def test_temporal_full_resolution_and_translation(self):
        rng=np.random.default_rng(10);a=rng.integers(0,256,(160,180,3),dtype=np.uint8);b=np.roll(a,1,axis=1)
        f,back,_=e.dense_motion(a,b,P);self.assertEqual(f.shape,(160,180,2))
        points=np.array([[x,y] for y in range(20,140,8) for x in range(20,160,8)],np.float32);m=e.motion_fit(points,f,back,P)
        self.assertIsNotNone(m['matrix']);self.assertLess(abs(m['matrix'][0][2]-1),.2)
    def test_failed_reverse_flow_rejects_motion(self):
        f=np.ones((80,90,2),np.float32)*10;b=np.zeros_like(f);points=np.array([[20+x,20+y] for x in range(10) for y in range(10)])
        self.assertIsNone(e.motion_fit(points,f,b,P)['matrix'])

if __name__=='__main__':unittest.main()
