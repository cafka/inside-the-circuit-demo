import {Box3,Vector3} from 'three';

// Tight clipping reduces depth quantisation at every orbit/zoom without moving
// CAD vertices. Works on both sides and at arbitrary board sizes.
export function fitDepthRange(camera,model){
 if(!model)return;
 const box=new Box3().setFromObject(model),radius=box.getSize(new Vector3()).length()/2;
 camera.updateMatrixWorld(true);
 const point=new Vector3();let closest=Infinity,farthest=-Infinity;
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
  point.set(x,y,z).applyMatrix4(camera.matrixWorldInverse);closest=Math.min(closest,-point.z);farthest=Math.max(farthest,-point.z);
 }
 camera.near=Math.max(radius*1e-4,closest*.5);camera.far=Math.max(camera.near*2,farthest+radius);
 camera.updateProjectionMatrix();
}
