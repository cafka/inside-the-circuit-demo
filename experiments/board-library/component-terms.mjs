// Lexical equivalents, not a list of components expected on any board. Geometry
// and semantic visual confirmation are deliberately outside this module.
export const termPolicy='document-component-terms/2';
export const normalizeTerm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 .replace(/\btype[ -]?c\b/g,'c').replace(/\bpci[ -]?express\b/g,'pcie')
 .replace(/[^a-z0-9]+/g,' ').trim().replace(/([a-z]) +(?=\d)/g,'$1');
const withoutSuffix=s=>s.replace(/\s+(?:chip|ic|ports?|connector|jack)$/,'').trim();
export function documentTerms(component,extra=[]){
 const labels=[component.label,component.id,component.partNumber,component.reference,component.designator,
  ...Object.values(component.translations||{}).map(t=>t.label),...extra];
 // Technical references are already backed by the component's documentary source.
 // Use their heading only; explanatory prose is not another component identity.
 const references=[component.technicalReference,...Object.values(component.translations||{}).map(t=>t.technicalReference)]
  .filter(Boolean).map(s=>s.split(/[·\n]/)[0].trim());
 return [...new Set([...labels,...references].filter(Boolean).map(normalizeTerm))];
}
export function matchesDocumentTerm(observed,documented){
 if(!observed||!documented)return false;
 if(observed===documented)return true;
 const short=withoutSuffix(observed),reference=withoutSuffix(documented);
 if(short===reference&&short.replaceAll(' ','').length>=3)return true;
 // Short identifiers need both letters and numbers; do not match generic IC/U/J.
 const informative=s=>s.replaceAll(' ','').length>=5||(s.includes(' ')&&s.replaceAll(' ','').length>=4)||/^(?=.*[a-z])(?=.*\d)[a-z0-9]{3,}$/.test(s);
 return informative(short)&&(` ${documented} `.includes(` ${short} `)||short===reference)||
  informative(reference)&&` ${observed} `.includes(` ${reference} `);
}
