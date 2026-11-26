import {SCHEMA_VERSION} from '../../src/identity/schema.mjs';
import {createCapture} from '../../src/identity/capture.mjs';
export const pi5=()=>({schemaVersion:SCHEMA_VERSION,manufacturer:'Raspberry Pi',family:'Raspberry Pi',model:'Raspberry Pi 5',hardwareRevision:null,boardId:'raspberry-pi-5',status:'identified',visualEvidence:['Readable Raspberry Pi 5 board silkscreen (controlled double).'],alternatives:[],limitations:['Revision not visible.']});
export const unknown=()=>({...pi5(),manufacturer:null,family:null,model:null,boardId:null,status:'unknown',visualEvidence:[],limitations:['No board identity is supported.']});
export const partial=()=>({...pi5(),model:null,boardId:null,status:'partial',visualEvidence:['Raspberry Pi logo only.']});
export const pi4=()=>({...pi5(),model:'Raspberry Pi 4 Model B',boardId:'raspberry-pi-4-model-b',visualEvidence:['Readable Raspberry Pi 4 Model B marking (controlled double).']});
export const capture=(n=1)=>createCapture(new Uint8Array([255,216,255,n]),'image/jpeg');
export const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
export function fakeAdapter(steps={}) {
  const calls=[];
  return {calls,evidenceKind:'controlled_double',cloudModel:'controlled-cloud',preflight(){if(steps.preflight)throw Object.assign(new Error(steps.preflight),{code:steps.preflight});},
    async infer(args){calls.push({lane:args.lane,captureId:args.capture.captureId});const step=steps[args.lane];if(step instanceof Error)throw step;
      const value=typeof step==='function'?await step(args):step??unknown();
      return typeof value==='object' && 'inferenceSource' in value ? value : {text:typeof value==='string'?value:JSON.stringify(value),inferenceSource:args.lane==='nano'?'on_device':'in_cloud'};
    }};
}
