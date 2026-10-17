const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../extension/core.js'),T=require('../extension/tasks.js'),G=require('../extension/google-calendar.js'),harness=require('./worker-harness.cjs');
function fixture(){const s=C.migrateState(C.emptyState());T.createManual(s,{title:'Homework 1',courseKey:'manual:personal',date:'2026-10-20',time:'23:59'},'manual:one');s.google={enabled:true,owner:'owner1',calendarId:'calendar1',events:{},reminder:'morning',pending:true};return s;}
const item=s=>C.activeItems(s)[0];
function mock(saved=fixture(),extra={}){
  const calls=[],auth=[],remote=new Map(),control={fail:null,wait:null,tokenError:false},alarms=[];
  const identity={getAuthToken:async options=>{auth.push(options);if(control.tokenError)throw Error('sign in');return {token:'SECRET_ACCESS_TOKEN',grantedScopes:[G.SCOPE]};},removeCachedAuthToken:async()=>{}};
  let h;
  const fetch=async(url,options)=>{
    assert.ok(url.startsWith('https://www.googleapis.com/calendar/v3/'));assert.equal(options.headers.Authorization,'Bearer SECRET_ACCESS_TOKEN');assert.equal(options.credentials,'omit');
    const path=url.replace('https://www.googleapis.com/calendar/v3',''),body=options.body?JSON.parse(options.body):undefined;
    calls.push({method:options.method,path,body});
    if(control.wait){const wait=control.wait;control.wait=null;await wait();}
    if(control.fail){const fail=control.fail;control.fail=null;if(fail instanceof Error)throw fail;return response(fail,{});}
    if(path==='/calendars'&&options.method==='POST')return response(200,{id:'calendar1'});
    const id=decodeURIComponent(path.split('/').at(-1));
    if(options.method==='POST'){if(remote.has(body.id))return response(409,{});remote.set(body.id,structuredClone(body));return response(200,body);}
    if(!remote.has(id))return response(404,{});
    if(options.method==='GET')return response(200,remote.get(id));
    if(options.method==='PUT'){remote.set(id,{id,...structuredClone(body)});return response(200,body);}
    if(options.method==='DELETE'){remote.delete(id);return response(204,{});}
    throw Error('Unexpected API operation');
  };
  const response=(status,body)=>({ok:status>=200&&status<300,status,headers:{get:()=>null},json:async()=>structuredClone(body)});
  h=harness({state:saved},false,{manifest:{oauth2:{client_id:'public-client.apps.googleusercontent.com'}},identity,fetch,permissions:async()=>true,setTimeout:(fn,ms)=>ms===250?{unref(){}}:setTimeout(fn,ms),...extra});
  const worker=h.context.DNGoogleWorker;
  return {...h,worker,calls,auth,remote,control,alarms,run:()=>worker.run()};
}
test('calendar bodies use deadline instant, course zone, private ownership and due-day morning reminder',()=>{
 const s=fixture(),body=G.desired(s)['manual:one'].body;assert.equal(body.summary,'Homework 1');assert.equal(body.start.dateTime,'2026-10-21T03:59:00.000Z');assert.equal(body.start.timeZone,'America/New_York');assert.deepEqual(body.reminders,{useDefault:false,overrides:[{method:'popup',minutes:899}]});assert.equal(body.end.dateTime,'2026-10-21T04:00:00.000Z');assert.equal(body.extendedProperties.private.dueNorthOwner,'owner1');assert.equal(body.transparency,'transparent');
});
test('early deadlines remind at deadline, numeric/disabled reminders and DST morning are deterministic',()=>{
 const s=fixture(),i=item(s);i.dueAt='2026-11-01T12:00:00Z';assert.equal(G.eventBody(i,s,{owner:'o',reminder:'morning'}).reminders.overrides[0].minutes,0);
 i.dueAt='2026-11-02T04:59:00Z';assert.equal(G.eventBody(i,s,{owner:'o',reminder:'morning'}).reminders.overrides[0].minutes,899);
 assert.equal(G.eventBody(i,s,{owner:'o',reminder:'60'}).reminders.overrides[0].minutes,60);assert.deepEqual(G.eventBody(i,s,{owner:'o',reminder:'none'}).reminders.overrides,[]);
});
test('date-only events end the next day and have no reminders; inferred, invalid and undated tasks stay local',()=>{
 const s=fixture(),i=item(s);i.dueAt=null;i.dueDate='2026-12-31';const b=G.eventBody(i,s,s.google);assert.deepEqual(b.start,{date:'2026-12-31'});assert.deepEqual(b.end,{date:'2027-01-01'});assert.deepEqual(b.reminders.overrides,[]);
 i.dateNote='Year inferred';assert.equal(G.eventBody(i,s,s.google),null);i.dateNote='';i.dueAt='invalid';assert.equal(G.eventBody(i,s,s.google),null);i.dueAt=null;i.dueDate=null;assert.equal(G.eventBody(i,s,s.google),null);
});
test('completion removes desired events; local override restores source-completed tasks',()=>{
 const s=fixture();s.items['manual:one'].completionOverride='done';assert.deepEqual(G.desired(s),{});s.items['manual:one'].status='submitted';s.items['manual:one'].completionOverride='todo';assert.equal(Object.keys(G.desired(s)).length,1);
});
test('initial sync reserves durable ID, repeat sync never duplicates, date edits update same event',async()=>{
 const h=mock();await h.run();let record=h.store.state.google.events['manual:one'];const id=record.id;assert.match(id,/^[0-9a-v]{5,1024}$/);assert.equal(h.remote.size,1);assert.equal(h.calls.filter(c=>c.method==='POST').length,1);assert.equal(h.store.state.google.pending,false);
 await h.run();assert.equal(h.calls.length,1);
 await h.message({type:'SET_ITEM',id:'manual:one',date:'2026-10-22',time:'12:30'});await h.run();assert.equal(h.remote.size,1);assert.equal(h.store.state.google.events['manual:one'].id,id);assert.equal(h.remote.get(id).start.dateTime,'2026-10-22T16:30:00.000Z');assert.equal(h.calls.at(-1).method,'PUT');assert.ok(h.auth.every(a=>a.interactive===false));
});
test('checking complete deletes Google event and reminders; unchecking uses a fresh event ID',async()=>{
 const h=mock();await h.run();const id=h.store.state.google.events['manual:one'].id;
 await h.message({type:'SET_ITEM',id:'manual:one',completionOverride:'done'});await h.run();assert.equal(h.remote.size,0);assert.equal(h.calls.at(-1).method,'DELETE');assert.deepEqual(h.store.state.google.events,{});
 await h.message({type:'SET_ITEM',id:'manual:one',completionOverride:'todo'});await h.run();assert.equal(h.remote.size,1);assert.notEqual(h.store.state.google.events['manual:one'].id,id);
});
test('offline changes persist, retry after worker restart keeps the same reserved ID',async()=>{
 const h=mock();h.control.fail=Error('offline');await h.run();const g=h.store.state.google;assert.equal(g.pending,true);assert.equal(g.events['manual:one'].present,false);assert.ok(g.retryAt>Date.now());assert.match(g.error,/Offline/);
 const resumed=mock(h.store.state);resumed.store.state.google.retryAt=0;await resumed.run();assert.equal(resumed.remote.size,1);assert.equal(resumed.store.state.google.events['manual:one'].id,g.events['manual:one'].id);
});
test('lost insert response recovers through 409 without duplicate events',async()=>{
 const h=mock();await h.run();const record=h.store.state.google.events['manual:one'];record.present=false;record.fingerprint='';await h.run();assert.equal(h.remote.size,1);assert.ok(h.calls.some(c=>c.method==='GET'));assert.equal(h.store.state.google.pending,false);
});
test('Google-deleted events are recreated with a new ID; already deleted completion is harmless',async()=>{
 const h=mock();await h.run();const old=h.store.state.google.events['manual:one'].id;h.remote.clear();h.store.state.google.events['manual:one'].checkedAt=0;await h.run();const id=h.store.state.google.events['manual:one'].id;assert.notEqual(id,old);assert.equal(h.remote.size,1);
 h.remote.clear();await h.message({type:'SET_ITEM',id:'manual:one',completionOverride:'done'});await h.run();assert.equal(h.store.state.google.pending,false);assert.deepEqual(h.store.state.google.events,{});
});
test('completion during in-flight insert is applied to latest state and immediately cleaned up',async()=>{
 const h=mock();h.control.wait=()=>h.message({type:'SET_ITEM',id:'manual:one',completionOverride:'done'});await h.run();assert.equal(h.store.state.items['manual:one'].completionOverride,'done');assert.equal(h.remote.size,0);assert.equal(h.calls.at(-1).method,'DELETE');
});
test('a due edit during network work is not overwritten by stale state',async()=>{
 const h=mock();h.control.wait=()=>h.message({type:'SET_ITEM',id:'manual:one',date:'2026-10-25',time:'15:00'});await h.run();const record=h.store.state.google.events['manual:one'];assert.equal(h.remote.get(record.id).start.dateTime,'2026-10-25T19:00:00.000Z');assert.ok(h.store.state.items['manual:one'].dueOverride);
});
test('only tagged events can be changed or deleted',async()=>{
 const h=mock();await h.run();const id=h.store.state.google.events['manual:one'].id;h.remote.get(id).extendedProperties.private.dueNorthOwner='someone-else';await h.message({type:'SET_ITEM',id:'manual:one',completionOverride:'done'});await h.run();assert.equal(h.remote.size,1);assert.equal(h.store.state.google.blocked,true);assert.match(h.store.state.google.error,/no longer belongs/);assert.ok(!h.calls.some(c=>c.method==='DELETE'));
});
test('disconnect removes only tracked events; clear is blocked until cleanup succeeds',async()=>{
 const h=mock();await h.run();h.remote.set('unrelated',{summary:'Personal event'});assert.match((await h.message({type:'CLEAR'})).error,/Disconnect/);
 await h.message({type:'GOOGLE_DISCONNECT'});await h.run();assert.equal(h.remote.size,1);assert.ok(h.remote.has('unrelated'));assert.equal(h.store.state.google.enabled,false);assert.equal(h.store.state.google.disconnecting,false);assert.equal((await h.message({type:'CLEAR'})).ok,true);
});
test('offline disconnect is durable and authentication can be renewed without re-enabling sync',async()=>{
 const h=mock();await h.run();h.control.tokenError=true;await h.message({type:'GOOGLE_DISCONNECT'});await h.run();assert.equal(h.store.state.google.disconnecting,true);assert.equal(h.store.state.google.authRequired,true);
 h.control.tokenError=false;assert.equal((await h.message({type:'GOOGLE_CONNECT'})).ok,true);assert.equal(h.store.state.google.enabled,false);await h.run();assert.equal(h.remote.size,0);assert.equal(h.store.state.google.disconnecting,false);assert.ok(h.auth.some(a=>a.interactive));
});
test('Connect is the only interactive auth path and tokens never enter storage or UI responses',async()=>{
 const h=mock(C.emptyState());assert.equal((await h.message({type:'GOOGLE_CONNECT'})).ok,true);await h.run();assert.equal(h.calls.filter(c=>c.path==='/calendars').length,1);assert.ok(h.auth[0].interactive);assert.ok(!JSON.stringify(h.store).includes('SECRET_ACCESS_TOKEN'));assert.ok(!JSON.stringify(await h.message({type:'GET_STATE'})).includes('SECRET_ACCESS_TOKEN'));
});
test('an uncertain calendar creation is not automatically repeated',async()=>{
 const h=mock(C.emptyState());h.control.fail=Error('network lost');assert.match((await h.message({type:'GOOGLE_CONNECT'})).error,/Offline/);await h.run();await h.run();assert.equal(h.calls.length,1);assert.equal(h.store.state.google.creating,true);assert.match((await h.message({type:'GOOGLE_CONNECT'})).error,/interrupted/);assert.equal(h.calls.length,1);
});
test('missing client, unsupported browser, and untrusted calendar requests fail safely',async()=>{
 let h=mock(C.emptyState(),{manifest:{}});assert.match((await h.message({type:'GOOGLE_CONNECT'})).error,/setup guide/);assert.equal(h.auth.length,0);
 h=mock(C.emptyState(),{identity:null});assert.match((await h.message({type:'GOOGLE_CONNECT'})).error,/Chrome/);
 assert.match((await h.message({type:'GOOGLE_CONNECT'},{id:'test-extension',url:'https://purdue.brightspace.com/d2l/home',tab:{id:1}})).error,/dashboard/);
});
test('rate limiting backs off without losing pending edits; reminders update the existing event',async()=>{
 const h=mock();h.control.fail=429;await h.run();assert.equal(h.store.state.google.pending,true);const calls=h.calls.length;await h.run();assert.equal(h.calls.length,calls);h.store.state.google.retryAt=0;await h.run();const id=h.store.state.google.events['manual:one'].id;
 await h.message({type:'GOOGLE_SETTINGS',reminder:'60'});await h.run();assert.equal(h.remote.get(id).reminders.overrides[0].minutes,60);assert.equal(h.remote.size,1);
});
test('merged tasks count once and separating removes obsolete group event',async()=>{
 const s=fixture();T.createManual(s,{title:'Copy',courseKey:'manual:personal',date:'2026-10-20',time:'23:59'},'manual:two');const h=mock(s);await h.run();assert.equal(h.remote.size,2);
 const result=await h.message({type:'MERGE_TASKS',id:'manual:one',otherId:'manual:two',primaryId:'manual:one'});assert.ok(result.id);await h.run();assert.equal(h.remote.size,1);
 await h.message({type:'SEPARATE_TASK',id:result.id});await h.run();assert.equal(h.remote.size,2);assert.ok(!h.store.state.google.events[result.id]);
});
test('changing a timed task to date-only replaces both time fields and disables reminders',async()=>{
 const h=mock();await h.run();const id=h.store.state.google.events['manual:one'].id;await h.message({type:'SET_ITEM',id:'manual:one',date:'2026-10-23',time:''});await h.run();const event=h.remote.get(id);assert.deepEqual(event.start,{date:'2026-10-23'});assert.deepEqual(event.end,{date:'2026-10-24'});assert.deepEqual(event.reminders.overrides,[]);assert.equal(h.remote.size,1);
});
test('manual deletion and restoring a deleted task remove and recreate its event',async()=>{
 const h=mock();await h.run();await h.message({type:'DELETE_MANUAL',id:'manual:one'});await h.run();assert.equal(h.remote.size,0);await h.message({type:'RESTORE_MANUAL',id:'manual:one'});await h.run();assert.equal(h.remote.size,1);
});
test('expired access token is evicted and retried silently; persistent denial asks to reconnect',async()=>{
 const h=mock();h.control.fail=401;await h.run();assert.equal(h.store.state.google.pending,false);assert.equal(h.remote.size,1);assert.ok(h.auth.every(a=>a.interactive===false));
 h.control.tokenError=true;await h.message({type:'SET_ITEM',id:'manual:one',completionOverride:'done'});await h.run();assert.equal(h.store.state.google.authRequired,true);assert.equal(h.store.state.google.pending,true);assert.equal(h.remote.size,1);
});
test('deselecting a course removes its event and reselecting restores it',async()=>{
 const s=fixture(),key='brightspace:42';s.courses[key]={key,id:'42',source:'brightspace',title:'Fall '+new Date().getFullYear()+' Class',term:s.activeTerm,enabled:true};s.items['manual:one'].courseKey=key;s.items['manual:one'].courseId='42';s.items['manual:one'].course='Class';const h=mock(s);await h.run();assert.equal(h.remote.size,1);await h.message({type:'SET_COURSE',key,enabled:false});await h.run();assert.equal(h.remote.size,0);await h.message({type:'SET_COURSE',key,enabled:true});await h.run();assert.equal(h.remote.size,1);
});
test('conditional writes use Google etags and never mutate an event changed after ownership check',async()=>{
 const s=fixture(),body=G.desired(s)['manual:one'].body,calls=[];const op={kind:'update',task:'manual:one',record:{id:'event123'},body};
 await G.perform(async(method,path,value,etag)=>{calls.push({method,etag});return {...body,etag:'"v1"'};},s.google,op);assert.equal(calls[1].etag,'"v1"');
 await assert.rejects(()=>G.perform(async method=>{if(method==='GET')return {...body,etag:'"v1"'};throw Object.assign(Error('changed'),{status:412});},s.google,op),/changed/);
});
test('a deleted calendar reports recovery instructions and disconnect permits a new calendar',async()=>{
 const h=mock();h.control.fail=404;await h.run();assert.equal(h.store.state.google.calendarMissing,true);assert.equal(h.store.state.google.blocked,true);assert.match(h.store.state.google.error,/calendar is missing/);
 await h.message({type:'GOOGLE_DISCONNECT'});await h.run();assert.equal(h.store.state.google.calendarId,undefined);assert.equal(h.store.state.google.disconnecting,false);
 assert.equal((await h.message({type:'GOOGLE_CONNECT'})).ok,true);await h.run();assert.equal(h.remote.size,1);
});
test('concurrent connection attempts cannot create a second calendar',async()=>{
 const h=mock(C.emptyState());let unblock,started;const waiting=new Promise(resolve=>{unblock=resolve;}),ready=new Promise(resolve=>{started=resolve;});h.control.wait=async()=>{started();await waiting;};const first=h.message({type:'GOOGLE_CONNECT'});await ready;
 assert.match((await h.message({type:'GOOGLE_RETRY_SETUP'})).error,/already running/);unblock();assert.equal((await first).ok,true);assert.equal(h.calls.filter(c=>c.path==='/calendars').length,1);
});
test('long queues retain pending work and converge across bounded worker runs',async()=>{
 const s=fixture();for(let n=2;n<=18;n++)T.createManual(s,{title:'Homework '+n,courseKey:'manual:personal',date:'2026-10-20',time:'23:59'},'manual:'+n);const h=mock(s);await h.run();assert.equal(h.store.state.google.pending,true);await h.run();assert.equal(h.remote.size,18);assert.equal(h.store.state.google.pending,false);assert.equal(new Set(h.calls.filter(c=>c.method==='POST').map(c=>c.body.id)).size,18);
});
test('repairing a cached source year moves its existing Google event without duplication',async()=>{
 const s=fixture(),key='brightspace:42';s.courses[key]={key,id:'42',source:'brightspace',term:s.activeTerm,enabled:true,title:'Fall 2026 ECE 33700'};
 Object.assign(s.items['manual:one'],{source:'brightspace',courseKey:key,courseId:'42',term:s.activeTerm,url:'https://purdue.brightspace.com/d2l/lms/dropbox/user/folder_submit_files.d2l?ou=42&db=99',dueRaw:'Nov 22, 2026 11:59 PM',dueAt:'2025-11-23T04:59:00.000Z',dueDate:null});
 const body=G.desired(s)['manual:one'].body,id='dn123abc';s.google.events['manual:one']={id,present:true,fingerprint:JSON.stringify(body),checkedAt:Date.now()};
 const h=mock(s);h.remote.set(id,{id,...body});await h.run();assert.equal(h.remote.size,1);assert.equal(h.remote.get(id).start.dateTime,'2026-11-23T04:59:00.000Z');assert.equal(h.store.state.google.events['manual:one'].id,id);assert.equal(h.calls.at(-1).method,'PUT');
});
