import {build} from 'esbuild';
import path from 'node:path';
import {DIR,ROOT} from './catalog.mjs';
await build({entryPoints:[path.join(DIR,'app.mjs')],outfile:path.join(DIR,'public/app.js'),nodePaths:[path.join(ROOT,'experiments/cad-viewer/node_modules')],bundle:true,format:'esm',minify:true,legalComments:'linked',target:['es2022']});
await build({entryPoints:[path.join(ROOT,'src/local/worker.mjs')],outfile:path.join(DIR,'public/local-worker.js'),bundle:true,format:'esm',minify:true,target:['es2022']});
await build({entryPoints:[path.join(DIR,'release-check.mjs')],outfile:path.join(DIR,'public/release-check.js'),bundle:true,format:'esm',minify:true,legalComments:'linked',target:['es2022']});
console.log('Board library built; shared existing Three.js and Firebase dependencies.');
