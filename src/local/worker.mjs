import {resolverPerfil,resetConstructionTiming,constructionMs} from './generated/profile.js';
import {reconocerPlaca} from './generated/motor.js';
import {tplCache} from './generated/ncc.js';
import {seleccionarEstrategia} from '../experimental/kiro/p1/estrategias/registro.js';
import {validateDimensions} from './coordinates.mjs';
import {estrategiaAnillosRpi5} from './generated/strategy.js';
import {trace} from './trace.mjs';
let resolved=null;
async function load(){const files=await Promise.all(['profile','map','reference'].map(async x=>{const r=await fetch('/assets/'+x);if(!r.ok)throw Error('private_assets_missing');return r.json();}));return files;}
self.onmessage=async({data:m})=>{try{
 const phases={profileLoadMs:null,profileMs:null,templateConstructionMs:null};let cache='warm';
 if(!resolved||m.cold){cache='cold';tplCache.vaciar();let t=performance.now();const [def,mapa,referencia]=await load();phases.profileLoadMs=performance.now()-t;resetConstructionTiming();t=performance.now();const r=resolverPerfil(def,{mapa,referencia});phases.templateConstructionMs=constructionMs;phases.profileMs=performance.now()-t-constructionMs;if(!r.ok||!validateDimensions(r.perfil))throw Error('invalid_profile');const s=seleccionarEstrategia(r.perfil);if(!s.ok||s.estrategia.id!==estrategiaAnillosRpi5.id)throw Error('invalid_strategy');resolved={profile:r.perfil,strategy:estrategiaAnillosRpi5};}
 const hashStart=performance.now(),hash=await crypto.subtle.digest('SHA-256',m.img.data);phases.pixelHashMs=performance.now()-hashStart;
 const before=tplCache.estadisticas(),result=reconocerPlaca(m.img,resolved.profile,resolved.strategy),after=tplCache.estadisticas();
 const matrix={width:m.img.width,height:m.img.height,channels:m.img.channels,bytes:m.img.data.byteLength,type:m.img.data.constructor.name,order:'row-major RGBA, canvas sRGB',sha256:Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('')};
 self.postMessage({id:m.id,result,trace,matrix,phases:{...phases,...result.phases},cache,templateCache:{before,after}});
 }catch(e){self.postMessage({id:m.id,error:e.message});}};
