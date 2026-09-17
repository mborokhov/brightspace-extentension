const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function harness(saved) {
  const events={};const event=name=>({addListener:fn=>{events[name]=fn;}});
  const store=saved?structuredClone(saved):{},tabs=new Map(),removed=[],notifications=[],created=[];
  let nextTab=1;
  const chrome={runtime:{id:'test-extension',getURL:p=>'chrome-extension://test-extension/'+p,onMessage:event('message'),onInstalled:event('installed'),onStartup:event('startup')},
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
  return {store,tabs,removed,notifications,created,events,message,settle,admin,context};
}
const url='https://www.gradescope.com/courses/42';
const sender={id:'test-extension',url,tab:{id:500}};
const snapshot=(extra={})=>({source:'gradescope',pageURL:url,title:'MA 161',items:[{title:'HW 1',source:'gradescope',url:url+'/assignments/99',course:'MA 161',courseId:'42',dueRaw:'September 20, 2026 11:59 PM',status:'not-submitted'}],links:[],settled:true,...extra});
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
 await h.message({type:'CAPTURE',snapshot:{pageURL:current,title:'Home',items:[],links:[{url:'https://purdue.brightspace.com/d2l/home/123',title:'Course'},{url:'https://evil.test/',title:'Bad'}],settled:true}}, {id:'test-extension',url:current,tab:{id:tabId}});
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
 assert.match((await h.message({type:'SYNC'})).error,/paused/);
});
