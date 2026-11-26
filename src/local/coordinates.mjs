import {preparedSize} from '../experimental/kiro/p1/preparar.js';
export function imageTransform(width,height){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('invalid_image_dimensions');
 const p=preparedSize(width,height);return {...p,originalWidth:width,originalHeight:height,scaleX:p.width/width,scaleY:p.height/height};
}
export function originalPolygon(points,t){
 if(!Array.isArray(points)||points.length!==4||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))return null;
 return points.map(([x,y])=>[x/t.scaleX,y/t.scaleY]);
}
export function validateDimensions(profile){return Number.isFinite(profile?.dimensiones?.w)&&profile.dimensiones.w>0&&Number.isFinite(profile?.dimensiones?.h)&&profile.dimensiones.h>0;}
