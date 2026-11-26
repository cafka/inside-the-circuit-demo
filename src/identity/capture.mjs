export async function createCapture(bytes, mimeType) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > 8*1024*1024 || !['image/jpeg','image/png'].includes(mimeType)) throw new Error('invalid_image');
  const copy = Uint8Array.from(bytes);
  const signatureOK = mimeType === 'image/jpeg' ? copy[0]===255 && copy[1]===216 && copy[2]===255 : [137,80,78,71,13,10,26,10].every((b,i)=>copy[i]===b);
  if (!signatureOK) throw new Error('image_signature_mismatch');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',copy))].map(x=>x.toString(16).padStart(2,'0')).join('');
  let binary = ''; for (let i=0;i<copy.length;i+=8192) binary += String.fromCharCode(...copy.subarray(i,i+8192));
  return Object.freeze({captureId:`sha256:${hash}`, sha256:hash, mimeType, byteLength:copy.length, base64:btoa(binary)});
}
