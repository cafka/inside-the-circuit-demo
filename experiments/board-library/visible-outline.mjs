import {FrontSide} from 'three';

// Keep both silhouette passes on the visible selected surface. Blurred outer
// edges must not spill onto a closer neighbouring part or through the PCB.
export function visibleSurfaceOnly(pass) {
  pass.hiddenEdgeColor.setRGB(0,0,0);
  pass.prepareMaskMaterial.side=FrontSide;
  const original='gl_FragColor = vec4(0.0, depthTest, 1.0, 1.0);';
  if(!pass.prepareMaskMaterial.fragmentShader.includes(original))throw Error('outline_depth_shader_changed');
  pass.prepareMaskMaterial.fragmentShader=pass.prepareMaskMaterial.fragmentShader.replace(original,
    'if (depthTest > 0.5) discard; gl_FragColor = vec4(0.0, 0.0, 1.0, 1.0);');
  const overlay='vec4 finalColor = edgeStrength * maskColor.r * edgeValue;';
  if(!pass.overlayMaterial.fragmentShader.includes(overlay))throw Error('outline_overlay_shader_changed');
  pass.overlayMaterial.fragmentShader=pass.overlayMaterial.fragmentShader.replace(overlay,`
    if (maskColor.r > 0.5 || maskColor.g > 0.5) discard;
    vec4 finalColor = edgeStrength * (1.0 - maskColor.r) * edgeValue;`);
}
