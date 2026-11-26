// One geometry index for the menu and raycasting. Educational coverage is unrelated.
export function selectionIndex(components,meshes){
 const byId=new Map(),byNode=new Map(),issues=[];
 for(const component of components){
  const targets=meshes.filter(m=>component.nodeIds?.includes(m.userData.catalogNodeId)&&m.visible);
  const missing=(component.nodeIds||[]).filter(id=>!targets.some(m=>m.userData.catalogNodeId===id));
  byId.set(component.id,{component,targets,missing});
  for(const node of component.nodeIds||[]){if(byNode.has(node)){issues.push({node,reason:'ambiguous_component_binding'});byNode.set(node,null);}else byNode.set(node,component.id);}
 }
 return {byId,byNode,issues};
}

export function tapTracker({distance=7,duration=700}={}){
 const pointers=new Set();let start=null,moved=false,multiple=false;
 return {
  down(e){pointers.add(e.pointerId);if(pointers.size===1){start={x:e.clientX,y:e.clientY,at:e.timeStamp,id:e.pointerId};moved=e.button!==0;multiple=false;}else multiple=true;},
  move(e){if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>distance)moved=true;},
  up(e){pointers.delete(e.pointerId);const tap=!!start&&!pointers.size&&!moved&&!multiple&&e.pointerId===start.id&&e.timeStamp-start.at<=duration;if(!pointers.size)start=null;return tap;},
  cancel(){pointers.clear();start=null;multiple=false;}
 };
}

// Reversible light on the exact selected materials. Preserve custom CAD shaders.
export function illuminateSelection(meshes){
 const saved=meshes.map(mesh=>({mesh,material:mesh.material}));
 for(const {mesh,material}of saved){const clone=source=>{const m=source.clone();m.onBeforeCompile=source.onBeforeCompile;m.customProgramCacheKey=source.customProgramCacheKey;if(m.emissive){m.emissive.setRGB(1,.68,.06);m.emissiveIntensity=.18;}return m;};mesh.material=Array.isArray(material)?material.map(clone):clone(material);}
 return {count:saved.length,restore(){for(const {mesh,material}of saved){for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])m.dispose();mesh.material=material;}}};
}
