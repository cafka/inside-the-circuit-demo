// Reviewed catalogue data is pinned to the exact asset, never to a board name.
export function enrichCatalog(record,data){
 const entry=data.assets.find(a=>a.assetSHA256===record.inventory.sourceHash);if(!entry)return record;
 const out=structuredClone(record);out.geometryPartitions=[];const replacedAutomatic=[];
 for(const patch of entry.components){
  const previous=out.components.find(c=>c.id===patch.id);
  let nodes=previous?.nodeIds||[];
  if(patch.selector?.path)nodes=out.inventory.nodes.filter(n=>n.mesh!==null&&patch.selector.path.every((s,i)=>n.path[i]===s)).map(n=>n.id);
  if(patch.geometryRanges){
   nodes=[];
   for(const sourceNodeId of new Set(patch.geometryRanges.map(r=>r.sourceNodeId))){
    const source=out.inventory.nodes.find(n=>n.id===sourceNodeId);if(!source)throw Error('catalogue_source_node_missing');
    const index=Math.max(...out.inventory.nodes.map(n=>n.index))+1,id=`${sourceNodeId}:region:${patch.id}`;
    out.inventory.nodes.push({...source,id,index,path:[...source.path,patch.id],catalogueRegion:true});
    out.geometryPartitions.push({sourceNodeId,nodeId:id,nodeIndex:index,ranges:patch.geometryRanges.filter(r=>r.sourceNodeId===sourceNodeId)});nodes.push(id);
   }
  }
  if(!nodes.length||nodes.some(id=>!out.inventory.nodes.some(n=>n.id===id)))throw Error('catalogue_binding_missing');
  out.components=out.components.filter(c=>{
   if(c.id===patch.id)return false;
   if(!c.nodeIds?.some(id=>nodes.includes(id)))return true;
   // A pinned reviewed association supersedes automatic ECAD ownership. Never
   // let both appear as selectable identities on the same physical geometry.
   if(c.geometryEvidence&&c.educationPolicy?.startsWith('documented-component-lessons/')){
    replacedAutomatic.push({automaticId:c.id,reviewedId:patch.id,reason:'pinned_reviewed_geometry_precedence'});return false;
   }
   throw Error('reviewed_catalogue_geometry_conflict');
  });
  out.components.push({...previous,...patch,nodeIds:nodes,nodeIndices:nodes.map(id=>out.inventory.nodes.find(n=>n.id===id).index)});
 }
 out.catalogueEnrichment={version:data.version,source:entry.reviewSource,replacedAutomatic};
 return out;
}
