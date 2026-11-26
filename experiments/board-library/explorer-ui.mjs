import {t,onLocaleChange} from './i18n.mjs';
// Presentation only. No board identities, dimensions, CAD conversion or inference.
const $=s=>document.querySelector(s);
export function createExplorerUI({getSelectedBounds,getBoardBounds,onCloseCard}) {
  const card=$('#card'),activeStage=()=>document.body.dataset.screen==='camera'?$('#camera-stage'):$('#stage');
  function tab(button) {
    const dialog=button.closest('dialog');
    for(const b of dialog.querySelectorAll('[data-tab]')) {const active=b===button;b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1;$('#'+b.dataset.tab).hidden=!active;}
  }
  function open(id,tabId) {
    for(const d of document.querySelectorAll('dialog[open]'))d.close();
    if(tabId)tab($('#'+tabId));
    const dialog=$('#'+id);dialog.showModal();
    if(id==='catalog-dialog')$('#catalog-toggle').setAttribute('aria-expanded','true');
  }
  function closeMenus(){for(const d of document.querySelectorAll('dialog[open]'))d.close();}
  for(const d of document.querySelectorAll('dialog')){
    d.querySelector('[data-close]').onclick=()=>d.close();
    d.addEventListener('close',()=>$('#catalog-toggle').setAttribute('aria-expanded','false'));
    d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))d.close();});
    for(const b of d.querySelectorAll('[data-tab]')){
      b.onclick=()=>tab(b);
      b.onkeydown=e=>{const buttons=[...d.querySelectorAll('[data-tab]')],i=buttons.indexOf(b);let next;
        if(e.key==='ArrowRight')next=buttons[(i+1)%buttons.length];if(e.key==='ArrowLeft')next=buttons[(i+buttons.length-1)%buttons.length];if(e.key==='Home')next=buttons[0];if(e.key==='End')next=buttons.at(-1);
        if(next){e.preventDefault();tab(next);next.focus();}};
    }
  }
  $('#catalog-toggle').onclick=$('#empty-catalog').onclick=()=>open('catalog-dialog');
  $('#components-toggle').onclick=()=>open('components-dialog');
  $('#details-toggle').onclick=()=>open('board-dialog');
  for(const b of document.querySelectorAll('[data-open-admin]'))b.onclick=()=>open('details-dialog',b.dataset.openAdmin||'tab-info');
  $('#show-preparation').onclick=()=>open('details-dialog','tab-diagnostics');
  $('#minimize-card').onclick=()=>{const small=card.classList.toggle('minimized');$('#minimize-card').setAttribute('aria-expanded',String(!small));$('#minimize-card').title=$('#minimize-card').ariaLabel=t(small?'selection.restoreCard':'selection.minimizeCard');placeCard();};
  $('#expand-card').onclick=()=>{card.classList.remove('minimized');$('#minimize-card').setAttribute('aria-expanded','true');const expanded=card.classList.toggle('expanded');$('#card-details').hidden=!expanded;$('#expand-card').setAttribute('aria-expanded',expanded);$('#expand-card').setAttribute('aria-label',expanded?t('collapse'):t('ui.expand_card'));$('#expand-card').title=expanded?t('collapse'):t('ui.expand_card');placeCard();};
  $('#component-info').onclick=()=>{card.classList.remove('minimized');const panel=$('#component-diagnostic'),open=panel.hidden;card.classList.toggle('diagnostic-open',open);panel.hidden=!open;$('#component-info').setAttribute('aria-expanded',String(open));placeCard();if(open)panel.scrollIntoView({block:'nearest',behavior:'smooth'});};
  $('#close-card').onclick=onCloseCard;
  let lastLayout='',preparing=false;
  function placeCard(){
    const small=card.classList.contains('minimized'),toggle=$('#minimize-card');toggle.setAttribute('aria-expanded',String(!small));toggle.title=toggle.ariaLabel=t(small?'selection.restoreCard':'selection.minimizeCard');
    if(card.hidden)return;
    const stage=activeStage(),isCamera=document.body.dataset.screen==='camera',W=stage.clientWidth,H=stage.clientHeight;
    if(!W||!H)return;
    const top=isCamera?(H<450?150:228):(H<450?76:88),width=Math.min(W-24,H<450?310:350),bottom=isCamera?(H<450?12:125):(H<450?12:95);
    const wanted=card.classList.contains('expanded')||!$('#component-diagnostic').hidden?510:370,maxHeight=Math.max(94,Math.min(wanted,H-top-bottom));
    const left=12; // Fixed viewport position; orbit, pan and zoom never move the card.
    card.style.left=left+'px';card.style.top=top+'px';card.style.width=width+'px';card.style.maxHeight=maxHeight+'px';card.dataset.placement='top';
  }
  onLocaleChange(()=>{const expanded=card.classList.contains('expanded');$('#expand-card').setAttribute('aria-label',t(expanded?'collapse':'ui.expand_card'));$('#expand-card').title=t(expanded?'collapse':'ui.expand_card');placeCard();});

  const observer=new ResizeObserver(placeCard);observer.observe($('#stage'));observer.observe($('#camera-stage'));
  return {
    open,closeMenus,placeCard,
    selected(){closeMenus();if(document.body.dataset.screen!=='explorer')card.classList.remove('minimized');card.classList.remove('diagnostic-open');$('#component-diagnostic').hidden=true;$('#component-info').setAttribute('aria-expanded','false');$('.card-scroll').scrollTop=0;card.classList.remove('expanded');$('#card-details').hidden=true;$('#expand-card').setAttribute('aria-expanded','false');$('#expand-card').setAttribute('aria-label',t('ui.expand_card'));$('#expand-card').title=t('ui.expand_card');lastLayout='';placeCard();},
    loading(){closeMenus();$('#empty-state').hidden=true;$('#loading-state').hidden=false;},
    loaded(){ $('#loading-state').hidden=true;$('.board-heading').hidden=false;$('#view-controls').hidden=false;$('#viewer-message').hidden=false;$('#components-toggle').disabled=false;},
    loadFailed(hasModel){$('#loading-state').hidden=true;$('#empty-state').hidden=hasModel;},
    progress(status){if(status==='running'&&!preparing)closeMenus();preparing=status==='running';$('#preparation-panel').hidden=false;$('#preparation-status').hidden=!preparing;},
    error(message){for(const p of document.querySelectorAll('.panel-error'))p.textContent=message;}
  };
}
