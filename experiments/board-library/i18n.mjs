import ui from './locales/ui.json';
import messages from './locales/messages.json';
import content from './locales/content.json';
import diagnosticPatterns from './locales/diagnostic-patterns.json';
import {displayText} from './display-text.mjs';
export const resources={...ui,...messages};
const supported=['es','en'],listeners=new Set(),bindings=new Map();
let language='en';
try{const saved=localStorage.getItem('itc-language');language=supported.includes(saved)?saved:navigator.language.toLowerCase().startsWith('es')?'es':'en';}catch{language=globalThis.navigator?.language?.toLowerCase().startsWith('es')?'es':'en';}
export const locale=()=>language;
export function t(key,args={}){const row=resources[key];if(!row)throw Error('Missing translation: '+key);return row[language].replace(/\{(\w+)\}/g,(_,k)=>String(args[k]??''));}
export function message(target,key,args={}){const el=typeof target==='string'?document.querySelector(target):target;if(!el)return;bindings.set(el,{key,args});el.removeAttribute('data-i18n');el.textContent=t(key,args);}
export function clearMessage(target){const el=typeof target==='string'?document.querySelector(target):target;if(!el)return;bindings.delete(el);el.removeAttribute('data-i18n');el.textContent='';}
export function translateDOM(root=document){
 for(const el of root.querySelectorAll('[data-i18n]'))el.textContent=t(el.dataset.i18n);
 for(const attr of ['aria-label','title','placeholder'])for(const el of root.querySelectorAll(`[data-i18n-${attr}]`))el.setAttribute(attr,t(el.getAttribute('data-i18n-'+attr)));
 for(const [el,m]of bindings){if(el.isConnected)el.textContent=t(m.key,m.args);else bindings.delete(el);}
 document.documentElement.lang=language;
 for(const b of document.querySelectorAll('[data-language]'))b.setAttribute('aria-pressed',String(b.dataset.language===language));
}
export function setLocale(value){if(!supported.includes(value)||value===language)return;language=value;try{localStorage.setItem('itc-language',value);}catch{}translateDOM();for(const fn of listeners)fn();}
export function onLocaleChange(fn){listeners.add(fn);return()=>listeners.delete(fn);}
export function initLanguage(){translateDOM();for(const b of document.querySelectorAll('[data-language]'))b.onclick=()=>setLocale(b.dataset.language);}
// Reviewed translations of existing catalogue content. Unknown text is never guessed.
const patterns=diagnosticPatterns.map(p=>({...p,regex:new RegExp(p.pattern)}));
export function localize(value){const text=displayText(value||'');const pair=content[text];if(pair)return pair[language];if(language==='en'){for(const p of patterns){const match=p.regex.exec(text);if(match)return p.en.replace(/\{(\d+)\}/g,(_,i)=>localize(match[Number(i)]));}if(text.includes('; '))return text.split('; ').map(localize).join('; ');}return text;}
export function componentText(component){const pair=component.translations?.[language];const original=displayText(component.description||'');const known=content[original];const sourceLanguage=component.sourceLanguage||'es';return {label:pair?.label||component.label,description:pair?.description||known?.[language]||(language===sourceLanguage?original:t('translationMissing')),original:!pair?.description&&!known&&language!==sourceLanguage?original:null};}
export function errorText(error){const code=error?.message||String(error);if(resources[code])return t(code);if(error?.name==='SyntaxError')return t('invalidConfiguration');return t('genericError',{code:localize(code)});}
export function errorMessage(target,error){const code=error?.message||String(error);message(target,resources[code]?code:error?.name==='SyntaxError'?'invalidConfiguration':'genericError',{code:localize(code)});}
