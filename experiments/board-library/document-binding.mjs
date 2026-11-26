import {bindComponents} from './glb.mjs';

// Exact, unique designators only. Never guess from colour, position or a part category.
export function bindDocumentedDesignators(inventory,documents){
 const candidates=documents.flatMap(({data,asset})=>data.components.map(c=>({reference:c.SOURCEDESIGNATOR,description:c.SOURCEDESCRIPTION||null,footprint:c.PATTERN,layer:c.LAYER,source:asset.url,sourceSHA256:data.sha256,member:data.member})));
 const counts=new Map();for(const c of candidates)counts.set(c.reference,(counts.get(c.reference)||0)+1);
 const definitions=[],audit=[];
 for(const c of candidates){
  const nodes=inventory.nodes.filter(n=>n.name===c.reference);
  const reason=!c.reference||counts.get(c.reference)!==1?'duplicate_or_missing_document_designator':!c.description?'missing_document_description':nodes.length!==1?'cad_designator_missing_or_ambiguous':null;
  audit.push({...c,matchingNodeIndices:nodes.map(n=>n.index),status:reason?'unbound':'exact_designator',reason});
  if(reason)continue;
  definitions.push({id:'document-'+c.reference.toLowerCase().replace(/[^a-z0-9]/g,'-'),label:c.reference,description:c.description,sourceLanguage:'en',status:'documented',selector:{path:nodes[0].path},
   sources:[{url:c.source,locator:c.member+' / '+c.reference,status:'publisher_ecad_record'}],facts:[],bindingEvidence:'Unique exact CAD/ECAD designator; source file hash '+c.sourceSHA256,educationStatus:'technical_source_only_not_bilingual_lesson'});
 }
 // Overlap is rejected by the same binder used by existing boards.
 let components=[];try{components=bindComponents(inventory,definitions);}catch(error){return {components:[],audit,error:error.message};}
 return {components,audit,error:null};
}
