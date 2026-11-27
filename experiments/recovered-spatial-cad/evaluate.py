"""Post-run evaluation only. Never imported by the inference/registration adapter."""
import json,sys,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
run=Path(sys.argv[1]);summary=read(run/'summary.json');historical=read(ROOT/'experiments/photo-evidence-v2/results/historical-16.json')
prior=read(ROOT/'experiments/multimodal-cad/results/evaluation.json');mapping={g['candidateId']:g['historicalOverlap'] for g in prior['groupCoverage']};rows=[]
for case in ['a','b']:
    result=read(run/f'{case}.json');call=read(ROOT/f'experiments/multimodal-cad/results/live/cad-target-{case}.json');items={p['candidateId']:p for p in call['parsed']['items']}
    for item in result['contours']:
        proposal=items[item['observedRegion']]
        rows.append({'case':case,'cadCandidate':item['id'],'originalGeminiCandidate':item['observedRegion'],'originalGeminiName':proposal['name'],'historicalCADReference':mapping.get(item['id'],[]),'unchangedOriginalPair':item['id']==item['observedRegion'],'geometricMargin':item['globalMargin'],'boundarySupport':item['support'],'competingBoundaryMargin':item['margin'],'rejections':item['reasons']+([] if result['geometry']['reservedPassed'] else ['independent_geometry_failed']),'verified':False})
output={'evaluationOnly':True,'historicalAssociationsCount':len(historical['associations']),'records':rows,'confirmedPhotoCADLinks':0,'acceptedFalsePositives':0,'visualPrecision':None,'limitation':'Zero accepted links does not measure precision. The old table is a CAD identity reference, not independently annotated photo ground truth. No new human annotation was used to fit or tune.'}
(run/'evaluation.json').write_text(json.dumps(output,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
