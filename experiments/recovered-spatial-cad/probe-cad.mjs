// Capability probe, not semantic identification. Does not read catalogue records.
import fs from 'node:fs';import crypto from 'node:crypto';
import {THREE,GLTFLoader} from '../multimodal-cad/dependencies.mjs';import {selectCandidates} from '../multimodal-cad/prepare.mjs';
const [file,output]=process.argv.slice(2),bytes=fs.readFileSync(file),start=performance.now();
const root=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;root.scale.multiplyScalar(1000);root.updateMatrixWorld(true);
const policy=JSON.parse(fs.readFileSync('experiments/multimodal-cad/policy.json'));const result={inputSHA256:crypto.createHash('sha256').update(bytes).digest('hex'),historicalAssociationsRead:false};
try{result.extraction=selectCandidates(root,policy);result.status='extracted';}catch(e){result.status='capability_unmet';result.reason=e.message;}
const envelope=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).toArray(),axes=[0,1,2].sort((a,b)=>envelope[b]-envelope[a]),[u,v,n]=axes;const meshes=[];
root.traverse(m=>{if(m.isMesh){m.geometry.computeBoundingBox();const dims=m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld).getSize(new THREE.Vector3()).toArray();meshes.push({dimensionsMm:dims,footprintFraction:dims[u]*dims[v]/(envelope[u]*envelope[v]),thicknessRatio:dims[n]/Math.min(dims[u],dims[v])});}});
result.envelopeMm=envelope;result.largestFootprints=meshes.sort((a,b)=>b.footprintFraction-a.footprintFraction).slice(0,5);result.elapsedMs=performance.now()-start;result.policy=policy;fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,reason:result.reason,largest:result.largestFootprints[0],elapsedMs:result.elapsedMs}));
