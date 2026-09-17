/* Shared, dependency-free logic. Also loaded by the Node test runner. */
(function (root) {
  'use strict';
  const PEARSON_HOSTS = ['mylabmastering.pearson.com', 'www.mathxl.com', 'mylab.pearson.com', 'xlitemprod.pearsoncmg.com'];
  const HOSTS = ['purdue.brightspace.com', 'www.gradescope.com', 'gradescope.com', ...PEARSON_HOSTS];
  const HOMES = ['https://purdue.brightspace.com/d2l/home', 'https://www.gradescope.com/'];
  const clean = (value, max = 500) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  function allowedURL(value) {
    try { const u = new URL(value); return u.protocol === 'https:' && HOSTS.includes(u.hostname) && !u.username && !u.password && !u.port; } catch { return false; }
  }
  function canonicalURL(value, base) {
    if(typeof value!=='string'||!value.trim())return '';
    try {
      const u = new URL(value, base);
      if (!allowedURL(u.href)) return '';
      u.hash = '';
      for (const key of [...u.searchParams.keys()]) if (!['ou', 'db', 'qi', 'isprv', 'cfql', 'contentid', 'courseid', 'course', 'homeworkid', 'assignmentid', 'testid'].includes(key.toLowerCase())) u.searchParams.delete(key);
      u.searchParams.sort();
      return u.href;
    } catch { return ''; }
  }
  const sourceFor = url => new URL(url).hostname.endsWith('brightspace.com') ? 'brightspace' : PEARSON_HOSTS.includes(new URL(url).hostname) ? 'pearson' : 'gradescope';
  // Embedded Pearson list routes vary. Inspect their DOM, but never crawl or read players.
  function canInspectPearson(value) {
    return allowedURL(value) && sourceFor(value)==='pearson' && !/player|launch|take(?:test|quiz)|review|question|answer|\/auth|\/login|\/signin/i.test(new URL(value).pathname);
  }
  function pageKind(value) {
    if (!allowedURL(value)) return '';
    const u = new URL(value), p = u.pathname;
    if (sourceFor(value) === 'pearson') {
      if (u.hostname === 'mylabmastering.pearson.com') {
        if (/^\/courses\/?$/i.test(p)) return 'home';
        if (/^\/courses\/\d+\/menu\/[\w-]+\/?$/i.test(p)) return 'list';
        if (/^\/courses\/\d+\/?$/i.test(p)) return 'course';
      }
      if (/player|launch|take(?:test|quiz)|review|question|answer/i.test(p)) return '';
      if (/\/(?:Student\/)?(?:DoAssignments|Assignments|HomeworkAndTests)(?:\.aspx)?\/?$/i.test(p) || /\/assignments\/?$/i.test(p)) return 'list';
      if (/\/(?:Student\/)?(?:CourseHome|CourseList|MyCourses)(?:\.aspx)?\/?$/i.test(p)) return 'course';
      return '';
    }
    if (sourceFor(value) === 'gradescope') {
      if (p === '/' || /^\/account\/?$/.test(p)) return 'home';
      if (/^\/courses\/\d+\/?$/.test(p)) return 'course';
      if (/^\/courses\/\d+\/assignments\/?$/.test(p)) return 'list';
      return '';
    }
    if (/^\/d2l\/home\/?$/i.test(p)) return 'home';
    if (/^\/d2l\/home\/\d+\/?$/i.test(p)) return 'course';
    if (/\/(folders_list|quizzes_list)\.d2l$/i.test(p)) return 'list';
    return '';
  }
  function courseId(url) {
    const u = new URL(url);
    return [...u.searchParams].find(([key]) => /^(ou|courseid|course)$/i.test(key))?.[1] || u.pathname.match(/\/(?:courses|home)\/([\w-]+)/)?.[1] || '';
  }
  function hash(text) { let h = 2166136261; for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  const isEventAlias = item => item.source==='brightspace' && (item.eventAlias===true || /^view\s+event\s*[-:–—]/i.test(clean(item.title)));
  function assignmentTitle(item) { return isEventAlias(item) ? clean(item.title).replace(/^view\s+event\s*[-:–—]\s*/i,'').replace(/\s*[-:–—]\s*due\s*$/i,'').trim() : clean(item.title,250); }
  function nativeAssignmentId(item) {
    if(isEventAlias(item))return '';
    const u=new URL(item.url);
    return item.nativeId || u.pathname.match(/\/assignments\/(\d+)/)?.[1] || [...u.searchParams].find(([key]) => /^(db|qi|homeworkid|assignmentid|testid)$/i.test(key))?.[1] || '';
  }
  function assignmentId(item) {
    const u = new URL(item.url), course = item.courseId || courseId(item.pageURL || item.url);
    const id = nativeAssignmentId(item);
    const type = item.type === 'quiz' || /quizz/i.test(u.pathname) ? 'quiz' : 'assignment';
    return `${item.source}:${course}:${type}:${id || hash(assignmentTitle(item).toLowerCase())}`;
  }
  function validZone(zone) { try { new Intl.DateTimeFormat('en', {timeZone: zone}).format(); return true; } catch { return false; } }
  function zoneParts(ms, zone) {
    return Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'}).formatToParts(ms).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  }
  function zonedISO(y, m, d, h, min, zone) {
    const target = Date.UTC(y, m - 1, d, h, min), check = new Date(target);
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d || h > 23 || min > 59) return null;
    const matches = new Set();
    // Sample offsets on both sides of a DST transition, then validate the wall time.
    for (const delta of [-86400000, 0, 86400000]) {
      const sample = target + delta, p = zoneParts(sample, zone);
      const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - sample;
      const candidate = target - offset, v = zoneParts(candidate, zone);
      if (v.year === y && v.month === m && v.day === d && v.hour === h && v.minute === min) matches.add(candidate);
    }
    return matches.size === 1 ? new Date([...matches][0]).toISOString() : null;
  }
  function parseDue(raw, zone = 'America/New_York', now = Date.now()) {
    const text = clean(raw), result = {dueAt: null, dueDate: null, dueRaw: text, dateNote: ''};
    if (!text || /^(?:—|-|none|no due date|n\/a)$/i.test(text)) return {...result, dateNote: 'No deadline listed'};
    if (!validZone(zone)) return {...result, dateNote: 'Invalid time zone'};
    const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(Z|[+-]\d{2}:?\d{2})\b/i);
    if (iso) {
      const [,year,month,day,hour,minute,second='00',fraction='',offset] = iso;
      const check = new Date(Date.UTC(+year,+month-1,+day));
      const normalized = `${year}-${month}-${day}T${hour}:${minute}:${second}${fraction?'.'+fraction:''}${offset.toUpperCase()}`;
      if (check.getUTCFullYear() === +year && check.getUTCMonth() === +month-1 && check.getUTCDate() === +day && +hour < 24 && +minute < 60 && +second < 60 && Number.isFinite(Date.parse(normalized))) return {...result,dueAt:new Date(normalized).toISOString()};
      return {...result,dateNote:'Invalid date — check source'};
    }
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const named = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i);
    const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2}|\d{2})\b/);
    const plainISO = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    let y, m, d, inferred = false;
    if (named) { m = months.indexOf(named[1].slice(0, 3).toLowerCase()) + 1; d = +named[2]; y = +named[3]; }
    else if (numeric) { m = +numeric[1]; d = +numeric[2]; y = numeric[3].length===2 ? 2000 + +numeric[3] : +numeric[3]; }
    else if (plainISO) { y = +plainISO[1]; m = +plainISO[2]; d = +plainISO[3]; }
    else return {...result, dateNote: 'Unrecognized deadline — check source'};
    if (!y) {
      inferred = true;
      const current = zoneParts(now, zone).year;
      y = [current - 1, current, current + 1].sort((a, b) => Math.abs(Date.UTC(a, m - 1, d) - now) - Math.abs(Date.UTC(b, m - 1, d) - now))[0];
    }
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return {...result, dateNote: 'Invalid date — check source'};
    const time = text.match(/(?:\b|T)(\d{1,2}):(\d{2})(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)?/i);
    if (!time) return {...result, dueDate: `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`, dateNote: inferred ? 'Time missing; year inferred — check source' : 'Time not listed — check source'};
    let hour = +time[1]; const minute = +time[2], meridiem = time[3]?.toLowerCase().replace(/\./g, '');
    if (meridiem && (hour < 1 || hour > 12)) return {...result, dateNote: 'Invalid time — check source'};
    if (meridiem) hour = hour % 12 + (meridiem === 'pm' ? 12 : 0);
    const fixed = {UTC:0, GMT:0, EST:-5, EDT:-4, CST:-6, CDT:-5, MST:-7, MDT:-6, PST:-8, PDT:-7};
    const suffix = text.match(/\b(UTC|GMT|EST|EDT|CST|CDT|MST|MDT|PST|PDT)\b/i)?.[1]?.toUpperCase();
    if (hour > 23 || minute > 59) return {...result, dateNote: 'Invalid time — check source'};
    const dueAt = suffix ? new Date(Date.UTC(y, m - 1, d, hour - fixed[suffix], minute)).toISOString() : zonedISO(y, m, d, hour, minute, zone);
    return {...result, dueAt, dateNote: !dueAt ? 'Ambiguous or invalid DST time — check source' : inferred ? 'Year inferred — verify before relying on reminders' : suffix ? '' : `Time interpreted in ${zone}`};
  }
  function parseTerm(value) {
    const text = clean(value,2000), match = text.match(/\b(Spring|Summer|Fall|Autumn)\s*[-/,:]?\s*(20\d{2})\b/i) || text.match(/\b(20\d{2})\s*[-/,:]?\s*(Spring|Summer|Fall|Autumn)\b/i)?.map((v,i,a) => i === 1 ? a[2] : i === 2 ? a[1] : v);
    if (!match) return null;
    const season = /fall|autumn/i.test(match[1]) ? 'Fall' : /^spring/i.test(match[1]) ? 'Spring' : 'Summer';
    return `${season} ${match[2]}`;
  }
  function currentTerm(now = Date.now(), zone = 'America/New_York') { const p = zoneParts(now,zone); return `${p.month <= 5 ? 'Spring' : p.month <= 7 ? 'Summer' : 'Fall'} ${p.year}`; }
  const courseKey = (source,id) => `${source}:${id}`;
  function emptyState() { return {schema:2,activeTerm:currentTerm(),courses:{},items:{},pages:{},sources:{},settings:{zone:'America/New_York',reminders:false,leadHours:24,collecting:true},job:null}; }
  function migrateState(input, now = Date.now()) {
    if (!input) return emptyState();
    const state = input;
    state.settings = {...emptyState().settings,...state.settings};
    state.activeTerm = currentTerm(now,state.settings.zone);
    state.courses ||= {}; state.items ||= {}; state.pages ||= {}; state.sources ||= {};
    if (state.schema !== 2) {
      for (const item of Object.values(state.items)) {
        const id = item.courseId || courseId(item.pageURL || item.url), key = courseKey(item.source,id);
        item.courseKey = key;
        if (!state.courses[key]) { const term = parseTerm(item.course); state.courses[key] = {key,source:item.source,id,title:item.course,term,enabled:term===state.activeTerm,url:item.pageURL || item.url}; }
        delete item.archived;
      }
      if (state.job?.running) { state.job.running = false; state.job.note = 'Choose your current courses, then sync.'; }
      state.schema = 2;
    }
    state.items=deduplicateItems(state.items);
    for(const item of Object.values(state.items))if(item.source==='pearson'&&!item.dueAt&&!item.dueDate&&item.dueRaw)Object.assign(item,parseDue(item.dueRaw,state.settings.zone,now));
    return state;
  }
  function isCourseActive(state,key) { const c = state.courses[key]; return !!(c?.enabled && !c.inactive && c.term === state.activeTerm); }
  function effective(item) { return item.dueOverride ? {...item,...item.dueOverride,dateNote:'Edited by you'} : item; }
  function activeItems(state) { return Object.values(state.items).filter(i => isCourseActive(state,i.courseKey || courseKey(i.source,i.courseId))).map(effective); }
  function manualDue(date, time, zone) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choose a valid date.');
    const parsed = parseDue(`${date}${time ? ' '+time : ''}`,zone);
    if (time && !parsed.dueAt || !time && !parsed.dueDate) throw new Error('Invalid or ambiguous time. Choose another time.');
    return {dueAt:parsed.dueAt,dueDate:parsed.dueDate};
  }
  function dateKey(value, zone) { const p = zoneParts(typeof value === 'number' ? value : Date.parse(value),zone); return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`; }
  function shiftDay(day, delta) { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+delta); return d.toISOString().slice(0,10); }
  function weekStart(now,zone) { const key = dateKey(now,zone), weekday = new Date(`${key}T12:00:00Z`).getUTCDay(); return shiftDay(key,-((weekday+6)%7)); }
  function weekCounts(items,start,zone) { return Array.from({length:7},(_,i) => { const day = shiftDay(start,i); return {day,count:items.filter(item => { const e = effective(item); return !isDone(e) && (e.dueAt ? dateKey(e.dueAt,zone) : e.dueDate) === day; }).length}; }); }
  function isDone(item) { return item.completionOverride ? item.completionOverride === 'done' : ['submitted','graded'].includes(item.status); }
  function combineDuplicates(keeper,alias) {
    const merged={...keeper,firstSeen:Math.min(keeper.firstSeen||Infinity,alias.firstSeen||Infinity),lastSeen:Math.max(keeper.lastSeen||0,alias.lastSeen||0)};
    if(!alias.eventAlias&&(alias.lastSeen||0)>(keeper.lastSeen||0)){
      if(alias.dueRaw)for(const field of ['dueAt','dueDate','dueRaw','dateNote'])merged[field]=alias[field];
      if(alias.status&&alias.status!=='unknown')merged.status=alias.status;
    }
    for(const [field,stamp] of [['dueOverride','dueOverrideUpdatedAt'],['completionOverride','completionUpdatedAt']]){
      if((alias[stamp]||0)>(keeper[stamp]||0)||(!keeper[field]&&!keeper[stamp])){merged[field]=alias[field]??keeper[field];merged[stamp]=alias[stamp]||keeper[stamp];}
    }
    merged.remindedFor=keeper.remindedFor||alias.remindedFor;
    return merged;
  }
  function deduplicateItems(items) {
    const next={},groups=new Map();
    for(const [key,original] of Object.entries(items)){
      const item={...original,eventAlias:isEventAlias(original),title:assignmentTitle(original)};
      next[key]=item;
      const course=item.courseId||courseId(item.pageURL||item.url);
      if(!course)continue;
      const group=JSON.stringify([item.source,course,item.title.toLowerCase()]);
      if(!groups.has(group))groups.set(group,[]);groups.get(group).push(key);
    }
    for(const keys of groups.values()){
      // Strong native IDs are never merged with another different native ID.
      for(const key of keys){
        const item=next[key];if(!item||nativeAssignmentId(item))continue;
        const type=item.type==='quiz'||/quizz/i.test(item.url)?'quiz':'assignment';
        let matches=keys.filter(k=>k!==key&&next[k]&&!next[k].eventAlias&&(nativeAssignmentId(next[k])||item.eventAlias)&&
          (item.eventAlias||type===(next[k].type==='quiz'||/quizz/i.test(next[k].url)?'quiz':'assignment')));
        if(matches.length>1)matches=matches.filter(k=>(item.dueAt||item.dueDate)&&((next[k].dueAt||next[k].dueDate)===(item.dueAt||item.dueDate)));
        if(matches.length!==1)continue;
        const target=matches[0];next[target]=combineDuplicates(next[target],item);delete next[key];
      }
    }
    return next;
  }
  function mergeItems(existing, incoming, now = Date.now()) {
    const next = {...existing};
    for (const item of incoming) {
      if (!allowedURL(item.url) || !clean(item.title) || !['brightspace','gradescope','pearson'].includes(item.source)) continue;
      const id = assignmentId(item), old = next[id];
      next[id] = {...item, id, firstSeen: old?.firstSeen || now, lastSeen: now, completionOverride: old?.completionOverride || '', dueOverride: old?.dueOverride || null, dueOverrideUpdatedAt:old?.dueOverrideUpdatedAt,completionUpdatedAt:old?.completionUpdatedAt,remindedFor:old?.remindedFor,
        previousDue: old && (old.dueAt !== item.dueAt || old.dueDate !== item.dueDate) ? old.dueAt || old.dueDate || '' : old?.previousDue || '',
        changedAt: old && (old.dueAt !== item.dueAt || old.dueDate !== item.dueDate) ? now : old?.changedAt || null};
    }
    return deduplicateItems(next);
  }
  function dueReminders(state, now = Date.now()) {
    if (!state.settings.reminders) return [];
    return activeItems(state).filter(i => !isDone(i) && i.dueAt && !/inferred/i.test(i.dateNote) && now - i.lastSeen < 7 * 86400000 && Date.parse(i.dueAt) > now && Date.parse(i.dueAt) - now <= state.settings.leadHours * 3600000 && i.remindedFor !== i.dueAt);
  }
  function escapeICS(text) { return String(text || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g,'\\;').replace(/,/g,'\\,'); }
  function foldICS(line) {
    const lines = []; let current = '', length = 0;
    for (const ch of line) { const size = new TextEncoder().encode(ch).length; if (length + size > 75) { lines.push(current); current = ' '; length = 1; } current += ch; length += size; }
    lines.push(current); return lines.join('\r\n');
  }
  function calendar(items, now = Date.now()) {
    const stamp = new Date(now).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
    const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Due North//Assignment Tracker//EN','CALSCALE:GREGORIAN'];
    for (const item of items.map(effective).filter(i => !isDone(i) && (i.dueAt || i.dueDate))) {
      lines.push('BEGIN:VEVENT', `UID:${item.id}@due-north.local`, `DTSTAMP:${stamp}`);
      if (item.dueAt) lines.push(`DTSTART:${item.dueAt.replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`);
      else lines.push(`DTSTART;VALUE=DATE:${item.dueDate.replace(/-/g,'')}`);
      lines.push(`SUMMARY:${escapeICS(`${item.course}: ${item.title}`)}`, `DESCRIPTION:${escapeICS(`Deadline snapshot from ${item.source}. ${item.dateNote || ''}\n${item.dueRaw}\nCheck the source for updates.\n${item.url}`)}`, `URL:${item.url}`, 'END:VEVENT');
    }
    lines.push('END:VCALENDAR'); return lines.map(foldICS).join('\r\n') + '\r\n';
  }
  const api = {HOSTS,PEARSON_HOSTS,HOMES,clean,allowedURL,canonicalURL,sourceFor,pageKind,canInspectPearson,courseId,hash,assignmentId,assignmentTitle,isEventAlias,deduplicateItems,validZone,parseDue,zonedISO,emptyState,isDone,mergeItems,dueReminders,calendar,parseTerm,currentTerm,courseKey,migrateState,isCourseActive,effective,activeItems,manualDue,dateKey,shiftDay,weekStart,weekCounts};
  root.DNCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
