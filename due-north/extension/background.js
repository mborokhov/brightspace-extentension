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
chrome.runtime.onStartup.addListener(()=>locked(async()=>{await ensureAlarm();await configurePearson();const state=await read();if(state.job?.running){state.job.running=false;state.job.note='Sync paused after browser restart.';}await save(state);}));
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
async function closeOwned(id){if(!id)return;try{const tab=await chrome.tabs.get(id);if(C.pageKind(tab.url))await chrome.tabs.remove(id);}catch{}}
async function advance(state,error='',preserveTab=false){
  const job=state.job;if(!job?.running)return;
  const oldTab=job.tabId;if(oldTab){job.checked++;if(error)job.errors.push(C.clean(error,220));}job.tabId=null;
  job.queue=job.queue.filter(url=>canSync(state,url));
  if(!job.queue.length||job.checked>=60){job.running=false;job.finishedAt=Date.now();job.note=`${job.checked} pages checked${job.errors.length?' · some pages need attention':''}.`;await save(state);if(!preserveTab)await closeOwned(oldTab);return;}
  job.currentURL=job.queue.shift();job.startedPageAt=Date.now();await save(state);if(!preserveTab)await closeOwned(oldTab);
  try{const tab=await chrome.tabs.create({url:job.currentURL,active:false});job.tabId=tab.id;await save(state);}catch{job.running=false;job.note='Could not open a sync tab.';await save(state);}
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
      status:['submitted','graded','not-submitted'].includes(item.status)?item.status:'unknown',...C.parseDue(C.clean(item.dueRaw,500),state.settings.zone)}];
  });
  const links=(Array.isArray(snapshot.links)?snapshot.links:[]).slice(0,150).flatMap(link=>{
    const url=C.canonicalURL(link.url);return url&&C.pageKind(url)&&C.sourceFor(url)===source?[{url,title:C.clean(link.title,160),source,courseId:C.courseId(url)||C.clean(link.courseId,80)||course.id,term:C.parseTerm(link.term||link.title),inactive:!!link.inactive}]:[];
  });
  const kind=C.pageKind(frameURL)||(C.canInspectPearson(frameURL)&&snapshot.kind==='list'&&items.length?'list':'');
  return {source,pageURL,frameURL,items,links,course,kind,title:C.clean(snapshot.title,160),login:!!snapshot.login,settled:!!snapshot.settled,embedded:!!snapshot.embedded};
}
async function capture(snapshot,sender){
  const state=await read(),snap=sanitizedSnapshot(snapshot,sender,state),now=Date.now();
  if(state.settings.collecting===false)return {ok:true,paused:true};
  if(!snap.kind&&!snap.login)return {ok:true};
  const course=registerCourse(state,{...snap.course,source:snap.source,url:snap.pageURL});
  const included=course&&C.isCourseActive(state,course.key);
  const items=included?snap.items.map(i=>({...i,courseKey:course.key,course:course.title,term:course.term})):[];
  state.items=C.mergeItems(state.items,items,now);
  state.sources[snap.source]={lastSeen:now,login:snap.login,count:items.length};
  if(snap.kind)state.pages[snap.pageURL]={url:snap.pageURL,title:snap.title,source:snap.source,courseKey:course?.key,lastSeen:now,count:items.length,kind:snap.kind,message:snap.login?'Sign in required':course&&!included?'Course not selected for this semester':`${items.length} assignments`};
  for(const link of snap.links){
    const same=course&&link.courseId===course.id;
    const linked=registerCourse(state,{id:link.courseId,title:same?course.title:link.title,source:snap.source,term:link.term||(same?course.term:null),url:link.url,inactive:link.inactive});
    state.pages[link.url]={...state.pages[link.url],url:link.url,title:state.pages[link.url]?.title||link.title,source:snap.source,courseKey:linked?.key,kind:C.pageKind(link.url)};
  }
  const job=state.job;
  const usableFrame=sender.frameId===undefined||sender.frameId===0||snap.source==='pearson'&&snap.items.length>0;
  if(job?.running&&job.tabId===sender.tab.id&&snap.settled&&usableFrame&&!(snap.embedded&&!snap.items.length)){
    for(const link of snap.links)if(canSync(state,link.url)&&!job.seen.includes(link.url)&&job.seen.length<60){job.seen.push(link.url);job.queue.push(link.url);}
    await advance(state,snap.login?`Sign in to ${snap.source}, then sync again.`:included&&snap.kind==='list'&&!snap.items.length?`${course.title}: no readable rows.`:'',snap.login);
  }else await save(state);
  return {ok:true,included:!!included};
}
async function rescanOpenTabs(){
  const urls=[...C.HOMES.map(url=>new URL(url).origin+'/*'),'https://gradescope.com/*',...(await pearsonEnabled()?PEARSON_ORIGINS:[])];
  for(const tab of await chrome.tabs.query({url:urls}))try{await chrome.tabs.sendMessage(tab.id,{type:'RESCAN'});}catch{}
}
async function dispatch(message,sender){
  if(message?.type==='CONTENT_SETTINGS'&&sender.tab&&C.allowedURL(sender.url)){const state=await read();return {settings:state.settings,syncOwned:!!state.job?.running&&state.job.tabId===sender.tab.id};}
  if(message?.type==='CAPTURE')return capture(message.snapshot,sender);
  if(!trusted(sender))throw new Error('Only the extension dashboard can perform this action');
  const state=await read();
  switch(message.type){
    case 'GET_STATE':return {state,pearsonEnabled:await pearsonEnabled()};
    case 'ENABLE_PEARSON':if(!await pearsonEnabled())throw new Error('Allow MyLab access first.');await configurePearson();return {ok:true};
    case 'SYNC':{
      if(state.job?.running)return {ok:true};if(state.settings.collecting===false)throw new Error('Enable collection in Settings.');
      await ensureAlarm();const pearson=await pearsonEnabled();
      const urls=[...new Set([...C.HOMES,...(pearson?[PEARSON_HOME]:[]),...Object.keys(state.pages).filter(url=>canSync(state,url)&&(C.sourceFor(url)!=='pearson'||pearson))])].slice(0,60);
      state.job={running:true,queue:urls,seen:[...urls],checked:0,errors:[],tabId:null,startedAt:Date.now(),note:'Syncing current courses…'};await advance(state);return {ok:true};
    }
    case 'STOP_SYNC':if(state.job?.running){const id=state.job.tabId;state.job.running=false;state.job.tabId=null;state.job.note='Sync stopped.';await save(state);await closeOwned(id);}return {ok:true};
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
      else if(message.date!==undefined){item.dueOverride=C.manualDue(C.clean(message.date,10),C.clean(message.time,5),state.settings.zone);item.dueOverrideUpdatedAt=Date.now();}
      await save(state);return {ok:true};
    }
    case 'SET_SETTINGS':{
      const settings=message.settings;
      if(!settings||!C.validZone(settings.zone)||![1,6,12,24,48].includes(Number(settings.leadHours)))throw new Error('Choose a valid time zone and reminder interval.');
      state.settings={zone:settings.zone,leadHours:Number(settings.leadHours),reminders:!!settings.reminders,collecting:settings.collecting??state.settings.collecting};
      if(typeof state.settings.collecting!=='boolean')throw new Error('Invalid collection setting');
      if(!state.settings.collecting&&state.job?.running){const id=state.job.tabId;state.job.running=false;state.job.tabId=null;await save(state);await closeOwned(id);}
      for(const item of Object.values(state.items))Object.assign(item,C.parseDue(item.dueRaw,state.settings.zone));
      await save(C.migrateState(state));await ensureAlarm();if(state.settings.collecting)rescanOpenTabs().catch(()=>{});return {ok:true};
    }
    case 'CLEAR':{const id=state.job?.tabId,empty=C.emptyState();empty.settings.collecting=false;await save(empty);await closeOwned(id);return {ok:true};}
    case 'TEST_NOTIFICATION':await chrome.notifications.create('due-north-test',{type:'basic',iconUrl:'icons/128.png',title:'Due North',message:'Deadline reminders are ready.'});return {ok:true};
    default:throw new Error('Unknown request');
  }
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{locked(()=>dispatch(message,sender)).then(reply,error=>reply({error:error.message}));return true;});
chrome.tabs.onRemoved.addListener(id=>locked(async()=>{const state=await read();if(state.job?.running&&state.job.tabId===id)await advance(state,'A sync tab was closed.');}));
chrome.alarms.onAlarm.addListener(alarm=>{
  if(alarm.name!=='maintenance')return;
  locked(async()=>{
    const state=await read();if(state.job?.running&&Date.now()-state.job.startedPageAt>55000){await advance(state,'Page timed out or needs sign-in. Open the site and retry.');return;}
    for(const item of C.dueReminders(state).slice(0,5)){
      await chrome.notifications.create(`due:${item.id}`,{type:'basic',iconUrl:'icons/128.png',title:`Due soon · ${item.course}`,message:`${item.title}\n${new Date(item.dueAt).toLocaleString('en-US',{timeZone:state.settings.zone})}`});state.items[item.id].remindedFor=item.dueAt;
    }
    await save(state);
  }).catch(console.error);
});
chrome.notifications.onClicked.addListener(id=>locked(async()=>{const item=(await read()).items[id.slice(4)];if(id.startsWith('due:')&&item&&C.allowedURL(item.url)){await chrome.tabs.create({url:item.url});return;}await openDashboard();}));
