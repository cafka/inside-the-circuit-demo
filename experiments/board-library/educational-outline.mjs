import {Vector2,NormalBlending} from 'three';
import {OutlinePass} from 'three/addons/postprocessing/OutlinePass.js';
import {visibleSurfaceOnly} from './visible-outline.mjs';

// One depth-aware silhouette pass for all available lessons. No proxy boxes,
// added geometry, material changes, or raycast targets. Active selection is separate.
export function createEducationalOutline(meshes,width,height,scene,camera){
 const pass=new OutlinePass(new Vector2(width,height),scene,camera,meshes);
 pass.visibleEdgeColor.setRGB(1,0,0);pass.hiddenEdgeColor.setRGB(0,0,0);
 pass.edgeStrength=4;pass.edgeGlow=0;pass.edgeThickness=2;pass.downSampleRatio=1;
 visibleSurfaceOnly(pass);
 pass.overlayMaterial.blending=NormalBlending;
 pass.overlayMaterial.fragmentShader=pass.overlayMaterial.fragmentShader.replace('gl_FragColor = finalColor;',`
  float strength = finalColor.r;
  float core = smoothstep(0.06, 0.42, strength);
  vec3 colour = mix(vec3(0.025, 0.075, 0.12), vec3(0.16, 0.66, 0.95), core);
  gl_FragColor = vec4(colour, clamp(strength * 1.6, 0.0, 0.9));`);
 pass.setSize(width,height);
 return {nodeIds:[...new Set(meshes.map(m=>m.userData.catalogNodeId))],resize(w,h){pass.setSize(w,h);},render(renderer){pass.render(renderer,null,null,0,false);},dispose(){pass.dispose();}};
}
