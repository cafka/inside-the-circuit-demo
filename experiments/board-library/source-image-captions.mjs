// Conservative bindings between image URLs and explicit publisher captions.
// This is metadata extraction only: no filenames, gallery-order inference or AI.
const decode=s=>String(s||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'");
const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)].map(m=>[m[1].toLowerCase(),decode(m[2])]));
const absolute=(value,base)=>{try{const u=new URL(value,base);return u.protocol==='https:'?u.href:null;}catch{return null;}};
const clean=s=>decode(s.replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
function urls(a,base){return [...new Set([a.src,a['data-src'],...String(a.srcset||a['data-srcset']||'').split(',').map(v=>v.trim().split(/\s+/)[0])].filter(Boolean).map(v=>absolute(v,base)).filter(Boolean))];}
export function linkedImageCaptions(html,pageURL){
 const out=[],add=(url,caption,method)=>{if(url&&caption&&caption.length<=500)out.push({url,caption,method});};
 for(const match of html.matchAll(/<img\b[^>]*>/gi)){const a=attrs(match[0]);for(const url of urls(a,pageURL))add(url,a.alt||a.title,'image_attribute');}
 for(const match of html.matchAll(/<picture\b[^>]*>([\s\S]*?)<\/picture>/gi)){
  const tags=[...match[1].matchAll(/<img\b[^>]*>/gi)];if(tags.length!==1)continue;
  const a=attrs(tags[0][0]),caption=a.alt||a.title;
  for(const tag of match[1].matchAll(/<source\b[^>]*>/gi))for(const url of urls(attrs(tag[0]),pageURL))add(url,caption,'picture_caption');
 }
 for(const match of html.matchAll(/<figure\b[^>]*>([\s\S]*?)<\/figure>/gi)){
  const tags=[...match[1].matchAll(/<img\b[^>]*>/gi)],caps=[...match[1].matchAll(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/gi)];
  if(tags.length!==1||caps.length!==1)continue;
  for(const url of urls(attrs(tags[0][0]),pageURL))add(url,clean(caps[0][1]),'single_image_figure');
 }
 for(const script of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  if(script[1].length>500000)continue;
  try{const walk=(value,depth=0)=>{if(depth>12||!value||typeof value!=='object')return;
   if(value['@type']==='ImageObject'&&typeof value.contentUrl==='string'&&typeof value.caption==='string')add(absolute(value.contentUrl,pageURL),clean(value.caption),'image_object_caption');
   for(const child of Object.values(value))if(Array.isArray(child))child.forEach(v=>walk(v,depth+1));else if(child&&typeof child==='object')walk(child,depth+1);
  };walk(JSON.parse(script[1]));}catch{/* Malformed metadata supplies no evidence. */}
 }
 return out;
}
export function explicitRearCaption(caption){return /\b(rear|back|bottom|underside|reverse|reverso|dorso|cara inferior)\b/i.test(caption)&&!/\b(front|top|frente|anverso|schematic|pinout|diagram|drawing|esquema|not|no|other)\b/i.test(caption);}
