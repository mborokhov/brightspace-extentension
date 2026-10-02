const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function harness(saved,pearson=false) {
  const events={};const event=name=>({addListener:fn=>{events[name]=fn;}});
  const store=saved?structuredClone(saved):{},tabs=new Map(),removed=[],notifications=[],created=[];
  let nextTab=1;
  const rescans=[],updates=[],rescan={handle:async()=>({readerVersion:4})};
  const scripts=[];const chrome={permissions:{contains:async()=>pearson,onRemoved:event('permissionRemoved')},scripting:{getRegisteredContentScripts:async()=>scripts,unregisterContentScripts:async()=>{scripts.length=0;},registerContentScripts:async value=>scripts.push(...value)},runtime:{id:'test-extension',getURL:p=>'chrome-extension://test-extension/'+p,onMessage:event('message'),onInstalled:event('installed'),onStartup:event('startup')},
    storage:{local:{get:async key=>structuredClone({[key]:store[key]}),set:async value=>Object.assign(store,structuredClone(value)),setAccessLevel:async()=>{}}},
    action:{onClicked:event('action')},alarms:{create:async()=>{},onAlarm:event('alarm')},
    tabs:{query:async options=>[...tabs.values()].filter(t=>!options?.url||(Array.isArray(options.url)?options.url:[options.url]).some(u=>t.url?.startsWith(u.replace(/\*$/,'')))),sendMessage:async(id,message)=>{rescans.push({id,message});return rescan.handle(id,message);},create:async options=>{const tab={...options,id:nextTab++};tabs.set(tab.id,tab);created.push(tab);return tab;},get:async id=>{if(!tabs.has(id))throw Error('No tab');return tabs.get(id);},update:async(id,change)=>{updates.push({id,change});if(tabs.has(id))Object.assign(tabs.get(id),change);},onUpdated:event('updated'),onActivated:event('activated'),remove:async id=>{removed.push(id);tabs.delete(id);},onRemoved:event('removed')},
    notifications:{create:async(id,options)=>{notifications.push({id,options});},onClicked:event('notification')}
  };
  const context=vm.createContext({chrome,console,URL,Date,Intl,TextEncoder,AbortController,setTimeout,clearTimeout});
  context.importScripts=(...files)=>{for(const file of files)vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension',file),'utf8'),context);};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/background.js'),'utf8'),context);
  const reads=[],transport={handle:async()=>({kind:'render'})};context.DNBackground.read=async(...args)=>{reads.push(args);return transport.handle(...args);};
  const admin={id:'test-extension',url:'chrome-extension://test-extension/dashboard.html'};
  const message=async(payload,sender=admin)=>{
    if(payload.type==='CAPTURE'&&payload.snapshot.requestId===undefined&&store.state?.job?.tabId===sender.tab?.id)payload={...payload,snapshot:{...payload.snapshot,requestId:store.state.job.pageToken}};
    const result=await new Promise(resolve=>events.message(payload,sender,resolve));
    await new Promise(resolve=>setImmediate(resolve));return result;
  };
  const settle=()=>message({type:'GET_STATE'});
  return {reads,transport,store,tabs,scripts,rescans,updates,rescan,removed,notifications,created,events,message,settle,admin,context};
}
const C=require('../extension/core.js'),term=C.currentTerm();
const url='https://www.gradescope.com/courses/42';
const sender={id:'test-extension',url,tab:{id:500}};
const snapshot=(extra={})=>({source:'gradescope',pageURL:url,title:'MA 161',course:{id:'42',title:'MA 161',term},items:[{title:'HW 1',source:'gradescope',url:url+'/assignments/99',course:'MA 161',courseId:'42',dueRaw:'September 20, 2026 11:59 PM',status:'not-submitted'}],links:[],settled:true,...extra});
test('worker rejects content scripts requesting privileged operations and spoofed captures',async()=>{
 const h=harness();assert.match((await h.message({type:'CLEAR'},sender)).error,/dashboard/);
 assert.match((await h.message({type:'GET_STATE'},sender)).error,/dashboard/);
 assert.match((await h.message({type:'CAPTURE',snapshot:snapshot({pageURL:'https://purdue.brightspace.com/d2l/home'})},sender)).error,/Invalid page/);
});
test('capture validates URLs and saves normalized dates without trusting incoming dueAt',async()=>{
 const h=harness(),s=snapshot();s.items[0].dueAt='2099-01-01T00:00Z';s.items.push({...s.items[0],url:'https://evil.test/'});
 assert.equal((await h.message({type:'CAPTURE',snapshot:s},sender)).ok,true);
 const items=Object.values((await h.settle()).state.items);assert.equal(items.length,1);assert.equal(items[0].dueAt,'2026-09-21T03:59:00.000Z');
});
test('concurrent captures serialize writes and preserve separate assignments',async()=>{
 const h=harness(),second=snapshot();second.items[0].url=url+'/assignments/100';
 await Promise.all([h.message({type:'CAPTURE',snapshot:snapshot()},sender),h.message({type:'CAPTURE',snapshot:second},sender)]);
 assert.equal(Object.keys((await h.settle()).state.items).length,2);
});
test('changing time zone reparses wall-time dates and local completion survives rescans',async()=>{
 const h=harness();await h.message({type:'CAPTURE',snapshot:snapshot()},sender);
 const id=Object.keys((await h.settle()).state.items)[0];await h.message({type:'SET_ITEM',id,completionOverride:'done'});
 await h.message({type:'SET_SETTINGS',settings:{zone:'America/Los_Angeles',leadHours:6,reminders:false}});
 await h.message({type:'CAPTURE',snapshot:snapshot()},sender);
 const item=(await h.settle()).state.items[id];assert.equal(item.completionOverride,'done');assert.equal(item.dueAt,'2026-09-21T06:59:00.000Z');
});
test('sync discovers only allowlisted pages, persists queue and does not close user-owned tabs',async()=>{
 const h=harness();await h.message({type:'SYNC'});let s=(await h.settle()).state;
 assert.equal(s.job.running,true);assert.equal(h.created.length,1);
 const current=s.job.currentURL,tabId=s.job.tabId;
 await h.message({type:'CAPTURE',snapshot:{pageURL:current,title:'Home',items:[],links:[{url:'https://purdue.brightspace.com/d2l/home/123',title:'Course',term},{url:'https://evil.test/',title:'Bad'}],settled:true}}, {id:'test-extension',url:current,tab:{id:tabId}});
 s=(await h.settle()).state;assert.equal(s.job.checked,1);assert.ok(s.job.seen.includes('https://purdue.brightspace.com/d2l/home/123'));assert.ok(!s.job.seen.includes('https://evil.test/'));assert.ok(!h.removed.includes(tabId));assert.equal(h.created.length,1);assert.equal(h.store.state.job.tabId,tabId);assert.ok(!h.removed.includes(500));
 await h.message({type:'STOP_SYNC'});assert.equal((await h.settle()).state.job.running,false);
});
test('SSO redirect times out, reports sign-in requirement and leaves external sign-in tab open',async()=>{
 const h=harness();await h.message({type:'SYNC'});let s=h.store.state;
 const id=s.job.tabId;h.tabs.get(id).url='https://login.microsoftonline.com/purdue';s.job.startedPageAt=Date.now()-90000;
 h.events.alarm({name:'maintenance'});await h.settle();
 assert.ok(!h.removed.includes(id));assert.match(h.store.state.job.errors[0],/sign[- ]in/i);
});
test('same-domain login page is preserved while queue continues',async()=>{
 const h=harness();await h.message({type:'SYNC'});const job=h.store.state.job;
 await h.message({type:'CAPTURE',snapshot:{pageURL:job.currentURL,login:true,settled:true,items:[],links:[],title:'Login'}},{id:'test-extension',url:job.currentURL,tab:{id:job.tabId}});
 assert.ok(!h.removed.includes(job.tabId));assert.match(h.store.state.job.errors[0],/Sign[- ]in/);
});
test('sync queue resumes through content events after worker recreation',async()=>{
 const h=harness();await h.message({type:'SYNC'});const s=h.store.state,job=s.job;
 const restarted=harness(h.store);restarted.tabs.set(job.tabId,{id:job.tabId,url:job.currentURL});
 await restarted.message({type:'CAPTURE',snapshot:{pageURL:job.currentURL,settled:true,items:[],links:[],title:'Home'}},{id:'test-extension',url:job.currentURL,tab:{id:job.tabId}});
 assert.equal((await restarted.settle()).state.job.checked,1);
});
test('notification marker survives rescans and suppresses duplicate reminders',async()=>{
 const h=harness(),s=snapshot(),due=new Date(Date.now()+3600000).toISOString();s.items[0].dueRaw=due;
 await h.message({type:'CAPTURE',snapshot:s},sender);await h.message({type:'SET_SETTINGS',settings:{zone:'America/New_York',leadHours:24,reminders:true}});
 h.events.alarm({name:'maintenance'});await h.settle();assert.equal(h.notifications.length,1);
 await h.message({type:'CAPTURE',snapshot:s},sender);h.events.alarm({name:'maintenance'});await h.settle();assert.equal(h.notifications.length,1);
});
test('clear removes local data and preferences; settings reject invalid zones',async()=>{
 const h=harness();await h.message({type:'CAPTURE',snapshot:snapshot()},sender);
 assert.match((await h.message({type:'SET_SETTINGS',settings:{zone:'Not/AZone',leadHours:24}})).error,/valid/);
 await h.message({type:'CLEAR'});const s=(await h.settle()).state;assert.equal(Object.keys(s.items).length,0);assert.equal(s.settings.reminders,false);assert.equal(s.settings.collecting,false);
 await h.message({type:'CAPTURE',snapshot:snapshot()},sender);assert.equal(Object.keys((await h.settle()).state.items).length,0);
 assert.match((await h.message({type:'SYNC'})).error,/collection/);
});

test('unknown courses require selection; old-semester courses are never imported or queued',async()=>{
 const h=harness(),unknown=snapshot({course:{id:'42',title:'Unlabelled course'}});
 await h.message({type:'CAPTURE',snapshot:unknown},sender);assert.equal(Object.keys(h.store.state.items).length,0);
 assert.equal((await h.message({type:'SET_COURSE',key:'gradescope:42',enabled:true})).ok,true);
 await h.message({type:'CAPTURE',snapshot:unknown},sender);assert.equal(Object.keys(h.store.state.items).length,1);
 const oldURL='https://www.gradescope.com/courses/43',old=snapshot({pageURL:oldURL,course:{id:'43',title:'Old course',term:'Spring 2020'}});
 await h.message({type:'CAPTURE',snapshot:old},{...sender,url:oldURL});
 assert.match((await h.message({type:'SET_COURSE',key:'gradescope:43',enabled:true})).error,/another semester/);
 await h.message({type:'SYNC'});assert.ok(!h.store.state.job.seen.includes(oldURL));assert.ok(h.store.state.job.seen.includes(url));
});
test('edited deadlines survive source changes and timezone changes, and can be reset',async()=>{
 const h=harness();await h.message({type:'CAPTURE',snapshot:snapshot()},sender);const id=Object.keys(h.store.state.items)[0];
 assert.equal((await h.message({type:'SET_ITEM',id,date:'2026-09-25',time:'18:00'})).ok,true);
 const updated=snapshot();updated.items[0].dueRaw='September 22, 2026 11:59 PM';await h.message({type:'CAPTURE',snapshot:updated},sender);
 await h.message({type:'SET_SETTINGS',settings:{zone:'America/Los_Angeles',leadHours:24}});
 assert.equal(C.effective(h.store.state.items[id]).dueAt,'2026-09-25T22:00:00.000Z');
 assert.equal(h.store.state.items[id].dueAt,'2026-09-23T06:59:00.000Z');
 await h.message({type:'SET_ITEM',id,resetDue:true});assert.equal(C.effective(h.store.state.items[id]).dueAt,'2026-09-23T06:59:00.000Z');
});
test('Pearson requires optional access and registers its reader in frames',async()=>{
 const denied=harness();assert.match((await denied.message({type:'ENABLE_PEARSON'})).error,/Allow/);await denied.message({type:'SYNC'});assert.ok(!denied.store.state.job.seen.some(u=>u.includes('pearson')));
 const h=harness(undefined,true);assert.equal((await h.message({type:'ENABLE_PEARSON'})).ok,true);assert.equal(h.scripts[0].allFrames,true);
 const parent='https://mylabmastering.pearson.com/courses/123/menu/homework',frame='https://www.mathxl.com/Student/DoAssignments.aspx?courseId=999';
 const s={pageURL:frame,title:'Homework and Tests',course:{id:'999',title:'MA 162',term},items:[{title:'Section 3.4',url:frame,dueRaw:'Sep 24, 2026 11:59 PM',status:'not-submitted'}],links:[],settled:true};
 await h.message({type:'CAPTURE',snapshot:s},{id:'test-extension',url:frame,frameId:2,tab:{id:500,url:parent}});
 const item=Object.values(h.store.state.items)[0];assert.equal(item.courseId,'123');assert.equal(item.source,'pearson');assert.equal(item.pageURL,parent);
});

test('sync waits for Pearson embedded assignments instead of closing the empty parent',async()=>{
 const parent='https://mylabmastering.pearson.com/courses/123/menu/homework',frame='https://www.mathxl.com/Student/DoAssignments.aspx?courseId=999';
 const state=C.emptyState();state.courses['pearson:123']={key:'pearson:123',source:'pearson',id:'123',title:'MA 162',term,enabled:true};
 state.job={running:true,queue:[],seen:[parent],currentURL:parent,tabId:7,checked:0,errors:[],startedPageAt:Date.now()};
 const h=harness({state},true);h.tabs.set(7,{id:7,url:parent});
 const snap={pageURL:parent,title:'MA 162',course:{id:'123',title:'MA 162',term},embedded:true,items:[],links:[],settled:true};
 await h.message({type:'CAPTURE',snapshot:snap},{id:'test-extension',url:parent,frameId:0,tab:{id:7,url:parent}});
 assert.equal(h.store.state.job.running,true);assert.equal(h.removed.length,0);
 await h.message({type:'CAPTURE',snapshot:{...snap,pageURL:frame,embedded:false,items:[{title:'HW',url:frame,dueRaw:'Sep 24, 2026 11:59 PM'}]}},{id:'test-extension',url:frame,frameId:2,tab:{id:7,url:parent}});
 assert.equal(h.store.state.job.running,false);assert.deepEqual(h.removed,[7]);assert.equal(Object.values(h.store.state.items).length,1);
});
test('archived-course exclusion survives a course page with ordinary navigation links',async()=>{
 const h=harness();const home='https://www.gradescope.com/';
 await h.message({type:'CAPTURE',snapshot:{pageURL:home,title:'Home',items:[],links:[{url,title:'MA 161',term,inactive:true}]}},{...sender,url:home});
 await h.message({type:'CAPTURE',snapshot:snapshot({links:[{url:url+'/assignments',title:'Assignments'}]})},sender);
 assert.equal(Object.values(h.store.state.items).length,0);assert.equal(h.store.state.courses['gradescope:42'].inactive,true);
});

test('Pearson embedded list routes are accepted by observed layout and inherit the portal course',async()=>{
 const h=harness(undefined,true),parent='https://mylabmastering.pearson.com/courses/123/menu/homework';
 const owner={id:'test-extension',url:parent,frameId:0,tab:{id:500,url:parent}};
 await h.message({type:'CAPTURE',snapshot:{pageURL:parent,title:'MyLab Math',course:{id:'123',title:'MA 265',term},items:[],links:[],embedded:true}},owner);
 const frame='https://www.mathxl.com/Student/AssignmentManager.aspx',s={pageURL:frame,kind:'list',title:'Assignments',course:{title:'Course Home'},items:[{title:'Homework 1',url:frame,dueRaw:'09/06/26 11:59pm',status:'unknown'}],links:[]};
 await h.message({type:'CAPTURE',snapshot:s},{...owner,url:frame,frameId:2});
 const items=Object.values(h.store.state.items);assert.equal(items.length,1);assert.equal(items[0].course,'MA 265');assert.equal(items[0].courseId,'123');assert.equal(items[0].dueAt,'2026-09-07T03:59:00.000Z');
 const player='https://www.mathxl.com/Student/Player.aspx';await h.message({type:'CAPTURE',snapshot:{...s,pageURL:player,items:[{...s.items[0],title:'Player content',url:player}]}},{...owner,url:player,frameId:2});
 assert.equal(Object.values(h.store.state.items).length,1);
});

test('content settings disclose sync ownership only for the temporary sync tab',async()=>{
 const h=harness();await h.message({type:'SYNC'});const job=h.store.state.job;
 assert.equal((await h.message({type:'CONTENT_SETTINGS'},sender)).syncOwned,false);
 assert.equal((await h.message({type:'CONTENT_SETTINGS'},{...sender,url:job.currentURL,tab:{id:job.tabId}})).syncOwned,true);
 assert.equal((await h.message({type:'CONTENT_SETTINGS'},{...sender,tab:{id:job.tabId}})).syncOwned,false);
});

function singlePageJob(){
 const state=C.emptyState();state.courses['gradescope:42']={key:'gradescope:42',source:'gradescope',id:'42',title:'Course',term,enabled:true};
 state.job={runId:'run-one',sources:['gradescope'],running:true,queue:[],seen:[url],currentURL:url,tabId:7,tabOwned:true,checked:0,errors:[],results:{},itemIds:{},changed:0,startedPageAt:Date.now()};
 return state;
}
test('successful assignment reads produce counts and a platform timestamp; discovery alone does not',async()=>{
 const h=harness({state:singlePageJob()});h.tabs.set(7,{id:7,url,active:false});
 await h.message({type:'CAPTURE',snapshot:snapshot()},{...sender,tab:{id:7}});
 assert.match(h.store.state.job.note,/1 assignments checked/);assert.equal(h.store.state.job.changed,1);assert.ok(h.store.state.sources.gradescope.lastSuccess);
 const prev=h.store.state.sources.gradescope.lastSuccess;
 await h.message({type:'CAPTURE',snapshot:snapshot({pageURL:'https://www.gradescope.com/',course:{},items:[]})},{...sender,url:'https://www.gradescope.com/'});
 assert.equal(h.store.state.sources.gradescope.lastSuccess,prev);
});
test('unknown layouts, unreadable dates and partial pages cannot report a successful sync',async()=>{
 for(const extra of [{items:[]},{items:[{...snapshot().items[0],dueRaw:'See timetable'}]},{quality:{partial:true}},{quality:{unreadableRows:1}}]){
  const state=singlePageJob();state.sources.gradescope={lastSuccess:123};const h=harness({state});h.tabs.set(7,{id:7,url});
  await h.message({type:'CAPTURE',snapshot:snapshot(extra)},{...sender,tab:{id:7}});
  assert.equal(h.store.state.sources.gradescope.lastSuccess,123);assert.ok(h.store.state.job.errors.length);assert.notEqual(h.store.state.pages[url].outcome,'updated');
 }
});
test('explicit empty lists are valid; sign-in failures retain the old success timestamp',async()=>{
 const h=harness({state:singlePageJob()});h.tabs.set(7,{id:7,url});
 await h.message({type:'CAPTURE',snapshot:snapshot({items:[],quality:{explicitEmpty:true}})},{...sender,tab:{id:7}});
 assert.equal(h.store.state.pages[url].outcome,'empty');assert.ok(h.store.state.sources.gradescope.lastSuccess);
 const success=h.store.state.sources.gradescope.lastSuccess;
 await h.message({type:'CAPTURE',snapshot:snapshot({login:true,items:[]})},sender);assert.equal(h.store.state.sources.gradescope.lastSuccess,success);assert.equal(h.store.state.sources.gradescope.outcome,'login');
});
test('repeated captures report unchanged and preserve local corrections; source changes remain visible',async()=>{
 const h=harness();await h.message({type:'CAPTURE',snapshot:snapshot()},sender);const id=Object.keys(h.store.state.items)[0];
 await h.message({type:'SET_ITEM',id,date:'2026-10-01',time:'18:00'});
 for(let n=0;n<3;n++)await h.message({type:'CAPTURE',snapshot:snapshot()},sender);
 assert.equal(Object.keys(h.store.state.items).length,1);assert.equal(h.store.state.pages[url].outcome,'unchanged');assert.equal(h.store.state.items[id].dueOverride.dueAt,'2026-10-01T22:00:00.000Z');
 const changed=snapshot();changed.items[0].dueRaw='September 25, 2026 11:59 PM';await h.message({type:'CAPTURE',snapshot:changed},sender);
 assert.ok(h.store.state.items[id].deadlineChange);assert.equal(C.sameDeadline(h.store.state.items[id].overrideSourceDue,h.store.state.items[id]),false);
});
test('sync reuses matching open tabs without navigating or closing them',async()=>{
 const h=harness(),home=C.HOMES[0];h.tabs.set(500,{id:500,url:home,active:true});await h.message({type:'SYNC'});
 const job=h.store.state.job;assert.equal(job.tabId,500);assert.equal(job.tabOwned,false);assert.equal(h.created.length,0);
 await h.message({type:'CAPTURE',snapshot:{pageURL:home,title:'Home',items:[],links:[],settled:true,requestId:job.pageToken}},{id:'test-extension',url:home,tab:{id:500}});
 assert.equal(h.store.state.job.reused,1);assert.ok(!h.removed.includes(500));assert.equal(h.updates.length,0);
});
test('stale readers get a fresh temporary tab without changing the user tab',async()=>{
 const h=harness();h.tabs.set(500,{id:500,url:C.HOMES[0],active:true});h.rescan.handle=async()=>({readerVersion:4,needsReload:true});await h.message({type:'SYNC'});await h.settle();await h.settle();
 assert.equal(h.created.length,1);assert.equal(h.store.state.job.tabOwned,true);assert.equal(h.tabs.get(500).url,C.HOMES[0]);assert.ok(!h.removed.includes(500));
});
test('recent successes are skipped while force refresh bypasses the cache',async()=>{
 const state=C.emptyState();for(const home of C.HOMES)state.pages[home]={url:home,kind:'home',source:C.sourceFor(home),outcome:'discovered',lastSuccess:Date.now()};
 const h=harness({state});await h.message({type:'SYNC'});assert.equal(h.created.length,0);assert.equal(h.store.state.job.skipped,2);assert.equal(h.store.state.job.running,false);
 await h.message({type:'SYNC',force:true});assert.equal(h.created.length,1);assert.equal(h.store.state.job.force,true);
});
test('stop and clear never close borrowed tabs; temporary error tabs are closed',async()=>{
 for(const type of ['STOP_SYNC','CLEAR']){const h=harness();h.tabs.set(500,{id:500,url:C.HOMES[0],active:true});await h.message({type:'SYNC'});await h.message({type});assert.ok(!h.removed.includes(500));}
 const h=harness();await h.message({type:'SYNC'});const id=h.store.state.job.tabId;h.tabs.get(id).url='https://purdue.brightspace.com/d2l/error/500';await h.message({type:'STOP_SYNC'});assert.ok(h.removed.includes(id));
});
test('Brightspace group links retain context and fall back after a server error',async()=>{
 const h=harness(),page='https://purdue.brightspace.com/d2l/lms/dropbox/user/folders_list.d2l?ou=42',link='https://purdue.brightspace.com/d2l/lms/dropbox/user/folder_submit_files.d2l?ou=42&db=11&grpid=7';
 await h.message({type:'CAPTURE',snapshot:{pageURL:page,course:{id:'42',title:'Course',term},items:[{title:'Group homework',url:link,linkVersion:2,dueRaw:'Sep 25, 2026 11:59 PM'}],links:[]}},{id:'test-extension',url:page,tab:{id:500}});
 const id=Object.keys(h.store.state.items)[0];await h.message({type:'OPEN_ASSIGNMENT',id});const tab=h.created.at(-1);assert.match(tab.url,/grpid=7/);
 h.events.updated(tab.id,{url:'https://purdue.brightspace.com/d2l/error/500'},{});await h.settle();assert.equal(h.updates.at(-1).change.url,page);
});


test('timezone display changes preserve the source-date baseline without inventing a conflict',async()=>{
 const h=harness();await h.message({type:'CAPTURE',snapshot:snapshot()},sender);const id=Object.keys(h.store.state.items)[0];
 await h.message({type:'SET_ITEM',id,date:'2026-10-01',time:'18:00'});
 const custom=h.store.state.items[id].dueOverride;
 await h.message({type:'SET_SETTINGS',settings:{zone:'America/Los_Angeles',leadHours:6,reminders:false}});
 const item=h.store.state.items[id];assert.equal(C.sameDeadline(item.overrideSourceDue,item),true);assert.deepEqual(item.dueOverride,custom);
});

const homeSnapshot=pageURL=>({pageURL,kind:'home',title:'Courses',items:[],links:[],course:{},quality:{},settled:true});
function selectedPages(source='gradescope'){
 const state=C.emptyState();
 for(const home of C.HOMES)state.pages[home]={url:home,source:C.sourceFor(home),kind:'home',lastSuccess:Date.now(),outcome:'discovered'};
 for(const id of ['42','43']){const link=source==='gradescope'?`https://www.gradescope.com/courses/${id}`:`https://purdue.brightspace.com/d2l/home/${id}`,key=source+':'+id;state.courses[key]={key,id,source,title:'Course '+id,term,enabled:true};state.pages[link]={url:link,source,kind:'course',courseKey:key};}
 return state;
}
test('background reads finish selected courses without opening or navigating tabs',async()=>{
 const h=harness({state:selectedPages()});h.transport.handle=async page=>({kind:'snapshot',snapshot:snapshot({pageURL:page,course:{id:C.courseId(page),title:'Course',term}})});
 await h.message({type:'SYNC'});await h.settle();
 assert.equal(h.store.state.job.running,false);assert.equal(h.store.state.job.background,2);assert.equal(h.created.length,0);assert.equal(h.updates.length,0);assert.equal(Object.keys(h.store.state.items).length,2);assert.ok(h.store.state.sources.gradescope.lastSuccess);
});
test('one fallback tab is reused across pages and closed only after the run',async()=>{
 const h=harness({state:selectedPages()});await h.message({type:'SYNC'});const first={...h.store.state.job},id=first.tabId;
 await h.message({type:'CAPTURE',snapshot:snapshot()},{...sender,tab:{id}});
 const second={...h.store.state.job};assert.equal(second.tabId,id);assert.equal(h.created.length,1);assert.equal(h.removed.length,0);assert.equal(h.updates.at(-1).change.url,second.currentURL);
 await h.message({type:'CAPTURE',snapshot:snapshot({pageURL:second.currentURL,course:{id:'43',title:'Course',term}})},{...sender,url:second.currentURL,tab:{id}});
 assert.equal(h.created.length,1);assert.deepEqual(h.removed,[id]);assert.equal(h.store.state.job.running,false);
});
test('Stop and Clear cancel pending requests and discard late background results',async()=>{
 for(const action of ['STOP_SYNC','CLEAR']){
  const h=harness({state:selectedPages()});let complete,signal;
  h.transport.handle=async(_url,_settings,options)=>{signal=options.signal;return new Promise(resolve=>{complete=resolve;});};
  await h.message({type:'SYNC'});await h.message({type:action});assert.equal(signal.aborted,true);
  complete({kind:'snapshot',snapshot:snapshot()});await h.settle();await h.settle();
  assert.equal(Object.keys(h.store.state.items).length,0);assert.equal(h.created.length,0);assert.ok(!h.store.state.job?.running);
 }
});
test('expired login skips that platform and continues other background reads without opening login tabs',async()=>{
 const state=selectedPages('brightspace');state.pages[C.HOMES[0]].lastSuccess=0;state.pages[C.HOMES[1]].lastSuccess=0;
 const h=harness({state});h.transport.handle=async page=>C.sourceFor(page)==='brightspace'?{kind:'login'}:{kind:'snapshot',snapshot:homeSnapshot(page)};
 await h.message({type:'SYNC'});await h.settle();
 assert.deepEqual(h.reads.map(args=>args[0]),C.HOMES);assert.equal(h.created.length,0);assert.equal(h.store.state.job.running,false);assert.equal(h.store.state.sources.brightspace.outcome,'login');assert.match(h.store.state.sources.brightspace.message,/Sign in/);
});
test('login redirects pause the entire source immediately and preserve the single sign-in tab',async()=>{
 const h=harness({state:selectedPages()});await h.message({type:'SYNC'});const id=h.store.state.job.tabId,login='https://www.gradescope.com/login';h.tabs.get(id).url=login;
 h.events.updated(id,{url:login},h.tabs.get(id));await h.settle();
 assert.equal(h.store.state.job.running,false);assert.equal(h.created.length,1);assert.equal(h.removed.length,0);assert.equal(h.reads.length,1);assert.equal(h.store.state.sources.gradescope.outcome,'login');
});
test('old render responses cannot advance the next page or import old content',async()=>{
 const h=harness({state:selectedPages()});await h.message({type:'SYNC'});const first={...h.store.state.job};
 await h.message({type:'CAPTURE',snapshot:snapshot()},{...sender,tab:{id:first.tabId}});const second={...h.store.state.job};
 const stale=snapshot({requestId:first.pageToken,items:[{...snapshot().items[0],title:'Stale poison',url:url+'/assignments/999'}]});
 await h.message({type:'CAPTURE',snapshot:stale},{...sender,tab:{id:first.tabId}});
 assert.equal(h.store.state.job.currentURL,second.currentURL);assert.equal(h.store.state.job.checked,1);assert.ok(!Object.values(h.store.state.items).some(i=>i.title==='Stale poison'));
});
test('activating the fallback tab relinquishes it and does not create replacement tabs',async()=>{
 const h=harness({state:selectedPages()});await h.message({type:'SYNC'});const id=h.store.state.job.tabId;h.tabs.get(id).active=true;h.events.activated({tabId:id});await h.settle();
 await h.message({type:'CAPTURE',snapshot:snapshot()},{...sender,tab:{id}});await h.settle();
 assert.equal(h.created.length,1);assert.equal(h.removed.length,0);assert.equal(h.updates.length,0);assert.equal(h.store.state.job.running,false);assert.ok(h.store.state.job.errors.length);
});
test('a partial borrowed page falls back without navigating the user tab',async()=>{
 const h=harness({state:selectedPages()});h.tabs.set(500,{id:500,url,active:true});await h.message({type:'SYNC'});
 const job=h.store.state.job;await h.message({type:'CAPTURE',snapshot:snapshot({quality:{partial:true},requestId:job.pageToken})},sender);
 assert.equal(h.created.length,1);assert.equal(h.store.state.job.tabOwned,true);assert.equal(h.tabs.get(500).url,url);assert.ok(!h.updates.some(update=>update.id===500));
});
