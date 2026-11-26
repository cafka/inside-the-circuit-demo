// A transport error is never evidence that an image contains no board.
export function photoOutcome(observation){
 if(!observation.validation?.valid)return null;
 const presence=observation.validation.boardPresence;
 if(presence==='absent')return 'photo.noBoard';
 if(presence==='uncertain')return 'photo.uncertainPresence';
 if(presence==='present'&&observation.status!=='identified')return 'photo.unknownBoard';
 return null;
}
