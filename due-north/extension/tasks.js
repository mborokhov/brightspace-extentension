/* Local tasks and reversible cross-platform groups. Source records remain intact. */
(function(root){
  'use strict';
  const C=root.DNCore||(typeof require==='function'?require('./core.js'):null);
  const SOURCES={brightspace:'Brightspace',gradescope:'Gradescope',pearson:'MyLab Math',manual:'Manual'};
  const pair=(a,b)=>[a,b].sort().join('|');
  function manualURL(value){
    const text=C.clean(value,2000);if(!text)return '';
    try{const url=new URL(text);if(url.protocol==='https:'&&!url.username&&!url.password)return url.href;}catch{}
    throw Error('Use an HTTPS link without embedded login credentials.');
  }
  function createManual(state,input,id,now=Date.now()){
    const title=C.clean(input.title,250);if(!title)throw Error('Enter an assignment name.');
    const date=C.clean(input.date,10),time=C.clean(input.time,5);
    if(!date&&time)throw Error('Choose a date before adding a time.');
    const due=date?C.manualDue(date,time,state.settings.zone):{dueAt:null,dueDate:null};
    const url=manualURL(input.url),requested=input.courseKey||'manual:personal',key=requested==='manual:personal'?'manual:personal:'+C.hash(state.activeTerm):requested;
    if(requested==='manual:personal'&&!state.courses[key])state.courses[key]={key,id:key.slice(7),source:'manual',title:'Personal',term:state.activeTerm,enabled:true};
    const course=state.courses[key];if(!C.isCourseActive(state,key))throw Error('Choose a current course.');
    const old=state.items[id];if(old&&old.source!=='manual')throw Error('Only manual assignments can be edited here.');
    state.items[id]={...old,id,source:'manual',title,course:course.title,courseId:course.id,courseKey:key,term:course.term,url,pageURL:'',status:old?.status||'not-submitted',...due,dueRaw:due.dueAt||due.dueDate||'',dateNote:'',dueOverride:null,dueOverrideUpdatedAt:now,deleted:false,firstSeen:old?.firstSeen||now,lastSeen:now};
    return id;
  }
  function nativeReference(url){
    if(!C.allowedURL(url))return '';
    const u=new URL(url);
    if(!/\/assignments\/\d+/.test(u.pathname)&&![...u.searchParams.keys()].some(key=>/^(db|qi|homeworkid|assignmentid|testid)$/i.test(key)))return '';
    return C.assignmentId({source:C.sourceFor(url),url,courseId:C.courseId(url)});
  }
  function groups(state){state.groups ||= {};state.separatePairs ||= [];return state.groups;}
  function members(state,id){
    const group=groups(state)[id];return (group?group.members:[id]).map(key=>state.items[key]).filter(item=>item&&!item.deleted);
  }
  function mergeTasks(state,ids,primaryId,automatic=false){
    const registry=groups(state),expanded=new Set(),existing=[];
    for(const id of ids){if(registry[id])for(const member of registry[id].members)expanded.add(member);else expanded.add(id);}
    for(const [id,group] of Object.entries(registry))if(group.members.some(member=>expanded.has(member))){existing.push(id);for(const member of group.members)expanded.add(member);}
    const keys=[...expanded].filter(id=>state.items[id]&&!state.items[id].deleted).sort();
    if(keys.length<2)throw Error('Choose another assignment to merge.');
    if(keys.some(id=>!C.isCourseActive(state,state.items[id].courseKey)))throw Error('Only current-course assignments can be merged.');
    const id=existing[0]||'group:'+C.hash(keys.join('|')),old=registry[id];
    const primary=keys.includes(primaryId)?primaryId:old&&keys.includes(old.primaryId)?old.primaryId:keys.find(key=>state.items[key].source==='gradescope')||keys.find(key=>state.items[key].source==='pearson')||keys[0];
    const group={...old,id,members:keys,primaryId:primary,automatic:old?old.automatic&&automatic:automatic};
    if(!old){
      for(const [field,stamp] of [['dueOverride','dueOverrideUpdatedAt'],['completionOverride','completionUpdatedAt']]){
        const edited=keys.map(key=>state.items[key]).filter(item=>item[stamp]||item[field]).sort((a,b)=>(b[stamp]||0)-(a[stamp]||0))[0];
        if(edited){group[field]=edited[field];group[stamp]=edited[stamp];if(field==='dueOverride')group.overrideSourceDue=edited.overrideSourceDue;}
      }
    }
    const priorMarkers=existing.map(key=>registry[key].remindedFor);
    for(const other of existing.slice(1)){
      const alias=registry[other];
      for(const [field,stamp] of [['dueOverride','dueOverrideUpdatedAt'],['completionOverride','completionUpdatedAt']])if((alias[stamp]||0)>(group[stamp]||0)){group[field]=alias[field];group[stamp]=alias[stamp];if(field==='dueOverride')group.overrideSourceDue=alias.overrideSourceDue;}
      delete registry[other];
    }
    const selected=C.effective({...state.items[primary],dueOverride:group.dueOverride||null});
    if(selected.dueAt&&(keys.some(key=>state.items[key].remindedFor===selected.dueAt)||priorMarkers.includes(selected.dueAt)))group.remindedFor=selected.dueAt;
    registry[id]=group;
    if(!automatic)state.separatePairs=state.separatePairs.filter(value=>!keys.some((a,i)=>keys.slice(i+1).some(b=>pair(a,b)===value)));
    return id;
  }
  function reconcileGroups(state){
    const registry=groups(state),eligible=Object.values(state.items).filter(item=>!item.deleted&&item.source!=='manual'&&C.isCourseActive(state,item.courseKey));
    const references=new Map();
    for(const item of eligible){const reference=nativeReference(item.url);if(reference){if(!references.has(reference))references.set(reference,[]);references.get(reference).push(item);}}
    for(const item of eligible){
      const targets=[...new Set((item.relatedURLs||[]).map(nativeReference).filter(Boolean))].flatMap(reference=>references.get(reference)||[]).filter(other=>other.source!==item.source&&other.id!==item.id);
      const sourceCounts=new Map();for(const other of targets)sourceCounts.set(other.source,(sourceCounts.get(other.source)||0)+1);
      for(const other of targets){
        if(sourceCounts.get(other.source)!==1||state.separatePairs.includes(pair(item.id,other.id)))continue;
        const combined=new Set([item.id,other.id]);for(const group of Object.values(registry))if(group.members.some(id=>combined.has(id)))for(const id of group.members)combined.add(id);
        const raw=[...combined].map(id=>state.items[id]).filter(Boolean);
        if(new Set(raw.map(i=>i.source)).size!==raw.length||raw.some((a,i)=>raw.slice(i+1).some(b=>state.separatePairs.includes(pair(a.id,b.id)))))continue;
        mergeTasks(state,[item.id,other.id],undefined,true);
      }
    }
    return state;
  }
  function taskItem(state,id,applyOverride=true){
    const group=groups(state)[id];if(!group)return state.items[id]&&!state.items[id].deleted?(applyOverride?C.effective(state.items[id]):state.items[id]):null;
    const all=members(state,id).filter(item=>C.isCourseActive(state,item.courseKey));if(!all.length)return null;
    const primary=all.find(item=>item.id===group.primaryId)||all[0];
    const item={...primary,id,memberIds:all.map(item=>item.id),courseKeys:[...new Set(all.map(item=>item.courseKey))],merged:true,automatic:group.automatic,primaryId:primary.id,status:all.every(C.isDone)?'submitted':'not-submitted',lastSeen:primary.lastSeen,completionOverride:group.completionOverride||'',completionUpdatedAt:group.completionUpdatedAt,dueOverride:group.dueOverride||null,dueOverrideUpdatedAt:group.dueOverrideUpdatedAt,overrideSourceDue:group.overrideSourceDue,remindedFor:group.remindedFor};
    return applyOverride?C.effective(item):item;
  }
  function taskItems(state){
    const taken=new Set(),result=[];
    for(const group of Object.values(groups(state))){
      const active=members(state,group.id).filter(item=>C.isCourseActive(state,item.courseKey));
      if(!active.length)continue;
      // Do not combine an excluded course's deadline or completion status into current tasks.
      const scoped={...state,groups:{[group.id]:{...group,members:active.map(item=>item.id)}}};
      result.push(taskItem(scoped,group.id));for(const item of active)taken.add(item.id);
    }
    for(const item of Object.values(state.items))if(!item.deleted&&!taken.has(item.id)&&C.isCourseActive(state,item.courseKey))result.push(C.effective(item));
    return result;
  }
  function record(state,id){return groups(state)[id]||state.items[id];}
  function separate(state,id){
    const group=groups(state)[id];if(!group)throw Error('This assignment is not merged.');
    const keys=group.members;
    for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++)if(!state.separatePairs.includes(pair(keys[i],keys[j])))state.separatePairs.push(pair(keys[i],keys[j]));
    for(const key of keys){
      const item=state.items[key];if(!item)continue;
      for(const [field,stamp] of [['dueOverride','dueOverrideUpdatedAt'],['completionOverride','completionUpdatedAt']])if(group[stamp]&&(group[stamp]||0)>=(item[stamp]||0)){item[field]=group[field];item[stamp]=group[stamp];if(field==='dueOverride')item.overrideSourceDue={dueAt:item.dueAt,dueDate:item.dueDate};}
      if(group.remindedFor&&group.remindedFor===C.effective(item).dueAt)item.remindedFor=group.remindedFor;
    }
    delete state.groups[id];
  }
  function sourceLinks(state,item){return members(state,item.id).filter(member=>member.url&&C.isCourseActive(state,member.courseKey)).map(member=>({id:member.id,source:member.source,label:SOURCES[member.source],url:member.source==='manual'?manualURL(member.url):C.assignmentOpenURL(member)}));}
  function courseMatches(item,key){return !key||item.courseKey===key||item.courseKeys?.includes(key);}
  function compareTasks(a,b,zone){
    const day=item=>item.dueAt?C.dateKey(item.dueAt,zone):item.dueDate||'9999';
    return day(a).localeCompare(day(b))||((a.dueAt?Date.parse(a.dueAt):-Infinity)-(b.dueAt?Date.parse(b.dueAt):-Infinity))||a.title.localeCompare(b.title);
  }
  function upcoming(state,limit=6){return taskItems(state).filter(item=>!C.isDone(item)).sort((a,b)=>compareTasks(a,b,state.settings.zone)).slice(0,limit);}
  const api={SOURCES,manualURL,createManual,nativeReference,mergeTasks,reconcileGroups,members,taskItem,taskItems,record,separate,sourceLinks,courseMatches,compareTasks,upcoming};
  root.DNTasks=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
