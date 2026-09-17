(function(root){
  'use strict';
  const C=root.DNCore;
  function allRoots(doc){const roots=[doc];for(let n=0;n<roots.length&&n<150;n++)for(const el of roots[n].querySelectorAll('*'))if(el.shadowRoot)roots.push(el.shadowRoot);return roots;}
  const query=(roots,selector)=>roots.flatMap(r=>[...r.querySelectorAll(selector)]);
  function text(el){
    if(!el)return '';
    if(el.ownerDocument.defaultView&&el.innerText)return C.clean(el.innerText,2000);
    // Detached fixtures and adjacent inline date labels still need word boundaries.
    const walker=el.ownerDocument.createTreeWalker(el,4),parts=[];
    while(walker.nextNode())parts.push(walker.currentNode.nodeValue);
    return C.clean(parts.join(' '),2000);
  }
  const hidden=el=>!!el.closest('[hidden],[aria-hidden="true"],template')||/display\s*:\s*none/i.test(el.getAttribute('style')||'');
  const cells=row=>[...row.querySelectorAll(':scope > td,:scope > th,:scope > [role="cell"]')];
  function headersFor(row){
    const table=row.closest('table,[role="table"]');if(!table)return [];
    let headers=[...table.querySelectorAll('thead th,thead td,[role="columnheader"]')];
    if(!headers.length)headers=[...table.querySelectorAll('tr:first-child th')];
    if(!headers.length){const first=table.querySelector('tr');if(first&&/due|evaluation status|assignment|current quizzes/i.test(text(first)))headers=cells(first);}
    return headers.map(text);
  }
  function statusOf(raw){
    const value=C.clean(raw).toLowerCase();
    if(/no submission|not submitted|not started|in progress|unsubmitted|incomplete|not completed|0 submissions|0 files/.test(value))return 'not-submitted';
    if((!/not graded|ungraded/.test(value)&&/\bgraded\b/.test(value))||/\d+(?:\.\d+)?\s*\/\s*\d+/.test(value))return 'graded';
    if(/\bsubmitted\b|submission received|\bcompleted\b|\b[1-9]\d* (?:submissions?|files?)\b/.test(value))return 'submitted';
    return 'unknown';
  }
  function labelDate(container){
    if(!container)return '';
    const blocks=[...container.querySelectorAll('[title],[aria-label],span,div,p,time')];
    for(const el of [container,...blocks]){
      if(el.querySelectorAll('time').length===1&&/\bdue(?:\s+date|\s+on)?\b/i.test(text(el))&&!/\b(late|available|starts|ends)\b/i.test(text(el))){
        const machine=el.querySelector('time[datetime]')?.getAttribute('datetime');if(machine)return machine;
      }
    }
    const candidates=blocks.flatMap(el=>[el.getAttribute('title'),el.getAttribute('aria-label'),text(el)]).filter(Boolean);candidates.push(text(container));
    for(const candidate of candidates.sort((a,b)=>a.length-b.length)){
      const normal=candidate.split(/late\s+due(?:\s+date)?/i)[0];
      const match=normal.match(/\bDue(?:\s+Date)?(?:\s+on)?\s*[:\-]?\s*(.+?)(?=\s+(?:Available|Starts|Ends|Closes|Until|Submission|Not submitted)\b|$)/i);
      if(match&&!/^date$/i.test(match[1]))return match[1];
    }
    return '';
  }
  function ownTerm(value){return C.parseTerm(value);}
  function contextualTerm(el){
    if(!el)return null;
    const direct=ownTerm(el.getAttribute('data-term')||el.getAttribute('title')||text(el));if(direct)return direct;
    for(let parent=el.parentElement,depth=0;parent&&parent.tagName!=='BODY'&&depth<5;parent=parent.parentElement,depth++){
      const compact=text(parent);const terms=[...compact.matchAll(/\b(?:Spring|Summer|Fall|Autumn)\s*[-/,:]?\s*20\d{2}\b/gi)].map(m=>C.parseTerm(m[0]));
      if(terms.length&&new Set(terms).size===1&&compact.length<650)return terms[0];
      for(let sibling=parent.previousElementSibling;sibling;sibling=sibling.previousElementSibling){if(/^(H[1-6])$/.test(sibling.tagName)||sibling.getAttribute('role')==='heading'){const term=ownTerm(text(sibling));if(term)return term;break;}}
    }
    const headings=[...el.ownerDocument.querySelectorAll('h1,h2,h3,[role="heading"]')].filter(h=>h.compareDocumentPosition(el)&4);
    return ownTerm(text(headings.at(-1)));
  }
  function courseInfo(roots,doc,url){
    const explicit=query(roots,'[data-course-name],.courseHeader--title,.course-header h1,.course-title,.d2l-navigation-s-title-container a')[0];
    let title=explicit?.getAttribute('data-course-name')||text(explicit);
    if(C.sourceFor(url)==='pearson'){
      const labelled=query(roots,'h1,h2,h3,h4,h5,a,[role="heading"],header,[role="banner"],span,div').map(text).filter(t=>t.length<180&&/^(?:Spring|Summer|Fall|Autumn)\s+20\d{2}\s+[A-Z]{2,}\s*\d{3,}/i.test(t)&&!/welcome|sign out|gradebook/i.test(t)).sort((a,b)=>a.length-b.length)[0];
      if(labelled)title=labelled;
    }
    if(!title)title=query(roots,'h1').map(text).find(t=>!/^(assignments?|quizzes|current quizzes|gradescope|brightspace|home|homework and tests)$/i.test(t))||C.clean(doc.title).replace(/\s*[|–-]\s*(Gradescope|Brightspace|MyLab).*$/i,'').replace(/^(Assignments|Quizzes|Homework and Tests)\s*[-–|]\s*/i,'');
    const id=C.courseId(url)||query(roots,'[data-course-id]')[0]?.getAttribute('data-course-id')||'';
    if(/^(assignments?|quizzes|gradescope|brightspace|home|homework and tests)$/i.test(title))title='';
    const term=ownTerm(title)||ownTerm(doc.title)||query(roots,'.courseHeader--term,[data-course-term]').map(el=>ownTerm(el.getAttribute('data-course-term')||text(el))).find(Boolean)||null;
    return {id,title:C.clean(title||`Course ${id||'unknown'}`,160),term};
  }
  function machineOrText(el){return el?.getAttribute('datetime')||el?.getAttribute('data-due-date')||text(el);}
  function isLate(el,boundary){for(let n=el;n&&n!==boundary;n=n.parentElement){if(/late/i.test(n.className?.toString()||'')||(/late\s+due/i.test(text(n))&&n.querySelectorAll('time').length<=1))return true;}return false;}
  function gradescopeDue(row,dueCell){
    const scope=dueCell||row;
    // Prefer the semantically named right-hand deadline, never the release or late cutoff.
    const explicit=[...scope.querySelectorAll('[data-due-date],[class*="--dueDate"],[class*="--due-date"],.due-date,.dueDate')].find(el=>!isLate(el,scope));
    if(explicit)return machineOrText(explicit.querySelector('time[datetime]')||explicit);
    const times=[...scope.querySelectorAll('time')].filter(el=>!isLate(el,scope));
    if(times.length>=2)return machineOrText(times[1]);
    if(times.length===1&&dueCell)return machineOrText(times[0]);
    const normal=text(scope).split(/Late\s+Due(?:\s+Date)?\s*:/i)[0];
    const dates=[...normal.matchAll(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:,?\s+20\d{2})?(?:\s+(?:at\s+)?\d{1,2}:\d{2}\s*(?:AM|PM)?(?:\s+(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC))?)?/gi)];
    if(dates.length>=2)return dates[1][0];
    if(dueCell)return labelDate(dueCell)||normal;
    return labelDate(row);
  }
  function baseItem(source,course,url,pageURL,title,raw,zone,now,extra={}){return {source,title:C.clean(title,250),course:course.title,courseId:course.id,term:course.term,url,pageURL:C.canonicalURL(pageURL),...C.parseDue(raw,zone,now),...extra};}
  function gradescope(doc,roots,url,zone,now,course){
    const items=[];
    for(const row of query(roots,'tr,[role="row"]')){
      if(hidden(row))continue;
      const cell=cells(row),headers=headersFor(row),anchor=[...row.querySelectorAll('a[href]')].find(a=>/\/courses\/\d+\/assignments\/\d+/.test(a.getAttribute('href')));
      const dueIndex=headers.findIndex(h=>/due/i.test(h)&&!/late/i.test(h));
      if(!anchor&&!(row.closest('#assignments-student-table,table[data-assignments]')&&row.querySelector('td')))continue;
      const title=text(anchor)||text(cell[0]);if(!title||/^(name|assignment|assignment name)$/i.test(title))continue;
      const statusIndex=headers.findIndex(h=>/status|submission/i.test(h));
      const status=statusOf(statusIndex>=0?text(cell[statusIndex]):text(row.querySelector('.submissionStatus,.submission-status,[data-status]'))||text(cell[1]));
      const link=C.canonicalURL(anchor?.getAttribute('href')||url,url);if(!link||C.sourceFor(link)!=='gradescope')continue;
      items.push(baseItem('gradescope',course,link,url,title,gradescopeDue(row,dueIndex>=0?cell[dueIndex]:null),zone,now,{status}));
    }
    return items;
  }
  function brightspace(doc,roots,url,zone,now,course){
    const items=[],quizPage=/quizzes_list/i.test(url);
    for(const row of query(roots,'tr,[role="row"],d2l-list-item,.d2l-datalist-item')){
      if(hidden(row)||row.querySelector('tr,[role="row"]'))continue;
      const cell=cells(row),nameCell=cell[0]||row,headers=headersFor(row);
      let anchor=[...nameCell.querySelectorAll('a[href]')].find(a=>/folders_submit_files|quizzing/i.test(a.getAttribute('href')));
      if(!anchor)anchor=[...nameCell.querySelectorAll('a,button,[data-assignment-name]')].find(a=>text(a)&&!/^(actions?|view|open|submit|start|continue|feedback|not submitted)$/i.test(text(a)));
      if(!anchor)continue;
      const title=anchor.getAttribute('data-assignment-name')||text(anchor),raw=labelDate(nameCell);
      // Calendar widget links are summaries of assignments, not new assignments.
      if(C.isEventAlias({source:'brightspace',title}))continue;
      const nativeLink=C.canonicalURL(anchor.getAttribute('href'),url);
      const positive=nativeLink&&/folders_submit_files|quizzing/i.test(nativeLink);
      if(!positive&&!raw&&!/not submitted/i.test(text(row)))continue;
      const link=nativeLink||C.canonicalURL(url);if(!link||C.sourceFor(link)!=='brightspace')continue;
      const dueIndex=headers.findIndex(h=>/due/i.test(h)&&!/end|late/i.test(h));
      const deadline=raw||(dueIndex>=0?machineOrText(cell[dueIndex]?.querySelector('time[datetime]')||cell[dueIndex]):'');
      const evaluationIndex=headers.findIndex(h=>/evaluation\s+status/i.test(h));
      const statusIndex=headers.findIndex(h=>/completion|submission|status/i.test(h)&&!/evaluation/i.test(h));
      const evaluation=evaluationIndex>=0?cell[evaluationIndex]:null;
      const filled=!!evaluation&&(!!text(evaluation)||!!evaluation.querySelector('img,svg,[aria-label],[title]'));
      const status=quizPage&&filled?'submitted':statusOf(statusIndex>=0?text(cell[statusIndex]):/not submitted/i.test(text(row))?'Not Submitted':text(row.querySelector('.d2l-assignment-status,[data-status]')));
      items.push(baseItem('brightspace',{...course,id:course.id||C.courseId(link)},link,url,title,deadline,zone,now,{status,type:quizPage?'quiz':'assignment',nativeId:row.getAttribute('data-assignment-id')||''}));
    }
    return items;
  }
  function pearson(doc,roots,url,zone,now,course){
    const items=[];
    for(const row of query(roots,'tr,[role="row"],[data-assignment-id]')){
      if(hidden(row)||row.querySelector('tr,[role="row"]'))continue;
      const cell=cells(row),headers=headersFor(row),dueIndex=headers.findIndex(h=>/due/i.test(h)&&!/available|start|late/i.test(h));
      if(dueIndex<0&&!row.hasAttribute('data-assignment-id'))continue;
      const nameIndex=headers.findIndex(h=>/assignment|homework|name/i.test(h)),nameCell=cell[nameIndex>=0?nameIndex:0]||row;
      const anchor=nameCell.querySelector('a,button,[data-assignment-name]');
      const title=anchor?.getAttribute('data-assignment-name')||text(anchor)||(nameCell.matches('td,[role="cell"]')?text(nameCell):'');if(!title)continue;
      const dueCell=cell[dueIndex]||row.querySelector('[data-due-date]');
      const raw=dueCell?machineOrText(dueCell.querySelector('time[datetime]')||dueCell):labelDate(row);
      const statusIndex=headers.findIndex(h=>/status|progress|completed/i.test(h));
      const statusCell=cell[statusIndex],icon=statusCell?.querySelector('[title],[alt],[aria-label]'),statusText=text(statusCell)||icon?.getAttribute('alt')||icon?.getAttribute('aria-label')||icon?.getAttribute('title')||'';
      const progress=/progress|completed/i.test(headers[statusIndex]||'')&&statusText.match(/^(\d+)\s*\/\s*(\d+)$/);
      const status=progress?(+progress[2]>0&&+progress[1]===+progress[2]?'submitted':'not-submitted'):/^100\s*%$/.test(statusText)?'submitted':statusOf(statusText);
      const link=C.canonicalURL(anchor?.getAttribute('href'),url)||C.canonicalURL(url);
      if(C.sourceFor(link)!=='pearson')continue;
      items.push(baseItem('pearson',course,link,url,title,raw,zone,now,{status,nativeId:row.getAttribute('data-assignment-id')||''}));
    }
    // Course Home exposes compact date badges beside homework titles, outside a table.
    const names=query(roots,'a,button,h2,h3,h4,h5,strong,span,[role="heading"],[class*="title"],[class*="name"]')
      .filter(el=>!hidden(el)&&!el.closest('table,[role="table"]')&&/^(?:Homework|Assignment|Quiz|Test|Exam|Problem set)\s+\S/i.test(text(el))&&text(el).length<160&&!/\b(?:pts|score|and tests)\b|\d+\s*\/\s*\d+/i.test(text(el)));
    const seen=new Set();
    for(const name of names){
      const title=text(name);let card=name.parentElement,raw='';
      for(let depth=0;card&&depth<4;depth++,card=card.parentElement){
        if(names.some(other=>other!==name&&text(other)!==title&&card.contains(other)))break;
        const value=text(card),stamp=value.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,?\s+20\d{2})?\s+(?:at\s+)?\d{1,2}:\d{2}\s*(?:AM|PM)\b/i);
        raw=labelDate(card)||stamp?.[0]||'';
        if(raw&&C.parseDue(raw,zone,now).dueAt)break;
      }
      if(!card||!raw||seen.has(title))continue;
      const year=course.term?.match(/20\d{2}/)?.[0];
      if(year&&!/20\d{2}/.test(raw))raw=raw.replace(/(\b[A-Za-z]+\s+\d{1,2})\b/,'$1, '+year);
      const anchor=name.matches('a')?name:name.querySelector('a');
      const link=C.canonicalURL(anchor?.getAttribute('href'),url)||C.canonicalURL(url);
      if(C.sourceFor(link)!=='pearson')continue;
      const completed=!!card.closest('[data-status="completed"],[aria-label="Completed"],#completed,.completed');
      items.push(baseItem('pearson',course,link,url,title,raw,zone,now,{status:completed?'submitted':'not-submitted',nativeId:card.getAttribute('data-assignment-id')||''}));seen.add(title);
    }
    return items;
  }
  function extract(doc,url,settings={},now=Date.now()){
    if(!C.allowedURL(url))throw new Error('Unsupported site');
    const roots=allRoots(doc),zone=settings.zone||'America/New_York',source=C.sourceFor(url),course=courseInfo(roots,doc,url);
    let kind=C.pageKind(url);
    const login=!!query(roots,'input[type="password"]')[0]||/\/(login|signin|auth)(?:\/|$)/i.test(new URL(url).pathname),links=new Map();
    for(const el of query(roots,'a[href],d2l-course-card[href]')){
      if(hidden(el))continue;
      const href=C.canonicalURL(el.getAttribute('href'),url);if(!href||C.sourceFor(href)!==source||!C.pageKind(href))continue;
      const id=C.courseId(href)||course.id,term=contextualTerm(el)||(id===course.id?course.term:null);
      const inactive=!!el.closest('[data-archived="true"],.archived,.past-courses,.inactive-courses');
      links.set(href,{url:href,title:C.clean(text(el)||el.getAttribute('text')||'Course',160),source,courseId:id,term,inactive});
    }
    const adapters={gradescope,brightspace,pearson};
    const raw=login||!(['course','list'].includes(kind)||C.canInspectPearson(url))?[]:adapters[source](doc,roots,url,zone,now,course);
    if(!kind&&source==='pearson'&&raw.length)kind='list';
    const unique=new Map(raw.map(item=>[C.assignmentId(item),item]));
    const assignmentList=source==='pearson'&&query(roots,'tr,[role="row"]').some(row=>{const h=headersFor(row);return h.some(t=>/\bdue\b/i.test(t))&&h.some(t=>/assignment|homework/i.test(t));});
    return {source,pageURL:C.canonicalURL(url),title:C.clean(doc.title,160),kind,login,course,assignmentList,embedded:source==='pearson'&&!!query(roots,'iframe')[0],items:[...unique.values()].slice(0,500),links:[...links.values()].slice(0,150),message:login?'Sign in to continue.':`${unique.size} assignments read.`};
  }
  function openPearsonAssignments(doc,url){
    if(!C.allowedURL(url)||new URL(url).hostname!=='mylabmastering.pearson.com'||!C.courseId(url))return false;
    const target=query(allRoots(doc),'a,button,[role="link"]').find(el=>{
      if(hidden(el)||el.closest('form,table,[role="table"]')||!/^Assignments$/.test(text(el)))return false;
      const href=el.getAttribute('href'),destination=href?C.canonicalURL(href,url):'';
      return !href||href==='#'||!!(destination&&C.sourceFor(destination)==='pearson'&&C.pageKind(destination)&&C.courseId(destination)===C.courseId(url));
    });
    if(!target)return false;
    target.click();return true;
  }
  root.DNExtract={extract,statusOf,labelDate,allRoots,gradescopeDue,contextualTerm,openPearsonAssignments};
})(globalThis);
