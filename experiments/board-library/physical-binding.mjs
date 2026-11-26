import fs from 'node:fs';
import path from 'node:path';
import {DIR} from './catalog.mjs';
const lessons=JSON.parse(fs.readFileSync(path.join(DIR,'education-rules.json')));
export function bindRegisteredBodies(inventory,ecad,surfaces,asset){
 const audit=[],components=[];
 if(surfaces.registration?.status!=='verified')return {components,audit,reason:'physical_frame_not_verified'};
 const map=new Map(inventory.nodes.map(n=>[n.index,n]));
 const pairs=surfaces.registration.bindings?.length?surfaces.registration.bindings:surfaces.registration.namedPairs||[];
 for(const pair of pairs){
  const c=ecad.components[pair.component],indices=pair.nodes||[pair.node],nodes=indices.map(i=>map.get(i));
  if(!c?.designator||!c.description||!indices.length||nodes.some(n=>!n||n.mesh===null)||new Set(indices).size!==indices.length)continue;
  if(ecad.components.filter(other=>other.designator===c.designator).length!==1||pairs.some(other=>other!==pair&&(other.nodes||[other.node]).some(i=>indices.includes(i))))continue;
  const node=nodes[0];
  const matching=lessons.rules.filter(r=>new RegExp(r.pattern,'i').test(c.description));
  const rule=matching.length===1?matching[0]:null;
  const sources=[{url:asset.url,locator:ecad.member+' · '+c.designator,status:'publisher_ecad_registered_geometry',sha256:ecad.sha256}];
  const translations=Object.fromEntries(['es','en'].map(lang=>[lang,rule?{...rule[lang],technicalReference:`${c.designator} · ${c.description.replaceAll('\n',' ')}`}:{label:c.designator,description:lang==='es'?'La identidad eléctrica está vinculada a esta geometría. Su explicación educativa todavía está pendiente.':'The electrical identity is linked to this geometry. Its educational explanation is still pending.',technicalReference:`${c.designator} · ${c.description.replaceAll('\n',' ')}`} ]));
  const evidence={es:{identity:'Designador y descripción recuperados del diseño eléctrico del fabricante.',association:'Posición, lado y dimensiones del cuerpo coinciden con la geometría 3D en un marco verificado mediante otras piezas. No es reconocimiento de una foto.'},en:{identity:'Designator and description recovered from the manufacturer’s electrical design.',association:'Body position, side and dimensions match the 3D geometry in a frame checked against other parts. This is not recognition in a photo.'}};
  components.push({id:'ecad-'+c.designator.toLowerCase().replace(/[^a-z0-9-]/g,'-'),label:c.designator,description:c.description,sourceLanguage:'en',translations,evidence,sources,status:'documented',bindingStatus:'bound',nodeIndices:[pair.node],nodeIds:[node.id],bindingEvidence:`ECAD/MCAD frame verified; body extent residual ${pair.errorMm.toFixed(6)} mm; ${surfaces.registration.heldout} held-out bodies`,confidence:'documented_geometry_correspondence',educationStatus:rule?'documented_function_bilingual':'technical_record_function_pending',educationRule:rule?.id||null,educationPolicy:lessons.version,geometryEvidence:pair,facts:[]});
  components.at(-1).educationScope=rule?'documented_component_class_not_circuit_role':'technical_reference_only';
  components.at(-1).nodeIndices=indices.slice();components.at(-1).nodeIds=nodes.map(n=>n.id);
  audit.push({designator:c.designator,node:pair.node,residualMm:pair.errorMm,independent:pair.independent,educationRule:rule?.id||null,educationReason:rule?'explicit_document_class':matching.length?'ambiguous_document_class':'unsupported_document_class'});
 }
 return {components,audit,unbound:ecad.components.filter(c=>!audit.some(a=>a.designator===c.designator)).map(c=>({designator:c.designator,reason:'no_unique_body_extent_match'})),generatedCards:components.filter(c=>c.educationRule).length};
}
