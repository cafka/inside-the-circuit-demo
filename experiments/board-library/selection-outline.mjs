import {Vector2,NormalBlending} from 'three';
import {OutlinePass} from 'three/addons/postprocessing/OutlinePass.js';

// Union of visible selected surfaces, not CAD feature edges or inscriptions.
// Compares against other surfaces' depth. Original materials remain unchanged.
export function createSelectionOutline(meshes,width,height,scene,camera){
 const pass=new OutlinePass(new Vector2(width,height),scene,camera,meshes);
 // Encode visibility in separate channels; the final overlay is always yellow.
 pass.visibleEdgeColor.setRGB(1,0,0);pass.hiddenEdgeColor.setRGB(0,1,0);
 pass.edgeStrength=6;pass.edgeGlow=.12;pass.edgeThickness=4;pass.downSampleRatio=1;
 // Normal alpha blending retains yellow on green PCB and bright metal alike.
 // The union mask excludes the selected surface's interior from this overlay.
 pass.overlayMaterial.blending=NormalBlending;
 pass.overlayMaterial.fragmentShader=pass.overlayMaterial.fragmentShader.replace('gl_FragColor = finalColor;',`
  float strength = max(finalColor.r, max(finalColor.g, finalColor.b));
  // A dark outer keyline separates the yellow from bright metal/background.
  // Both remain outside the union mask; letters and inner details are untouched.
  float core = smoothstep(0.18, 0.7, strength);
  vec3 colour = mix(vec3(0.045, 0.03, 0.004), vec3(1.0, 0.85, 0.18), core);
  float occluded = step(edgeValue.r + 0.0001, edgeValue.g);
  float dash = mix(1.0, step(fract((gl_FragCoord.x + gl_FragCoord.y) / 14.0), 0.55), occluded);
  gl_FragColor = vec4(colour, clamp(strength * 1.5, 0.0, 1.0) * dash);`);
 pass.setSize(width,height);
 return {kind:'visible-and-occluded-silhouette',nodeIds:[...new Set(meshes.map(m=>m.userData.catalogNodeId))],
  resize(w,h){pass.setSize(w,h);},render(renderer){pass.render(renderer,null,null,0,false);},dispose(){pass.dispose();}};
}
