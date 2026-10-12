'use strict';
const C=DNCore,T=DNTasks,$=id=>document.getElementById(id),extension=location.protocol==='chrome-extension:'&&!!globalThis.chrome?.runtime?.id;
let state=extension?C.emptyState():new URLSearchParams(location.search).has('empty')?C.emptyState():DNDemo.create();
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
async function send(message){
  if(!extension){if(message.type==='SET_ITEM'){const item=T.record(state,message.id);item.completionOverride=message.completionOverride;}return {state};}
  const response=await chrome.runtime.sendMessage(message);if(response?.error)throw Error(response.error);return response;
}
async function action(message){try{await send(message);await refresh();}catch(error){$('popup-error').textContent=error.message;}}
function render(){
  state=C.migrateState(state);const zone=state.settings.zone,today=C.dateKey(Date.now(),zone),items=T.upcoming(state);
  $('popup-date').textContent=new Intl.DateTimeFormat('en-US',{timeZone:zone,month:'short',day:'numeric'}).format(Date.now());$('popup-list').replaceChildren();
  for(const item of items){
    const row=el('div','popup-task'),check=el('input');check.type='checkbox';check.setAttribute('aria-label',`Mark ${item.title} complete`);check.addEventListener('change',()=>action({type:'SET_ITEM',id:item.id,completionOverride:'done'}));
    const info=el('div'),name=el('button','popup-name',item.title);name.addEventListener('click',()=>{if(C.assignmentOpenURL(item)&&extension)action({type:'OPEN_ASSIGNMENT',id:item.id});else openPlanner();});
    info.append(name,el('small','',item.course+' · '+(item.merged?'Merged':T.SOURCES[item.source])));
    const day=item.dueAt?C.dateKey(item.dueAt,zone):item.dueDate,overdue=item.dueAt?Date.parse(item.dueAt)<Date.now():day&&day<today;
    const date=day===today?'Today':day?new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric'}).format(new Date(day+'T12:00Z')):'No date',time=item.dueAt?new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'numeric',minute:'2-digit'}).format(new Date(item.dueAt)):day?'All day':'';
    const due=el('div','popup-due'+(overdue?' overdue':''),date);due.append(el('small','',overdue?'Past due · '+time:time));row.append(check,info,due);$('popup-list').append(row);
  }
  if(!items.length)$('popup-list').append(el('div','popup-empty',C.activeItems(state).length?'All caught up.':'Add an assignment or open your course lists to get started.'));
  $('popup-sync').textContent=state.job?.running?'Stop':'Sync';const login=Object.entries(state.sources).find(([,source])=>source.outcome==='login');
  $('popup-status').textContent=state.job?.running?`Syncing · ${state.job.checked} pages checked`:login?'Sign in to '+T.SOURCES[login[0]]:state.job?.note||C.activeItems(state).filter(item=>!C.isDone(item)).length+' assignments to do';
}
async function refresh(){try{if(extension)state=(await send({type:'GET_STATE'})).state;render();}catch(error){$('popup-error').textContent=error.message;}}
async function openPlanner(mode){try{if(extension){await send({type:'OPEN_DASHBOARD',mode});window.close();}else window.open('dashboard.html'+(mode==='add'?'#add':''),'_blank','noopener');}catch(error){$('popup-error').textContent=error.message;}}
$('popup-open').addEventListener('click',()=>openPlanner());$('popup-dashboard').addEventListener('click',()=>openPlanner());$('popup-add').addEventListener('click',()=>openPlanner('add'));
$('popup-sync').addEventListener('click',()=>{if(extension)action({type:state.job?.running?'STOP_SYNC':'SYNC'});else $('popup-error').textContent='Install the extension to sync your courses.';});
if(extension)chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.state){state=changes.state.newValue||C.emptyState();render();}});else $('popup-demo').hidden=false;
refresh();
