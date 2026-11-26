import {bindRegisteredBodies} from './physical-binding.mjs';
import {bindDocumentedDesignators} from './document-binding.mjs';

// Shared by registered profiles and name-driven incorporation. Reviewed bindings
// retain precedence; automatic additions must occupy disjoint, verified meshes.
export function completeDocumentedComponents(inventory,enrichment,existing=[]){
 const start=performance.now(),{surfaces,ecad=[],physicalData}=enrichment||{};
 const physical=surfaces?.registration?.status==='verified'&&(surfaces.registration.bindings?.length||surfaces.registration.namedPairs?.length);
 const proposed=physical&&physicalData&&ecad.length===1
  ?bindRegisteredBodies(inventory,physicalData,surfaces,ecad[0].asset)
  :bindDocumentedDesignators(inventory,ecad);
 const components=structuredClone(existing),occupied=new Set(existing.flatMap(c=>c.nodeIndices||[]));
 const skipped=[];let added=0;
 for(const candidate of proposed.components){
  const nodes=candidate.nodeIndices||[];
  const reason=!nodes.length?'geometry_unbound':nodes.some(n=>occupied.has(n))?'existing_geometry_association_preserved':components.some(c=>c.id===candidate.id)?'component_identifier_conflict':null;
  if(reason){skipped.push({id:candidate.id,reason,nodeIndices:nodes});continue;}
  components.push(candidate);for(const n of nodes)occupied.add(n);added++;
 }
 return {...proposed,components,generatedCards:components.filter(c=>c.educationStatus==='documented_function_bilingual').length,
  completion:{policy:'documented-component-completion/1',route:physical?'independently_registered_bodies':'unique_documented_designators',preserved:existing.length,added,skipped,ms:performance.now()-start}};
}
