'use strict';
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message?.target!=='offscreen-parser')return;
  if(sender.id!==chrome.runtime.id||sender.tab||sender.url&&sender.url!==chrome.runtime.getURL('background.js')||message.type!=='PARSE_HTML')return;
  try{
    if(typeof message.html!=='string'||message.html.length>4*1024*1024||!DNCore.allowedURL(message.url)||!(DNCore.pageKind(message.url)||DNCore.canInspectPearson(message.url)))throw Error('Invalid parser request');
    // Detached document only: never insert fetched markup into the live extension DOM.
    // This page's CSP also blocks images, frames and other remote subresources.
    const doc=new DOMParser().parseFromString(message.html,'text/html');
    reply({snapshot:DNExtract.extract(doc,message.url,message.settings)});
  }catch{reply({error:'Could not read the downloaded page'});}
});
