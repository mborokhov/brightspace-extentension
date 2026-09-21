'use strict';
importScripts('core.js');
const C=DNCore,PEARSON_ORIGINS=C.PEARSON_HOSTS.map(host=>`https://${host}/*`),PEARSON_HOME='https://mylabmastering.pearson.com/courses';
let serial=Promise.resolve();
const locked=fn=>{const result=serial.then(fn);serial=result.catch(()=>{});return result;};
const read=async()=>C.migrateState((await chrome.storage.local.get('state')).state);
const save=state=>chrome.storage.local.set({state});
const dashboardURL=()=>chrome.runtime.getURL('dashboard.html');
const trusted=sender=>sender.id===chrome.runtime.id&&!!sender.url?.startsWith(chrome.runtime.getURL(''));
const pearsonEnabled=async()=>!!(await chrome.permissions?.contains({origins:PEARSON_ORIGINS}));
async function configurePearson(){
  if(!chrome.scripting)return;
  const existing=await chrome.scripting.getRegisteredContentScripts({ids:['pearson-reader']});
  if(await pearsonEnabled()){
    if(existing.length)await chrome.scripting.unregisterContentScripts({ids:['pearson-reader']});
    await chrome.scripting.registerContentScripts([{id:'pearson-reader',matches:PEARSON_ORIGINS,js:['core.js','extractors.js','content.js'],runAt:'document_idle',allFrames:true,persistAcrossSessions:true}]);
  }else if(existing.length)await chrome.scripting.unregisterContentScripts({ids:['pearson-reader']});
}
async function ensureAlarm(){await chrome.alarms.create('maintenance',{periodInMinutes:1});await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});}
async function openDashboard(){const tabs=await chrome.tabs.query({url:dashboardURL()});if(tabs.length)await chrome.tabs.update(tabs[0].id,{active:true});else await chrome.tabs.create({url:dashboardURL()});}
chrome.action.onClicked.addListener(openDashboard);
chrome.runtime.onInstalled.addListener(()=>locked(async()=>{await ensureAlarm();await configurePearson();await save(await read());await openDashboard();}));
chrome.runtime.onStartup.addListener(()=>locked(async()=>{await ensureAlarm();await configurePearson();const state=await read();if(state.job?.running){state.job.running=false;state.job.tabId=null;state.job.note='Sync paused after browser restart.';}state.syncTabs={};state.opening={};await save(state);}));
chrome.permissions?.onRemoved?.addListener(()=>locked(configurePearson));
function registerCourse(state,input){
  if(!input.id)return null;
  const key=C.courseKey(input.source,input.id),old=state.courses[key];
  const title=C.clean(input.title,160),generic=/^(Course(?: page)?(?: [\w-]+)?|Assignments|Quizzes|Homework and Tests|MyLab Math|Course Home)$/i.test(title);
  const term=C.parseTerm(input.term)||C.parseTerm(title)||old?.term||null;
  const inactive=input.inactive===true||old?.inactive===true;
  const course={...old,key,id:input.id,source:input.source,title:generic&&old?.title?old.title:title||old?.title||`Course ${input.id}`,term,inactive,
    url:old?.url||input.url,enabled:old?.userSelected??(term===state.activeTerm&&!inactive)};
  state.courses[key]=course;return course;
}
function canSync(state,url){
  const kind=C.pageKind(url)||(C.canInspectPearson(url)&&state.pages[url]?.kind==='list'?'list':'');if(!kind)return false;
  if(kind==='home')return true;
  const key=state.pages[url]?.courseKey||C.courseKey(C.sourceFor(url),C.courseId(url));
  return C.isCourseActive(state,key);
}
const CACHE_MS=2*60000;
const goodCodes=new Set(['updated','unchanged','empty','discovered']);
function sourceStatus(state,source){return state.sources[source] ||= {};}
async function closeOwned(id,expectedURL){
  if(!id)return;
  try{
    const tab=await chrome.tabs.get(id),actual=C.canonicalURL(tab.url),expected=C.canonicalURL(expectedURL);
    if(tab.active||!actual||!expected)return;
    const sameCourse=C.pageKind(actual)&&C.sourceFor(actual)===C.sourceFor(expected)&&C.courseId(actual)&&C.courseId(actual)===C.courseId(expected);
    const errorPage=new URL(actual).hostname===new URL(expected).hostname&&/\/d2l\/error\//i.test(new URL(actual).pathname);
    if((actual===expected&&C.pageKind(actual))||sameCourse||errorPage||actual===expected&&C.canInspectPearson(actual))await chrome.tabs.remove(id);
  }catch{}
}
async function releaseCurrent(state,preserve=false){
  const job=state.job,id=job?.tabId,owned=job?.tabOwned!==false,url=job?.currentURL;
  if(!id)return;
  job.tabId=null;state.syncTabs ||= {};delete state.syncTabs[id];await save(state);
  if(owned&&!preserve)await closeOwned(id,url);
}
function recordResult(state,url,outcome,count=0){
  const job=state.job,source=C.sourceFor(url);
  job.results ||= {};job.results[url]={source,...outcome,count};
  if(!outcome.success&&outcome.code!=='unselected'){
    const error=`${source}: ${outcome.message}`;if(!job.errors.includes(error))job.errors.push(error);
  }
}
function finishJob(state){
  const job=state.job;job.running=false;job.finishedAt=Date.now();
  const results=Object.values(job.results||{}),ids=Object.keys(job.itemIds||{}).filter(id=>state.items[id]);
  job.note=`${ids.length} assignments checked · ${job.changed||0} changed${job.reused?` · ${job.reused} open pages reused`:''}${job.skipped?` · ${job.skipped} recent pages skipped`:''}${results.some(r=>!r.success)?' · needs attention':''}`;
  for(const source of new Set([...(job.sources||[]),...results.map(r=>r.source)])){
    const data=sourceStatus(state,source),checks=results.filter(r=>r.source===source),courses=Object.values(state.courses).filter(c=>c.source===source&&C.isCourseActive(state,c.key));
    const covered=courses.every(c=>Object.values(state.pages).some(p=>p.courseKey===c.key&&['updated','unchanged','empty'].includes(p.outcome)&&p.lastSuccess&&p.lastSuccess>=(job.startedAt||Date.now())-CACHE_MS));
    const failed=checks.filter(r=>!r.success),listRead=checks.some(r=>['updated','unchanged','empty'].includes(r.code));
    data.lastAttempt=Date.now();
    data.message=checks.length&&checks.every(r=>r.code==='cached')?'Recently checked · no pages reopened':failed.length?failed[0].message:!courses.length?'Choose current courses':!covered?'Open missing assignment lists':`${ids.filter(id=>state.items[id]?.source===source).length} assignments checked`;
    data.outcome=failed.length?failed[0].code:!courses.length||!covered?'partial':'updated';
    // Cached pages retain their original timestamp; discovering links is not a successful assignment sync.
    if(!failed.length&&covered&&listRead)data.lastSuccess=Date.now();
    data.login=failed.some(r=>r.code==='login');
  }
}
async function createSyncTab(state){
  const job=state.job;
  const tab=await chrome.tabs.create({url:job.currentURL,active:false});job.tabId=tab.id;job.tabOwned=true;job.startedPageAt=Date.now();
  state.syncTabs ||= {};state.syncTabs[tab.id]={url:job.currentURL,runId:job.runId};await save(state);
}
async function replaceBorrowed(runId,tabId){
  const state=await read(),job=state.job;
  if(!job?.running||job.runId!==runId||job.tabId!==tabId||job.tabOwned!==false)return;
  job.tabId=null;await save(state);
  try{await createSyncTab(state);}catch{await advance(state,'Could not open a refresh tab.');}
}
async function advance(state,error='',preserveTab=false){
  const job=state.job;if(!job?.running)return;
  if(job.tabId){job.checked++;if(error){const outcome={code:/sign.in/i.test(error)?'login':'error',message:error,success:false};recordResult(state,job.currentURL,outcome);const page=state.pages[job.currentURL];if(page)Object.assign(page,{outcome:outcome.code,message:error,lastAttempt:Date.now()});}}
  await releaseCurrent(state,preserveTab);
  job.queue=job.queue.filter(url=>canSync(state,url));
  while(job.queue.length&&job.checked<60){
    job.currentURL=job.queue.shift();const page=state.pages[job.currentURL];
    if(!job.force&&page?.lastSuccess&&Date.now()-page.lastSuccess<CACHE_MS&&goodCodes.has(page.outcome)){
      job.skipped=(job.skipped||0)+1;recordResult(state,job.currentURL,{code:'cached',message:'Recently checked; kept existing data',success:true},page.count);continue;
    }
    job.startedPageAt=Date.now();await save(state);
    try{
      const candidates=await chrome.tabs.query({url:new URL(job.currentURL).origin+'/*'});
      const existing=candidates.find(tab=>!state.syncTabs?.[tab.id]&&C.canonicalURL(tab.url)===job.currentURL);
      if(existing&&chrome.tabs.sendMessage){
        job.tabId=existing.id;job.tabOwned=false;await save(state);
        // Do not await a content reply while holding the storage lock: its CAPTURE uses that lock.
        chrome.tabs.sendMessage(existing.id,{type:'RESCAN',requestId:job.runId,requireFresh:true,force:job.force}).then(reply=>{
          if(reply?.readerVersion!==3||reply.needsReload)locked(()=>replaceBorrowed(job.runId,existing.id));
        },()=>locked(()=>replaceBorrowed(job.runId,existing.id)));
      }else await createSyncTab(state);
      return;
    }catch{recordResult(state,job.currentURL,{code:'error',message:'Could not open this page',success:false});job.checked++;}
  }
  if(job.queue.length)recordResult(state,job.currentURL,{code:'partial',message:'Sync limit reached; some pages remain',success:false});
  finishJob(state);await save(state);
}
function sanitizedSnapshot(snapshot,sender,state){
  if(!sender.tab||!C.allowedURL(sender.url)||!snapshot||C.canonicalURL(sender.url)!==C.canonicalURL(snapshot.pageURL))throw new Error('Invalid page capture');
  const frameURL=C.canonicalURL(sender.url),source=C.sourceFor(frameURL);
  const parentURL=C.canonicalURL(sender.tab.url),pearsonParent=source==='pearson'&&parentURL&&C.sourceFor(parentURL)==='pearson'&&C.courseId(parentURL);
  const pageURL=pearsonParent?parentURL:frameURL;
  const course={id:C.clean(pearsonParent||snapshot.course?.id||C.courseId(frameURL),80),title:C.clean(snapshot.course?.title||snapshot.items?.[0]?.course||snapshot.title,160),term:C.parseTerm(snapshot.course?.term||snapshot.course?.title||snapshot.title)};
  const items=(Array.isArray(snapshot.items)?snapshot.items:[]).slice(0,500).flatMap(item=>{
    const url=C.canonicalURL(item.url);if(!url||C.sourceFor(url)!==source||!C.clean(item.title))return [];
    return [{source,url,pageURL,title:C.clean(item.title,250),course:course.title,courseId:course.id||C.clean(item.courseId,80),nativeId:C.clean(item.nativeId,80),type:item.type==='quiz'?'quiz':'assignment',
      linkVersion:item.linkVersion===2?2:0,status:['submitted','graded','not-submitted'].includes(item.status)?item.status:'unknown',...C.parseDue(C.clean(item.dueRaw,500),state.settings.zone)}];
  });
  const links=(Array.isArray(snapshot.links)?snapshot.links:[]).slice(0,150).flatMap(link=>{
    const url=C.canonicalURL(link.url);return url&&C.pageKind(url)&&C.sourceFor(url)===source?[{url,title:C.clean(link.title,160),source,courseId:C.courseId(url)||C.clean(link.courseId,80)||course.id,term:C.parseTerm(link.term||link.title),inactive:!!link.inactive}]:[];
  });
  const kind=C.pageKind(frameURL)||(C.canInspectPearson(frameURL)&&snapshot.kind==='list'&&items.length?'list':'');
  const q=snapshot.quality||{},quality={explicitEmpty:!!q.explicitEmpty,partial:!!q.partial,preview:!!q.preview,rowCount:Math.max(0,Math.min(500,Number(q.rowCount)||0)),unreadableRows:Math.max(0,Math.min(500,Number(q.unreadableRows)||0))};
  return {source,pageURL,frameURL,items,links,course,kind,quality,requestId:C.clean(snapshot.requestId,100),pageError:!!snapshot.pageError,title:C.clean(snapshot.title,160),login:!!snapshot.login,settled:!!snapshot.settled,embedded:!!snapshot.embedded};
}
async function capture(snapshot,sender){
  const state=await read(),snap=sanitizedSnapshot(snapshot,sender,state),now=Date.now();
  if(state.settings.collecting===false)return {ok:true,paused:true};
  if(!snap.kind&&!snap.login&&!snap.pageError)return {ok:true};
  const course=registerCourse(state,{...snap.course,source:snap.source,url:snap.pageURL});
  const included=course&&C.isCourseActive(state,course.key);
  const items=included?snap.items.map(i=>({...i,courseKey:course.key,course:course.title,term:course.term})):[];
  const before=state.items;
  state.items=C.mergeItems(state.items,items,now);
  const outcome=C.captureOutcome(snap,included),oldPage=state.pages[snap.pageURL]||{};
  const fingerprint=C.hash(JSON.stringify({items:snap.items,links:snap.links,quality:snap.quality}));
  if(outcome.code==='updated'&&oldPage.fingerprint===fingerprint){outcome.code='unchanged';outcome.message=`${items.length} assignments checked · no changes`;}
  const source=sourceStatus(state,snap.source);Object.assign(source,{lastAttempt:now,login:snap.login,outcome:outcome.code,message:outcome.message});
  if(outcome.success&&['updated','unchanged','empty'].includes(outcome.code))source.lastPageSuccess=now;
  if(snap.kind)state.pages[snap.pageURL]={...oldPage,url:snap.pageURL,title:snap.title,source:snap.source,courseKey:course?.key,lastSeen:now,lastAttempt:now,lastSuccess:outcome.success?now:oldPage.lastSuccess,count:items.length,kind:snap.kind,outcome:outcome.code,message:outcome.message,quality:snap.quality,fingerprint};
  for(const link of snap.links){
    const same=course&&link.courseId===course.id;
    const linked=registerCourse(state,{id:link.courseId,title:same?course.title:link.title,source:snap.source,term:link.term||(same?course.term:null),url:link.url,inactive:link.inactive});
    state.pages[link.url]={...state.pages[link.url],url:link.url,title:state.pages[link.url]?.title||link.title,source:snap.source,courseKey:linked?.key,kind:C.pageKind(link.url)};
  }
  const job=state.job;
  const usableFrame=sender.frameId===undefined||sender.frameId===0||snap.source==='pearson'&&(snap.items.length>0||snap.quality.explicitEmpty);
  const requested=job?.tabOwned!==false||snap.requestId===job.runId;
  const waitingForFrame=snap.embedded&&!snap.items.length&&!snap.quality.explicitEmpty&&!snap.login&&!snap.pageError;
  if(job?.running&&job.tabId===sender.tab.id&&snap.settled&&usableFrame&&requested&&!waitingForFrame){
    for(const link of snap.links)if(canSync(state,link.url)&&!job.seen.includes(link.url)&&job.seen.length<60){job.seen.push(link.url);job.queue.push(link.url);}
    job.itemIds ||= {};job.changed ||= 0;
    for(const item of items){
      const identity=C.assignmentId(item),saved=state.items[identity]||Object.values(state.items).find(i=>C.assignmentId(i)===identity)||Object.values(state.items).filter(i=>i.source===item.source&&i.courseId===item.courseId&&i.title.toLowerCase()===C.assignmentTitle(item).toLowerCase());
      const record=Array.isArray(saved)?saved.length===1?saved[0]:null:saved;if(!record)continue;
      const id=record.id,old=before[id];if(!job.itemIds[id]&&(!old||old.title!==record.title||old.status!==record.status||!C.sameDeadline(old,record)))job.changed++;job.itemIds[id]=true;
    }
    if(job.tabOwned===false)job.reused=(job.reused||0)+1;
    recordResult(state,job.currentURL,outcome,items.length);
    if(snap.pageURL!==job.currentURL&&state.pages[job.currentURL])Object.assign(state.pages[job.currentURL],{outcome:outcome.code,message:outcome.message,lastAttempt:now});
    await advance(state,'',snap.login);
  }else await save(state);
  return {ok:true,included:!!included,outcome:outcome.code};
}

async function rescanOpenTabs(){
  const urls=[...C.HOMES.map(url=>new URL(url).origin+'/*'),'https://gradescope.com/*',...(await pearsonEnabled()?PEARSON_ORIGINS:[])];
  for(const tab of await chrome.tabs.query({url:urls}))try{await chrome.tabs.sendMessage(tab.id,{type:'RESCAN'});}catch{}
}
async function dispatch(message,sender){
  if(message?.type==='CONTENT_SETTINGS'&&sender.tab&&C.allowedURL(sender.url)){const state=await read();return {settings:state.settings,syncOwned:!!state.job?.running&&state.job.tabId===sender.tab.id&&state.job.tabOwned!==false};}
  if(message?.type==='CAPTURE')return capture(message.snapshot,sender);
  if(!trusted(sender))throw new Error('Only the extension dashboard can perform this action');
  const state=await read();
  switch(message.type){
    case 'GET_STATE':return {state,pearsonEnabled:await pearsonEnabled()};
    case 'OPEN_ASSIGNMENT':{const item=state.items[message.id];if(!item)throw new Error('Assignment not found.');await openAssignment(item,state);return {ok:true};}
    case 'ENABLE_PEARSON':if(!await pearsonEnabled())throw new Error('Allow MyLab access first.');await configurePearson();return {ok:true};
    case 'SYNC':{
      if(state.job?.running)return {ok:true};if(state.settings.collecting===false)throw new Error('Enable collection in Settings.');
      await ensureAlarm();const pearson=await pearsonEnabled();
      const urls=[...new Set([...C.HOMES,...(pearson?[PEARSON_HOME]:[]),...Object.keys(state.pages).filter(url=>canSync(state,url)&&(C.sourceFor(url)!=='pearson'||pearson))])].slice(0,60);
      state.job={runId:String(Date.now())+'-'+Math.random().toString(36).slice(2),force:!!message.force,sources:[...new Set(urls.map(C.sourceFor))],results:{},itemIds:{},changed:0,reused:0,skipped:0,running:true,queue:urls,seen:[...urls],checked:0,errors:[],tabId:null,startedAt:Date.now(),note:'Checking current courses...'};await advance(state);return {ok:true};
    }
    case 'STOP_SYNC':if(state.job?.running){await releaseCurrent(state);state.job.running=false;state.job.note='Sync stopped.';await save(state);}return {ok:true};
    case 'SET_COURSE':{
      const course=state.courses[message.key];if(!course)throw new Error('Course not found.');
      if(message.enabled&&(course.inactive||course.term&&course.term!==state.activeTerm))throw new Error('This course is from another semester.');
      course.term ||= state.activeTerm;course.enabled=!!message.enabled;course.userSelected=course.enabled;
      await save(state);rescanOpenTabs().catch(()=>{});return {ok:true};
    }
    case 'SET_ITEM':{
      const item=state.items[message.id];if(!item)throw new Error('Assignment not found');
      if(['done','todo',''].includes(message.completionOverride)){item.completionOverride=message.completionOverride;item.completionUpdatedAt=Date.now();}
      if(message.resetDue===true){item.dueOverride=null;item.dueOverrideUpdatedAt=Date.now();}
      else if(message.date!==undefined){item.dueOverride=C.manualDue(C.clean(message.date,10),C.clean(message.time,5),state.settings.zone);item.dueOverrideUpdatedAt=Date.now();item.overrideSourceDue={dueAt:item.dueAt,dueDate:item.dueDate};}
      await save(state);return {ok:true};
    }
    case 'SET_SETTINGS':{
      const settings=message.settings;
      if(!settings||!C.validZone(settings.zone)||![1,6,12,24,48].includes(Number(settings.leadHours)))throw new Error('Choose a valid time zone and reminder interval.');
      state.settings={zone:settings.zone,leadHours:Number(settings.leadHours),reminders:!!settings.reminders,collecting:settings.collecting??state.settings.collecting};
      if(typeof state.settings.collecting!=='boolean')throw new Error('Invalid collection setting');
      if(!state.settings.collecting&&state.job?.running){await releaseCurrent(state);state.job.running=false;await save(state);}
      for(const item of Object.values(state.items)){
        const baselineMatches=item.overrideSourceDue&&C.sameDeadline(item.overrideSourceDue,item);
        Object.assign(item,C.parseDue(item.dueRaw,state.settings.zone));
        if(baselineMatches)item.overrideSourceDue={dueAt:item.dueAt,dueDate:item.dueDate};
      }
      await save(C.migrateState(state));await ensureAlarm();if(state.settings.collecting)rescanOpenTabs().catch(()=>{});return {ok:true};
    }
    case 'CLEAR':{await releaseCurrent(state);const empty=C.emptyState();empty.settings.collecting=false;await save(empty);return {ok:true};}
    case 'TEST_NOTIFICATION':await chrome.notifications.create('due-north-test',{type:'basic',iconUrl:'icons/128.png',title:'Due North',message:'Deadline reminders are ready.'});return {ok:true};
    default:throw new Error('Unknown request');
  }
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{locked(()=>dispatch(message,sender)).then(reply,error=>reply({error:error.message}));return true;});
chrome.tabs.onRemoved.addListener(id=>locked(async()=>{const state=await read();if(state.opening?.[id]){delete state.opening[id];await save(state);}if(state.job?.running&&state.job.tabId===id)await advance(state,'A sync tab was closed.');}));
chrome.alarms.onAlarm.addListener(alarm=>{
  if(alarm.name!=='maintenance')return;
  locked(async()=>{
    const state=await read();if(state.job?.running&&Date.now()-state.job.startedPageAt>55000){if(state.job.tabOwned===false){await replaceBorrowed(state.job.runId,state.job.tabId);return;}await advance(state,'Page timed out or needs sign-in. Open the site and retry.');return;}
    for(const [id,opening] of Object.entries(state.opening||{}))if(Date.now()>opening.expires)delete state.opening[id];
    for(const item of C.dueReminders(state).slice(0,5)){
      await chrome.notifications.create(`due:${item.id}`,{type:'basic',iconUrl:'icons/128.png',title:`Due soon · ${item.course}`,message:`${item.title}\n${new Date(item.dueAt).toLocaleString('en-US',{timeZone:state.settings.zone})}`});state.items[item.id].remindedFor=item.dueAt;
    }
    await save(state);
  }).catch(console.error);
});
chrome.notifications.onClicked.addListener(id=>locked(async()=>{const item=(await read()).items[id.slice(4)];if(id.startsWith('due:')&&item&&C.allowedURL(item.url)){await openAssignment(item);return;}await openDashboard();}));

async function openAssignment(item,state){
  const url=C.assignmentOpenURL(item);if(!C.allowedURL(url))throw new Error('No valid source link.');
  const tab=await chrome.tabs.create({url,active:true});
  if(item.source==='brightspace'&&url!==C.courseListURL(item)){
    state ||= await read();state.opening ||= {};state.opening[tab.id]={url,fallback:C.courseListURL(item),expires:Date.now()+120000};await save(state);
  }
}
chrome.tabs.onUpdated?.addListener((id,change,tab)=>{
  if(!change.url)return;
  locked(async()=>{
    const state=await read(),opening=state.opening?.[id];if(!opening)return;
    if(Date.now()>opening.expires){delete state.opening[id];await save(state);return;}
    const url=C.canonicalURL(change.url);
    if(url&&C.sourceFor(url)==='brightspace'&&/\/d2l\/error\/(?:500|404)/i.test(new URL(url).pathname)){
      delete state.opening[id];await save(state);await chrome.tabs.update(id,{url:opening.fallback});
    }
  }).catch(console.error);
});
