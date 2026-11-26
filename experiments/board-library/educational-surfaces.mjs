// Synthetic extrusion walls are not observations of a component's back/sides.
// Mark only its textured, planar source face. Real CAD keeps all physical faces.
export function educationalSurface(mesh,component){
 if(component.geometryEvidence?.status!=='educational_relief_unknown_height')return true;
 const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
 if(!materials.some(m=>m.map))return false;
 const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;
 if(!p||!n||!p.count)return false;
 const nx=n.getX(0),ny=n.getY(0),nz=n.getZ(0),d=nx*p.getX(0)+ny*p.getY(0)+nz*p.getZ(0);
 for(let i=1;i<p.count;i++)if(Math.abs(nx*p.getX(i)+ny*p.getY(i)+nz*p.getZ(i)-d)>1e-7)return false;
 return true;
}
