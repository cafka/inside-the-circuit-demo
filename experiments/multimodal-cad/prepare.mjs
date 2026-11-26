// Inputs are native CAD geometry and its conversion receipt only. No catalogue.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {GLTFLoader,THREE} from './dependencies.mjs';
const {Box3,Vector3}=THREE;
export const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export function selectCandidates(root,policy){
 const meshes=[];
 function visit(o,chain=[]){
  const node={path:[...chain,o.name],children:[],meshIds:[],bounds:new Box3()};
  if(o.isMesh){o.geometry.computeBoundingBox();node.meshIds.push(meshes.length);node.bounds.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);meshes.push({index:meshes.length,path:node.path,bounds:node.bounds.clone()});}
  for(const c of o.children){const v=visit(c,node.path);node.children.push(v);node.bounds.union(v.bounds);node.meshIds.push(...v.meshIds);}
  return node;
 }
 root.updateMatrixWorld(true);const tree=visit(root);
 const envelope=tree.bounds.getSize(new Vector3()).toArray(),axes=[0,1,2].sort((a,b)=>envelope[b]-envelope[a]),[u,v,n]=axes;
 const area=b=>{const s=b.getSize(new Vector3()).toArray();return s[u]*s[v];};
 const envelopeArea=envelope[u]*envelope[v];
 const slabs=meshes.filter(m=>{const s=m.bounds.getSize(new Vector3()).toArray();return area(m.bounds)/envelopeArea>=policy.supportMinimumFootprintRatio&&s[n]/Math.min(s[u],s[v])<policy.supportMaximumThicknessRatio;}).sort((a,b)=>area(b.bounds)-area(a.bounds));
 if(!slabs.length)throw Error('No axis-aligned thin support found; generic capability unmet');
 const support=slabs[0],supportArea=area(support.bounds),supportIds=new Set(slabs.map(s=>s.index)),groups=[];
 function collect(node){
  if(!node.meshIds.length)return;
  const ratio=area(node.bounds)/supportArea;
  if(ratio<policy.candidateMinimumFootprintRatio)return;
  if(ratio<=policy.candidateMaximumFootprintRatio&&!node.meshIds.some(i=>supportIds.has(i))){groups.push(node);return;}
  node.children.forEach(collect);
 }
 collect(tree);
 if(groups.length>policy.maximumCandidates)throw Error('Candidate limit exceeded; no silent trial-specific pruning');
 groups.sort((a,b)=>a.path.join('/').localeCompare(b.path.join('/')));
 const candidates=groups.map((g,i)=>{const center=g.bounds.getCenter(new Vector3()).toArray();return {id:'P'+String(i+1).padStart(3,'0'),meshIds:g.meshIds,path:g.path,boundsMm:[g.bounds.min.toArray(),g.bounds.max.toArray()],centerMm:center,
  side:center[n]>support.bounds.max.toArray()[n]?'positive':center[n]<support.bounds.min.toArray()[n]?'negative':'crosses_support',
  footprintRatio:area(g.bounds)/supportArea,identity:null,decision:'native_CAD_hierarchy_and_relative_extent',
  evaluationRole:parseInt(sha(g.path.join('/')).slice(0,8),16)/0xffffffff<policy.holdoutFraction?'holdout':'fit'};});
 return {candidates,meshCount:meshes.length,support:{meshIds:[...supportIds],boundsMm:[support.bounds.min.toArray(),support.bounds.max.toArray()]},axes:{u,v,n},boundsMm:[tree.bounds.min.toArray(),tree.bounds.max.toArray()]};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname.replace(/^\/(?:([A-Z]:))/,'$1'))){
 const [cad,receiptFile,outDir]=process.argv.slice(2);if(!cad||!receiptFile||!outDir)throw Error('Usage: prepare.mjs native.glb conversion-receipt.json isolated-output');
 const start=performance.now(),receipt=JSON.parse(fs.readFileSync(receiptFile)),bytes=fs.readFileSync(cad),policy=JSON.parse(fs.readFileSync(new URL('./policy.json',import.meta.url)));
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'')).scene;
 // Native OCCT GLTF exports metres. Preserve every source placement; record unit conversion.
 scene.scale.multiplyScalar(1000);scene.updateMatrixWorld(true);
 const inventory=selectCandidates(scene,policy);
 const out=path.resolve(outDir);fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'geometry.glb'),bytes);
 fs.writeFileSync(path.join(out,'candidates.json'),JSON.stringify({schema:'anonymous-cad-candidates/1',...inventory,units:'mm',gltfScale:1000,
  inputSHA256:sha(bytes),sourceSTEPHash:receipt.sourceSHA256??receipt.stepSHA256??null,policy,elapsedMs:performance.now()-start,
  historicalTableRead:false,referencePhotoAnnotationsRead:false},null,2));
 console.log(JSON.stringify({candidates:inventory.candidates.length,meshes:inventory.meshCount,support:inventory.support,roles:inventory.candidates.map(c=>[c.id,c.meshIds.length,c.side,c.evaluationRole]),elapsedMs:performance.now()-start}));
}
