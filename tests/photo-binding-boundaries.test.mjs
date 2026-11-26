import test from 'node:test';import assert from 'node:assert/strict';
import {bindPhotoComponents} from '../experiments/board-library/photo-scene.mjs';
test('A component phrase cannot match characters across unrelated word boundaries',()=>{
 const proposals=[{id:'a',name:'RAM IC',marking:null,status:'proposed'},{id:'b',name:'Ethernet Jack',marking:null,status:'proposed'}];
 const components=[{id:'slot',label:'Ranura microSD'},{id:'ethernet',label:'Puerto de red Ethernet'}];
 const result=bindPhotoComponents(proposals,components);
 assert.equal(result[0].componentId,null);assert.equal(result[0].binding.status,'unmatched');
 assert.equal(result[1].componentId,'ethernet');
});
