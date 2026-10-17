const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../extension/core.js'),T=require('../extension/tasks.js');
const now=Date.parse('2026-10-12T12:00:00Z');
function state(){const s=C.emptyState();s.activeTerm='Fall 2026';s.settings.zone='America/New_York';for(const source of ['brightspace','gradescope','pearson']){const key=source+':42';s.courses[key]={key,id:'42',source,title:'MA 161',term:s.activeTerm,enabled:true};}return s;}
function add(s,id,source,extra={}){return s.items[id]={id,source,courseKey:source+':42',courseId:'42',course:'MA 161',term:s.activeTerm,title:'Homework 1',url:source==='brightspace'?'https://purdue.brightspace.com/d2l/lms/dropbox/user/folder_submit_files.d2l?ou=42&db=99':source==='gradescope'?'https://www.gradescope.com/courses/42/assignments/99':'https://www.mathxl.com/Student/DoAssignments.aspx?courseId=42&homeworkId=99',dueAt:'2026-10-14T03:59:00.000Z',dueDate:null,dueRaw:'Oct 13, 2026 11:59 PM',status:'not-submitted',lastSeen:now,...extra};}
test('manual assignments support current courses, Personal, timed, date-only and undated deadlines',()=>{
 const s=state();T.createManual(s,{title:'Review',courseKey:'brightspace:42',date:'2026-10-15',time:'18:00'},'manual:1',now);
 T.createManual(s,{title:'Meeting',date:'2026-10-16'},'manual:2',now);T.createManual(s,{title:'Project'},'manual:3',now);
 assert.equal(s.items['manual:1'].dueAt,'2026-10-15T22:00:00.000Z');assert.equal(s.items['manual:2'].dueDate,'2026-10-16');assert.equal(s.items['manual:3'].dueAt,null);
 assert.equal(C.activeItems(C.migrateState(s,now)).length,3);assert.equal(C.assignmentOpenURL(s.items['manual:3']),'');
 assert.equal((C.calendar(C.activeItems(s),now).match(/BEGIN:VEVENT/g)||[]).length,2);assert.ok(!C.calendar(C.activeItems(s),now).includes('\r\nURL:'));
});
test('manual input rejects unsafe links, missing names, invalid dates and excluded courses',()=>{
 const s=state();for(const url of ['javascript:alert(1)','http://example.test','https://user:pass@example.test'])assert.throws(()=>T.createManual(s,{title:'X',url},'manual:x',now),/HTTPS/);
 assert.throws(()=>T.createManual(s,{title:''},'manual:x',now),/name/);assert.throws(()=>T.createManual(s,{title:'X',time:'18:00'},'manual:x',now),/date/);
 assert.throws(()=>T.createManual(s,{title:'X',date:'2026-02-30'},'manual:x',now));s.courses['brightspace:42'].enabled=false;
 assert.throws(()=>T.createManual(s,{title:'X',courseKey:'brightspace:42'},'manual:x',now),/current course/);
 assert.equal(T.manualURL('https://example.test/homework'),'https://example.test/homework');
});
test('manual records and local completion survive migration and unrelated scans',()=>{
 const s=state();T.createManual(s,{title:'Review',date:'2026-10-15'},'manual:1',now);s.items['manual:1'].completionOverride='done';
 s.items=C.mergeItems(s.items,[add(state(),'raw','gradescope')],now+1000);C.migrateState(s,now);
 assert.equal(s.items['manual:1'].title,'Review');assert.equal(s.items['manual:1'].completionOverride,'done');
 T.createManual(s,{title:'Review revised',date:'2026-10-16'},'manual:1',now+2000);assert.equal(s.items['manual:1'].completionOverride,'done');
 s.items['manual:1'].deleted=true;assert.ok(!T.taskItems(s).some(item=>item.id==='manual:1'));s.items['manual:1'].deleted=false;assert.ok(T.taskItem(s,'manual:1'));
});
test('same title and same date alone never cause automatic cross-platform merging',()=>{
 const s=state();add(s,'b','brightspace');add(s,'g','gradescope');T.reconcileGroups(s);
 assert.equal(T.taskItems(s).length,2);assert.equal(Object.keys(s.groups).length,0);
});
test('explicit native assignment references combine one task, preserve links and count once',()=>{
 const s=state();const b=add(s,'b','brightspace'),g=add(s,'g','gradescope');b.relatedURLs=[g.url];T.reconcileGroups(s);T.reconcileGroups(s);
 const items=T.taskItems(s);assert.equal(items.length,1);assert.equal(items[0].primaryId,'g');assert.equal(items[0].automatic,true);assert.equal(Object.keys(s.items).length,2);
 assert.equal(T.sourceLinks(s,items[0]).length,2);assert.equal(C.weekCounts(items,'2026-10-12',s.settings.zone)[1].count,1);
 assert.equal((C.calendar(items,now).match(/BEGIN:VEVENT/g)||[]).length,1);assert.equal(T.upcoming(s).length,1);
});
test('ambiguous native references and course-level links stay separate',()=>{
 const s=state(),b=add(s,'b','brightspace'),g=add(s,'g','gradescope'),g2=add(s,'g2','gradescope',{url:'https://www.gradescope.com/courses/42/assignments/100'});
 b.relatedURLs=[g.url,g2.url];T.reconcileGroups(s);assert.equal(T.taskItems(s).length,3);
 b.relatedURLs=['https://www.gradescope.com/courses/42'];T.reconcileGroups(s);assert.equal(T.taskItems(s).length,3);
});
test('merged completion requires every source complete unless overridden locally',()=>{
 const s=state();add(s,'b','brightspace',{status:'submitted'});add(s,'g','gradescope');const id=T.mergeTasks(s,['b','g'],'g');
 assert.equal(C.isDone(T.taskItem(s,id)),false);s.items.g.status='submitted';assert.equal(C.isDone(T.taskItem(s,id)),true);
 s.groups[id].completionOverride='todo';assert.equal(C.isDone(T.taskItem(s,id)),false);s.groups[id].completionOverride='done';assert.equal(C.isDone(T.taskItem(s,id)),true);
});
test('manual merging keeps chosen source, local edits and independent raw records through resync',()=>{
 const s=state();add(s,'b','brightspace');add(s,'g','gradescope',{title:'Homework one'});const id=T.mergeTasks(s,['b','g'],'b');
 const group=s.groups[id];group.dueOverride=C.manualDue('2026-10-16','18:00',s.settings.zone);group.dueOverrideUpdatedAt=now;group.overrideSourceDue={dueAt:s.items.b.dueAt,dueDate:null};group.completionOverride='done';group.completionUpdatedAt=now;
 s.items=C.mergeItems(s.items,[{...s.items.b,dueAt:'2026-10-15T03:59:00.000Z'}],now+1000);C.migrateState(s,now+1000);
 const task=T.taskItem(s,id);assert.equal(task.primaryId,'b');assert.equal(task.dueAt,'2026-10-16T22:00:00.000Z');assert.equal(C.isDone(task),true);assert.equal(Object.keys(s.items).length,2);
 assert.equal(C.sameDeadline(task.overrideSourceDue,T.taskItem(s,id,false)),false);
});
test('separating preserves local edits and blocks automatic remerging until explicit merge',()=>{
 const s=state(),b=add(s,'b','brightspace'),g=add(s,'g','gradescope');b.relatedURLs=[g.url];T.reconcileGroups(s);const id=Object.keys(s.groups)[0];
 Object.assign(s.groups[id],{dueOverride:C.manualDue('2026-10-17','',s.settings.zone),dueOverrideUpdatedAt:now,completionOverride:'done',completionUpdatedAt:now});
 T.separate(s,id);T.reconcileGroups(s);assert.equal(T.taskItems(s).length,2);for(const item of T.taskItems(s)){assert.equal(item.dueDate,'2026-10-17');assert.equal(C.isDone(item),true);}
 T.mergeTasks(s,['b','g'],'g');assert.equal(T.taskItems(s).length,1);assert.deepEqual(s.separatePairs,[]);
});
test('excluded members cannot supply source deadlines or status, but group edits survive exclusion',()=>{
 const s=state();add(s,'b','brightspace',{status:'submitted'});add(s,'g','gradescope',{dueAt:'2026-10-18T03:59:00.000Z'});const id=T.mergeTasks(s,['b','g'],'g');
 s.groups[id].dueOverride=C.manualDue('2026-10-16','',s.settings.zone);s.courses['gradescope:42'].enabled=false;
 const task=T.taskItems(s)[0];assert.equal(task.id,id);assert.equal(task.primaryId,'b');assert.equal(task.dueDate,'2026-10-16');assert.equal(C.isDone(task),true);assert.equal(T.sourceLinks(s,task).length,1);
 s.courses['gradescope:42'].enabled=true;assert.equal(T.taskItems(s)[0].primaryId,'g');assert.equal(T.taskItems(s)[0].dueDate,'2026-10-16');
});
test('popup orders local days correctly, includes undated tasks last and limits to six',()=>{
 const s=state();add(s,'late','gradescope',{title:'Previous evening',dueAt:'2026-10-16T03:59:00.000Z'});
 T.createManual(s,{title:'Next all day',date:'2026-10-16'},'manual:day',now);for(let i=0;i<7;i++)T.createManual(s,{title:'Undated '+i},'manual:'+i,now);
 assert.deepEqual(T.upcoming(s).slice(0,2).map(item=>item.title),['Previous evening','Next all day']);assert.equal(T.upcoming(s).length,6);
});
test('manual reminder remains eligible without stale school scans and has a stable identity',()=>{
 const s=state();s.settings.reminders=true;const due=new Date(now+3600000).toISOString();T.createManual(s,{title:'Review'},'manual:1',now-10*86400000);
 Object.assign(s.items['manual:1'],{dueAt:due,dueRaw:due});assert.equal(C.dueReminders(s,now).length,1);s.items['manual:1'].remindedFor=due;assert.equal(C.dueReminders(s,now).length,0);
});

test('Personal assignments stay in their semester while new Personal tasks can be added after rollover',()=>{
 const s=state();T.createManual(s,{title:'Fall task'},'manual:fall',now);const oldCourse=s.items['manual:fall'].courseKey;
 s.activeTerm='Spring 2027';T.createManual(s,{title:'Spring task'},'manual:spring',Date.parse('2027-01-15T12:00Z'));
 assert.notEqual(oldCourse,s.items['manual:spring'].courseKey);assert.deepEqual(T.taskItems(s).map(item=>item.title),['Spring task']);
});

test('merging and separating an already reminded deadline do not resend that reminder',()=>{
 const s=state();s.settings.reminders=true;const due=new Date(now+3600000).toISOString();add(s,'b','brightspace',{dueAt:due,remindedFor:due});add(s,'g','gradescope',{dueAt:due});
 const id=T.mergeTasks(s,['b','g'],'g');assert.equal(C.dueReminders(s,now).length,0);T.separate(s,id);assert.equal(C.dueReminders(s,now).length,0);
});
test('a fresh secondary scan cannot make an outdated chosen deadline eligible for reminders',()=>{
 const s=state();s.settings.reminders=true;const due=new Date(now+3600000).toISOString();add(s,'b','brightspace',{dueAt:due,lastSeen:now-8*86400000});add(s,'g','gradescope',{dueAt:due});
 T.mergeTasks(s,['b','g'],'b');assert.equal(C.dueReminders(s,now).length,0);
});
test('cached year repair preserves a merged task custom deadline and its source baseline',()=>{
 const s=state(),old=C.parseDue('Nov 22 at 11:59 PM','America/New_York',Date.parse('2026-04-01T12:00Z'));
 add(s,'a','brightspace',old);add(s,'b','gradescope',old);const id=T.mergeTasks(s,['a','b'],'a');
 s.groups[id].dueOverride=C.manualDue('2026-11-24','18:00',s.settings.zone);s.groups[id].overrideSourceDue={dueAt:old.dueAt,dueDate:null};s.groups[id].completionOverride='todo';
 C.migrateState(s,Date.parse('2026-10-17T16:00Z'));
 assert.equal(T.taskItem(s,id,false).dueAt,'2026-11-23T04:59:00.000Z');assert.equal(T.taskItem(s,id).dueAt,'2026-11-24T23:00:00.000Z');assert.ok(C.sameDeadline(s.groups[id].overrideSourceDue,T.taskItem(s,id,false)));assert.equal(s.groups[id].completionOverride,'todo');
});
