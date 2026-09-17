'use strict';
const C = DNCore, $ = id => document.getElementById(id);
const extension = location.protocol === 'chrome-extension:' && !!globalThis.chrome?.runtime?.id;
let state = C.emptyState(), view = 'upcoming', toastTimer;
function demoState() {
  const s = C.emptyState(), now = Date.now();
  const rows = [
    ['Problem Set 04: Applications of Derivatives','MA 16100','brightspace',21,'not-submitted'],
    ['Lab 03: Loops & Conditionals','CS 18000','gradescope',43,'not-submitted'],
    ['Reading Response: Design in Context','ENGL 10600','brightspace',68,'unknown'],
    ['Homework 05: Forces & Motion','PHYS 17200','gradescope',96,'not-submitted'],
    ['Quiz 02: Chemical Reactions','CHM 11500','brightspace',140,'not-submitted'],
    ['Week 03 Reflection','ENGL 10600','brightspace',-20,'not-submitted'],
    ['Project proposal','CS 18000','gradescope',null,'unknown'],
    ['Homework 03: Vectors','PHYS 17200','gradescope',-48,'graded']
  ];
  rows.forEach(([title,course,source,hours,status],index) => {
    const dueAt = hours === null ? null : new Date(now + hours*3600000).toISOString();
    const url = source === 'brightspace' ? `https://purdue.brightspace.com/d2l/lms/dropbox/user/folders_submit_files.d2l?ou=100&db=${index}` : `https://www.gradescope.com/courses/100/assignments/${index}`;
    s.items[`sample-${index}`] = {id:`sample-${index}`,title,course,source,status,dueAt,dueDate:null,dueRaw:dueAt || 'See syllabus',dateNote:hours === null ? 'Unrecognized deadline — check source' : '',lastSeen:now-120000,url,courseId:'100'};
  });
  s.sources = {brightspace:{lastSeen:now-120000},gradescope:{lastSeen:now-120000}};
  return s;
}
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => {$('toast').hidden=true;},5500); }
async function send(message) {
  if (!extension) {
    if (message.type === 'SET_ITEM') Object.assign(state.items[message.id],message);
    else if (message.type === 'SET_SETTINGS') state.settings = message.settings;
    else if (message.type === 'CLEAR') { state = C.emptyState(); state.settings.collecting = false; }
    else if (message.type !== 'GET_STATE') toast('Preview only. Install the extension to sync your courses and enable notifications.');
    return {state};
  }
  const response = await chrome.runtime.sendMessage(message);
  if (response?.error) throw new Error(response.error);
  return response;
}
async function refresh() { try { if (extension) state = (await send({type:'GET_STATE'})).state; render(); } catch(error) { $('status').textContent = `Could not load your workspace: ${error.message}. Reload the extension, then this page.`; $('status').className='status-line error'; } }
function relative(ms) { const min = Math.max(0,Math.round((Date.now()-ms)/60000)); return min < 1 ? 'just now' : min < 60 ? `${min}m ago` : min < 1440 ? `${Math.floor(min/60)}h ago` : `${Math.floor(min/1440)}d ago`; }
function needsReview(item) { return !item.dueAt || /inferred|ambiguous|invalid|unrecognized/i.test(item.dateNote) || Date.now()-item.lastSeen > 7*86400000; }
function dateLabel(item) {
  if (item.dueAt) return new Intl.DateTimeFormat('en-US',{timeZone:state.settings.zone,month:'short',day:'numeric'}).format(new Date(item.dueAt));
  if (item.dueDate) return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric'}).format(new Date(`${item.dueDate}T12:00:00Z`));
  return 'Check source';
}
function timeLabel(item) { return item.dueAt ? new Intl.DateTimeFormat('en-US',{timeZone:state.settings.zone,hour:'numeric',minute:'2-digit'}).format(new Date(item.dueAt)) : item.dueDate ? 'Time not listed' : 'Deadline not parsed'; }
function element(tag,className,value) { const el = document.createElement(tag); if (className) el.className=className; if (value !== undefined) el.textContent=value; return el; }
function sourceLabel(source) { return source === 'brightspace' ? 'Brightspace' : 'Gradescope'; }
function sortTime(item) { return item.dueAt ? Date.parse(item.dueAt) : item.dueDate ? Date.parse(item.dueDate) : Infinity; }
function render() {
  const now = Date.now(), all = Object.values(state.items), active = all.filter(i => !i.archived && !C.isDone(i));
  const soon = active.filter(i => i.dueAt && Date.parse(i.dueAt)>=now && Date.parse(i.dueAt)<now+7*86400000);
  $('today-label').textContent = new Intl.DateTimeFormat('en-US',{timeZone:state.settings.zone,weekday:'long',month:'long',day:'numeric'}).format(now).toUpperCase();
  $('zone-label').textContent = state.settings.zone.replace('America/','').replaceAll('_',' ');
  $('nav-count').textContent=active.length; $('review-count').textContent=active.filter(needsReview).length;
  $('week-count').textContent=soon.length; $('overdue-count').textContent=active.filter(i=>i.dueAt && Date.parse(i.dueAt)<now).length;
  const next = [...soon].sort((a,b)=>sortTime(a)-sortTime(b))[0] || active.filter(i=>i.dueAt && Date.parse(i.dueAt)>now).sort((a,b)=>sortTime(a)-sortTime(b))[0];
  $('next-title').textContent=next?.title || (all.length ? 'A little breathing room.' : 'Make room for what’s next.');
  $('next-course').textContent=next ? `${next.course} · ${sourceLabel(next.source)}` : all.length ? 'No upcoming parsed deadlines in your saved list.' : 'Connect your courses to get started.';
  $('next-due').textContent=next ? `${dateLabel(next)} · ${timeLabel(next)}` : 'Keep your course pages in the loop.';
  $('next-link').hidden=!next || !extension; if(next) $('next-link').href=next.url;
  [...document.querySelectorAll('.mini-bars i')].forEach((bar,index)=>{const n=soon.filter(i=>Math.floor((Date.parse(i.dueAt)-now)/86400000)===index).length;bar.style.height=`${4+Math.min(n,5)*4}px`;bar.classList.toggle('filled',n>0);});
  for(const source of ['brightspace','gradescope']){const data=state.sources[source];$(source+'-status').textContent=data?.login?'Sign in to continue':data?.lastSeen?`Last page read ${relative(data.lastSeen)}`:'Waiting for your first visit';}
  const job=state.job;
  $('sync').textContent=job?.running?'■ Stop sync':'↻ Sync courses';
  $('status').className='status-line'+(job?.running?' busy':'');
  $('status').textContent=state.settings.collecting===false?'Page collection is paused. Enable it in Settings when you are ready.':job?.running?`Checking discovered course pages · ${job.checked} checked · ${job.queue.length+1} remaining. Sign-in tabs may need your attention.`:job?.note || (all.length ? 'Collected from loaded course pages. Visit each Assignments and Quizzes list to improve coverage.' : 'Start by opening your course assignment lists. Then use Sync courses to refresh discovered pages.');
  const courseSelect=$('course-filter'), selected=courseSelect.value, courses=[...new Set(all.map(i=>i.course))].sort();
  courseSelect.replaceChildren(new Option('All courses',''),...courses.map(c=>new Option(c,c))); courseSelect.value=courses.includes(selected)?selected:'';
  const search=$('search').value.trim().toLowerCase();
  const filtered=all.filter(item=>{
    if(view==='archived') { if(!item.archived)return false; }
    else if(item.archived)return false;
    else if(view==='done') { if(!C.isDone(item))return false; }
    else { if(C.isDone(item))return false; if(view==='review'&&!needsReview(item))return false; if(view==='week'&&!(item.dueAt&&sortTime(item)>=now&&sortTime(item)<now+7*86400000))return false; }
    return (!courseSelect.value||item.course===courseSelect.value)&&(!search||`${item.title} ${item.course} ${item.source}`.toLowerCase().includes(search));
  }).sort((a,b)=>sortTime(a)-sortTime(b)||a.title.localeCompare(b.title));
  const titles={upcoming:'The assignment list',week:'Your next 7 days',review:'Worth a closer look',done:'One thing at a time. Done.',archived:'Out of the way'};
  $('list-title').firstChild.textContent=titles[view]+' ';$('list-count').textContent=filtered.length;
  const subtitles={upcoming:'A clear view of what’s ahead.',week:'Upcoming deadlines, in order.',review:'Missing times, inferred dates, or pages not read for 7 days.',done:'Source submissions and your personal completion marks.',archived:'Archived locally. Restore an item whenever you need it.'};
  $('list-subtitle').textContent=subtitles[view];$('item-summary').textContent=`${all.length} assignments collected`;
  const body=$('assignment-rows');body.replaceChildren();
  for(const item of filtered) {
    const done=C.isDone(item), late=!done&&item.dueAt&&sortTime(item)<now, review=needsReview(item), row=element('tr',done?'completed':'');
    const checkCell=element('td'), check=element('input','completion');check.type='checkbox';check.checked=done;check.setAttribute('aria-label',`Mark ${item.title} ${done?'incomplete':'complete'}`);
    check.addEventListener('change',()=>act({type:'SET_ITEM',id:item.id,completionOverride:check.checked?'done':'todo'}));checkCell.append(check);row.append(checkCell);
    const titleCell=element('td'), link=element(extension?'a':'span','assignment-link',item.title);
    if(extension){link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';link.append(element('span','external','↗'));}titleCell.append(link);
    const note=item.changedAt&&now-item.changedAt<7*86400000?'Deadline changed · check source':now-item.lastSeen>7*86400000?`Last seen ${relative(item.lastSeen)} · refresh this course`:item.completionOverride?'Personal completion mark':item.dateNote&&/inferred/i.test(item.dateNote)?'Year inferred · verify date':'';
    if(note)titleCell.append(element('span',`item-detail${item.changedAt?' changed':''}`,note));row.append(titleCell);
    const courseCell=element('td');courseCell.append(element('span','course-tag',item.course),element('span','source-name',sourceLabel(item.source)));row.append(courseCell);
    const dateCell=element('td'),date=element('div','deadline'+(late?' overdue':''),dateLabel(item));date.title=`Original: ${item.dueRaw||'No date'}\n${item.dateNote||''}`;date.append(element('small','',timeLabel(item)));dateCell.append(date);row.append(dateCell);
    let pill=done?['done',item.completionOverride?'Done':item.status==='graded'?'Graded':'Submitted']:review?['review','Review date']:late?['late','Past due']:sortTime(item)-now<2*86400000?['soon','Due soon']:['','Upcoming'];
    const statusCell=element('td');statusCell.append(element('span',`pill ${pill[0]}`,pill[1]));row.append(statusCell);
    const actionCell=element('td'),archive=element('button','row-action',item.archived?'Restore':'Archive');archive.setAttribute('aria-label',`${item.archived?'Restore':'Archive'} ${item.title}`);archive.addEventListener('click',()=>act({type:'SET_ITEM',id:item.id,archived:!item.archived}));actionCell.append(archive);
    if(item.completionOverride){const reset=element('button','row-action','Use source');reset.setAttribute('aria-label',`Use source completion status for ${item.title}`);reset.addEventListener('click',()=>act({type:'SET_ITEM',id:item.id,completionOverride:''}));actionCell.append(reset);}row.append(actionCell);body.append(row);
  }
  $('empty-state').hidden=filtered.length>0;
  $('empty-title').textContent=!all.length?'Let’s bring your courses together.':search||courseSelect.value?'Nothing matches just yet.':view==='done'?'Your wins will live here.':view==='review'?'Nothing needs review right now.':view==='archived'?'Nothing archived.':'A little breathing room.';
  $('empty-description').textContent=!all.length?'Sign in to each site, then open your courses’ assignment lists. Due North collects the rows you can see.':search||courseSelect.value?'Try another search or choose All courses.':'This view is clear. Visit your course pages regularly to keep your list current.';
  $('setup-buttons').hidden=all.length>0;
  if($('coverage-dialog').open)renderCoverage();
}
async function act(message){try{await send(message);await refresh();}catch(error){toast(error.message);}}
function renderCoverage(){
  $('sync-errors').replaceChildren(...(state.job?.errors||[]).map(e=>element('p','sync-error',e)));
  const pages=Object.values(state.pages).sort((a,b)=>(b.lastSeen||0)-(a.lastSeen||0));
  $('coverage-pages').replaceChildren(...pages.map(page=>{const row=element('div','coverage-row'),a=element('a','',page.title||page.url);a.href=page.url;a.target='_blank';a.rel='noopener noreferrer';row.append(a,element('p','',page.message),element('small','',`${sourceLabel(page.source)} · ${page.lastSeen?relative(page.lastSeen):'Not checked'} · ${page.count||0} readable assignments`));return row;}));
  if(!pages.length)$('coverage-pages').append(element('p','muted',extension?'No pages discovered yet. Open Brightspace and Gradescope, then visit your courses.':'Coverage appears here after you install the extension and visit your course pages.'));
}
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.view;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b===button));render();}));
$('search').addEventListener('input',render);$('course-filter').addEventListener('change',render);
$('sync').addEventListener('click',()=>act({type:state.job?.running?'STOP_SYNC':'SYNC'}));
for(const source of ['brightspace','gradescope'])$(source+'-source').addEventListener('click',()=>window.open(source==='brightspace'?C.HOMES[0]:C.HOMES[1],'_blank','noopener,noreferrer'));
document.querySelectorAll('.close-dialog').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$('settings-open').addEventListener('click',()=>{$('zone-input').value=state.settings.zone;$('collecting-input').checked=state.settings.collecting!==false;$('reminders-input').checked=state.settings.reminders;$('lead-input').value=state.settings.leadHours;$('settings-dialog').showModal();});
$('coverage-open').addEventListener('click',()=>{renderCoverage();$('coverage-dialog').showModal();});
$('settings-form').addEventListener('submit',async e=>{e.preventDefault();const settings={collecting:$('collecting-input').checked,zone:$('zone-input').value.trim(),reminders:$('reminders-input').checked,leadHours:Number($('lead-input').value)};if(!C.validZone(settings.zone)){toast('Use a valid IANA zone, such as America/New_York.');return;}try{await send({type:'SET_SETTINGS',settings});$('settings-dialog').close();toast('Settings saved.');await refresh();}catch(error){toast(error.message);}});
$('test-notification').addEventListener('click',()=>act({type:'TEST_NOTIFICATION'}));
$('clear-data').addEventListener('click',()=>$('clear-dialog').showModal());
$('confirm-clear').addEventListener('click',async()=>{try{await send({type:'CLEAR'});$('clear-dialog').close();$('settings-dialog').close();await refresh();toast('Local workspace cleared.');}catch(error){toast(error.message);}});
$('export').addEventListener('click',()=>{const items=Object.values(state.items);if(!items.some(i=>!i.archived&&!C.isDone(i)&&(i.dueAt||i.dueDate))){toast('There are no open assignments with a readable date to export.');return;}const blob=new Blob([C.calendar(items)],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),a=element('a');a.href=url;a.download=extension?'due-north-deadlines.ics':'due-north-SAMPLE-deadlines.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Calendar snapshot exported. It will not update automatically.');});
if(!extension){state=demoState();$('demo-banner').hidden=false;}
if(extension)chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.state){state=changes.state.newValue||C.emptyState();render();}});
refresh();setInterval(()=>render(),60000);
