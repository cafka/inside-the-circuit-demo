import * as THREE from 'three';
import registry from './pad-trace-profile.json';
import policy from './pad-trace-policy.json';

// Only precomputed contact-to-contact routes from the verified CAD frame.
// The renderer cannot add endpoints, random wiring or holes.
export function createPadTraces(record){
 const started=performance.now();
 const entry=registry.assets.find(a=>a.baseGLBSHA256===record.inventory.sourceHash);
 if(!entry)return null;
 const {totalMs:preparationMs,...preparedAudit}=entry.audit;
 const audit={status:entry.status,...preparedAudit,preparationMs,illustrativeOnly:true,verifiedElectricalConnections:false,additionalTriangles:entry.routes.length?2:0};
 if(!entry.routes.length)return{object:null,audit,dispose(){}};
 const canvas=document.createElement('canvas');[canvas.width,canvas.height]=entry.size;const ctx=canvas.getContext('2d');ctx.translate(0,canvas.height);ctx.scale(1,-1);ctx.lineWidth=policy.lineWidthPixels;ctx.strokeStyle=policy.color;ctx.globalAlpha=policy.opacity;ctx.lineCap='round';ctx.lineJoin='round';
 for(const route of entry.routes){ctx.beginPath();for(const [i,p]of route.points.entries())ctx[i?'lineTo':'moveTo'](p[0]*canvas.width,p[1]*canvas.height);ctx.stroke();}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(entry.corners.flat(),3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));
 const p=entry.corners.map(p=>new THREE.Vector3(...p)),facing=p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).dot(new THREE.Vector3(...entry.normal));geometry.setIndex(facing>0?[0,1,2,0,2,3]:[0,2,1,0,3,2]);geometry.computeVertexNormals();
 const material=new THREE.MeshStandardMaterial({map:texture,metalness:.15,roughness:.5,transparent:true,alphaTest:.02,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 const object=new THREE.Mesh(geometry,material);object.name='CAD pad traces · illustrative, not verified wiring';object.userData.illustrativeOnly=true;object.raycast=()=>{};
 return{object,audit:{...audit,runtimeMs:performance.now()-started,textureSize:entry.size,estimatedTextureBytes:Math.ceil(canvas.width*canvas.height*4*4/3)},dispose(){texture.dispose();geometry.dispose();material.dispose();}};
}
