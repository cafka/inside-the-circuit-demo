// Observations from the actual invocation, never a second recognition pass.
export let trace;
export function resetTrace(){trace={schema:'itc-recognition-trace/1',geometry:{goldPixels:0,regions:[],candidates:[],quartets:[],hypotheses:[],orientation:[]},ncc:[],components:{},modules:[]};}
resetTrace();
export function observeMap(tpl,tplRect,atRect,sigmaMM,out){
 const valid=out.filter(p=>Number.isFinite(p.ncc)),sorted=valid.slice().sort((a,b)=>b.ncc-a.ncc);
 trace.ncc.push({templateRect:tplRect,targetRect:atRect,templateGrid:[tpl.nu,tpl.nv],templateSamples:tpl.n,stepMM:tpl.step??.25,sigmaMM,positions:out.length,validPositions:valid.length,best:sorted[0]??null,correlations:out.map(p=>[p.dx,p.dy,Number.isFinite(p.ncc)?p.ncc:null])});
}
export function finishTrace(loc,pieces,policy){
 trace.geometry.result=loc;
 for(const [id,p] of Object.entries(pieces))trace.components[id]={quality:p.calidad??null,skin:p.piel??null,texture:p.textura??null,policy:policy[id],nccPrecondition:!loc.ok?'sin_pose_valida':!p.textura||p.textura.resultado==='no_evaluable'?p.textura?.motivo??'sin_textura':p.textura.resultado==='no_aplica'?'sin_plantilla':'ejecutada'};
 trace.modules=['resolverPerfil (caché o carga)','grayImage','independentPose',...(loc.ok?['regionMetrics','judgeQuality','skinFraction']:[]),...(trace.ncc.length?['nccMapMacro','classifyMacro']:[]),'decidir'];
 trace.work={goldPixels:trace.geometry.goldPixels,regions:trace.geometry.regions.length,candidates:trace.geometry.candidates.length,quartets:trace.geometry.quartets.length,hypotheses:trace.geometry.hypotheses.length,orientationComparisons:trace.geometry.orientation.length,nccMaps:trace.ncc.length,nccPositions:trace.ncc.reduce((s,m)=>s+m.positions,0),nccValidPositions:trace.ncc.reduce((s,m)=>s+m.validPositions,0),polygons:Object.values(policy).filter(p=>p.poligono?.length===4).length};
 trace.work.geometryAccepted=loc.ok;trace.work.nccExecuted=trace.ncc.length>0;
 trace.work.group=!loc.ok?'geometria_rechazada':!trace.ncc.length?'geometria_sin_textura_evaluable':trace.work.polygons===Object.keys(policy).length?'reconocimiento_con_poligonos':'geometria_con_ncc';
 trace.work.groupNote='Grupos excluyentes; geometria_con_ncc excluye las ejecuciones con todos los polígonos. Tener polígonos no equivale a confirmar todas las piezas.';
}
