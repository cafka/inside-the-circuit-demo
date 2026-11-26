import fs from 'node:fs';
import path from 'node:path';
import {DIR} from './catalog.mjs';
export const discoveryPolicy=JSON.parse(fs.readFileSync(path.join(DIR,'discovery-policy.json')));
export const normalizeName=s=>String(s).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const words=s=>normalizeName(s).split(' ').filter(Boolean);
export const coverage=(name,text)=>{const tokens=words(name),hay=new Set(words(text));return tokens.filter(t=>hay.has(t)).length/tokens.length;};
export function matchedModel(name,heading){
  const tokens=name.trim().split(/\s+/),h=' '+normalizeName(heading)+' ';
  for(let length=tokens.length;length>=2;length--)for(let start=0;start<=tokens.length-length;start++){
    const phrase=tokens.slice(start,start+length).join(' ');if(h.includes(' '+normalizeName(phrase)+' '))return phrase;
  }
  return null;
}
const decode=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n));
export const plain=s=>decode(s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
export function links(text,base){
  const items=[];
  for(const m of text.matchAll(/<a\b[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>|<img\b[^>]*?src=["']([^"']+)["'][^>]*>/gi)){
    try{const url=new URL(decode(m[1]||m[3]),base);if(url.protocol==='https:')items.push({url:url.href,text:plain(m[2]||m[0].match(/alt=["']([^"']*)/)?.[1]||''),type:m[3]?'img':'a'});}catch{}
  }
  for(const m of text.matchAll(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g))items.push({url:m[2],text:m[1],type:'a'});
  for(const m of text.matchAll(/https:\/\/[^\s)<>"\]]+/g))if(!items.some(x=>x.url===decode(m[0])))items.push({url:decode(m[0]),text:'',type:'a'});
  return [...new Map(items.map(x=>[x.url.split('#')[0],x])).values()];
}
export function assetKind(url,label=''){
  const s=decodeURIComponent(new URL(url).pathname),context=s+' '+label;
  if(/\.(step|stp)$/i.test(s))return 'step';if(/\.glb$/i.test(s))return 'glb';
  if(/\.(zip|kicad_pcb|pcbdoc|brd|sch|schdoc|kicad_sch|dxf|iges|igs)$/i.test(s))return 'cad';
  if(/\.pdf$/i.test(s))return /schematic|sch[_.-]/i.test(context)?'schematic':/pinout/i.test(context)?'pinout':/layout/i.test(context)?'layout':'documentation';
  if(/\.(png|jpe?g|webp|svg)$/i.test(s))return /pinout/i.test(context)?'pinout':'image';return null;
}
export function resourceRole(resource,identity){
 if(resource.kind==='image'||resource.kind==='pinout')return 'linked_document'; // A product gallery suffix is not a hardware revision.
 const file=decodeURIComponent(new URL(resource.url).pathname.split('/').at(-1)),base=normalizeName(file.replace(/\.[^.]+$/,''));
 const model=normalizeName(identity.model),manufacturer=normalizeName(identity.manufacturer||'');
 let remainder=base.replace(model,' ').replace(manufacturer||/^$/,' ').trim();
 remainder=remainder.replace(/\b(cad|altium|schematic|schematics|layout|datasheet|pinout|files|model|models|3d|pcb|gerber)\b/g,'').replace(/\s+/g,' ').trim();
 if(base.includes(model))return remainder?'related_variant':'requested_board';
 if(/\/(3dmodels|footprints|parts|components|templates)\//i.test(resource.url))return 'part_or_template';
 return 'linked_document';
}
const repoURL=url=>{const u=new URL(url),p=u.pathname.split('/').filter(Boolean);return u.hostname==='github.com'&&p.length>=2?{owner:p[0],repo:p[1],path:p.slice(4).join('/'),ref:p[3]||null}:null;};
export async function discoverByName(name,client,onProgress=()=>{}){
  if(typeof name!=='string'||name.trim().length<4||name.length>140||/[<>\r\n]/.test(name))throw Error('invalid_board_name');
  const evidence={input:name,provider:discoveryPolicy.searchProvider,search:[],candidates:[],pages:[],repositories:[],resources:[],errors:[],authority:{status:'unverified'}};
  const request=async url=>{try{return await client.get(url,8*1024*1024);}catch(e){evidence.errors.push({url,error:e.message});return null;}};
  onProgress('search');
  const searchURL='https://api.github.com/search/repositories?q='+encodeURIComponent('"'+name.replace(/"/g,'')+'" in:readme')+'&per_page='+discoveryPolicy.maxRepositories+'&sort=stars';
  const search=await request(searchURL);if(!search)return evidence;
  const data=JSON.parse(search.bytes);evidence.search.push({url:searchURL,sha256:search.sha256,total:data.total_count});
  const seeds=[];
  for(const repo of data.items||[]){
    const readme=await request(`https://api.github.com/repos/${repo.full_name}/readme`);if(!readme)continue;
    const meta=JSON.parse(readme.bytes),text=Buffer.from(meta.content||'','base64').toString();
    for(const l of links(text,repo.html_url))if(new URL(l.url).hostname!=='github.com'&&!assetKind(l.url))seeds.push({...l,via:repo.html_url,readmeSHA256:readme.sha256,score:coverage(name,decodeURIComponent(l.url)+' '+l.text)});
  }
  const unique=[...new Map(seeds.sort((a,b)=>b.score-a.score).map(x=>[x.url,x])).values()].filter(x=>x.score>=.5).slice(0,discoveryPolicy.maxCandidatePages);
  onProgress('authority');
  for(const seed of unique){
    const page=await request(seed.url);if(!page)continue;const html=page.bytes.toString(),title=plain(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||''),h1=plain(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'');
    const score=coverage(name,title+' '+h1),ls=links(html,page.url);
    const candidate={...seed,url:page.url,title,h1,nameCoverage:score,sha256:page.sha256,file:page.file,hasProductResources:ls.some(l=>assetKind(l.url)||/schematic|datasheet/i.test(l.text)),html,links:ls};
    evidence.candidates.push({...candidate,html:undefined,links:undefined});
    if(score>=discoveryPolicy.minimumNameCoverage&&candidate.hasProductResources&&!evidence.pages.some(p=>p.url===candidate.url))evidence.pages.push(candidate);
  }
  // Prefer the product page over tutorials, without making the first search result authoritative.
  evidence.pages.sort((a,b)=>Number(/\/products?\/|\/hardware\//i.test(b.url))-Number(/\/products?\/|\/hardware\//i.test(a.url))||b.nameCoverage-a.nameCoverage);
  const page=evidence.pages[0];if(!page){evidence.reason='no_matching_documented_product_page';return evidence;}
  const structured=[...page.html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(m=>{try{const j=JSON.parse(m[1]);return Array.isArray(j)?j:j['@graph']||[j];}catch{return[];}});
  const product=structured.find(p=>p['@type']==='Product'&&coverage(name,p.name)>=discoveryPolicy.minimumNameCoverage);
  const titleParts=page.title.split(/\s+[|–—]\s+/);evidence.identity={model:matchedModel(name,page.h1)||matchedModel(name,page.title),manufacturer:product?.brand?.name||(titleParts.length>1?titleParts.at(-1):null),hardwareRevision:null,basis:'name_matches_document_heading',probability:null};
  const origin=new URL(page.url).origin;const candidateRepoLinks=page.links.filter(l=>repoURL(l.url));
  const scope=new URL(page.url).pathname.split('/').filter(Boolean).find(part=>coverage(evidence.identity.model,part)===1);
  evidence.documentScope=scope;
  // One bounded related-document crawl; all resource downloads retain their parent link.
  const more=page.links.filter(l=>new URL(l.url).origin===origin&&!assetKind(l.url)&&scope&&new URL(l.url).pathname.split('/').includes(scope)&&!/add.on|accessor/i.test(l.text)&&/doc|spec|design|download|started/i.test(l.url+' '+l.text)).sort((a,b)=>Number(/datasheet|design|schematic/i.test(b.url+' '+b.text))-Number(/datasheet|design|schematic/i.test(a.url+' '+a.text))).slice(0,discoveryPolicy.maxDocumentPages);
  for(const link of more){if(evidence.pages.some(p=>p.url===link.url))continue;const p=await request(link.url);if(!p||evidence.pages.some(v=>v.url===p.url))continue;const html=p.bytes.toString();evidence.pages.push({url:p.url,title:plain(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||''),sha256:p.sha256,file:p.file,html,links:links(html,p.url)});}
  const allLinks=evidence.pages.flatMap(p=>p.links.map(l=>({...l,parent:p.url,parentSHA256:p.sha256})));
  candidateRepoLinks.push(...allLinks.filter(l=>repoURL(l.url)&&/schematic|layout|mechanic|design|hardware|electrical/i.test(l.text+' '+l.url)));
  evidence.selectedPage=page.url;
  allLinks.push(...await repositoryResources(evidence,client,candidateRepoLinks));
  const relevant=allLinks.filter(l=>l.kind==='license'||assetKind(l.url));
  evidence.resources=[...new Map(relevant.map(l=>[l.url,{...l,kind:l.kind||assetKind(l.url,l.text),license:{id:l.repositoryLicense==='NOASSERTION'?null:l.repositoryLicense||null,status:l.repositoryLicense&&l.repositoryLicense!=='NOASSERTION'?'repository_declaration':'undetermined',redistributionAuthorized:false}}])).values()];
  evidence.selectedPage=page.url;
  evidence.pages=evidence.pages.map(({html,links,...p})=>p);
  return evidence;
}

export async function repositoryResources(evidence,client,incoming){
 const allLinks=[];
 const request=async url=>{try{return await client.get(url,8*1024*1024);}catch(e){evidence.errors.push({url,error:e.message});return null;}};
  const seenRepos=new Set(evidence.repositories.map(r=>r.name));
  for(const link of incoming){
    const r=repoURL(link.url);if(!r)continue;const key=r.owner+'/'+r.repo;if(seenRepos.has(key)||seenRepos.size>=discoveryPolicy.maxRepositoryTrees)continue;seenRepos.add(key);
    const metaResponse=await request(`https://api.github.com/repos/${key}`);if(!metaResponse)continue;const meta=JSON.parse(metaResponse.bytes);
    const requestedRef=r.ref||meta.default_branch,commitResponse=await request(`https://api.github.com/repos/${key}/commits/${encodeURIComponent(requestedRef)}`);if(!commitResponse)continue;const commit=JSON.parse(commitResponse.bytes).sha;
    if(!/^[a-f0-9]{40}$/.test(commit)){evidence.errors.push({url:link.url,error:'invalid_commit_revision'});continue;}
    const treeResponse=await request(`https://api.github.com/repos/${key}/git/trees/${commit}?recursive=1`);if(!treeResponse)continue;const tree=JSON.parse(treeResponse.bytes);
    const repository={name:key,via:link.url,linkedFrom:link.parent||evidence.selectedPage,defaultBranch:meta.default_branch,requestedRef,commit,treeResponseSHA:tree.sha,license:meta.license,treeTruncated:!!tree.truncated,treeSHA256:treeResponse.sha256,files:tree.tree.filter(x=>x.type==='blob').map(x=>({path:x.path,sha:x.sha,size:x.size}))};
    evidence.repositories.push(repository);
    const ownerResponse=await request(`https://api.github.com/users/${r.owner}`);if(ownerResponse){const owner=JSON.parse(ownerResponse.bytes),blog=owner.blog?.replace(/\/$/,'');if(blog){const blogURL=blog.startsWith('http')?blog.replace(/^http:/,'https:'):'https://'+blog,orgHome=await request(blogURL);const sourceHost=new URL(evidence.selectedPage).hostname;const redirectedSource=client.log.some(row=>new URL(row.url).hostname===new URL(blogURL).hostname&&row.redirect===evidence.selectedPage);if(owner.type==='Organization'&&orgHome&&(new URL(orgHome.url).hostname===sourceHost||redirectedSource||links(orgHome.bytes.toString(),orgHome.url).some(l=>new URL(l.url).hostname===sourceHost)||[...orgHome.bytes.toString().matchAll(/(?:document|window)\.location\s*=\s*["'](https?:\/\/[^"']+)["']/g)].some(m=>new URL(m[1]).hostname===sourceHost))){evidence.authority={status:'reciprocal_publisher_links',publisher:owner.name||owner.login,organization:owner.html_url,homepage:orgHome.url,organizationSHA256:ownerResponse.sha256,note:'Document links repository; organization links source domain, including recorded publisher redirects. Provenance evidence, not a universal authenticity certificate.'};}}}
    const folder=r.path;
    const files=repository.files.filter(x=>assetKind('https://placeholder.example/'+x.path)&&(folder?(x.path===folder||x.path.startsWith(folder+'/')):coverage(evidence.identity.model,x.path)>=.5));
    for(const file of files)allLinks.push({url:`https://raw.githubusercontent.com/${key}/${commit}/${file.path}`,text:file.path,parent:link.url,parentContext:link.context||link.text,parentSHA256:treeResponse.sha256,repository:key,commit,repositoryLicense:meta.license?.spdx_id||null,gitBlob:file.sha});
    // Save license links as evidence; repository-level declarations are not applied to unrelated assets.
    for(const file of repository.files.filter(x=>/^(license|copying|notice)(\.|$)/i.test(x.path)))allLinks.push({url:`https://raw.githubusercontent.com/${key}/${commit}/${file.path}`,text:file.path,parent:link.url,kind:'license',repository:key});
  }
 return allLinks;
}
