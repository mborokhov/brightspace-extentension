/* Shared, dependency-free logic. Also loaded by the Node test runner. */
(function (root) {
  'use strict';
  const HOSTS = ['purdue.brightspace.com', 'www.gradescope.com', 'gradescope.com'];
  const HOMES = ['https://purdue.brightspace.com/d2l/home', 'https://www.gradescope.com/'];
  const clean = (value, max = 500) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  function allowedURL(value) {
    try { const u = new URL(value); return u.protocol === 'https:' && HOSTS.includes(u.hostname) && !u.username && !u.password && !u.port; } catch { return false; }
  }
  function canonicalURL(value, base) {
    try {
      const u = new URL(value, base);
      if (!allowedURL(u.href)) return '';
      u.hash = '';
      for (const key of [...u.searchParams.keys()]) if (!['ou', 'db', 'qi', 'isprv', 'cfql', 'contentId'].includes(key)) u.searchParams.delete(key);
      u.searchParams.sort();
      return u.href;
    } catch { return ''; }
  }
  const sourceFor = url => new URL(url).hostname.endsWith('brightspace.com') ? 'brightspace' : 'gradescope';
  function pageKind(value) {
    if (!allowedURL(value)) return '';
    const u = new URL(value), p = u.pathname;
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
    return u.searchParams.get('ou') || u.pathname.match(/\/(?:courses|home)\/(\d+)/)?.[1] || '';
  }
  function hash(text) { let h = 2166136261; for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  function assignmentId(item) {
    const u = new URL(item.url), course = item.courseId || courseId(item.pageURL || item.url);
    const id = u.pathname.match(/\/assignments\/(\d+)/)?.[1] || u.searchParams.get('db') || u.searchParams.get('qi');
    const type = /quizz/i.test(u.pathname) ? 'quiz' : 'assignment';
    return `${item.source}:${course}:${type}:${id || hash(clean(item.title).toLowerCase())}`;
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
    const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
    const plainISO = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    let y, m, d, inferred = false;
    if (named) { m = months.indexOf(named[1].slice(0, 3).toLowerCase()) + 1; d = +named[2]; y = +named[3]; }
    else if (numeric) { m = +numeric[1]; d = +numeric[2]; y = +numeric[3]; }
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
  function emptyState() { return {schema: 1, items: {}, pages: {}, sources: {}, settings: {zone: 'America/New_York', reminders: false, leadHours: 24, collecting: true}, job: null}; }
  function isDone(item) { return item.completionOverride ? item.completionOverride === 'done' : ['submitted','graded'].includes(item.status); }
  function mergeItems(existing, incoming, now = Date.now()) {
    const next = {...existing};
    for (const item of incoming) {
      if (!allowedURL(item.url) || !clean(item.title) || !['brightspace','gradescope'].includes(item.source)) continue;
      const id = assignmentId(item), old = next[id];
      next[id] = {...item, id, firstSeen: old?.firstSeen || now, lastSeen: now, completionOverride: old?.completionOverride || '', archived: old?.archived || false,
        previousDue: old && (old.dueAt !== item.dueAt || old.dueDate !== item.dueDate) ? old.dueAt || old.dueDate || '' : old?.previousDue || '',
        changedAt: old && (old.dueAt !== item.dueAt || old.dueDate !== item.dueDate) ? now : old?.changedAt || null};
    }
    return next;
  }
  function dueReminders(state, now = Date.now()) {
    if (!state.settings.reminders) return [];
    return Object.values(state.items).filter(i => !i.archived && !isDone(i) && i.dueAt && !/inferred/i.test(i.dateNote) && now - i.lastSeen < 7 * 86400000 && Date.parse(i.dueAt) > now && Date.parse(i.dueAt) - now <= state.settings.leadHours * 3600000 && i.remindedFor !== i.dueAt);
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
    for (const item of items.filter(i => !i.archived && !isDone(i) && (i.dueAt || i.dueDate))) {
      lines.push('BEGIN:VEVENT', `UID:${item.id}@due-north.local`, `DTSTAMP:${stamp}`);
      if (item.dueAt) lines.push(`DTSTART:${item.dueAt.replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`);
      else lines.push(`DTSTART;VALUE=DATE:${item.dueDate.replace(/-/g,'')}`);
      lines.push(`SUMMARY:${escapeICS(`${item.course}: ${item.title}`)}`, `DESCRIPTION:${escapeICS(`Deadline snapshot from ${item.source}. ${item.dateNote || ''}\n${item.dueRaw}\nCheck the source for updates.\n${item.url}`)}`, `URL:${item.url}`, 'END:VEVENT');
    }
    lines.push('END:VCALENDAR'); return lines.map(foldICS).join('\r\n') + '\r\n';
  }
  const api = {HOSTS,HOMES,clean,allowedURL,canonicalURL,sourceFor,pageKind,courseId,hash,assignmentId,validZone,parseDue,zonedISO,emptyState,isDone,mergeItems,dueReminders,calendar};
  root.DNCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
