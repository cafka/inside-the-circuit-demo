import {BufferGeometry,BufferAttribute,Box3,Sphere,Vector3} from 'three';

// Partition existing indexed triangles, preserving vertex attributes, winding,
// transforms and material groups. No boxes, inferred coordinates or new faces.
export function partitionGeometry(meshes,partitions=[]){
 const result=[...meshes];
 for(const sourceNodeId of new Set(partitions.map(p=>p.sourceNodeId))){
  const mesh=result.find(m=>m.userData.catalogNodeId===sourceNodeId);if(!mesh)throw Error('partition_source_missing');
  const g=mesh.geometry,index=g.index;if(!index)throw Error('partition_requires_index');
  const parts=partitions.filter(p=>p.sourceNodeId===sourceNodeId),owners=new Int32Array(index.count/3).fill(-1);
  parts.forEach((p,owner)=>p.ranges.forEach(r=>{
   if(!Number.isInteger(r.firstTriangle)||!Number.isInteger(r.triangleCount)||r.firstTriangle<0||r.triangleCount<1||r.firstTriangle+r.triangleCount>owners.length)throw Error('partition_range_invalid');
   for(let i=r.firstTriangle;i<r.firstTriangle+r.triangleCount;i++){if(owners[i]!==-1)throw Error('partition_overlap');owners[i]=owner;}
  }));
  const groups=g.groups.length?g.groups:[{start:0,count:index.count,materialIndex:0}];
  const buckets=Array.from({length:parts.length+1},()=>({indices:[],groups:[]}));
  for(const group of groups){const starts=buckets.map(b=>b.indices.length);
   for(let i=group.start;i<group.start+group.count;i+=3){const b=buckets[owners[i/3]+1];b.indices.push(index.getX(i),index.getX(i+1),index.getX(i+2));}
   buckets.forEach((b,i)=>{const count=b.indices.length-starts[i];if(count)b.groups.push({start:starts[i],count,materialIndex:group.materialIndex});});
  }
  function make(bucket){
   const geometry=new BufferGeometry();for(const [name,attribute]of Object.entries(g.attributes))geometry.setAttribute(name,attribute);
   geometry.setIndex(new BufferAttribute(new index.array.constructor(bucket.indices),1));geometry.groups=bucket.groups;
   const box=new Box3(),v=new Vector3(),p=g.attributes.position;
   for(const i of bucket.indices)box.expandByPoint(v.fromBufferAttribute(p,i));
   geometry.boundingBox=box;geometry.boundingSphere=new Sphere();box.getBoundingSphere(geometry.boundingSphere);return geometry;
  }
  // Clone before replacing source geometry, keeping the exact local transform.
  parts.forEach((part,i)=>{const region=mesh.clone(false);region.geometry=make(buckets[i+1]);region.name=part.nodeId;region.userData={...mesh.userData,catalogNodeId:part.nodeId,catalogNodeIndex:part.nodeIndex};mesh.parent.add(region);result.push(region);});
  mesh.geometry=make(buckets[0]);mesh.visible=mesh.visible&&buckets[0].indices.length>0;
  g.dispose();
 }
 return result;
}
