import unittest,json
from pathlib import Path
from verify import fit_pose,camera_for_focal,np,cv2
POLICY=json.loads(Path(__file__).with_name('policy.json').read_text())
class PoseChecks(unittest.TestCase):
 def test_independent_objects_and_wrong_holdout(self):
  a=np.array([[-40,-25,0],[0,-25,4],[40,-25,1],[-40,25,3],[0,25,0],[40,25,6],[-32,0,2],[32,0,5]],np.float64)
  k=camera_for_focal(np.hypot(1280,960),1280,960);r=np.array([.18,.08,.04]);t=np.array([0.,0.,130.]);b=cv2.projectPoints(a,r,t,k,None)[0].reshape(-1,2)
  roles=['fit']*6+['holdout']*2;good=fit_pose(a,b,roles,1280,960,POLICY);self.assertTrue(good['heldoutCheck']);self.assertTrue(good['coverageCheck']);self.assertLess(good['fitRmsPx'],.01)
  altered=b.copy();altered[-2:]=altered[-2:][::-1];bad=fit_pose(a,altered,roles,1280,960,POLICY);self.assertFalse(bad['heldoutCheck']);self.assertEqual(good['fitIndices'],bad['fitIndices']);self.assertEqual(good['K'],bad['K'])
 def test_insufficient_points_do_not_fabricate_pose(self):
  result=fit_pose([[0,0,0]],[[10,10]],['fit'],100,100,POLICY);self.assertEqual(result['status'],'undetermined')
if __name__=='__main__':unittest.main()
