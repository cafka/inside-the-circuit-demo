import test from 'node:test';
import assert from 'node:assert/strict';
import {orbitGestureGate,nearbyChoices,POINTER_POLICY} from './selection-pointer.mjs';
const e=(id,x,y)=>({pointerId:id,clientX:x,clientY:y});
test('Tap jitter never reaches OrbitControls; intentional drag and multitouch do',()=>{
 const g=orbitGestureGate();g.down(e(1,0,0));assert.equal(g.move(e(1,3,2)),true);g.up(e(1,3,2));
 g.down(e(2,0,0));assert.equal(g.move(e(2,8,0)),false);assert.equal(g.move(e(2,0,0)),false);g.up(e(2,0,0));
 g.down(e(3,0,0));g.down(e(4,1,1));assert.equal(g.move(e(3,0,1)),false);g.cancel();assert.equal(g.move(e(3,0,1)),false);
});
test('Nearby options require independent visible samples, not overlap of projected boxes',()=>{
 const entries=['visible','occluded','unrelated'].map(id=>({id,bounds:{left:0,right:10,top:0,bottom:10}}));
 const candidates=nearbyChoices(entries,{x:4,y:4},8,id=>id==='visible'?[{x:5,y:4}]:id==='unrelated'?[{x:90,y:90}]:[]);
 assert.deepEqual(candidates.map(c=>c.id),['visible']);assert.equal(candidates[0].distance,1);
});
test('Several nearby pieces stay alternatives; no nearest identity is silently selected',()=>{
 const entries=['a','b'].map(id=>({id,bounds:{left:0,right:10,top:0,bottom:10}}));
 const result=nearbyChoices(entries,{x:4,y:4},POINTER_POLICY.touchRadius,id=>[{x:id==='a'?5:6,y:4}]);assert.deepEqual(result.map(c=>c.id),['a','b']);assert.equal(result.selected,undefined);
});
