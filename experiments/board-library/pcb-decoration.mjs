import * as THREE from 'three';
import policy from './pcb-decoration-policy.json';

const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
function triangles(mesh,callback){const p=mesh.geometry.attributes.position,ix=mesh.geometry.index,m=mesh.matrixWorld;
  for(let t=0;t<(ix?.count??p.count);t+=3){a.fromBufferAttribute(p,ix?ix.getX(t):t).applyMatrix4(m);b.fromBufferAttribute(p,ix?ix.getX(t+1):t+1).applyMatrix4(m);c.fromBufferAttribute(p,ix?ix.getX(t+2):t+2).applyMatrix4(m);callback(a,b,c,t);}}
function pcb(mesh,record){const id=mesh.userData.catalogNodeId,review=record.review?.materials?.[id];if(review)return review.finish==='pcb_soldermask';
  if(record.materials?.some(r=>r.nodeId===id&&r.finish==='pcb_soldermask'))return true;
  return !Array.isArray(mesh.material)&&mesh.material.name.startsWith('pcb_soldermask');}
function seeded(seed){let s=2166136261;for(const ch of seed)s=Math.imul(s^ch.charCodeAt(0),16777619)>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function raster(mask,w,h,x0,y0,x1,y1,x2,y2){const det=(x1-x0)*(y2-y0)-(y1-y0)*(x2-x0);if(Math.abs(det)<1e-8)return;
  const left=Math.max(0,Math.ceil(Math.min(x0,x1,x2)-.5)),right=Math.min(w-1,Math.floor(Math.max(x0,x1,x2)-.5)),top=Math.max(0,Math.ceil(Math.min(y0,y1,y2)-.5)),bottom=Math.min(h-1,Math.floor(Math.max(y0,y1,y2)-.5));
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
    const u=((x1-x0)*(y+.5-y0)-(y1-y0)*(x+.5-x0))/det,v=((x+.5-x0)*(y2-y0)-(y+.5-y0)*(x2-x0))/det;
    if(u>=-1e-6&&v>=-1e-6&&u+v<=1.000001)mask[y*w+x]=1;
  }}
function erode(surface,blocked,w,h){const allowed=new Uint8Array(w*h),r=policy.clearanceCells;
  for(let y=r;y<h-r;y++)for(let x=r;x<w-r;x++){let safe=true;for(let dy=-r;dy<=r&&safe;dy++)for(let dx=-r;dx<=r;dx++)if(!surface[(y+dy)*w+x+dx]||blocked[(y+dy)*w+x+dx]){safe=false;break;}if(safe)allowed[y*w+x]=1;}return allowed;}

// Pure geometric planning: no board IDs, expected component locations, image inference or document lookup.
export function planPCBDecoration(meshes,record){const started=performance.now(),candidates=meshes.filter(m=>pcb(m,record));
  const absent=reason=>({status:'omitted',reason,version:policy.version,totalMs:performance.now()-started});
  if(!candidates.length)return absent('pcb_material_not_identified');
  const bounds=new THREE.Box3();for(const m of meshes)bounds.expandByObject(m);const tolerance=bounds.getSize(new THREE.Vector3()).length()*policy.relativePlaneTolerance;
  if(!tolerance)return absent('empty_geometry');
  const groups=new Map(),ab=new THREE.Vector3(),ac=new THREE.Vector3(),normal=new THREE.Vector3();
  for(const mesh of candidates)triangles(mesh,(a,b,c,t)=>{
    normal.crossVectors(ab.subVectors(b,a),ac.subVectors(c,a));const twiceArea=normal.length();if(twiceArea<tolerance*tolerance)return;normal.divideScalar(twiceArea);
    const distance=normal.dot(a),key=normal.toArray().map(v=>Math.round(v/policy.normalBin)).join(',')+':'+Math.round(distance/tolerance);
    if(!groups.has(key))groups.set(key,{normal:normal.clone(),distance,area:0,faces:[],meshes:new Set()});const g=groups.get(key);g.area+=twiceArea/2;g.faces.push([mesh,t]);g.meshes.add(mesh);
  });
  if(!groups.size)return absent('no_planar_surface');
  const boxes=meshes.filter(m=>!candidates.includes(m)).map(m=>new THREE.Box3().setFromObject(m));
  const largest=Math.max(...[...groups.values()].map(g=>g.area));
  // Prefer a large face directed towards the component volume, rather than an arbitrary global up-axis.
  for(const g of groups.values()){let front=0,back=0;for(const box of boxes){const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),weight=size.length();if(g.normal.dot(center)-g.distance>tolerance)front+=weight;else back+=weight;}g.score=g.area*(.75+.25*front/Math.max(front+back,1e-10));}
  const plane=[...groups.values()].filter(g=>g.area>=largest*.75).sort((x,y)=>y.score-x.score)[0];
  const n=plane.normal,helper=Math.abs(n.z)<.8?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0),u=new THREE.Vector3().crossVectors(helper,n).normalize(),v=new THREE.Vector3().crossVectors(n,u).normalize();
  let minU=Infinity,minV=Infinity,maxU=-Infinity,maxV=-Infinity;const positions=[];
  for(const [mesh,t] of plane.faces){const p=mesh.geometry.attributes.position,ix=mesh.geometry.index;for(let k=0;k<3;k++){a.fromBufferAttribute(p,ix?ix.getX(t+k):t+k).applyMatrix4(mesh.matrixWorld);positions.push(a.x,a.y,a.z);const x=a.dot(u),y=a.dot(v);minU=Math.min(minU,x);maxU=Math.max(maxU,x);minV=Math.min(minV,y);maxV=Math.max(maxV,y);}}
  const spanU=maxU-minU,spanV=maxV-minV;if(Math.min(spanU,spanV)<tolerance*10)return absent('degenerate_surface');
  const cell=Math.max(spanU,spanV)/policy.gridMax,w=Math.ceil(spanU/cell),h=Math.ceil(spanV/cell),surface=new Uint8Array(w*h),blocked=new Uint8Array(w*h);
  for(let i=0;i<positions.length;i+=9){const q=[];for(let k=0;k<9;k+=3){a.fromArray(positions,i+k);q.push((a.dot(u)-minU)/cell,(a.dot(v)-minV)/cell);}raster(surface,w,h,...q);}
  const surfaceMs=performance.now()-started;let evaluatedTriangles=0;
  // Triangle footprints, not whole-mesh boxes: CAD meshes may batch hundreds of separate components.
  for(const mesh of meshes){if(plane.meshes.has(mesh))continue;const p=mesh.geometry.attributes.position,ix=mesh.geometry.index,m=mesh.matrixWorld.elements,projected=new Float32Array(p.count*3);
    for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),wx=m[0]*x+m[4]*y+m[8]*z+m[12],wy=m[1]*x+m[5]*y+m[9]*z+m[13],wz=m[2]*x+m[6]*y+m[10]*z+m[14];projected[i*3]=(u.x*wx+u.y*wy+u.z*wz-minU)/cell;projected[i*3+1]=(v.x*wx+v.y*wy+v.z*wz-minV)/cell;projected[i*3+2]=n.x*wx+n.y*wy+n.z*wz-plane.distance;}
    for(let t=0;t<(ix?.count??p.count);t+=3){const i=(ix?ix.getX(t):t)*3,j=(ix?ix.getX(t+1):t+1)*3,k=(ix?ix.getX(t+2):t+2)*3;evaluatedTriangles++;
      if(Math.max(projected[i+2],projected[j+2],projected[k+2])<-tolerance)continue;
      raster(blocked,w,h,projected[i],projected[i+1],projected[j],projected[j+1],projected[k],projected[k+1]);
    }
  }
  const allowed=erode(surface,blocked,w,h),free=allowed.reduce((s,x)=>s+x,0),maskMs=performance.now()-started-surfaceMs;
  if(free<30)return absent('no_clear_surface_area');
  const random=seeded((record.inventory?.sourceHash||'unlabelled')+policy.version),used=new Uint8Array(w*h),routes=[],vias=[],directions=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const target=Math.min(policy.maximumRoutes,Math.ceil(free/policy.freeCellsPerRoute)),inside=(x,y)=>x>0&&y>0&&x<w-1&&y<h-1&&allowed[y*w+x]&&!used[y*w+x];
  for(let attempt=0;attempt<target*policy.maximumAttemptsPerRoute&&routes.length<target;attempt++){
    let x=Math.floor(random()*w),y=Math.floor(random()*h);if(!inside(x,y))continue;let direction=Math.floor(random()*8);const cells=[[x,y]],points=[[x+.5,y+.5]],limit=policy.routeSegments[0]+Math.floor(random()*(policy.routeSegments[1]-policy.routeSegments[0]+1));
    for(let segment=0;segment<limit;segment++){
      const [dx,dy]=directions[direction],length=policy.segmentCells[0]+Math.floor(random()*(policy.segmentCells[1]-policy.segmentCells[0]+1));let steps=0;
      for(;steps<length;steps++){const nx=x+dx,ny=y+dy;if(!inside(nx,ny)||(dx&&dy&&(!inside(x+dx,y)||!inside(x,y+dy))))break;x=nx;y=ny;cells.push([x,y]);}
      if(steps)points.push([x+.5,y+.5]);if(!steps)break;direction=(direction+(random()<.5?1:7))%8;
    }
    if(cells.length<policy.minimumRouteCells||points.length<2)continue;
    routes.push(points);for(const [x,y] of cells)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)used[(y+dy)*w+x+dx]=1;
    // These are surface marks, not holes cut into the model or asserted electrical endpoints.
    for(const point of [points[0],points.at(-1)])if(random()<.7)vias.push(point);
  }
  const uv=[];for(let i=0;i<positions.length;i+=3){a.fromArray(positions,i);uv.push((a.dot(u)-minU)/(w*cell),(a.dot(v)-minV)/(h*cell));}
  return {status:routes.length?'ready':'omitted',reason:routes.length?null:'no_routes',version:policy.version,
    positions,uv,routes,vias,normal:n.toArray(),distance:plane.distance,w,h,cell,allowed,surface,blocked,
    audit:{sourceNodeIds:[...plane.meshes].map(m=>m.userData.catalogNodeId||m.name),surfaceArea:plane.area,freeCells:free,grid:[w,h],routes:routes.length,vias:vias.length,evaluatedTriangles,
      surfaceMs,maskMs,routingMs:performance.now()-started-surfaceMs-maskMs,totalMs:performance.now()-started}};
}

export function createPCBDecoration(meshes,record){const started=performance.now(),plan=planPCBDecoration(meshes,record);
  if(plan.status!=='ready')return {object:null,audit:plan,dispose(){}};
  const scale=policy.textureMax/Math.max(plan.w,plan.h),canvas=document.createElement('canvas');canvas.width=Math.ceil(plan.w*scale);canvas.height=Math.ceil(plan.h*scale);const ctx=canvas.getContext('2d');
  // CanvasTexture V flips canvas Y; invert once here to match the world-space UV basis.
  ctx.translate(0,canvas.height);ctx.scale(scale,-scale);ctx.strokeStyle=policy.traceColor;ctx.globalAlpha=policy.traceOpacity;ctx.lineWidth=policy.traceWidthCells;ctx.lineJoin='round';ctx.lineCap='round';
  for(const route of plan.routes){ctx.beginPath();route.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}
  for(const [x,y] of plan.vias){ctx.globalAlpha=.85;ctx.fillStyle=policy.viaColor;ctx.beginPath();ctx.arc(x,y,policy.viaRadiusCells,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.9;ctx.fillStyle=policy.viaCenterColor;ctx.beginPath();ctx.arc(x,y,policy.viaRadiusCells*.46,0,Math.PI*2);ctx.fill();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(plan.positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(plan.uv,2));geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({map:texture,metalness:policy.metalness,roughness:policy.roughness,transparent:true,depthWrite:false,alphaTest:.02,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const object=new THREE.Mesh(geometry,material);object.name='Pistas y vías ilustrativas · sin conexiones eléctricas verificadas';object.raycast=()=>{};object.userData.illustrativeOnly=true;
  return{object,audit:{status:'ready',version:policy.version,...plan.audit,textureSize:[canvas.width,canvas.height],textureWithMipmapsBytes:Math.ceil(canvas.width*canvas.height*4*4/3),decorationTriangles:plan.positions.length/9,totalMs:performance.now()-started},
    dispose(){geometry.dispose();material.dispose();texture.dispose();}};
}
