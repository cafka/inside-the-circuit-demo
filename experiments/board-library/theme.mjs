import {t,onLocaleChange} from './i18n.mjs';
// Presentation-only. Deliberately has no Three.js, material, light or camera dependency.
export function initTheme(){
 const button=document.querySelector('#theme-toggle');
 function refresh(){const dark=document.documentElement.dataset.theme!=='light';button.textContent=dark?'☀':'☾';button.setAttribute('aria-label',t(dark?'release.lightTheme':'release.darkTheme'));button.title=button.ariaLabel;button.setAttribute('aria-pressed',String(dark));}
 button.onclick=()=>{const next=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=next;try{localStorage.setItem('itc-theme',next);}catch{}refresh();};
 refresh();onLocaleChange(refresh);
}
