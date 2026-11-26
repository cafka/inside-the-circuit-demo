const normalize=s=>String(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
// Resolve only exact saved identities. This does not identify a photograph.
export function identifyHostedName(name,boards){
 const q=normalize(name);
 const matches=q?boards.filter(b=>[b.identity.model,b.identity.manufacturer+' '+b.identity.model,b.id].some(v=>normalize(v)===q)):[];
 return {status:matches.length===1?'identified':matches.length?'ambiguous':'unknown',basis:'persistent_catalog',confidence:'saved_documentation_identity',probability:null,candidates:matches.map(b=>({id:b.id,...b.identity,saved:true,modelAvailable:b.modelAvailable}))};
}
