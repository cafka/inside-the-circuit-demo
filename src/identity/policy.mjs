import { resolveProfile } from './catalog.mjs';
export const POLICY_VERSION = 'itc-identity-policy/1.0.0';
export function fallbackFor(call) {
  if (call.status === 'error') return {category:'technical', reason:call.error.code};
  if (!call.validation?.valid) return {category:'insufficient_recognition', reason:'invalid_response'};
  if (call.normalized.status !== 'identified') return {category:'insufficient_recognition', reason:call.normalized.status};
  const resolution = resolveProfile(call.normalized);
  if (!resolution.profile) return {category:'insufficient_recognition', reason:resolution.status};
  return null;
}
const canonical = (k,v) => k === 'manufacturer' && ['Raspberry Pi Ltd','Raspberry Pi Ltd.'].includes(v) ? 'Raspberry Pi' : k === 'model' && v === 'Pi 5' ? 'Raspberry Pi 5' : v;
export function reconcile(nano, cloud) {
  const n = nano?.validation?.valid ? nano.normalized : null, c = cloud?.validation?.valid ? cloud.normalized : null;
  const contradictions = n && c ? ['manufacturer','family','model','boardId','hardwareRevision'].filter(k=>n[k]!==null && c[k]!==null && canonical(k,n[k])!==canonical(k,c[k])) : [];
  if (contradictions.length) return {status:'ambiguous', selectedIdentity:null, selectedBy:null, contradictions, catalog:{status:'contradiction',profile:null}, validation:'pending_local_validation'};
  if (n?.status==='ambiguous' || c?.status==='ambiguous') return {status:'ambiguous',selectedIdentity:null,selectedBy:null,contradictions:[],catalog:{status:'unresolved_alternatives',profile:null},validation:'pending_local_validation'};
  // A specific result must pass its own evidence contract. Specificity itself is
  // never a tie breaker. Any conflicting non-null claim above vetoes selection.
  const selected = n?.status === 'identified' ? n : c?.status === 'identified' ? c : n ?? c;
  const selectedBy = selected === n && n ? 'nano' : selected === c && c ? 'cloud' : null;
  return {status:selected?.status ?? 'error', selectedIdentity:selected ?? null, selectedBy, contradictions:[], catalog:resolveProfile(selected), validation:'pending_local_validation'};
}
