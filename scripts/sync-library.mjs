// Consume a pinned publication artifact. Optional integration patches are served separately; downloads stay pristine.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const configFile=path.join(root,'config/library.json'),lockFile=path.join(root,'config/library-lock.json');
const config=JSON.parse(fs.readFileSync(configFile)),revision=process.argv.includes('--revision')?process.argv[process.argv.indexOf('--revision')+1]:null;
const gitHash=bytes=>crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const get=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error(`library_http_${r.status}`);return Buffer.from(await r.arrayBuffer());};
const integrationPatch=config.localPatch?JSON.parse(fs.readFileSync(path.join(root,config.localPatch))):null;
if(revision&&integrationPatch&&integrationPatch.baseCommit!==revision)throw Error('update_or_remove_library_patch_before_changing_revision');
let lock;
if(revision){
 if(!/^[a-f0-9]{40}$/.test(revision))throw Error('full_commit_required');
 const tree=JSON.parse((await get(`https://api.github.com/repos/${config.repository}/git/trees/${revision}?recursive=1`)).toString());
 if(tree.truncated)throw Error('truncated_publication_tree');
 const files=tree.tree.filter(f=>f.type==='blob'&&(f.path==='index.html'||f.path==='styles.css'||/^(src|vendor|python|arduino)\//.test(f.path))).map(({path,sha,size})=>({path,sha,size}));
 if(!files.some(f=>f.path==='index.html')||files.length>250||files.some(f=>f.path.split('/').includes('..')||f.size>20*1024*1024))throw Error('unexpected_publication_layout');
 lock={schema:'independent-library-lock/1',repository:config.repository,commit:revision,files};
}else lock=JSON.parse(fs.readFileSync(lockFile));
const dest=path.join(root,'.local/library',lock.commit);let downloaded=0,reused=0;const start=performance.now();
for(let i=0;i<lock.files.length;i+=5)await Promise.all(lock.files.slice(i,i+5).map(async f=>{
 const target=path.resolve(dest,f.path);if(!target.startsWith(dest+path.sep))throw Error('invalid_library_path');
 if(fs.existsSync(target)&&gitHash(fs.readFileSync(target))===f.sha){reused++;return;}
 const bytes=await get(`https://raw.githubusercontent.com/${lock.repository}/${lock.commit}/${f.path}`);
 if(gitHash(bytes)!==f.sha||bytes.length!==f.size)throw Error('library_asset_changed:'+f.path);
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);downloaded++;
}));
if(revision){
 fs.writeFileSync(lockFile,JSON.stringify(lock,null,2)+'\n');
 config.verifiedCommit=revision;config.externalUrl=config.externalUrl||config.url;
 config.url=`/library-assets/${integrationPatch?.variant||revision}/index.html`;
 fs.writeFileSync(configFile,JSON.stringify(config,null,2)+'\n');
}
const receipt={commit:lock.commit,files:lock.files.length,downloaded,reused,ms:performance.now()-start,sourceModified:false,manualFork:false};
fs.writeFileSync(path.join(dest,'sync-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
