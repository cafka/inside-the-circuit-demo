import test from 'node:test';
import assert from 'node:assert/strict';
import {parseScene} from '../experiments/board-library/photo-scene.mjs';
import {photoOutcome} from '../experiments/board-library/photo-outcome.mjs';
const identity={schemaVersion:'itc-board-identity/1.0.0',manufacturer:null,family:null,model:null,hardwareRevision:null,boardId:null,status:'unknown',visualEvidence:[],alternatives:[],limitations:['Cannot identify a model']};
test('No board, unknown board and uncertain presence are distinct validated outcomes',()=>{
 for(const [boardPresence,key] of [['absent','photo.noBoard'],['present','photo.unknownBoard'],['uncertain','photo.uncertainPresence']]){
  const validation=parseScene(JSON.stringify({boardPresence,identity,components:[]}));
  assert.equal(validation.valid,true);
  assert.equal(photoOutcome({validation,status:'unknown'}),key);
  assert.equal(validation.identity.model,null);
 }
});
test('Transport failures and contradictory scenes never become a negative visual result',()=>{
 assert.equal(photoOutcome({validation:{valid:false,boardPresence:'absent'},status:'error'}),null);
 const contradictory={boardPresence:'absent',identity,components:[{id:'p',name:'Package',marking:null,status:'proposed',box:[1,2,3,4],evidence:'rectangle'}]};
 assert.equal(parseScene(JSON.stringify(contradictory)).valid,false);
 assert.equal(parseScene(JSON.stringify({identity,components:[]})).valid,false);
});
