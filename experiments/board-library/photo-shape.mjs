// Observed shape contract, independent of board identity, CAD and evaluation data.
// A convex exterior is a segmentation seed, never an accepted contour.
export function validVisiblePolygon(polygon, box) {
 if (polygon === undefined || polygon === null) return true;
 if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > 12) return false;
 if (polygon.some(p => !Array.isArray(p) || p.length !== 2 || p.some(n => !Number.isFinite(n) || n < 0 || n > 1000))) return false;
 const [y0,x0,y1,x1]=box;
 if (polygon.some(([x,y])=>x<x0||x>x1||y<y0||y>y1)) return false;
 let sign=0,area=0;
 for(let i=0;i<polygon.length;i++){
  const a=polygon[i],b=polygon[(i+1)%polygon.length],c=polygon[(i+2)%polygon.length];
  const cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
  if(cross===0)return false;
  if(sign&&Math.sign(cross)!==sign)return false;
  sign=Math.sign(cross);area+=a[0]*b[1]-b[0]*a[1];
 }
 // Reject crossed polygons even if their local winding happens to agree.
 for(let i=0;i<polygon.length;i++)for(let j=i+1;j<polygon.length;j++){
  if(j===i+1||(i===0&&j===polygon.length-1))continue;
  const a=polygon[i],b=polygon[(i+1)%polygon.length],c=polygon[j],d=polygon[(j+1)%polygon.length];
  const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  if(cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0)return false;
 }
 return Math.abs(area)>0;
}
