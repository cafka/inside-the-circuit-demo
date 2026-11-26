// Fit real model bounds to a UI-free rectangle. No board-specific dimensions.
// The off-axis projection preserves the orbit target at the model centre.
export function frameInViewport(camera,box,outward,{width,height,left,right,top,bottom}){
 const Vector3=box.min.constructor;
 const radius=box.getSize(new Vector3()).length()/2;
 camera.clearViewOffset();camera.position.copy(outward);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
 const horizontal=new Vector3().setFromMatrixColumn(camera.matrixWorld,0),vertical=new Vector3().setFromMatrixColumn(camera.matrixWorld,1);
 const tan=Math.tan(camera.fov*Math.PI/360),corners=[];
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(new Vector3(x,y,z));
 const fx=(right-left)/width,fy=(bottom-top)/height;
 const distance=Math.max(radius,...corners.map(p=>p.dot(outward)+Math.max(Math.abs(p.dot(horizontal))/(tan*camera.aspect*fx),Math.abs(p.dot(vertical))/(tan*fy))));
 camera.position.copy(outward).multiplyScalar(distance);camera.near=Math.max(radius/1000,.000001);camera.far=radius*100;camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
 const points=corners.map(p=>p.clone().project(camera));
 const minY=Math.min(...points.map(p=>(1-p.y)*height/2)),maxY=Math.max(...points.map(p=>(1-p.y)*height/2));
 // Put 28% of unused vertical room above the board, the rest below it.
 const desiredTop=top+Math.max(0,bottom-top-(maxY-minY))*.28;
 camera.setViewOffset(width,height,(width-left-right)/2,minY-desiredTop,width,height);
 return {version:'useful-viewport/1',safe:{left,right,top,bottom},distance,radius};
}
