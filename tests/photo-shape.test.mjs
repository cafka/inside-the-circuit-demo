import test from 'node:test';
import assert from 'node:assert/strict';
import {validVisiblePolygon} from '../experiments/board-library/photo-shape.mjs';
import {parseScene} from '../experiments/board-library/photo-scene.mjs';
import {photoEvidenceTrace} from '../experiments/board-library/photo-evidence-trace.mjs';
test('Physical seed allows rotation, rejects crossed, concave, out-of-frame and invented inputs',()=>{
 const box=[0,0,1000,1000];
 assert.equal(validVisiblePolygon([[100,300],[600,100],[900,700],[400,900]],box),true);
 for(const p of [[[0,0],[100,100],[0,100],[100,0]],[[0,0],[100,0],[50,30],[100,100],[0,100]],
 [[-1,0],[50,0],[50,50]],[[0,0],[0,0],[50,50]],[[0,0],[50,0],[50,NaN]]])assert.equal(validVisiblePolygon(p,box),false);
 assert.equal(validVisiblePolygon(null,box),true);
 assert.equal(validVisiblePolygon([[0,0],[50,0],[50,50]],[10,10,100,100]),false);
});
test('CAD association, accepted edge and actual card opening remain separate evidence',()=>{
 const proposals=[{id:'p',name:'fixture',marking:null,box:[1,2,3,4],status:'proposed'}];
 const t=photoEvidenceTrace(proposals,{components:[{id:'p',verification:{accepted:true}}]},[{id:'p',componentId:'d'}],[{id:'d',nodeIds:['n']}],['p']);
 assert.equal(t.counts.displayed,1);assert.equal(t.counts.opened,0);
 assert.equal(t.counts.independentlyConfirmedIdentities,null);
 assert.equal(t.planeRegistration,'not_computed');
 assert.equal(t.rows[0].semanticStatus,'model_proposal_not_independently_verified');
 const rejected=photoEvidenceTrace(proposals,{components:[{id:'p',verification:{accepted:false,reasons:['unstable']}}]},[],[]);
 assert.equal(rejected.rows[0].firstBlockingStage,'unstable');assert.equal(rejected.counts.displayed,0);
});
