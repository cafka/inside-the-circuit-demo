// Explicit allowlist: never send a checkout, catalogue, input image or credentials to Cloud Build.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.resolve(process.argv[2]||'');
if(!process.argv[2]||fs.existsSync(out))throw Error('new_output_directory_required');
const files=['deployment/verification/Dockerfile','deployment/verification/cloudbuild.yaml','deployment/verification/package.json','deployment/verification/package-lock.json','deployment/verification/server.mjs','experiments/board-library/photo-verification-server.mjs','experiments/board-library/verify-photo-proposals.py','experiments/board-library/photo-verification-policy.json','experiments/component-parallax/policy.json','src/component-parallax/engine.py'];
const manifest=[];
for(const file of files){const bytes=fs.readFileSync(path.join(root,file)),dest=path.join(out,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);manifest.push({file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});}
fs.writeFileSync(path.join(out,'context-manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({files:files.length,output:out,totalBytes:manifest.reduce((n,f)=>n+f.bytes,0)}));
