import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {enrichCatalog} from './catalog-enrichment.mjs';
export const DIR=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(DIR,'../..');
export const STORE=path.resolve(process.env.ITC_BOARD_STORE||path.join(ROOT,'.local/release/catalog'));
export const profiles=JSON.parse(fs.readFileSync(path.join(DIR,'profiles.json')));
export const materialPolicy=JSON.parse(fs.readFileSync(path.join(DIR,'material-policy.json')));
export const safeId=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,79}$/.test(s);
export function boardDir(id){if(!safeId(id))throw Error('invalid_board_id');return path.join(STORE,id);}
export function saveJSON(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2));fs.renameSync(tmp,file);}
export function readBoard(id){
 const d=boardDir(id),record=JSON.parse(fs.readFileSync(path.join(d,'record.json'))),auditPath=path.join(d,'cad-audit.json');let cadAudit=null;
 if(fs.existsSync(auditPath)){const audit=JSON.parse(fs.readFileSync(auditPath));if(audit.sourceSHA256===record.conversion?.sourceSHA256&&audit.policy==='missing-cad-face/1'&&audit.missingFaces?.length===record.conversion?.missingFaces)cadAudit=audit;}
 const enriched=enrichCatalog(record,JSON.parse(fs.readFileSync(path.join(DIR,'catalog-enrichment.json'))));
 return {...enriched,cadAudit,review:fs.existsSync(path.join(d,'review.json'))?JSON.parse(fs.readFileSync(path.join(d,'review.json'))):{revision:0,materials:{},components:[],history:[]}};
}
export function listBoards(){if(!fs.existsSync(STORE))return[];return fs.readdirSync(STORE).filter(safeId).flatMap(id=>{try{const b=readBoard(id),merged=[...b.components.filter(c=>!b.review.components.some(m=>m.id===c.id)),...b.review.components];return[{id,identity:b.identity,coverage:{...b.coverage,boundComponents:merged.filter(c=>c.nodeIndices.length).length},source:b.source,preparedAt:b.preparedAt,modelAvailable:b.modelAvailable!==false,preparationStatus:b.preparationStatus||'ready'}];}catch{return[];}});}
const normalize=s=>String(s).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function identifyName(name) {
  const q=normalize(name);if(!q)return{status:'unknown',candidates:[],confidence:null};
  const saved=listBoards().filter(b=>{const p=profiles.find(p=>p.id===b.id);return [b.identity.model,b.identity.manufacturer+' '+b.identity.model,readBoard(b.id).onboarding?.input,...(p?.aliases||[])].filter(Boolean).some(v=>normalize(v)===q);});
  if(saved.length)return {status:saved.length===1?'identified':'ambiguous',confidence:'saved_documentation_identity',probability:null,basis:'persistent_catalog',candidates:saved.map(b=>({id:b.id,...b.identity,saved:true,modelAvailable:b.modelAvailable,requestedName:readBoard(b.id).onboarding?.input||null})),limitations:['Physical hardware revision is not inferred from a name.']};
  const exact=profiles.filter(p=>[p.id,...p.aliases,p.identity.model].some(a=>normalize(a)===q));
  const candidates=exact.length?exact:profiles.filter(p=>normalize(p.identity.manufacturer+' '+p.identity.model).includes(q));
  return{status:exact.length===1?'identified':candidates.length?'ambiguous':'unknown',
    confidence:exact.length===1?'exact_catalog_name':null,probability:null,basis:'user_supplied_name',
    candidates:candidates.map(p=>({id:p.id,...p.identity})),limitations:['La revisión física no se deduce del nombre.','Búsqueda inicial acotada a fuentes registradas; se puede importar otra placa manualmente.']};
}
export function classifyMaterials(inventory) {
  return inventory.nodes.filter(n=>n.mesh!==null).map(n=>{
    const matches=materialPolicy.rules.filter(r=>n.path.some(s=>new RegExp(r.segment,'i').test(s))&&(!r.ancestor||n.path.some(s=>new RegExp(r.ancestor,'i').test(s))));
    const finishes=[...new Set(matches.map(r=>r.finish))];
    return{nodeId:n.id,nodeIndex:n.index,finish:finishes.length===1?finishes[0]:null,
      status:finishes.length===1?'provisional':'unknown',evidence:matches.map(r=>r.reason),policy:materialPolicy.version};
  });
}
export function saveReview(id,patch) {
  const board=readBoard(id),review=structuredClone(board.review),valid=new Set(board.inventory.nodes.map(n=>n.id));
  if(patch.revision!==review.revision)throw Error('review_conflict');
  if(patch.material){const {nodeId,finish,note}=patch.material;if(!valid.has(nodeId)||!['nickel_satin','tin_satin','black_polymer','chip_package','pcb_soldermask','connector_polymer','unknown'].includes(finish)||!note?.trim())throw Error('invalid_material_review');review.materials[nodeId]={finish,note:note.slice(0,1000),status:'manually_reviewed'};}
  if(patch.component){const c=patch.component;if(!safeId(c.id)||!c.label?.trim()||!c.description?.trim()||!Array.isArray(c.nodeIds)||!c.nodeIds.length||c.nodeIds.some(n=>!valid.has(n))||!Array.isArray(c.sources)||!c.sources.length||c.sources.some(s=>!/^https:\/\//.test(s.url)))throw Error('invalid_component_review');
    const occupied=[...board.components,...review.components].filter(x=>x.id!==c.id).flatMap(x=>x.nodeIds);
    if(c.nodeIds.some(n=>occupied.includes(n)))throw Error('component_geometry_already_assigned');
    review.components=review.components.filter(x=>x.id!==c.id);review.components.push({...c,status:'manual_provisional',confidence:'user_review_required',nodeIndices:c.nodeIds.map(id=>board.inventory.nodes.find(n=>n.id===id).index)});
  }
  review.revision++;review.history.push({at:new Date().toISOString(),action:patch.material?'material':'component'});saveJSON(path.join(boardDir(id),'review.json'),review);return review;
}
