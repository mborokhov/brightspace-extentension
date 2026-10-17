/* Calendar network work stays outside the LMS storage lock. Every result merges into the latest state. */
(function(root){
  'use strict';
  const G=DNGoogle,ORIGIN='https://www.googleapis.com/*';let running=false,dirty=false,connecting=false,timer;
  const uuid=()=>crypto.randomUUID().replace(/-/g,'');
  const configured=()=>/^[\w-]+\.apps\.googleusercontent\.com$/.test(chrome.runtime.getManifest?.().oauth2?.client_id||'');
  const available=()=>typeof chrome.identity?.getAuthToken==='function';
  const write=state=>chrome.storage.local.set({state});
  async function change(fn){return locked(async()=>{const state=await read();const result=await fn(state);await write(state);return result;});}
  async function token(interactive=false){
    if(!available())throw Object.assign(Error('Google Calendar sync requires Google Chrome.'),{auth:true});
    if(!configured())throw Object.assign(Error('Complete the Google Calendar setup guide first.'),{auth:true});
    try{
      const result=await chrome.identity.getAuthToken({interactive,scopes:[G.SCOPE],enableGranularPermissions:true}),value=typeof result==='string'?result:result?.token;
      if(!value||result.grantedScopes&&!result.grantedScopes.includes(G.SCOPE))throw Error('Missing calendar permission');
      return value;
    }catch{throw Object.assign(Error('Reconnect Google Calendar to allow assignment syncing.'),{auth:true});}
  }
  async function api(method,path,body,etag,again=true){
    const access=await token(),controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch('https://www.googleapis.com/calendar/v3'+path,{method,headers:{Authorization:'Bearer '+access,...(body?{'Content-Type':'application/json'}:{}),...(etag?{'If-Match':etag}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal,cache:'no-store',credentials:'omit'});
      if(response.status===401&&again){await chrome.identity.removeCachedAuthToken({token:access});return api(method,path,body,etag,false);}
      if(!response.ok){
        const status=response.status,retry=Number(response.headers.get('Retry-After'));
        const calendarMissing=status===404&&method==='POST'&&path.endsWith('/events');
        throw Object.assign(Error(calendarMissing?'Due North calendar is missing. Disconnect, then connect to create it again.':status===401?'Reconnect Google Calendar.':status===403?'Google denied access. Check Calendar API setup and account permissions.':status===429?'Google is busy. Sync will retry.':status>=500?'Google is unavailable. Sync will retry.':'Calendar sync could not finish. Try again.'),{status,calendarMissing,auth:status===401,retryMs:Number.isFinite(retry)?Math.min(retry*1000,3600000):0});
      }
      return response.status===204?{}:await response.json();
    }catch(error){if(error.status||error.auth)throw error;throw Error('Offline or Google did not respond. Changes will retry.');}
    finally{clearTimeout(timeout);}
  }
  function schedule(state){
    if(!state?.google?.enabled&&!state?.google?.disconnecting)return;
    if(running){dirty=true;return;}clearTimeout(timer);
    // The alarm survives suspension; the short timer handles edits while the worker is awake.
    timer=setTimeout(()=>run().catch(console.error),250);timer.unref?.();
  }
  async function run(force=false){
    if(running){dirty=true;return;}running=true;dirty=false;
    let owner;
    try{
      const initial=await locked(read);if(!initial.google?.enabled&&!initial.google?.disconnecting)return;
      await chrome.alarms.create('google-sync',{when:Date.now()+60000});
      for(let count=0;count<30;count++){
        let state=await locked(read),g=state.google;owner=g?.owner;
        if(!g?.calendarId||!g.enabled&&!g.disconnecting||g.authRequired||g.blocked||!force&&g.retryAt>Date.now())break;
        force=false;
        let op=G.next({...state,google:{...g,retryAt:0}});
        if(!op){
          await change(latest=>{if(latest.google?.owner!==owner)return;const current=latest.google;current.pending=false;current.error='';current.retryAt=0;current.failures=0;current.lastSync=Date.now();if(current.disconnecting){current.enabled=false;current.disconnecting=false;current.disconnected=true;if(current.calendarMissing){delete current.calendarId;current.calendarMissing=false;}}});break;
        }
        if(op.kind==='reserve'){
          await change(latest=>{if(latest.google?.owner===owner&&!latest.google.events[op.task])latest.google.events[op.task]={id:'dn'+uuid(),present:false};});continue;
        }
        const result=await G.perform(api,g,op);
        await change(latest=>{
          const current=latest.google,record=current?.events?.[op.task];if(current?.owner!==owner||record?.id!==op.record.id)return;
          if(result.removed||result.missing)delete current.events[op.task];
          else Object.assign(record,{present:true,fingerprint:op.fingerprint,checkedAt:Date.now()});
          current.error='';current.retryAt=0;current.failures=0;current.pending=true;
        });
      }
    }catch(error){
      await change(state=>{const g=state.google;if(!g||g.owner!==owner)return;g.pending=true;g.error=error.message;g.authRequired=!!error.auth;g.blocked=!!error.permanent||!!error.calendarMissing;g.calendarMissing=!!error.calendarMissing;g.failures=(g.failures||0)+1;g.retryAt=Date.now()+Math.max(error.retryMs||0,Math.min(1800000,60000*2**Math.min(g.failures-1,5)));});
    }finally{
      running=false;const state=await locked(read),g=state.google;
      if(g?.pending&&!g.authRequired&&!g.blocked)await chrome.alarms.create('google-sync',{when:Math.max(Date.now()+60000,g.retryAt||0)});
      if(dirty||g?.pending&&!g.error&&!g.authRequired&&!g.blocked)schedule(state);
    }
  }
  async function establish(){
    if(!await chrome.permissions.contains({origins:[ORIGIN]}))throw Error('Allow Google Calendar access first.');
    // Only this explicitly requested path can show Google's sign-in/consent UI.
    await token(true);
    const info=await change(state=>{

      const g=state.google=G.settings(state.google);g.owner ||= uuid();g.error='';g.retryAt=0;g.authRequired=false;g.blocked=false;g.disconnected=false;
      if(!g.calendarId){if(g.creating)throw Error('Calendar setup was interrupted. Check Google Calendar for an empty Due North calendar, then use Retry setup.');g.creating=true;}
      else{g.enabled=!g.disconnecting;g.pending=true;}return {owner:g.owner,calendarId:g.calendarId,zone:state.settings.zone};
    });
    if(!info.calendarId){
      try{
        const calendar=await api('POST','/calendars',{summary:'Due North — Assignments',description:'Assignment deadlines managed by Due North.',timeZone:info.zone});
        if(!calendar.id)throw Error('Google did not return a calendar ID.');
        await change(state=>{const g=state.google;if(g?.owner===info.owner){g.calendarId=calendar.id;g.creating=false;g.enabled=true;g.pending=true;}});
      }catch(error){await change(state=>{if(state.google?.owner===info.owner){state.google.error=error.message;state.google.enabled=false;}});throw error;}
    }
    schedule(await locked(read));return {ok:true};
  }
  async function connect(){
    if(connecting)throw Error('Calendar setup is already running.');
    connecting=true;try{return await establish();}finally{connecting=false;}
  }
  async function request(message){
    switch(message.type){
      case 'GOOGLE_CONNECT':return connect();
      case 'GOOGLE_RETRY_SETUP':if(connecting)throw Error('Calendar setup is already running.');await change(state=>{if(!state.google?.enabled)state.google.creating=false;});return connect();
      case 'GOOGLE_SYNC':await change(state=>{const g=state.google;if(!g?.calendarId||!g.enabled&&!g.disconnecting)throw Error('Connect Google Calendar first.');g.retryAt=0;g.blocked=false;g.pending=true;for(const record of Object.values(g.events||{}))record.checkedAt=0;});run(true).catch(console.error);return {ok:true};
      case 'GOOGLE_SETTINGS':if(!['morning','0','60','1440','none'].includes(message.reminder))throw Error('Choose a reminder time.');await change(state=>{const g=state.google=G.settings(state.google);g.reminder=message.reminder;g.pending=!!g.enabled;});schedule(await locked(read));return {ok:true};
      case 'GOOGLE_DISCONNECT':await change(state=>{const g=state.google;if(!g?.calendarId)return;g.enabled=false;g.disconnecting=true;g.pending=true;g.retryAt=0;g.blocked=false;});schedule(await locked(read));return {ok:true};
      default:throw Error('Unknown calendar request.');
    }
  }
  root.DNGoogleWorker={schedule,run,request,configured,available};
})(globalThis);
