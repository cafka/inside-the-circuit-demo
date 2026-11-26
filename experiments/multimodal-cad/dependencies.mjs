// Reuse the installation already used by this repository's CAD viewer.
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const local=createRequire(import.meta.url);let entry;
try{entry=local.resolve('three');}catch{entry=createRequire(new URL('../cad-viewer/package.json',import.meta.url)).resolve('three');}
export const threeDirectory=path.dirname(path.dirname(entry));
export const THREE=await import(pathToFileURL(path.join(threeDirectory,'build/three.module.js')));
export const {GLTFLoader}=await import(pathToFileURL(path.join(threeDirectory,'examples/jsm/loaders/GLTFLoader.js')));
