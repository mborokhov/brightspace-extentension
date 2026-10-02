/* Read-only HTML transport. It never follows redirects to login or submission routes. */
(function(root){
  'use strict';
  const C=root.DNCore,MAX_BYTES=4*1024*1024;
  let creating;
  async function parser(){
    const url=chrome.runtime.getURL('offscreen.html');
    if((await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[url]})).length)return;
    if(!creating)creating=chrome.offscreen.createDocument({url:'offscreen.html',reasons:['DOM_PARSER'],justification:'Read downloaded assignment lists without opening browser tabs.'}).finally(()=>{creating=null;});
    await creating;
  }
  async function htmlBody(response){
    if(Number(response.headers.get('content-length'))>MAX_BYTES)throw Error('Page too large');
    const reader=response.body.getReader(),decoder=new TextDecoder();let text='',size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES)throw Error('Page too large');text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}
    finally{await reader.cancel().catch(()=>{});}
  }
  async function read(url,settings,{signal}={}){
    if(!C.allowedURL(url)||!(C.pageKind(url)||C.canInspectPearson(url)))return {kind:'error',message:'Unsupported sync page'};
    if(!chrome.offscreen||!chrome.runtime.getContexts)return {kind:'render'};
    const controller=new AbortController(),abort=()=>controller.abort();
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    let timer;
    try{
      const work=(async()=>{
        // Manual redirects prevent sending authenticated requests to arbitrary destinations.
        const response=await fetch(url,{credentials:'include',redirect:'manual',cache:'no-store',signal:controller.signal,headers:{Accept:'text/html'}});
        if(response.status===401)return {kind:'login'};
        if(response.type==='opaqueredirect'||response.status>=300&&response.status<400)return {kind:'render'};
        if(response.status===403)return {kind:'error',message:'Access denied. Open the site to check access.'};
        if(!response.ok)return {kind:'error',message:`Site returned HTTP ${response.status}`};
        if(!/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type')||''))return {kind:'render'};
        const html=await htmlBody(response);if(controller.signal.aborted)throw Error('Cancelled');
        await parser();if(controller.signal.aborted)throw Error('Cancelled');
        const result=await chrome.runtime.sendMessage({target:'offscreen-parser',type:'PARSE_HTML',url,html,settings:{zone:settings.zone}});
        if(result?.snapshot?.login)return {kind:'login'};
        if(result?.snapshot?.pageError)return {kind:'error',message:'Site error. Open the course and retry.'};
        const snap=result?.snapshot;if(!snap)return {kind:'render'};
        const outcome=C.captureOutcome(snap,true);
        // A blank JS shell or Course Home preview must not be mistaken for a complete list.
        const useful=outcome.success&&(!snap.embedded||snap.items.length||snap.quality?.explicitEmpty)&&(snap.items.length||snap.quality?.explicitEmpty||snap.links.some(link=>C.courseId(link.url)||C.pageKind(link.url)==='list'));
        return useful?{kind:'snapshot',snapshot:{...snap,settled:true}}:{kind:'render'};
      })();
      return await Promise.race([work,new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({kind:'render'});},15000);}),new Promise(resolve=>{controller.signal.addEventListener('abort',()=>resolve({kind:signal?.aborted?'cancelled':'render'}),{once:true});if(controller.signal.aborted)resolve({kind:'cancelled'});})]);
    }catch{return {kind:signal?.aborted?'cancelled':'render'};}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  root.DNBackground={read};
})(globalThis);
