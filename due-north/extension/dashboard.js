'use strict';
const C=DNCore,$=id=>document.getElementById(id),extension=location.protocol==='chrome-extension:'&&!!globalThis.chrome?.runtime?.id;
let state=C.emptyState(),view='overview',selectedDay='',week=C.weekStart(Date.now(),state.settings.zone),month=C.dateKey(Date.now(),state.settings.zone).slice(0,7),editingId='',pearsonReady=false,toastTimer;
const sourceNames={brightspace:'Brightspace',gradescope:'Gradescope',pearson:'MyLab Math'};
const el=(tag,cls,value)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(value!==undefined)node.textContent=value;return node;};
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('toast').hidden=true;},5500);}
function demoState(){
  const s=C.emptyState(),today=C.dateKey(Date.now(),s.settings.zone),term=s.activeTerm;
  const courses=[['brightspace','101','MA 16100'],['gradescope','102','CHM 11500'],['pearson','103','MA 16200']];
  for(const [source,id,title]of courses){const key=C.courseKey(source,id);s.courses[key]={key,source,id,title,term,enabled:true,url:source==='brightspace'?`https://purdue.brightspace.com/d2l/home/${id}`:source==='gradescope'?`https://www.gradescope.com/courses/${id}`:`https://mylabmastering.pearson.com/courses/${id}/menu/homework`};}
  const examples=[['HW3',0,0,'not-submitted'],['Lab Report 4',1,1,'not-submitted'],['Written Homework 11',0,2,'not-submitted'],['Section 3.4 Homework',2,0,'not-submitted'],['Quiz 2',0,-1,'submitted'],['Lab preparation',1,3,'not-submitted'],['Problem set 5',2,4,'not-submitted'],['Project proposal',1,null,'not-submitted']];
  examples.forEach(([title,index,offset,status],i)=>{const [source,courseId,course]=courses[index],courseKey=C.courseKey(source,courseId),date=offset===null?null:C.shiftDay(today,offset),dueAt=date?C.manualDue(date,'23:59',s.settings.zone).dueAt:null;const url=source==='gradescope'?`https://www.gradescope.com/courses/${courseId}/assignments/${i}`:s.courses[courseKey].url;s.items[`sample-${i}`]={id:`sample-${i}`,title,course,courseId,courseKey,term,source,status,url,dueAt,dueDate:null,dueRaw:dueAt||'',dateNote:'',lastSeen:Date.now()};});
  s.courses['brightspace:old']={key:'brightspace:old',source:'brightspace',id:'old',title:'Previous course',term:`Fall ${new Date().getFullYear()-1}`,enabled:false};
  for(const source of Object.keys(sourceNames))s.sources[source]={lastSeen:Date.now()};return s;
}
async function send(message){
  if(!extension){
    if(message.type==='SET_ITEM'){const item=state.items[message.id];if(message.completionOverride!==undefined)item.completionOverride=message.completionOverride;if(message.resetDue)item.dueOverride=null;else if(message.date!==undefined)item.dueOverride=C.manualDue(message.date,message.time,state.settings.zone);}
    if(message.type==='SET_COURSE'){const c=state.courses[message.key];c.enabled=message.enabled;c.term=state.activeTerm;c.userSelected=message.enabled;}
    if(message.type==='SET_SETTINGS')state.settings=message.settings;
    if(message.type==='CLEAR'){state=C.emptyState();state.settings.collecting=false;}
    if(['SYNC','ENABLE_PEARSON','TEST_NOTIFICATION'].includes(message.type))toast('Install the extension to use this feature.');
    return {state,pearsonEnabled:pearsonReady};
  }
  const response=await chrome.runtime.sendMessage(message);if(response?.error)throw new Error(response.error);return response;
}
async function refresh(){try{if(extension){const data=await send({type:'GET_STATE'});state=data.state;pearsonReady=data.pearsonEnabled;}render();}catch(error){$('status').textContent=error.message;}}
async function act(message){try{await send(message);await refresh();}catch(error){toast(error.message);}}
function dayOf(item){return item.dueAt?C.dateKey(item.dueAt,state.settings.zone):item.dueDate||'';}
function dayLabel(day,options={month:'short',day:'numeric'}){return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',...options}).format(new Date(`${day}T12:00:00Z`));}
function dateLabel(item){const day=dayOf(item);return day?dayLabel(day):'Set date';}
function timeLabel(item){return item.dueAt?new Intl.DateTimeFormat('en-US',{timeZone:state.settings.zone,hour:'numeric',minute:'2-digit'}).format(new Date(item.dueAt)):item.dueDate?'All day':'';}
function relative(ms){if(!ms)return 'Not synced';const min=Math.max(0,Math.round((Date.now()-ms)/60000));return min<1?'Just synced':min<60?`${min}m ago`:min<1440?`${Math.floor(min/60)}h ago`:`${Math.floor(min/1440)}d ago`;}
function baseItems(){const search=$('search').value.toLowerCase().trim(),course=$('course-filter').value;return C.activeItems(state).filter(i=>(!course||i.courseKey===course)&&(!search||`${i.title} ${i.course} ${sourceNames[i.source]}`.toLowerCase().includes(search)));}
function statusMatches(item){const filter=$('status-filter').value;return filter==='all'||(filter==='done'?C.isDone(item):!C.isDone(item));}
function renderWeek(items){
  const data=C.weekCounts(items,week,state.settings.zone),today=C.dateKey(Date.now(),state.settings.zone),max=Math.max(4,Math.ceil(Math.max(...data.map(d=>d.count))/4)*4);
  $('week-heading').textContent=week===C.weekStart(Date.now(),state.settings.zone)?'This week':'Weekly workload';
  $('week-range').textContent=`${dayLabel(week)} – ${dayLabel(C.shiftDay(week,6))}`;$('week-total').textContent=`${data.reduce((n,d)=>n+d.count,0)} to do`;
  $('chart-axis').replaceChildren(...[max,Math.round(max*.75),Math.round(max*.5),Math.round(max*.25),0].map(n=>el('span','',n)));
  $('week-chart').replaceChildren(...data.map(({day,count})=>{const b=el('button',`day-bar${day===today?' today':''}${day===selectedDay?' selected':''}`);b.setAttribute('aria-label',`${dayLabel(day,{weekday:'long',month:'long',day:'numeric'})}: ${count} assignments due`);b.setAttribute('aria-pressed',String(day===selectedDay));const track=el('span','bar-track'),fill=el('span','bar-fill');fill.style.height=`${count/max*100}%`;const countLabel=el('span','bar-count',count);countLabel.style.bottom=`calc(${count/max*100}% + 5px)`;track.append(countLabel,fill);b.append(track,el('span','bar-day',dayLabel(day,{weekday:'short'})),el('span','bar-date',dayLabel(day)));b.addEventListener('click',()=>{selectedDay=selectedDay===day?'':day;render();});return b;}));
}
function renderCalendar(items){
  $('month-title').textContent=dayLabel(month+'-01',{month:'long',year:'numeric'});
  const first=month+'-01',dow=(new Date(first+'T12:00:00Z').getUTCDay()+6)%7,start=C.shiftDay(first,-dow),daysInMonth=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate(),weeks=Math.ceil((dow+daysInMonth)/7),today=C.dateKey(Date.now(),state.settings.zone);
  const grid=$('calendar-grid');grid.replaceChildren();const headings=el('div','calendar-week');headings.setAttribute('role','row');for(const day of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']){const h=el('span','weekday',day);h.setAttribute('role','columnheader');headings.append(h);}grid.append(headings);
  for(let w=0;w<weeks;w++){const row=el('div','calendar-week');row.setAttribute('role','row');for(let d=0;d<7;d++){
    const day=C.shiftDay(start,w*7+d),cell=el('div',`calendar-day${day.slice(0,7)!==month?' outside':''}${day===today?' today':''}${day===selectedDay?' selected':''}`);cell.setAttribute('role','gridcell');cell.setAttribute('aria-label',dayLabel(day,{weekday:'long',month:'long',day:'numeric'}));
    const number=el('button','day-number',Number(day.slice(-2)));number.setAttribute('aria-label',`Show assignments for ${day}`);number.addEventListener('click',()=>{selectedDay=selectedDay===day?'':day;render();});cell.append(number);
    const list=items.filter(i=>statusMatches(i)&&dayOf(i)===day).sort((a,b)=>String(a.dueAt||'').localeCompare(b.dueAt||''));
    for(const item of list.slice(0,3)){const event=el('button',`calendar-event ${item.source}${C.isDone(item)?' completed':''}`,item.title);event.title=`${item.title} · ${timeLabel(item)}`;event.setAttribute('aria-label',`Edit deadline for ${item.title}`);event.addEventListener('click',()=>openEditor(item.id));cell.append(event);}
    if(list.length>3){const more=el('button','calendar-more',`+${list.length-3} more`);more.addEventListener('click',()=>{selectedDay=day;render();});cell.append(more);}row.append(cell);
  }grid.append(row);}
}
function renderList(items){
  const now=Date.now(),filtered=items.filter(i=>statusMatches(i)&&(!selectedDay||dayOf(i)===selectedDay)&&(view!=='calendar'||selectedDay||dayOf(i).slice(0,7)===month)).sort((a,b)=>(a.dueAt?Date.parse(a.dueAt):a.dueDate?Date.parse(a.dueDate):Infinity)-(b.dueAt?Date.parse(b.dueAt):b.dueDate?Date.parse(b.dueDate):Infinity)||a.title.localeCompare(b.title));
  $('list-count').textContent=filtered.length;$('date-filter').hidden=!selectedDay;$('date-filter').textContent=selectedDay?`${dayLabel(selectedDay)} ×`:'';
  const body=$('assignment-rows');body.replaceChildren();
  for(const item of filtered){
    const done=C.isDone(item),past=!done&&item.dueAt&&Date.parse(item.dueAt)<now,row=el('tr',done?'completed':'');
    const checkCell=el('td'),check=el('input','completion');check.type='checkbox';check.checked=done;check.setAttribute('aria-label',`Mark ${item.title} ${done?'incomplete':'complete'}`);check.addEventListener('change',()=>act({type:'SET_ITEM',id:item.id,completionOverride:check.checked?'done':'todo'}));checkCell.append(check);row.append(checkCell);
    const nameCell=el('td'),link=el(extension?'a':'span','assignment-link',item.title);if(extension){link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';}nameCell.append(link);
    if(item.changedAt&&now-item.changedAt<7*86400000)nameCell.append(el('span','item-detail',item.dueOverride?'Source changed · your date kept':'Source deadline changed'));row.append(nameCell);
    const course=el('td');course.append(el('span','course-name',item.course),el('span','source-name',sourceNames[item.source]));row.append(course);
    const dateCell=el('td'),date=el('div',`deadline${past?' past':''}`,dateLabel(item));date.title=`${item.dueRaw||'No date provided'}${item.dueOverride?' · Custom deadline':''}`;date.append(el('small','',`${timeLabel(item)}${item.dueOverride?' · Edited':''}`));dateCell.append(date);row.append(dateCell);
    const statusCell=el('td');let status=done?['done','Completed']:past?['past','Past due']:item.dueAt&&Date.parse(item.dueAt)-now<2*86400000?['soon','Due soon']:['','To do'];statusCell.append(el('span',`pill ${status[0]}`,status[1]));if(item.completionOverride){const reset=el('button','reset-status','Use source status');reset.addEventListener('click',()=>act({type:'SET_ITEM',id:item.id,completionOverride:''}));statusCell.append(reset);}row.append(statusCell);
    const editCell=el('td'),edit=el('button','edit-button','Edit date');edit.setAttribute('aria-label',`Edit deadline for ${item.title}`);edit.addEventListener('click',()=>openEditor(item.id));editCell.append(edit);row.append(editCell);body.append(row);
  }
  const courseCount=Object.values(state.courses).filter(c=>C.isCourseActive(state,c.key)).length;
  $('empty-state').hidden=filtered.length>0;$('empty-courses').hidden=courseCount>0;
  $('empty-title').textContent=!courseCount?'Choose this semester’s courses':items.length?'Nothing here':'No assignments yet';
  $('empty-description').textContent=!courseCount?'Open your course lists, then select your current classes.':items.length?'Try another date or filter.':'Visit Assignments, Quizzes, or Homework and Tests, then sync.';
}
function render(){
  state=C.migrateState(state);$('semester').textContent=state.activeTerm;$('today-label').textContent=new Intl.DateTimeFormat('en-US',{timeZone:state.settings.zone,weekday:'long',month:'long',day:'numeric'}).format(Date.now());
  $('page-title').textContent=view==='overview'?'Overview':'Calendar';$('week-panel').hidden=view!=='overview';$('calendar-panel').hidden=view!=='calendar';
  const select=$('course-filter'),selected=select.value,courses=Object.values(state.courses).filter(c=>C.isCourseActive(state,c.key)).sort((a,b)=>a.title.localeCompare(b.title));select.replaceChildren(new Option('All courses',''),...courses.map(c=>new Option(c.title,c.key)));select.value=courses.some(c=>c.key===selected)?selected:'';
  const job=state.job;$('sync').textContent=job?.running?'■ Stop':'↻ Sync';$('status').textContent=!state.settings.collecting?'Collection paused':job?.running?`${job.checked} pages checked…`:job?.note||'';
  for(const source of Object.keys(sourceNames))$(source+'-source').title=state.sources[source]?.login?'Sign in required':relative(state.sources[source]?.lastSeen);
  $('pearson-source').title=pearsonReady?relative(state.sources.pearson?.lastSeen):'Enable MyLab Math';
  const items=baseItems();renderWeek(items);if(view==='calendar')renderCalendar(items);renderList(items);
  if($('courses-dialog').open)renderCourses();if($('coverage-dialog').open)renderCoverage();
}
function openEditor(id){const original=state.items[id],item=C.effective(original);editingId=id;$('edit-title').textContent=item.title;$('edit-source').textContent=`Source: ${original.dueAt||original.dueDate?dateLabel(original)+' '+timeLabel(original):original.dueRaw||'No deadline'}`;$('edit-date').value=dayOf(item);$('edit-time').value=item.dueAt?new Intl.DateTimeFormat('en-GB',{timeZone:state.settings.zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(item.dueAt)):'';$('edit-zone').textContent=state.settings.zone;$('edit-error').textContent='';$('reset-due').hidden=!item.dueOverride;$('edit-dialog').showModal();}
function renderCourses(){
  $('courses-title').textContent=state.activeTerm+' courses';const all=Object.values(state.courses),visible=all.filter(c=>!c.inactive&&(!c.term||c.term===state.activeTerm)).sort((a,b)=>a.title.localeCompare(b.title));
  $('course-options').replaceChildren(...visible.map(course=>{const label=el('label','course-option'),check=el('input');check.type='checkbox';check.checked=C.isCourseActive(state,course.key);check.setAttribute('aria-label',`Include ${course.title}`);check.addEventListener('change',()=>act({type:'SET_COURSE',key:course.key,enabled:check.checked}));const info=el('span','',course.title);info.append(el('small','',`${sourceNames[course.source]} · ${course.term||'Confirm current semester'}`));label.append(check,info);return label;}));
  if(!visible.length)$('course-options').append(el('p','muted','Open your current course pages in each site, then return here.'));
  $('course-footer').textContent=all.length-visible.length?`${all.length-visible.length} previous-semester courses excluded.`:'';
}
function openCourses(){renderCourses();$('courses-dialog').showModal();}
function renderCoverage(){
  $('sync-errors').replaceChildren(...(state.job?.errors||[]).map(e=>el('p','sync-error',e)));
  const pages=Object.values(state.pages).filter(p=>p.kind==='home'||C.isCourseActive(state,p.courseKey));
  $('coverage-pages').replaceChildren(...pages.map(p=>{const row=el('div','coverage-row'),a=el('a','',p.title||p.url);a.href=p.url;a.target='_blank';a.rel='noopener noreferrer';row.append(a,el('small','',`${relative(p.lastSeen)} · ${p.message||'Not checked'}`));return row;}));
  if(!pages.length)$('coverage-pages').append(el('p','muted','No selected course pages yet.'));
}
async function openSource(source){
  if(source==='pearson'&&!pearsonReady){
    if(!extension){toast('Install the extension to enable MyLab Math.');return;}
    try{const granted=await chrome.permissions.request({origins:C.PEARSON_HOSTS.map(host=>`https://${host}/*`)});if(!granted){toast('MyLab access was not enabled.');return;}await send({type:'ENABLE_PEARSON'});pearsonReady=true;toast('MyLab enabled. Reload its assignment page.');}catch(error){toast(error.message);return;}
  }
  const url=source==='brightspace'?C.HOMES[0]:source==='gradescope'?C.HOMES[1]:Object.values(state.pages).find(p=>p.source==='pearson'&&p.kind==='list'&&C.isCourseActive(state,p.courseKey))?.url||'https://mylabmastering.pearson.com/courses';window.open(url,'_blank','noopener,noreferrer');
}
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.view;selectedDay='';document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b===button);if(b===button)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});render();}));
for(const id of ['search','course-filter','status-filter'])$(id).addEventListener(id==='search'?'input':'change',render);
$('date-filter').addEventListener('click',()=>{selectedDay='';render();});
$('week-prev').addEventListener('click',()=>{week=C.shiftDay(week,-7);selectedDay='';render();});$('week-next').addEventListener('click',()=>{week=C.shiftDay(week,7);selectedDay='';render();});$('week-today').addEventListener('click',()=>{week=C.weekStart(Date.now(),state.settings.zone);selectedDay='';render();});
function moveMonth(delta){const date=new Date(month+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+delta);month=date.toISOString().slice(0,7);selectedDay='';render();}
$('month-prev').addEventListener('click',()=>moveMonth(-1));$('month-next').addEventListener('click',()=>moveMonth(1));$('month-today').addEventListener('click',()=>{month=C.dateKey(Date.now(),state.settings.zone).slice(0,7);selectedDay='';render();});
$('sync').addEventListener('click',()=>act({type:state.job?.running?'STOP_SYNC':'SYNC'}));
$('courses-open').addEventListener('click',openCourses);$('empty-courses').addEventListener('click',openCourses);$('courses-sync').addEventListener('click',()=>{$('courses-dialog').close();act({type:'SYNC'});});
for(const source of Object.keys(sourceNames))$(source+'-source').addEventListener('click',()=>openSource(source));
document.querySelectorAll('.close-dialog').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
$('coverage-open').addEventListener('click',()=>{renderCoverage();$('coverage-dialog').showModal();});
$('edit-form').addEventListener('submit',async event=>{event.preventDefault();try{await send({type:'SET_ITEM',id:editingId,date:$('edit-date').value,time:$('edit-time').value});$('edit-dialog').close();await refresh();toast('Deadline saved.');}catch(error){$('edit-error').textContent=error.message;}});
$('reset-due').addEventListener('click',async()=>{try{await send({type:'SET_ITEM',id:editingId,resetDue:true});$('edit-dialog').close();await refresh();}catch(error){$('edit-error').textContent=error.message;}});
$('settings-open').addEventListener('click',()=>{$('zone-input').value=state.settings.zone;$('collecting-input').checked=state.settings.collecting;$('reminders-input').checked=state.settings.reminders;$('lead-input').value=state.settings.leadHours;$('settings-dialog').showModal();});
$('settings-form').addEventListener('submit',async event=>{event.preventDefault();const settings={zone:$('zone-input').value.trim(),collecting:$('collecting-input').checked,reminders:$('reminders-input').checked,leadHours:Number($('lead-input').value)};if(!C.validZone(settings.zone)){$('zone-input').setCustomValidity('Enter a valid time zone, such as America/New_York.');$('zone-input').reportValidity();return;}try{await send({type:'SET_SETTINGS',settings});$('settings-dialog').close();await refresh();}catch(error){toast(error.message);}});
$('zone-input').addEventListener('input',()=>$('zone-input').setCustomValidity(''));
$('test-notification').addEventListener('click',()=>act({type:'TEST_NOTIFICATION'}));$('clear-data').addEventListener('click',()=>$('clear-dialog').showModal());$('confirm-clear').addEventListener('click',async()=>{try{await send({type:'CLEAR'});$('clear-dialog').close();$('settings-dialog').close();await refresh();}catch(error){toast(error.message);}});
$('export').addEventListener('click',()=>{const items=C.activeItems(state);if(!items.some(i=>!C.isDone(i)&&(i.dueAt||i.dueDate))){toast('No dated assignments to export.');return;}const blob=new Blob([C.calendar(items)],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=extension?'due-north.ics':'due-north-SAMPLE.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Calendar snapshot exported.');});
if(!extension){state=new URLSearchParams(location.search).has('empty')?C.emptyState():demoState();$('demo-banner').hidden=false;pearsonReady=true;}
if(extension)chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.state){state=C.migrateState(changes.state.newValue);render();}});
refresh();setInterval(render,60000);
