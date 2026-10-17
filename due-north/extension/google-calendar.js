(function(root){
  'use strict';
  const C=root.DNCore||(typeof require==='function'?require('./core.js'):null);
  const T=root.DNTasks||(typeof require==='function'?require('./tasks.js'):null);
  const SCOPE='https://www.googleapis.com/auth/calendar.app.created';
  function settings(g={}){return {reminder:g.reminder||'morning',...g,events:g.events||{}};}
  function eventBody(item,state,g){
    if(C.isDone(item)||/inferred/i.test(item.dateNote)||!item.dueAt&&!item.dueDate)return null;
    if(item.dueAt&&!Number.isFinite(Date.parse(item.dueAt)))return null;
    const zone=state.settings.zone,day=item.dueAt?C.dateKey(item.dueAt,zone):item.dueDate;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||item.dueAt&&!Number.isFinite(Date.parse(item.dueAt)))return null;
    let overrides=[];
    if(item.dueAt&&g.reminder!=='none'){
      let minutes=Number(g.reminder);
      if(g.reminder==='morning'){
        const [y,m,d]=day.split('-').map(Number),morning=C.zonedISO(y,m,d,9,0,zone);
        minutes=Math.max(0,Math.round((Date.parse(item.dueAt)-Date.parse(morning))/60000));
      }
      overrides=[{method:'popup',minutes:Math.max(0,Math.min(40320,Number.isFinite(minutes)?minutes:0))}];
    }
    const links=T.sourceLinks(state,item).map(link=>`${link.label}: ${link.url}`);
    return {summary:item.title,description:[item.course,'Managed by Due North. Edit dates and completion in Due North.',...links].filter(Boolean).join('\n'),
      start:item.dueAt?{dateTime:item.dueAt,timeZone:zone}:{date:day},
      end:item.dueAt?{dateTime:new Date(Date.parse(item.dueAt)+60000).toISOString(),timeZone:zone}:{date:C.shiftDay(day,1)},
      transparency:'transparent',visibility:'private',reminders:{useDefault:false,overrides},
      extendedProperties:{private:{dueNorthOwner:g.owner,dueNorthTask:item.id}}};
  }
  function desired(state){const g=settings(state.google);if(!g.enabled||g.disconnecting)return {};const result={};for(const item of C.activeItems(state)){const body=eventBody(item,state,g);if(body)result[item.id]={body,fingerprint:JSON.stringify(body)};}return result;}
  function next(state,now=Date.now()){
    const g=state.google;if(!g?.calendarId||(!g.enabled&&!g.disconnecting)||g.authRequired||g.retryAt>now)return null;
    const want=desired(state),events=g.events||{};
    // Remove obsolete events first, including completed, merged, deselected and old-semester tasks.
    for(const [task,record] of Object.entries(events))if(!want[task])return {kind:'delete',task,record};
    for(const [task,value] of Object.entries(want)){
      const record=events[task];if(!record)return {kind:'reserve',task,...value};
      if(!record.present||record.fingerprint!==value.fingerprint||now-(record.checkedAt||0)>21600000)return {kind:record.present?'update':'insert',task,record,...value};
    }
    return null;
  }
  function owns(event,g,task){return event?.extendedProperties?.private?.dueNorthOwner===g.owner&&event.extendedProperties.private.dueNorthTask===task;}
  function status(g){if(g?.disconnecting)return g.error?'Calendar removal paused — '+g.error:'Removing calendar events…';if(g?.authRequired)return 'Reconnect Google Calendar';if(g?.error)return g.error;if(g?.creating)return 'Calendar setup interrupted — connect again';if(!g?.enabled)return 'Not connected';return g.pending?'Changes waiting to sync':'Up to date';}
  // The transport is injected so tests never contact a real account.
  async function perform(api,g,op){
    const base='/calendars/'+encodeURIComponent(g.calendarId)+'/events',path=base+'/'+encodeURIComponent(op.record.id);
    let remote;
    if(op.kind==='insert'){
      try{await api('POST',base,{id:op.record.id,...op.body});return {present:true};}
      catch(error){if(error.status!==409)throw error;}
    }
    try{remote=await api('GET',path);}catch(error){if([404,410].includes(error.status))return {missing:true};throw error;}
    if(remote.status==='cancelled')return {missing:true};
    if(!owns(remote,g,op.task))throw Object.assign(Error('An event no longer belongs to Due North. Open Google Calendar to check it.'),{permanent:true});
    if(op.kind==='delete'){
      try{await api('DELETE',path,undefined,remote.etag);}catch(error){if(![404,410].includes(error.status))throw error;}
      return {removed:true};
    }
    await api('PUT',path,op.body,remote.etag);return {present:true};
  }
  const api={SCOPE,settings,eventBody,desired,next,owns,status,perform};root.DNGoogle=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
