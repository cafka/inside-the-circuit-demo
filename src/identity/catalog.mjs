// Stage 2 indexes the frozen candidate; it neither changes nor executes P1+M+.
// No physical revision has independent coverage evidence in Stage 1.
export const PI5_PROFILE = Object.freeze({
  profileId:'rpi5', boardId:'raspberry-pi-5', profileVersion:'0.1.0-experimental',
  schemaVersion:'itc-profile-catalog-entry/1.0.0', profileContractVersion:'itc-board-profile/1.0.0', manifestKind:'identity-index-only',
  legacySchema:'perfil-placa-1', hardwareRevision:'unknown', compatibleHardwareRevisions:Object.freeze([]),
  publication:'candidate', validation:'pending_local_validation', recognitionAvailable:false,
  engineCompatibility:'frozen-stage1', strategyId:'anillos_dorados_rpi5',
  sourceCommit:'ae56be650cab47fb5ee2c78659df86d2e1571a9b',
  sourcePath:'app/data/perfiles/rpi5.json',
  sourceProfileSha256:'7eadbc08532eb41e9d565cbce778709529d8e422e8ed9af5d3a177270ca0f670',
  note:'Candidate lookup only. Unknown revision is not a wildcard. Component recognition is outside Stage 2.'
});
const manufacturers = new Set(['Raspberry Pi','Raspberry Pi Ltd','Raspberry Pi Ltd.']);
const models = new Set(['Raspberry Pi 5','Pi 5']);
export function resolveProfile(identity) {
  if (!identity || identity.status !== 'identified') return {status:'insufficient_identity', profile:null};
  if (identity.boardId !== 'raspberry-pi-5') return {status:'profile_unavailable', profile:null};
  if (!manufacturers.has(identity.manufacturer) || !models.has(identity.model) || (identity.family !== null && identity.family !== 'Raspberry Pi')) return {status:'identifier_conflict', profile:null};
  if (identity.hardwareRevision !== null) return {status:'revision_not_validated', profile:null, candidateProfileId:'rpi5'};
  return {status:'candidate_revision_unknown', profile:PI5_PROFILE, compatible:false};
}
export function manualProfile(profileId) {
  if (profileId !== PI5_PROFILE.profileId) throw new Error('unknown_profile');
  return {status:'manual_candidate', profile:PI5_PROFILE, compatible:false, provenance:'user_selection', validation:'pending_local_validation'};
}
