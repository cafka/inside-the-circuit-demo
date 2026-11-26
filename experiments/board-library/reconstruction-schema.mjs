import {Schema as S} from 'firebase/ai';
const str=()=>S.string(), num=()=>S.number(), nullableString=()=>S.string({nullable:true}), nullableNumber=()=>S.number({nullable:true});
const point=()=>S.array({items:num()});
const poly=(min=3,max=100)=>S.array({items:point()});
const evidence=()=>S.object({properties:{sourceId:nullableString(),basis:S.enumString({enum:['documented','image_estimate','unknown']}),reason:str()}});
const range=()=>S.array({items:num(),nullable:true});
const lesson=()=>S.object({properties:{label:str(),description:str(),example:str()}});
export const reconstructionSchema=S.object({properties:{
 referenceImageId:str(),
 board:S.object({properties:{corners:poly(4,4),outline:poly(),widthMm:num(),depthMm:num(),dimensionsEvidence:S.object({properties:{sourceId:str(),quote:str(),basis:S.enumString({enum:['documented']})}}),thicknessMm:nullableNumber(),thicknessRangeMm:range(),thicknessEvidence:evidence(),colourSamplePoint:point(),holes:S.array({items:S.object({properties:{center:point(),radius:num(),evidence:str()}})})}}),
 objects:S.array({items:S.object({properties:{id:str(),polygon:poly(4,4),shape:S.enumString({enum:['box','open_connector','cylinder']}),openingDirection:S.string({nullable:true}),visualClass:S.enumString({enum:['chip_package','connector_polymer','nickel_satin','tin_satin','black_polymer','unknown']}),heightMm:nullableNumber(),heightRangeMm:range(),heightEvidence:evidence(),identityStatus:S.enumString({enum:['documented_instance','documented_class','unknown']}),designator:nullableString(),partNumber:nullableString(),evidence:str(),sourceIds:S.array({items:str()}),translations:S.object({properties:{es:lesson(),en:lesson()}})}})}),
 contacts:S.array({items:S.object({properties:{polygon:poly(),appearance:S.enumString({enum:['silver','gold','unknown']}),evidence:str()}})}),
 silkscreen:S.object({properties:{status:S.enumString({enum:['visible','unknown']}),evidence:str()}}),
 missingResources:S.array({items:str()}),datasheetLinks:S.array({items:S.object({properties:{url:str(),partNumber:str(),basis:str()}})}),limitations:S.array({items:str()})
}});
