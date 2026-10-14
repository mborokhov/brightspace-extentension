/* Original, dependency-free line icons and accessible dialog presentation. */
(function(root){
  'use strict';
  const paths={
    overview:'M5 20V12h3v8zm6 0V4h3v16zm6 0V8h3v12z',
    calendar:'M4 6h16v15H4zM4 10h16M8 3v5M16 3v5',
    courses:'M12 6c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1zm0 0v15',
    settings:'M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
    help:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 2M12 16v.1',
    plus:'M12 4v16M4 12h16',
    close:'M6 6l12 12M6 18 18 6',
    sync:'M20 9a8 8 0 0 0-14-3L3 9m0-6v6h6M4 15a8 8 0 0 0 14 3l3-3m0 6v-6h-6',
    stop:'M5 5h14v14H5z',
    export:'M12 3v12m-4-4 4 4 4-4M4 15v6h16v-6',
    expand:'M14 3h7v7m0-7-10 10M10 5H3v16h16v-7'
  };
  function icon(name){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.75','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false',class:'ui-icon'}))svg.setAttribute(key,value);
    const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name]||paths.help);svg.append(path);return svg;
  }
  function buttonLabel(button,label,name){
    if(button.dataset.label===label&&button.dataset.symbol===name)return;
    const span=document.createElement('span');span.textContent=label;button.replaceChildren(icon(name),span);button.dataset.label=label;button.dataset.symbol=name;
  }
  document.querySelectorAll('[data-icon]').forEach(node=>node.replaceWith(icon(node.dataset.icon)));
  let anchor=null;
  document.addEventListener('click',event=>{const target=event.target.closest('button,a');if(target){const r=target.getBoundingClientRect();anchor={x:r.x+r.width/2,y:r.y+r.height/2};}},true);
  for(const dialog of document.querySelectorAll('dialog')){
    const heading=dialog.querySelector('h2');if(heading){heading.id ||= dialog.id+'-heading';dialog.setAttribute('aria-labelledby',heading.id);}
    new MutationObserver(()=>{if(!dialog.open||!anchor)return;const r=dialog.getBoundingClientRect(),clamp=value=>Math.max(0,Math.min(100,value));dialog.style.setProperty('--dialog-origin',clamp((anchor.x-r.x)/r.width*100)+'% '+clamp((anchor.y-r.y)/r.height*100)+'%');}).observe(dialog,{attributes:true,attributeFilter:['open']});
  }
  const scroll=()=>document.documentElement.classList.toggle('scrolled',window.scrollY>8);
  window.addEventListener('scroll',scroll,{passive:true});scroll();
  root.DNUI={icon,buttonLabel};
})(globalThis);
