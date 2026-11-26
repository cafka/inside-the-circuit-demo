import {parseIdentity} from './schema.mjs';
import {PROMPT_VERSION} from './prompt.mjs';
import {POLICY_VERSION,fallbackFor,reconcile} from './policy.mjs';
import {manualProfile} from './catalog.mjs';
import {safeCopy} from './trace.mjs';

const failure = code => Object.assign(new Error(code),{code});
export class IdentityController {
  constructor(adapter,{timeoutMs=60000,maxCalls=8,cloudEnabled=false,onChange=()=>{}}={}) {
    if (!Number.isFinite(timeoutMs) || timeoutMs<1 || timeoutMs>300000 || !Number.isInteger(maxCalls) || maxCalls<1 || maxCalls>20) throw failure('invalid_policy');
    Object.assign(this,{adapter,timeoutMs,maxCalls,cloudEnabled,onChange});
    this.records=new Map(); this.active=null; this.epoch=0; this.callsUsed=0; this.inflight=null;
  }
  setCapture(capture) {
    if (!Object.isFrozen(capture) || !/^sha256:[a-f0-9]{64}$/.test(capture.captureId) || capture.captureId!==`sha256:${capture.sha256}`) throw failure('invalid_capture');
    if (this.active?.captureId===capture.captureId) return this.view();
    this.invalidate('capture_changed'); this.active=capture; this.publish(); return this.view();
  }
  invalidate(reason='cancelled') {
    this.epoch++; this.inflight?.abort.abort(failure(reason)); this.inflight=null; this.active=null; this.publish();
  }
  view() { return this.active ? safeCopy(this.records.get(this.active.captureId) ?? {captureId:this.active.captureId,status:'ready'}) : null; }
  publish() { this.onChange(this.view()); }
  identify() {
    if (!this.active) return Promise.reject(failure('no_capture'));
    const capture=this.active;
    if (this.inflight?.captureId===capture.captureId) return this.inflight.promise;
    if (this.records.has(capture.captureId)) return Promise.resolve(this.view());
    const record={schemaVersion:'itc-identity-run/1.0.0',evidenceKind:this.adapter.evidenceKind,captureId:capture.captureId,
      promptVersion:PROMPT_VERSION,policyVersion:POLICY_VERSION,createdAt:new Date().toISOString(),status:'running',
      nano:null,cloud:null,fallback:null,decision:null,manualSelection:null,events:[],totalMs:null};
    this.records.set(capture.captureId,record);
    const abort=new AbortController(), epoch=this.epoch;
    // Install single-flight ownership before run() can complete or callbacks fire.
    const owner={captureId:capture.captureId,abort,promise:null}; this.inflight=owner;
    owner.promise=Promise.resolve().then(()=>this.run(capture,record,epoch,abort.signal)).finally(()=>{if(this.inflight===owner)this.inflight=null;});
    this.publish(); return owner.promise;
  }
  async run(capture,r,epoch,signal) {
    const start=performance.now(), current=()=>this.epoch===epoch && this.active?.captureId===capture.captureId && !signal.aborted;
    try {
      this.adapter.preflight();
      r.nano=await this.call('nano',capture,signal);
      if (!current()) {r.status='discarded';r.totalMs=performance.now()-start;return safeCopy(r);}
      r.fallback=fallbackFor(r.nano); this.publish();
      // Source violations and exhausted budgets fail closed: do not compound an
      // unexpected cloud execution with an additional cloud request.
      const prohibited=['unexpected_inference_source','request_limit','configuration_missing','wrong_project','app_check_missing','cancelled'];
      if (r.fallback && this.cloudEnabled && !prohibited.includes(r.fallback.reason)) r.cloud=await this.call('cloud',capture,signal,r.fallback);
      else if (r.fallback) r.events.push({type:'cloud_skipped',reason:this.cloudEnabled?'fail_closed':'cloud_not_enabled'});
      if (!current()) {r.status='discarded';r.totalMs=performance.now()-start;return safeCopy(r);}
      const catalogStart=performance.now();r.decision=reconcile(r.nano,r.cloud);r.catalogMs=performance.now()-catalogStart; r.status='complete';
    } catch(e) {
      r.status=current()?'error':'discarded'; r.error={code:this.adapter.errorCode?.(e) ?? e.code ?? 'technical_error'};
    } finally {r.totalMs=performance.now()-start; if(current()) this.publish();}
    return safeCopy(r);
  }
  async call(lane,capture,parentSignal,fallback=null) {
    const start=performance.now(), abort=new AbortController();
    const call={lane,captureId:capture.captureId,promptVersion:PROMPT_VERSION,startedAt:new Date().toISOString(),modelRequested:lane==='nano'?'Chrome managed Gemini Nano (generation unverified)':this.adapter.cloudModel,
      mode:lane==='nano'?'ONLY_ON_DEVICE':'ONLY_IN_CLOUD',inferenceSource:null,status:'error',rawResponse:null,normalized:null,validation:null,fallback,
      timings:{downloadMs:null,initializationMs:null,inferenceMs:null,totalMs:null,downloadMeasurement:'not_observed',initializationScope:'SDK setup, App Check and initializeDeviceModel',inferenceScope:'generateContent including SDK session creation'},error:null};
    if(this.callsUsed>=this.maxCalls) {call.error={code:'request_limit'};call.timings.totalMs=0;return call;}
    this.callsUsed++; const relay=()=>abort.abort(parentSignal.reason ?? failure('cancelled'));
    parentSignal.addEventListener('abort',relay,{once:true}); if(parentSignal.aborted)relay();
    let timer;
    const cancelled=new Promise((_,reject)=>{
      const rejectAbort=()=>reject(abort.signal.reason ?? failure('cancelled'));
      abort.signal.addEventListener('abort',rejectAbort,{once:true}); if(abort.signal.aborted)rejectAbort();
      timer=setTimeout(()=>abort.abort(failure('timeout')),this.timeoutMs);
    });
    // Adapter callbacks update only this private draft. A timed-out result can
    // never mutate a returned trace or the current capture.
    const draft={...call.timings};
    try {
      const result=await Promise.race([this.adapter.infer({lane,capture,signal:abort.signal,onTiming:(key,value)=>{draft[key]=value;}}),cancelled]);
      call.inferenceSource=result.inferenceSource ?? null;
      call.rawResponse=this.adapter.redact?.(result.text) ?? result.text;
      if (call.inferenceSource!==(lane==='nano'?'on_device':'in_cloud')) throw failure('unexpected_inference_source');
      call.validation=parseIdentity(result.text); call.normalized=call.validation.identity; delete call.validation.identity;
      call.status='response';
    } catch(e) {call.error={code:this.adapter.errorCode?.(e) ?? e.code ?? 'technical_error'};if(this.adapter.evidenceKind==='real_firebase'&&this.adapter.redact)call.error.message=this.adapter.redact(String(e.message??'')).slice(0,1200);}
    finally {clearTimeout(timer);parentSignal.removeEventListener('abort',relay);call.timings={...draft,totalMs:performance.now()-start};}
    return safeCopy(call);
  }
  selectManual(profileId) {
    if(!this.active)throw failure('no_capture'); if(this.inflight)throw failure('analysis_in_progress');
    let r=this.records.get(this.active.captureId);
    if(!r){r={schemaVersion:'itc-identity-run/1.0.0',evidenceKind:this.adapter.evidenceKind,captureId:this.active.captureId,status:'manual_only',nano:null,cloud:null,decision:null,events:[]};this.records.set(this.active.captureId,r);}
    r.manualSelection={...manualProfile(profileId),captureId:this.active.captureId,at:new Date().toISOString()};this.publish();return this.view();
  }
  exportRecords() {return safeCopy({schemaVersion:'itc-identity-session/1.0.0',evidenceKind:this.adapter.evidenceKind,callsUsed:this.callsUsed,maxCalls:this.maxCalls,records:[...this.records.values()]});}
}
