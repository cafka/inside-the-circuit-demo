// Retrieve public official images into a new private operator workspace. No images in Git.
import fs from 'node:fs';import path from 'node:path';import sharp from 'sharp';
import {hash} from '../experiments/board-library/glb.mjs';
import {buildBacksideRequest} from '../experiments/board-library/backside-selection.mjs';
const [fixturePath,out]=process.argv.slice(2);if(!fixturePath||!out||fs.existsSync(out))throw Error('fixture_and_new_workspace_required');
const fixture=JSON.parse(fs.readFileSync(fixturePath)),work=path.resolve(out,'reconstruction');fs.mkdirSync(work,{recursive:true});
const sources=[];
for(const source of fixture.sources){
 const u=new URL(source.url);if(u.protocol!=='https:')throw Error('https_required');
 const response=await fetch(u);if(!response.ok)throw Error('official_image_download_failed');
 const bytes=Buffer.from(await response.arrayBuffer());if(hash(bytes)!==source.sha256)throw Error('official_source_changed');
 const png=await sharp(bytes).rotate().png().toBuffer();if(hash(png)!==source.decodedSHA256)throw Error('decoded_image_changed');
 const file=`reconstruction/${source.id}.png`;fs.writeFileSync(path.resolve(out,file),png);sources.push({...source,file});
}
fs.writeFileSync(path.join(work,'input-manifest.json'),JSON.stringify({sources},null,2));
fs.writeFileSync(path.join(work,'observations.json'),JSON.stringify(fixture.front,null,2));
const request=buildBacksideRequest(work,sources,fixture.front);
if(request.requestSHA256!==fixture.requestSHA256)throw Error('request_changed');
console.log(JSON.stringify({work,images:sources.length,requestSHA256:request.requestSHA256}));
