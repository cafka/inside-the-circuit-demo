import {validVisiblePolygon} from './photo-shape.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
let running=false;
export async function verifyPhotoProposals(body,{root,store}){
 if(running)throw Error('local_verification_busy');
 if(!['image/jpeg','image/png'].includes(body.mimeType)||typeof body.base64!=='string'||body.base64.length>12*1024*1024||!Array.isArray(body.proposals)||body.proposals.length>24)throw Error('invalid_photo_verification');
 for(const p of body.proposals)if(typeof p.id!=='string'||p.id.length>80||!['proposed','ambiguous'].includes(p.status)||!Array.isArray(p.box)||p.box.length!==4||p.box.some(n=>!Number.isFinite(n)||n<0||n>1000)||p.box[0]>=p.box[2]||p.box[1]>=p.box[3]||!validVisiblePolygon(p.visiblePolygon,p.box))throw Error('invalid_proposal');
 const bytes=Buffer.from(body.base64,'base64');if(bytes.length>8*1024*1024||!bytes.length)throw Error('photo_size');
 const sha=crypto.createHash('sha256').update(bytes).digest('hex');if(sha!==body.sha256)throw Error('capture_hash_mismatch');
 const workRoot=path.resolve(store,'_photo-work'),directory=path.join(workRoot,crypto.randomUUID());
 if(path.dirname(path.resolve(directory))!==workRoot)throw Error('invalid_work_directory');
 running=true;
 try{await fs.mkdir(directory,{recursive:true});const image=path.join(directory,'input'),input=path.join(directory,'request.json');await fs.writeFile(image,bytes);await fs.writeFile(input,JSON.stringify({image,proposals:body.proposals}));
  const result=await new Promise((resolve,reject)=>{const child=spawn(process.env.ITC_PYTHON||'python',[path.join(root,'experiments/board-library/verify-photo-proposals.py'),input],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';const timer=setTimeout(()=>{child.kill();reject(Error('local_verification_timeout'));},60000);child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error(err.includes('ModuleNotFoundError')?'local_verifier_dependencies_missing':'local_verifier_failed'));try{resolve(JSON.parse(out));}catch{reject(Error('local_verifier_invalid_output'));}});});
  return result;
 }finally{try{await fs.rm(directory,{recursive:true,force:true});}finally{running=false;}}
}
