import test from 'node:test';
import assert from 'node:assert/strict';
import {validVisiblePolygon} from '../experiments/board-library/photo-shape.mjs';
import {parseScene} from '../experiments/board-library/photo-scene.mjs';
import {photoEvidenceTrace} from '../experiments/board-library/photo-evidence-trace.mjs';
import {photoIdentityEvidence} from '../experiments/board-library/photo-identity-evidence.mjs';
import {normalizeTerm,matchesDocumentTerm} from '../experiments/board-library/component-terms.mjs';
test('Exact photographic model requires reported readable marking, not layout resemblance',()=>{
 const id={status:'identified',manufacturer:'Vector',model:'Vector Zeta 9'};
 const layout={basis:'layout_only',observedText:null,box:null};
 assert.equal(photoIdentityEvidence(id,layout).allowed,false);
 assert.equal(photoIdentityEvidence(id,{basis:'readable_model_marking',observedText:'Vector Zeta 8',box:[10,20,30,40]}).allowed,false);
 const good={basis:'readable_model_marking',observedText:'Zeta 9',box:[10,20,30,40]};
 assert.equal(photoIdentityEvidence(id,good).allowed,true);
 assert.equal(photoIdentityEvidence(id,{...good,box:[10,20,5,40]}).allowed,false);
 assert.equal(photoIdentityEvidence(id,good).independentOCRVerification,false);
});
test('Document identifier spacing is normalized without erasing discriminating numbers',()=>{
 assert.equal(matchesDocumentTerm(normalizeTerm('LINK / OUT 7'),normalizeTerm('LINK/OUT7')),true);
 assert.equal(matchesDocumentTerm(normalizeTerm('LINK / OUT 7'),normalizeTerm('LINK/OUT8')),false);
 assert.equal(matchesDocumentTerm(normalizeTerm('RAM'),normalizeTerm('microSD card slot')),false);
});
test('Invalid optional shape is quarantined without editing original observations',()=>{
 const identity={schemaVersion:'itc-board-identity/1.0.0',manufacturer:'Vector',family:null,model:'Zeta',hardwareRevision:null,boardId:null,status:'identified',visualEvidence:['Zeta printed'],alternatives:[],limitations:[]};
 const c={id:'a',name:'Connector',marking:null,status:'proposed',box:[10,100,50,200],evidence:'visible',visiblePolygon:[[10,100],[50,100],[50,200],[10,200]]};
 const raw=JSON.stringify({boardPresence:'present',identity,components:[c]});
 const d=parseScene(raw);assert.equal(d.valid,true);assert.equal(d.components[0].visiblePolygon,null);assert.equal(d.warnings[0].reason,'invalid_visible_polygon_ignored');
 assert.deepEqual(JSON.parse(raw).components[0],c);
 const correct={...c,visiblePolygon:[{x:100,y:10},{x:200,y:10},{x:200,y:50},{x:100,y:50}]};
 assert.deepEqual(parseScene(JSON.stringify({boardPresence:'present',identity,components:[correct]})).components[0].visiblePolygon,[[100,10],[200,10],[200,50],[100,50]]);
});
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
