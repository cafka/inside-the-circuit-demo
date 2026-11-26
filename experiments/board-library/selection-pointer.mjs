// Screen-space interaction contract, independent of CAD scale and board identity.
export const POINTER_POLICY=Object.freeze({version:'screen-selection/1',dragPixels:7,mouseRadius:8,touchRadius:16,maxTriangleSamplesPerMesh:96});

// OrbitControls must not rotate during the small involuntary motion of a tap.
// Once the threshold is crossed the full gesture belongs to the user, not selection.
export function orbitGestureGate(distance=POINTER_POLICY.dragPixels){
 const starts=new Map();let dragging=false;
 return {
  down(e){if(!starts.size)dragging=false;starts.set(e.pointerId,{x:e.clientX,y:e.clientY});},
  move(e){const s=starts.get(e.pointerId);if(!s)return false;if(starts.size>1)dragging=true;if(Math.hypot(e.clientX-s.x,e.clientY-s.y)>distance)dragging=true;return !dragging;},
  up(e){starts.delete(e.pointerId);},cancel(){starts.clear();dragging=false;}
 };
}

// These are alternatives offered to the user, never inferred identities.
// The callback must return actual visible surface samples, not just bounding boxes.
export function nearbyChoices(entries,point,radius,visibleSamples){
 const found=[];
 for(const entry of entries){
  const b=entry.bounds,dx=Math.max(b.left-point.x,0,point.x-b.right),dy=Math.max(b.top-point.y,0,point.y-b.bottom);
  if(Math.hypot(dx,dy)>radius)continue;
  const samples=visibleSamples(entry.id),distances=samples.map(p=>Math.hypot(p.x-point.x,p.y-point.y)),distance=Math.min(...distances);
  if(distance<=radius)found.push({id:entry.id,distance,point:samples[distances.indexOf(distance)]});
 }
 return found.sort((a,b)=>a.distance-b.distance);
}
