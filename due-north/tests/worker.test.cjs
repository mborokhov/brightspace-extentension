const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function harness(saved,pearson=false) {
  const events={};const event=name=>({addListener:fn=>{events[name]=fn;}});
  const store=saved?structuredClone(saved):{},tabs=new Map(),removed=[],notifications=[],created=[];
  let nextTab=1;
  const scripts=[];const chrome={permissions:{contains:async()=>pearson,onRemoved:event('permissionRemoved')},scripting:{getRegisteredContentScripts:async()=>scripts,unregisterContentScripts:async()=>{scripts.length=0;},registerContentScripts:async value=>scripts.push(...value)},runtime:{id:'test-extension',getURL:p=>'chrome-extension://test-extension/'+p,onMessage:event('message'),onInstalled:event('installed'),onStartup:event('startup')},
    storage:{local:{get:async key=>structuredClone({[key]:store[key]}),set:async value=>Object.assign(store,structuredClone(value)),setAccessLevel:async()=>{}}},
    action:{onClicked:event('action')},alarms:{create:async()=>{},onAlarm:event('alarm')},
    tabs:{query:async()=>[],create:async options=>{const tab={...options,id:nextTab++};tabs.set(tab.id,tab);created.push(tab);return tab;},get:async id=>{if(!tabs.has(id))throw Error('No tab');return tabs.get(id);},update:async()=>{},remove:async id=>{removed.push(id);tabs.delete(id);},onRemoved:event('removed')},
    notifications:{create:async(id,options)=>{notifications.push({id,options});},onClicked:event('notification')}
  };
  const context=vm.createContext({chrome,console,URL,Date,Intl,TextEncoder,setTimeout,clearTimeout});
  context.importScripts=file=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension',file),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/background.js'),'utf8'),context);
  const admin={id:'test-extension',url:'chrome-extension://test-extension/dashboard.html'};
  const message=(payload,sender=admin)=>new Promise(resolve=>events.message(payload,sender,resolve));
  const settle=()=>message({type:'GET_STATE'});
  return {store,tabs,scripts,removed,notifications,created,events,message,settle,admin,context};
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
 s=(await h.settle()).state;assert.equal(s.job.checked,1);assert.ok(s.job.seen.includes('https://purdue.brightspace.com/d2l/home/123'));assert.ok(!s.job.seen.includes('https://evil.test/'));assert.ok(h.removed.includes(tabId));assert.ok(!h.removed.includes(500));
 await h.message({type:'STOP_SYNC'});assert.equal((await h.settle()).state.job.running,false);
});
test('SSO redirect times out, reports sign-in requirement and leaves external sign-in tab open',async()=>{
 const h=harness();await h.message({type:'SYNC'});let s=h.store.state;
 const id=s.job.tabId;h.tabs.get(id).url='https://login.microsoftonline.com/purdue';s.job.startedPageAt=Date.now()-90000;
 h.events.alarm({name:'maintenance'});await h.settle();
 assert.ok(!h.removed.includes(id));assert.match(h.store.state.job.errors[0],/sign-in/);
});
test('same-domain login page is preserved while queue continues',async()=>{
 const h=harness();await h.message({type:'SYNC'});const job=h.store.state.job;
 await h.message({type:'CAPTURE',snapshot:{pageURL:job.currentURL,login:true,settled:true,items:[],links:[],title:'Login'}},{id:'test-extension',url:job.currentURL,tab:{id:job.tabId}});
 assert.ok(!h.removed.includes(job.tabId));assert.match(h.store.state.job.errors[0],/Sign in/);
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
 assert.equal((await h.message({type:'CONTENT_SETTINGS'},{...sender,tab:{id:job.tabId}})).syncOwned,true);
});
