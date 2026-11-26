import * as THREE from 'three';
import originalProfile from './metal-profile.json';
import polishedProfile from './metal-polished-profile.json';

// Lighting-only scene. These softboxes never enter the CAD scene or its raycast.
function metalStudio(renderer,profile) {
  const background=profile.environment.background??.28;
  const studio=new THREE.Scene();studio.background=new THREE.Color().setRGB(background,background,background);
  const resources=[];
  function panel(position,size,radiance) {
    const geometry=new THREE.PlaneGeometry(...size);
    const material=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(radiance,radiance,radiance),side:THREE.DoubleSide});
    const plane=new THREE.Mesh(geometry,material);plane.position.set(...position);plane.lookAt(0,0,0);studio.add(plane);resources.push(geometry,material);
  }
  if(profile.environment.panels) {
    for(const p of profile.environment.panels)panel(p.position,p.size,p.radiance);
  } else {
    panel([-.8,4,.6],[3,1.3],5.5);
    panel([1,1.6,4],[4,1.25],3.3);
    panel([4,1,-1],[2,3.5],3.0);
    panel([-4,1.2,-2],[4,3],1.8);
    panel([-2,.1,3],[.7,3],.035);
  }
  const pmrem=new THREE.PMREMGenerator(renderer);
  const target=pmrem.fromScene(studio,profile.environment.blurRadians,.1,20,{size:profile.environment.faceSize});
  resources.forEach(r=>r.dispose());pmrem.dispose();return target;
}

function microGrain(profile) {
  const size=profile.grain.size,data=new Uint8Array(size*size*4);let seed=profile.grain.seed;
  for(let i=0;i<size*size;i++) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const value=128+(seed>>>25); // bounded, deterministic neutral microvariation
    data[i*4]=data[i*4+1]=data[i*4+2]=value;data[i*4+3]=255;
  }
  const t=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  t.name='Shared neutral metal grain';t.colorSpace=THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;
  return t;
}

// Triplanar roughness/tone + very small fragment-normal bump. No displacement,
// UV changes, CAD normal/position/index edits or extra geometry. Mipmaps avoid shimmer.
function addGrain(material,texture,profile) {
  const [roughnessMin,roughnessMax]=profile.grain.roughnessRange??[.32,.55];
  material.onBeforeCompile=shader=>{
    shader.uniforms.itcGrain={value:texture};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vCadPosition;\nvarying vec3 vCadNormal;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvCadPosition = position;\nvCadNormal = normal;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      uniform sampler2D itcGrain;
      varying vec3 vCadPosition;
      varying vec3 vCadNormal;
      float cadGrain() {
        vec3 w = abs(normalize(vCadNormal)); w *= w; w /= max(w.x + w.y + w.z, 0.0001);
        vec3 p = vCadPosition / ${profile.grain.tileMeters.toFixed(6)};
        float n = dot(w, vec3(texture2D(itcGrain,p.yz).r,texture2D(itcGrain,p.zx).r,texture2D(itcGrain,p.xy).r));
        return (n - 0.75) * 4.0;
      }`)
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        float fineGrain = clamp(cadGrain(), -1.0, 1.0);
        roughnessFactor = clamp(roughnessFactor + fineGrain * ${profile.grain.roughnessAmplitude}, ${roughnessMin}, ${roughnessMax});
        diffuseColor.rgb *= 1.0 + fineGrain * ${profile.grain.toneAmplitude};`)
      .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        vec3 dx = dFdx(-vViewPosition), dy = dFdy(-vViewPosition);
        vec3 r1 = cross(dy,normal), r2 = cross(normal,dx);
        float determinant = dot(dx,r1);
        float opticalHeight = fineGrain * ${profile.grain.bumpMeters.toFixed(9)};
        vec3 slope = sign(determinant) * (dFdx(opticalHeight)*r1 + dFdy(opticalHeight)*r2) / max(abs(determinant),1e-12);
        slope *= min(1.0, ${profile.grain.maxNormalSlope} / max(length(slope),1e-6));
        normal = normalize(normal-slope);`);
  };
  material.customProgramCacheKey=()=>profile.version+'/grain';
}

export function applyMetalAppearance(model,renderer,mode='metal-v2') {
  // Keep v1 reproducible; v2 changes finishes only, never material assignments.
  const profile=mode==='metal-v1'?originalProfile:{...originalProfile,
    version:polishedProfile.version,
    finishes:{...originalProfile.finishes,...polishedProfile.finishes},
    grain:{...originalProfile.grain,...polishedProfile.grain},
    environment:{...originalProfile.environment,...polishedProfile.environment}};
  const env=metalStudio(renderer,profile),grain=microGrain(profile),audit=[];
  function finish(original,name) {
    const p=profile.finishes[name],material=original.clone();material.name=`${name} · ${original.name}`;
    material.metalness=p.metalness;material.roughness=p.roughness;
    if(p.linearColor)material.color.setRGB(...p.linearColor,THREE.LinearSRGBColorSpace);
    if(p.metalness===1) {material.envMap=env.texture;material.envMapIntensity=profile.environment.intensity;}
    if(p.grain)addGrain(material,grain,profile);
    return material;
  }
  model.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const batch=mesh.userData.batchId,name=profile.batches[batch];if(!name)return;
    const original=mesh.material,base=finish(original,name),overrides=profile.partOverrides.filter(r=>r.batch===batch);
    mesh.material=base;
    if(overrides.length) {
      if(mesh.userData.componentId)throw Error('Selectable mesh must retain its single-material interaction contract');
      const materials=[base];let next=0;
      mesh.geometry.clearGroups();
      for(const r of overrides.sort((a,b)=>a.firstTriangle-b.firstTriangle)) {
        const start=r.firstTriangle*3,count=r.triangleCount*3;
        if(start<next||start+count>mesh.geometry.index.count)throw Error('Invalid CAD material range');
        if(start>next)mesh.geometry.addGroup(next,start-next,0);
        materials.push(finish(original,r.finish));mesh.geometry.addGroup(start,count,materials.length-1);next=start+count;
      }
      if(next<mesh.geometry.index.count)mesh.geometry.addGroup(next,mesh.geometry.index.count-next,0);
      mesh.material=materials;
    }
    audit.push({batch,finish:name,metalness:base.metalness,roughness:base.roughness,colorLinear:base.color.toArray(),groups:mesh.geometry.groups,overrides});
    original.dispose();
  });
  return {version:profile.version,batches:audit,grainBytes:profile.grain.size**2*4,grainWithMipmapsBytes:Math.ceil(profile.grain.size**2*4*4/3),additionalNetworkTextureBytes:0,environmentSize:[env.width,env.height],glbSHA256:profile.glbSHA256};
}
