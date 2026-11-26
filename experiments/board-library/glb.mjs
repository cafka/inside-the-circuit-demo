import crypto from 'node:crypto';
export const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export function inspectGLB(bytes) {
  if(bytes.length<28||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('invalid_glb');
  const jsonLength=bytes.readUInt32LE(12);
  if(bytes.readUInt32LE(16)!==0x4e4f534a||jsonLength>bytes.length-20)throw Error('invalid_glb_json');
  const gltf=JSON.parse(bytes.subarray(20,20+jsonLength));
  if(gltf.buffers?.some(b=>b.uri)||gltf.images?.some(i=>i.uri)||gltf.extensionsRequired?.length)throw Error('external_or_unsupported_glb_resource');
  const sourceHash=hash(bytes),nodes=[],seen=new Set();let triangles=0;
  function visit(i,ancestors=[],indices=[]) {
    if(seen.has(i)||!gltf.nodes?.[i])throw Error('invalid_or_instanced_node_tree');seen.add(i);
    const n=gltf.nodes[i],names=[...ancestors,n.name||`node-${i}`],chain=[...indices,i];
    const primitives=n.mesh===undefined?[]:gltf.meshes[n.mesh].primitives;
    for(const p of primitives) {
      if((p.mode??4)!==4)throw Error('non_triangle_primitive');
      const count=gltf.accessors[p.indices??p.attributes.POSITION]?.count;
      if(!count||count%3)throw Error('invalid_triangle_count');triangles+=count/3;
    }
    nodes.push({id:`${sourceHash.slice(0,16)}:node:${i}`,index:i,name:n.name||null,path:names,chain,
      mesh:n.mesh??null,primitives:primitives.length,extras:n.extras||{}});
    for(const c of n.children||[])visit(c,names,chain);
  }
  for(const i of gltf.scenes[gltf.scene??0].nodes)visit(i);
  return {sourceHash,bytes:bytes.length,triangles,nodes,meshes:nodes.filter(n=>n.mesh!==null).length,
    binarySHA256:hash(bytes.subarray(20+jsonLength)),asset:gltf.asset};
}
export function bindComponents(inventory,definitions) {
  const byIndex=new Map(inventory.nodes.map(n=>[n.index,n]));
  const components=definitions.map(c=>{
    const roots=inventory.nodes.filter(n=>c.selector.extrasComponentId
      ? n.extras.componentId===c.selector.extrasComponentId
      : JSON.stringify(n.path)===JSON.stringify(c.selector.path));
    const valid=c.selector.extrasComponentId?roots.length>0:roots.length===1;
    const nodeIndices=valid?inventory.nodes.filter(n=>n.mesh!==null&&roots.some(r=>n.chain.includes(r.index))).map(n=>n.index):[];
    return {...c,bindingStatus:nodeIndices.length?'bound':roots.length>1?'ambiguous':'missing',nodeIndices,
      nodeIds:nodeIndices.map(i=>byIndex.get(i).id),confidence:nodeIndices.length?'documented_catalog_binding':'unknown',
      confidenceNote:'Correspondencia CAD/documentación; no es probabilidad ni reconocimiento visual.'};
  });
  // Never silently attach two identities to one geometry node.
  const used=new Set();for(const c of components)for(const n of c.nodeIndices) {if(used.has(n))throw Error('overlapping_component_bindings');used.add(n);}
  return components;
}
