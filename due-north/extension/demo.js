'use strict';
const DNDemo={create(){
  const C=DNCore,s=C.emptyState(),today=C.dateKey(Date.now(),s.settings.zone),term=s.activeTerm;
  const courses=[['brightspace','101','MA 16100'],['gradescope','102','CHM 11500'],['pearson','103','MA 16200'],['brightspace','104','CHM 11500']];
  for(const [source,id,title]of courses){const key=C.courseKey(source,id);s.courses[key]={key,source,id,title,term,enabled:true,url:source==='brightspace'?`https://purdue.brightspace.com/d2l/home/${id}`:source==='gradescope'?`https://www.gradescope.com/courses/${id}`:`https://mylabmastering.pearson.com/courses/${id}/menu/homework`};}
  const examples=[['HW3',0,0,'not-submitted'],['Lab Report 4',1,1,'not-submitted'],['Written Homework 11',0,2,'not-submitted'],['Section 3.4 Homework',2,0,'not-submitted'],['Quiz 2',0,-1,'submitted'],['Lab preparation',1,3,'not-submitted'],['Problem set 5',2,4,'not-submitted'],['Project proposal',1,null,'not-submitted']];
  examples.forEach(([title,index,offset,status],i)=>{const [source,courseId,course]=courses[index],courseKey=C.courseKey(source,courseId),date=offset===null?null:C.shiftDay(today,offset),dueAt=date?C.manualDue(date,'23:59',s.settings.zone).dueAt:null;const url=source==='gradescope'?`https://www.gradescope.com/courses/${courseId}/assignments/${i}`:source==='brightspace'?`https://purdue.brightspace.com/d2l/lms/dropbox/user/folder_submit_files.d2l?ou=${courseId}&db=${i}`:s.courses[courseKey].url;s.items[`sample-${i}`]={id:`sample-${i}`,title,course,courseId,courseKey,term,source,status,url,linkVersion:2,type:i===4?'quiz':'assignment',dueAt,dueDate:null,dueRaw:dueAt||'',dateNote:'',lastSeen:Date.now()};});
  s.items['sample-copy']={...s.items['sample-1'],id:'sample-copy',source:'brightspace',courseId:'104',courseKey:'brightspace:104',url:'https://purdue.brightspace.com/d2l/lms/dropbox/user/folder_submit_files.d2l?ou=104&db=90',relatedURLs:[s.items['sample-1'].url]};
  DNTasks.createManual(s,{title:'Midterm review',courseKey:'brightspace:101',date:C.shiftDay(today,3),time:'18:00'},'manual:sample');
  s.courses['brightspace:old']={key:'brightspace:old',source:'brightspace',id:'old',title:'Previous course',term:`Fall ${new Date().getFullYear()-1}`,enabled:false};
  for(const source of ['brightspace','gradescope','pearson'])s.sources[source]={lastSuccess:Date.now(),outcome:'updated',message:'Sample data'};
  return C.migrateState(s);
}};
