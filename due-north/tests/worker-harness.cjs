const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function harness(saved,pearson=false,options={}) {
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
  chrome.runtime.getManifest=()=>options.manifest||{};
  if(options.identity)chrome.identity=options.identity;
  if(options.permissions)chrome.permissions.contains=options.permissions;
  const context=vm.createContext({chrome,console,URL,Date,Intl,TextEncoder,AbortController,setTimeout:options.setTimeout||setTimeout,clearTimeout,fetch:options.fetch,crypto:require('node:crypto').webcrypto});
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
module.exports=harness;
