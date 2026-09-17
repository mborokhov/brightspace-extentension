'use strict';
importScripts('core.js');
const C = DNCore;
let serial = Promise.resolve();
const locked = fn => { const result = serial.then(fn); serial = result.catch(() => {}); return result; };
const read = async () => (await chrome.storage.local.get('state')).state || C.emptyState();
const save = state => chrome.storage.local.set({state});
const dashboardURL = () => chrome.runtime.getURL('dashboard.html');
const trusted = sender => sender.id === chrome.runtime.id && !!sender.url?.startsWith(chrome.runtime.getURL(''));
async function ensureAlarm() { await chrome.alarms.create('maintenance',{periodInMinutes:1}); await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}); }
async function openDashboard() {
  const tabs = await chrome.tabs.query({url:dashboardURL()});
  if (tabs.length) await chrome.tabs.update(tabs[0].id,{active:true});
  else await chrome.tabs.create({url:dashboardURL()});
}
chrome.action.onClicked.addListener(openDashboard);
chrome.runtime.onInstalled.addListener(() => locked(async () => { await ensureAlarm(); const state = await read(); await save(state); await openDashboard(); }));
chrome.runtime.onStartup.addListener(() => locked(async () => {
  await ensureAlarm(); const state = await read();
  if (state.job?.running) { state.job.running = false; state.job.note = 'Browser restarted. Start a fresh sync.'; await save(state); }
}));
async function closeOwned(id) {
  if (!id) return;
  try { const tab = await chrome.tabs.get(id); if (C.pageKind(tab.url)) await chrome.tabs.remove(id); } catch {}
}
async function advance(state, error = '', preserveTab = false) {
  const job = state.job;
  if (!job?.running) return;
  const oldTab = job.tabId;
  if (oldTab) { job.checked++; if (error) job.errors.push(C.clean(error,220)); }
  job.tabId = null;
  if (!job.queue.length || job.checked >= 60) {
    job.running = false; job.finishedAt = Date.now();
    job.note = job.checked >= 60 && job.queue.length ? 'Reached the 60-page limit. Visit missing courses and sync again.' : `Checked ${job.checked} pages. ${job.errors.length ? 'Some pages need attention.' : 'Review coverage below; only discovered, loaded pages were checked.'}`;
    await save(state); if (!preserveTab) await closeOwned(oldTab); return;
  }
  const next = job.queue.shift();
  job.currentURL = next; job.startedPageAt = Date.now();
  // Persist the queue before creating a tab so worker restarts do not lose progress.
  await save(state); if (!preserveTab) await closeOwned(oldTab);
  try { const tab = await chrome.tabs.create({url:next,active:false}); job.tabId = tab.id; await save(state); }
  catch { job.errors.push('Could not open a sync tab.'); job.running = false; await save(state); }
}
function sanitizedSnapshot(snapshot,sender,state) {
  if (!sender.tab || !C.allowedURL(sender.url) || !snapshot || C.canonicalURL(sender.url) !== C.canonicalURL(snapshot.pageURL)) throw new Error('Invalid page capture');
  const pageURL = C.canonicalURL(sender.url), source = C.sourceFor(pageURL);
  const items = (Array.isArray(snapshot.items) ? snapshot.items : []).slice(0,500).flatMap(item => {
    const url = C.canonicalURL(item.url);
    if (!url || C.sourceFor(url) !== source || !C.clean(item.title)) return [];
    return [{source,url,pageURL,title:C.clean(item.title,250),course:C.clean(item.course,160),courseId:C.clean(item.courseId,40),
      status:['submitted','graded','not-submitted'].includes(item.status) ? item.status : 'unknown',...C.parseDue(C.clean(item.dueRaw,500),state.settings.zone)}];
  });
  const links = (Array.isArray(snapshot.links) ? snapshot.links : []).slice(0,150).flatMap(link => {
    const url = C.canonicalURL(link.url);
    return url && C.pageKind(url) && C.sourceFor(url) === source ? [{url,title:C.clean(link.title,160),source}] : [];
  });
  return {source,pageURL,items,links,kind:C.pageKind(pageURL),title:C.clean(snapshot.title,160),login:!!snapshot.login,settled:!!snapshot.settled,message:C.clean(snapshot.message,400)};
}
async function capture(snapshot,sender) {
  const state = await read(), snap = sanitizedSnapshot(snapshot,sender,state), now = Date.now();
  if (state.settings.collecting === false) return {ok:true,paused:true};
  // Ignore submission/edit pages entirely; never collect answer text or feedback.
  if (!snap.kind && !snap.login) return {ok:true};
  const oldItems = state.items;
  state.items = C.mergeItems(oldItems,snap.items,now);
  for (const [id,item] of Object.entries(state.items)) if (oldItems[id]?.remindedFor === item.dueAt) item.remindedFor = oldItems[id].remindedFor;
  state.sources[snap.source] = {lastSeen:now,login:snap.login,message:snap.message,count:snap.items.length};
  if (snap.kind) state.pages[snap.pageURL] = {url:snap.pageURL,title:snap.title,source:snap.source,lastSeen:now,count:snap.items.length,message:snap.message,kind:snap.kind};
  for (const link of snap.links) if (!state.pages[link.url]) state.pages[link.url] = {...link,kind:C.pageKind(link.url),lastSeen:null,count:0,message:'Discovered; not checked yet'};
  const job = state.job;
  if (job?.running && job.tabId === sender.tab.id && snap.settled) {
    for (const link of snap.links) if (!job.seen.includes(link.url) && job.seen.length < 60) { job.seen.push(link.url); job.queue.push(link.url); }
    await advance(state,snap.login ? `Sign in to ${snap.source}, then sync again.` : snap.kind === 'list' && !snap.items.length ? `${snap.title || snap.source}: no readable assignments; check the page manually.` : '',snap.login);
  } else await save(state);
  return {ok:true};
}
async function dispatch(message,sender) {
  if (message?.type === 'CONTENT_SETTINGS' && sender.tab && C.allowedURL(sender.url)) return {settings:(await read()).settings};
  if (message?.type === 'CAPTURE') return capture(message.snapshot,sender);
  if (!trusted(sender)) throw new Error('Only the extension dashboard can perform this action');
  const state = await read();
  switch (message.type) {
    case 'GET_STATE': return {state};
    case 'SYNC': {
      if (state.job?.running) return {ok:true};
      if (state.settings.collecting === false) throw new Error('Page collection is paused. Enable it in Settings before syncing.');
      await ensureAlarm();
      const urls = [...new Set([...C.HOMES,...Object.keys(state.pages).filter(C.pageKind)])].slice(0,60);
      state.job = {running:true,queue:urls,seen:[...urls],checked:0,errors:[],tabId:null,startedAt:Date.now(),note:'Opening discovered course pages in background tabs…'};
      await advance(state); return {ok:true};
    }
    case 'STOP_SYNC': {
      if (state.job?.running) { const id = state.job.tabId; state.job.running = false; state.job.tabId = null; state.job.note = 'Sync stopped. Previously collected assignments are saved.'; await save(state); await closeOwned(id); }
      return {ok:true};
    }
    case 'SET_ITEM': {
      const item = state.items[message.id]; if (!item) throw new Error('Assignment not found');
      if (['done','todo',''].includes(message.completionOverride)) item.completionOverride = message.completionOverride;
      if (typeof message.archived === 'boolean') item.archived = message.archived;
      await save(state); return {ok:true};
    }
    case 'SET_SETTINGS': {
      const settings = message.settings;
      if (!settings || !C.validZone(settings.zone) || ![1,6,12,24,48].includes(Number(settings.leadHours))) throw new Error('Choose a valid IANA time zone and reminder interval');
      state.settings = {zone:settings.zone,leadHours:Number(settings.leadHours),reminders:!!settings.reminders,collecting:settings.collecting ?? state.settings.collecting ?? true};
      if (typeof state.settings.collecting !== 'boolean') throw new Error('Invalid collection setting');
      if (!state.settings.collecting && state.job?.running) { const tab = state.job.tabId; state.job.running = false; state.job.tabId = null; state.job.note = 'Page collection paused.'; await save(state); await closeOwned(tab); }
      for (const item of Object.values(state.items)) Object.assign(item,C.parseDue(item.dueRaw,state.settings.zone));
      await save(state); await ensureAlarm(); return {ok:true};
    }
    case 'CLEAR': {
      const id = state.job?.tabId, empty = C.emptyState(); empty.settings.collecting = false; await save(empty); await closeOwned(id); return {ok:true};
    }
    case 'TEST_NOTIFICATION': {
      await chrome.notifications.create('due-north-test',{type:'basic',iconUrl:'icons/128.png',title:'Due North is ready',message:'Deadline reminders will appear here while your browser is running.'}); return {ok:true};
    }
    default: throw new Error('Unknown request');
  }
}
chrome.runtime.onMessage.addListener((message,sender,reply) => {
  locked(() => dispatch(message,sender)).then(reply,error => reply({error:error.message})); return true;
});
chrome.tabs.onRemoved.addListener(id => locked(async () => { const state = await read(); if (state.job?.running && state.job.tabId === id) await advance(state,'A sync tab was closed before it finished.'); }));
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== 'maintenance') return;
  locked(async () => {
    const state = await read();
    if (state.job?.running && Date.now() - state.job.startedPageAt > 55000) { await advance(state,'Page timed out or needs sign-in. Open the site, sign in, and retry.'); return; }
    for (const item of C.dueReminders(state).slice(0,5)) {
      await chrome.notifications.create(`due:${item.id}`,{type:'basic',iconUrl:'icons/128.png',title:`Due soon · ${item.course}`,message:`${item.title}\n${new Date(item.dueAt).toLocaleString('en-US',{timeZone:state.settings.zone})}`});
      item.remindedFor = item.dueAt;
    }
    await save(state);
  }).catch(console.error);
});
chrome.notifications.onClicked.addListener(id => locked(async () => {
  if (id.startsWith('due:')) { const item = (await read()).items[id.slice(4)]; if (item && C.allowedURL(item.url)) { await chrome.tabs.create({url:item.url}); return; } }
  await openDashboard();
}));
