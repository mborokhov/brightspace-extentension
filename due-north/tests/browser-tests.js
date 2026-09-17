'use strict';
const results=[], now=Date.parse('2026-09-17T12:00:00Z');
function test(name,fn){try{fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}}
function equal(actual,expected){if(actual!==expected)throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);}
function doc(html){return new DOMParser().parseFromString(html,'text/html');}
const gs='https://www.gradescope.com/courses/42';
const bs='https://purdue.brightspace.com/d2l/lms/dropbox/user/folders_list.d2l?ou=42';
const extract=(html,url)=>DNExtract.extract(doc(html),url,{zone:'America/New_York'},now);
test('Ungraded and Not graded do not imply a completed submission',()=>{equal(DNExtract.statusOf('Ungraded'),'unknown');equal(DNExtract.statusOf('Not graded'),'unknown');equal(DNExtract.statusOf('Submitted, ungraded'),'submitted');});
test('Gradescope: selects due date, not release or late deadline',()=>{
 const s=extract('<title>MA 161 | Gradescope</title><table><thead><tr><th>Name</th><th>Status</th><th>Released</th><th>Due Date</th><th>Late Due Date</th></tr></thead><tbody><tr><td><a href="/courses/42/assignments/99/submissions/new">Homework 4</a></td><td>No Submission</td><td><time datetime="2026-09-01T00:00:00Z">Sep 1</time></td><td><time datetime="2026-09-20T03:59:00Z">Sep 19</time></td><td><time datetime="2026-09-22T03:59:00Z">Sep 21</time></td></tr></tbody></table>',gs);
 equal(s.items.length,1);equal(s.items[0].dueAt,'2026-09-20T03:59:00.000Z');equal(s.items[0].status,'not-submitted');equal(s.items[0].course,'MA 161');
});
test('Gradescope: unreadable dates remain reviewable; graded status is recognized',()=>{
 const s=extract('<table><thead><tr><th>Name</th><th>Status</th><th>Due</th></tr></thead><tr><td><a href="/courses/42/assignments/1">Project</a></td><td>9 / 10</td><td>See syllabus</td></tr></table>',gs);
 equal(s.items[0].dueAt,null);equal(s.items[0].status,'graded');
});
test('Gradescope: unreleased unlinked named assignment has a stable fallback record',()=>{
 const s=extract('<table id="assignments-student-table"><thead><tr><th>Name</th><th>Status</th><th>Due</th></tr></thead><tr><th>Unreleased project</th><td>Not submitted</td><td>Sep 30, 2026 11:59 PM</td></tr></table>',gs);
 equal(s.items.length,1);equal(s.items[0].title,'Unreleased project');
});
test('Brightspace: finds inline due date and ignores availability end date',()=>{
 const s=extract('<title>Assignments - MA 161</title><table><tr><td><a href="/d2l/lms/dropbox/user/folders_submit_files.d2l?db=5&ou=42">Homework 5</a><div>Due on September 20, 2026 11:59 PM</div><div>Available until September 22, 2026 11:59 PM</div></td></tr></table>',bs);
 equal(s.items.length,1);equal(s.items[0].dueAt,'2026-09-21T03:59:00.000Z');equal(s.items[0].course,'MA 161');
});
test('Brightspace: never treats a lone availability time as a due date',()=>{
 const s=extract('<table><tr><td><a href="/d2l/lms/dropbox/user/folders_submit_files.d2l?db=5&ou=42">HW</a><div>Available until <time datetime="2026-09-20T03:59:00Z">Sep 19</time></div></td></tr></table>',bs);
 equal(s.items[0].dueAt,null);
});
test('Brightspace: supports labelled machine timestamps and explicit submission status columns',()=>{
 const s=extract('<table><thead><tr><th>Assignment</th><th>Completion Status</th></tr></thead><tr><td><a href="/d2l/lms/dropbox/user/folders_submit_files.d2l?db=5&ou=42">HW</a><div>Due <time datetime="2026-09-20T03:59:00Z">Sep 19</time></div></td><td>1 submission</td></tr></table>',bs);
 equal(s.items[0].dueAt,'2026-09-20T03:59:00.000Z');equal(s.items[0].status,'submitted');
});
test('Open shadow roots expose course links; unrelated domains and submit pages are not crawled',()=>{
 const d=doc('<div id="host"></div><a href="https://evil.test/courses/5">Ignore</a><a href="/courses/42/assignments/2/submissions/new">Submit</a>');
 d.getElementById('host').attachShadow({mode:'open'}).innerHTML='<a href="/courses/42">CS 180</a>';
 const s=DNExtract.extract(d,gs,{},now);equal(s.links.length,1);equal(s.links[0].url,gs);
});
test('Hidden assignment rows are excluded; duplicate links collapse to one item',()=>{
 const row='<td><a href="/courses/42/assignments/1">HW 1</a></td><td>Sep 20, 2026 11:59 PM</td>';
 const s=extract(`<table><thead><tr><th>Name</th><th>Due</th></tr></thead><tr>${row}</tr><tr>${row}</tr><tr hidden><td><a href="/courses/42/assignments/2">Hidden</a></td><td>Sep 20</td></tr></table>`,gs);equal(s.items.length,1);
});
test('Login screens yield no assignments and flag a sign-in requirement',()=>{const s=extract('<input type="password"><a href="/courses/42">Course</a>',gs);equal(s.login,true);equal(s.items.length,0);});
test('Brightspace quiz entry is read without crawling its start URL',()=>{
 const url='https://purdue.brightspace.com/d2l/lms/quizzing/user/quizzes_list.d2l?ou=42';
 const s=extract('<table><thead><tr><th>Quiz</th><th>Due Date</th></tr></thead><tr><td><a href="/d2l/lms/quizzing/user/quiz_summary.d2l?qi=6&ou=42">Quiz 2</a></td><td>Sep 22, 2026 11:59 PM</td></tr></table>',url);
 equal(s.items.length,1);equal(s.links.length,0);equal(s.items[0].dueAt,'2026-09-23T03:59:00.000Z');
});
const passed=results.filter(r=>r.pass).length;
document.getElementById('test-summary').textContent=`${passed}/${results.length} passed${passed===results.length?' — all parser checks passed.':' — failures need attention.'}`;
document.title=`${passed===results.length?'PASS':'FAIL'} · Due North DOM tests`;
for(const result of results){const li=document.createElement('li');li.textContent=`${result.pass?'PASS':'FAIL'}: ${result.name}${result.error?' — '+result.error:''}`;document.getElementById('test-results').append(li);}
