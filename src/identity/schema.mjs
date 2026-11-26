export const SCHEMA_VERSION = 'itc-board-identity/1.0.0';
export const STATUSES = ['identified', 'partial', 'unknown', 'ambiguous'];
const identityKeys = ['manufacturer', 'family', 'model', 'hardwareRevision', 'boardId'];
const keys = ['schemaVersion', ...identityKeys, 'status', 'visualEvidence', 'alternatives', 'limitations'];
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const exactKeys = (v, names) => plain(v) && Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
const nullableText = v => v === null || (typeof v === 'string' && v.trim().length > 0 && v.length <= 160 && !/[\u0000-\u001f]/.test(v));
const list = v => Array.isArray(v) && v.length <= 8 && v.every(s => typeof s === 'string' && s.trim().length > 0 && s.length <= 400 && !/[\u0000-\u001f]/.test(s));

// No extraction from prose, guessed fields, coercion, or model-powered repair.
// The sole recovery is removing one complete Markdown JSON fence.
export function parseIdentity(raw) {
  if (typeof raw !== 'string' || raw.length > 16000) return {valid:false, errors:['response_size_or_type'], identity:null, recovery:null};
  let text = raw.trim(), recovery = null;
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(text);
  if (fence) { text = fence[1].trim(); recovery = 'single_json_fence'; }
  let v;
  try { v = JSON.parse(text); } catch { return {valid:false, errors:['invalid_json'], identity:null, recovery}; }
  const errors = [];
  if (!exactKeys(v, keys)) errors.push('exact_fields_required');
  if (!plain(v)) return {valid:false, errors, identity:null, recovery};
  if (v.schemaVersion !== SCHEMA_VERSION) errors.push('schema_version');
  if (!STATUSES.includes(v.status)) errors.push('status');
  for (const key of identityKeys) if (!nullableText(v[key])) errors.push(key);
  for (const key of ['visualEvidence','limitations']) if (!list(v[key])) errors.push(key);
  if (!Array.isArray(v.alternatives) || v.alternatives.length > 4 || !v.alternatives.every(a => exactKeys(a,[...identityKeys,'reason']) && identityKeys.every(k=>nullableText(a[k])) && typeof a.reason === 'string' && a.reason.trim().length > 0 && a.reason.length <= 400)) errors.push('alternatives');
  if (v.boardId !== null && (typeof v.boardId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(v.boardId))) errors.push('board_id_format');
  if (v.status === 'identified' && (!v.manufacturer || !v.model || !v.visualEvidence?.length || v.alternatives?.length)) errors.push('identified_requires_model_evidence_no_alternatives');
  if (v.status === 'unknown' && identityKeys.some(k=>v[k] !== null)) errors.push('unknown_must_abstain');
  if (['unknown','partial'].includes(v.status) && v.alternatives?.length) errors.push('alternatives_require_ambiguous');
  if (v.status === 'partial' && ['model','boardId','hardwareRevision'].some(k=>v[k]!==null)) errors.push('partial_must_abstain_from_model_and_revision');
  if (v.status === 'partial' && !v.manufacturer && !v.family) errors.push('partial_requires_family_or_manufacturer');
  if (v.status === 'ambiguous' && (!Array.isArray(v.alternatives) || v.alternatives.length < 2)) errors.push('ambiguous_requires_alternatives');
  if (errors.length) return {valid:false, errors, identity:null, recovery};
  for (const k of identityKeys) if (v[k] !== null) v[k] = v[k].trim();
  v.visualEvidence = v.visualEvidence.map(s=>s.trim()); v.limitations = v.limitations.map(s=>s.trim());
  return {valid:true, errors:[], identity:v, recovery};
}

// A schema accepted by Chrome's JSON constrained output. Runtime validation
// above is stricter, including status-dependent rules and bounded strings.
const nullableString = {type:['string','null']};
const identityProperties = Object.fromEntries(identityKeys.map(k=>[k,nullableString]));
export const JSON_SCHEMA = {
  type:'object', additionalProperties:false, required:keys,
  properties:{schemaVersion:{type:'string',enum:[SCHEMA_VERSION]}, ...identityProperties,
    status:{type:'string',enum:STATUSES}, visualEvidence:{type:'array',items:{type:'string'}},
    alternatives:{type:'array',items:{type:'object',additionalProperties:false,required:[...identityKeys,'reason'],properties:{...identityProperties,reason:{type:'string'}}}},
    limitations:{type:'array',items:{type:'string'}}}
};

export function firebaseResponseSchema(Schema) {
  const fields = Object.fromEntries(identityKeys.map(k=>[k,Schema.string({nullable:true})]));
  return Schema.object({properties:{schemaVersion:Schema.enumString({enum:[SCHEMA_VERSION]}), ...fields,
    status:Schema.enumString({enum:STATUSES}), visualEvidence:Schema.array({items:Schema.string()}),
    alternatives:Schema.array({items:Schema.object({properties:{...fields,reason:Schema.string()}})}),
    limitations:Schema.array({items:Schema.string()})}});
}
