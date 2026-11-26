// Read only dimensions and orientation; never export GPS or other EXIF fields.
export function encodedMetadata(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),out={format:'unknown',width:null,height:null,exifOrientation:null};
 if(bytes.length>=24&&v.getUint32(0)===0x89504e47){return {...out,format:'png',width:v.getUint32(16),height:v.getUint32(20)};}
 if(bytes.length<4||v.getUint16(0)!==0xffd8)return out;out.format='jpeg';
 for(let p=2;p+4<=bytes.length;){if(bytes[p]!==255)break;const marker=bytes[p+1];if(marker===0xda||marker===0xd9)break;const len=v.getUint16(p+2),end=p+2+len;if(len<2||end>bytes.length)break;
  if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&len>=7){out.height=v.getUint16(p+5);out.width=v.getUint16(p+7);}
  if(marker===0xe1&&len>=16&&v.getUint32(p+4)===0x45786966&&v.getUint16(p+8)===0){try{const t=p+10,le=v.getUint16(t)===0x4949,ifd=t+v.getUint32(t+4,le);if(ifd>=t&&ifd+2<=end){const n=v.getUint16(ifd,le);for(let i=0;i<n;i++){const e=ifd+2+12*i;if(e+12>end)break;if(v.getUint16(e,le)===0x112&&v.getUint16(e+2,le)===3&&v.getUint32(e+4,le)===1){const o=v.getUint16(e+8,le);if(o>=1&&o<=8)out.exifOrientation=o;}}}}catch{/* malformed EXIF is recorded as absent/unknown, browser remains decoder */}}
  p=end;
 }return out;
}
