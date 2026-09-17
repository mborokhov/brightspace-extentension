const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../extension/core.js');
const now=Date.parse('2026-09-17T12:00:00Z');
test('allows only school HTTPS origins and removes auth-like URL parameters',()=>{
 assert.equal(C.allowedURL('https://purdue.brightspace.com.evil.test/'),false);
 assert.equal(C.allowedURL('https://user:pass@www.gradescope.com/'),false);
 assert.equal(C.allowedURL('http://www.gradescope.com/'),false);
 assert.equal(C.canonicalURL('https://purdue.brightspace.com/d2l/lms/dropbox/user/folders_list.d2l?ou=42&token=secret#auth'),'https://purdue.brightspace.com/d2l/lms/dropbox/user/folders_list.d2l?ou=42');
 assert.equal(C.canonicalURL('javascript:alert(1)','https://www.gradescope.com'), '');
});
test('crawl allowlist includes course/list pages but excludes submitting and starting quizzes',()=>{
 assert.equal(C.pageKind('https://www.gradescope.com/courses/42'),'course');
 assert.equal(C.pageKind('https://www.gradescope.com/courses/42/assignments/2/submissions/new'),'');
 assert.equal(C.pageKind('https://purdue.brightspace.com/d2l/lms/quizzing/user/attempt/quiz_start_frame.d2l?ou=1&qi=2'),'');
});
test('explicit ISO timezone is preserved, independent of computer timezone',()=>assert.equal(C.parseDue('2026-09-19T23:59:00-04:00','America/Los_Angeles',now).dueAt,'2026-09-20T03:59:00.000Z'));
test('Rails-style machine timestamps preserve explicit offsets; invalid machine dates rejected',()=>{
 assert.equal(C.parseDue('2026-09-19 23:59:00 -0700','America/New_York',now).dueAt,'2026-09-20T06:59:00.000Z');
 assert.equal(C.parseDue('2026-02-30T23:59:00Z','America/New_York',now).dueAt,null);
});
test('parses Purdue wall times using configured zone, including midnight/noon',()=>{
 assert.equal(C.parseDue('Due on September 19, 2026 11:59 PM','America/New_York',now).dueAt,'2026-09-20T03:59:00.000Z');
 assert.equal(C.parseDue('9/19/2026 12:00 AM','America/New_York',now).dueAt,'2026-09-19T04:00:00.000Z');
 assert.equal(C.parseDue('Sep 19, 2026 12:00 PM','America/New_York',now).dueAt,'2026-09-19T16:00:00.000Z');
});
test('explicit abbreviation overrides configured zone',()=>assert.equal(C.parseDue('Sep 19, 2026 11:59 PM PDT','America/New_York',now).dueAt,'2026-09-20T06:59:00.000Z'));
test('missing time stays date-only; invalid or ambiguous times never guessed',()=>{
 assert.equal(C.parseDue('Sep 19, 2026','America/New_York',now).dueDate,'2026-09-19');
 for(const raw of ['February 30, 2026 1:00 PM','March 8, 2026 2:30 AM','November 1, 2026 1:30 AM','Sep 19, 2026 25:00','See syllabus']) assert.equal(C.parseDue(raw,'America/New_York',now).dueAt,null,raw);
});
test('year inference crosses December safely and is explicitly flagged',()=>{
 const date=C.parseDue('Jan 3 at 11:59 PM','America/New_York',Date.parse('2026-12-28T12:00Z'));
 assert.equal(date.dueAt,'2027-01-04T04:59:00.000Z');assert.match(date.dateNote,/inferred/);
});
const item=(overrides={})=>({source:'gradescope',title:'HW 1',course:'MA 161',courseId:'1',url:'https://www.gradescope.com/courses/1/assignments/42',pageURL:'https://www.gradescope.com/courses/1',status:'not-submitted',dueAt:'2026-09-18T03:59:00.000Z',dueDate:null,dateNote:'',lastSeen:now,...overrides});
test('stable IDs deduplicate submission links and preserve personal marks on rescan',()=>{
 const initial=C.mergeItems({},[item()],now),id=Object.keys(initial)[0];initial[id].completionOverride='done';initial[id].archived=true;
 const next=C.mergeItems(initial,[item({url:'https://www.gradescope.com/courses/1/assignments/42/submissions/new',title:'HW 1 revised',dueAt:'2026-09-19T03:59:00.000Z'})],now+1000);
 assert.equal(Object.keys(next).length,1);assert.equal(next[id].completionOverride,'done');assert.equal(next[id].archived,true);assert.equal(next[id].previousDue,initial[id].dueAt);assert.equal(next[id].changedAt,now+1000);
});
test('empty scan keeps records, unreadable changed date invalidates old reminder date',()=>{
 const initial=C.mergeItems({},[item()],now),id=Object.keys(initial)[0];assert.equal(Object.keys(C.mergeItems(initial,[],now)).length,1);
 assert.equal(C.mergeItems(initial,[item({dueAt:null})],now)[id].dueAt,null);
});
test('reminders skip stale, submitted, unknown-time, inferred-year, and notified items',()=>{
 const s=C.emptyState();s.settings.reminders=true;
 s.items={yes:item(),done:item({status:'submitted'}),stale:item({lastSeen:now-8*86400000}),inferred:item({dateNote:'Year inferred'}),sent:item({remindedFor:item().dueAt}),dateOnly:item({dueAt:null,dueDate:'2026-09-18'})};
 assert.equal(C.dueReminders(s,now).length,1);
});
test('manual completion can override and reset source submission status',()=>{
 assert.equal(C.isDone(item({status:'submitted',completionOverride:'todo'})),false);
 assert.equal(C.isDone(item({status:'submitted',completionOverride:''})),true);
});
test('ICS escapes content, uses stable UIDs, UTC/date-only dates and CRLF byte folding',()=>{
 const output=C.calendar([item({id:'abc',title:'Hello, world;\n'+ 'é'.repeat(90)}),item({id:'date',dueAt:null,dueDate:'2026-09-19'}),item({id:'skip',archived:true})],now);
 assert.match(output,/DTSTART:20260918T035900Z/);assert.match(output,/DTSTART;VALUE=DATE:20260919/);assert.match(output,/UID:abc@due-north.local/);assert.match(output,/Hello\\, world\\;\\n/);assert.ok(!output.includes('UID:skip'));
 for(const line of output.split('\r\n')) assert.ok(Buffer.byteLength(line,'utf8')<=75);
});
