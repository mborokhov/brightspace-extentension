(() => {
  'use strict';
  let settings = {zone:'America/New_York'}, timer, lastSent = '', started = Date.now(), lastScan = 0, stopped = false, lastURL = location.href, syncOwned=false, openedAssignments=false, requestId='';
  async function scan() {
    if (stopped||settings.collecting===false) return;
    if (location.href !== lastURL) { lastURL = location.href; started = Date.now(); lastSent = ''; setTimeout(scan,6000); }
    if (!DNCore.pageKind(location.href) && !DNCore.canInspectPearson?.(location.href) && !/\/d2l\/error\//i.test(location.pathname) && !/\/(login|signin|auth)(?:\/|$)/i.test(location.pathname)) return;
    if (Date.now() - started < 5500) return;
    lastScan = Date.now();
    try {
      const snapshot = DNExtract.extract(document,location.href,settings);
      if(syncOwned&&!openedAssignments&&snapshot.source==='pearson'&&!snapshot.login&&!snapshot.assignmentList){
        openedAssignments=true;
        if(DNExtract.openPearsonAssignments(document,location.href)){started=Date.now();lastSent='';setTimeout(scan,6000);return;}
      }
      snapshot.requestId=requestId;
      snapshot.settled = Date.now() - started >= 5500;
      const signature = JSON.stringify(snapshot);
      if (signature === lastSent) return;
      const response=await chrome.runtime.sendMessage({type:'CAPTURE',snapshot});
      if(response?.included!==false&&!response?.error)lastSent = signature;
    } catch (error) {
      if (/context invalidated|receiving end/i.test(error.message)) { stopped = true; observer.disconnect(); }
    }
  }
  function schedule() { if (timer) return; timer = setTimeout(() => { timer = null; scan(); },Math.max(1200,4000 - (Date.now() - lastScan))); }
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  chrome.runtime.sendMessage({type:'CONTENT_SETTINGS'}).then(response => { if (response?.settings) settings = response.settings;syncOwned=response?.syncOwned===true;requestId=response?.requestId||requestId;scan(); }).catch(() => {});
  setTimeout(scan,6000);
  setTimeout(scan,15000);
  // Custom element shadow roots can populate without mutating the outer document.
  setTimeout(scan,30000);
  chrome.runtime.onMessage.addListener((message,_sender,reply) => {
    if (message.type === 'RESCAN') {
      if(message.requireFresh&&(message.force||Date.now()-started>120000)){reply({readerVersion:4,needsReload:true});return;}
      lastSent='';requestId=message.requestId||'';
      chrome.runtime.sendMessage({type:'CONTENT_SETTINGS'}).then(response=>{if(response?.settings)settings=response.settings;return scan();}).then(()=>reply({ok:true,readerVersion:4}),()=>reply({readerVersion:4,needsReload:true}));return true;
    }
  });
})();
