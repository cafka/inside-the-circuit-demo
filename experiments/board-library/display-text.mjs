// Repair reversible UTF-8-as-Windows-1252 sequences for display only.
// Historical catalogues and raw inference outputs are never rewritten.
const cp1252 = new Map([...new TextDecoder('windows-1252').decode(Uint8Array.from({length:32},(_,i)=>128+i))].map((ch,i)=>[ch,128+i]));
const utf8 = new TextDecoder('utf-8',{fatal:true});
export function displayText(value='') {
  return String(value).replace(/[\u00c2-\u00f4][\u0080-\u00bf€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]{1,3}/g, sequence=>{
    try { return utf8.decode(Uint8Array.from([...sequence],ch=>cp1252.get(ch)??ch.charCodeAt(0))); }
    catch { return sequence; }
  });
}
