// Educational text can survive a deterministic re-conversion of the same STEP.
// This grants no surface/coordinate calibration and never creates mesh bindings.
export function educationProfileMatches(record,entry){
 if(entry.id!==record.id)return false;
 if(entry.assetSHA256&&entry.assetSHA256===record.inventory?.sourceHash)return true;
 return !!entry.stepSHA256&&['official','linked_publisher'].includes(record.source?.authority)&&entry.stepSHA256===record.conversion?.sourceSHA256;
}
