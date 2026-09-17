(function (root) {
  'use strict';
  const C = root.DNCore;
  function allRoots(doc) {
    const roots = [doc];
    for (let n = 0; n < roots.length && n < 150; n++) for (const el of roots[n].querySelectorAll('*')) if (el.shadowRoot) roots.push(el.shadowRoot);
    return roots;
  }
  const query = (roots, selector) => roots.flatMap(r => [...r.querySelectorAll(selector)]);
  function text(el) { return C.clean(el?.innerText || el?.textContent || '', 1500); }
  function hidden(el) { return !!el.closest('[hidden],[aria-hidden="true"],template') || /display\s*:\s*none/i.test(el.getAttribute('style') || ''); }
  function labelDate(container) {
    if (!container) return '';
    const times = [...container.querySelectorAll('time[datetime]')];
    for (const time of times) {
      const context = text(time.parentElement);
      if (/\bdue(?:\s+on|\s+date)?\b/i.test(context) && !/\b(?:late|available|starts|ends)\b/i.test(context)) return time.getAttribute('datetime');
    }
    const blocks = [...container.querySelectorAll('time,[title],[aria-label],span,div,p')];
    const candidates = blocks.flatMap(el => [el.getAttribute('title'), el.getAttribute('aria-label'), text(el)]).filter(Boolean);
    candidates.push(text(container));
    for (const candidate of candidates.sort((a,b) => a.length - b.length)) {
      const match = candidate.match(/\bDue(?:\s+Date)?(?:\s+on)?\s*[:\-]?\s*(.+?)(?=\s+(?:Available|Starts|Ends|Late|Closes|Until|Submission|Not submitted)\b|$)/i);
      if (match && !/^date$/i.test(match[1]) && !/\blate\s+due/i.test(candidate.slice(0, candidate.indexOf(match[0]) + 5))) return match[1];
    }
    return '';
  }
  function statusOf(raw) {
    const value = C.clean(raw).toLowerCase();
    if (/no submission|not submitted|not started|unsubmitted|0 submissions|0 files/.test(value)) return 'not-submitted';
    if ((!/not graded|ungraded/.test(value) && /\bgraded\b/.test(value)) || /\d+(?:\.\d+)?\s*\/\s*\d+/.test(value)) return 'graded';
    if (/submitted|submission received|\b[1-9]\d* (?:submissions?|files?)\b/.test(value)) return 'submitted';
    return 'unknown';
  }
  function headersFor(row) {
    const table = row.closest('table,[role="table"]');
    if (!table) return [];
    let headers = [...table.querySelectorAll('thead th,thead td,[role="columnheader"]')];
    if (!headers.length) headers = [...table.querySelectorAll('tr:first-child th')];
    return headers.map(text);
  }
  function courseName(roots, doc, url) {
    const explicit = query(roots, '[data-course-name],.courseHeader--title,.course-header h1,.course-title,.d2l-navigation-s-title-container a,d2l-navigation-main-header a')[0];
    let title = explicit?.getAttribute('data-course-name') || text(explicit);
    if (!title) {
      const heading = query(roots, 'h1').map(text).find(t => !/^(assignments?|quizzes|gradescope|brightspace|home)$/i.test(t));
      title = heading || C.clean(doc.title).replace(/\s*[|–-]\s*(Gradescope|Brightspace).*$/i, '').replace(/^(Assignments|Quizzes)\s*[-–|]\s*/i, '');
    }
    if (/^(assignments?|quizzes|gradescope|brightspace|home)$/i.test(title)) title = '';
    return C.clean(title || `Course ${C.courseId(url) || 'unknown'}`, 160);
  }
  function gradescope(doc, roots, url, zone, now) {
    const items = [], course = courseName(roots, doc, url), id = C.courseId(url);
    for (const row of query(roots, 'tr,[role="row"]')) {
      if (hidden(row)) continue;
      const anchor = [...row.querySelectorAll('a[href]')].find(a => /\/courses\/\d+\/assignments\/\d+/.test(a.getAttribute('href')));
      const cells = [...row.querySelectorAll(':scope > td,:scope > th,:scope > [role="cell"]')];
      const headers = headersFor(row);
      const dueIndex = headers.findIndex(h => /due/i.test(h) && !/late/i.test(h));
      // Only actual assignment rows: a linked assignment or a named row in the assignment table.
      const assignmentTable = row.closest('#assignments-student-table,table[data-assignments]');
      if (!anchor && !(assignmentTable && dueIndex >= 0 && row.querySelector('td'))) continue;
      const title = text(anchor) || text(cells[0]);
      if (!title || /^(name|assignment|assignment name)$/i.test(title)) continue;
      const dueCell = dueIndex >= 0 ? cells[dueIndex] : row.querySelector('.due-date,.dueDate,[data-due-date]');
      let raw = '';
      if (dueCell) {
        const times = [...dueCell.querySelectorAll('time[datetime]')];
        // Some layouts put ordinary + late deadlines in the same cell. First is the ordinary deadline.
        raw = times[0]?.getAttribute('datetime') || dueCell.getAttribute('data-due-date') || text(dueCell).split(/late(?:\s+due)?(?:\s+date)?\s*:?/i)[0];
      }
      if (!raw) raw = labelDate(row);
      const statusIndex = headers.findIndex(h => /status|submission/i.test(h));
      const status = statusOf(statusIndex >= 0 ? text(cells[statusIndex]) : text(row.querySelector('.submissionStatus,.submission-status,[data-status]')));
      const link = C.canonicalURL(anchor?.getAttribute('href') || url, url);
      if (!link || C.sourceFor(link) !== 'gradescope') continue;
      items.push({source: 'gradescope', title: C.clean(title,250), course, courseId: id, url: link, pageURL: C.canonicalURL(url), status, ...C.parseDue(raw,zone,now)});
    }
    return items;
  }
  function brightspace(doc, roots, url, zone, now) {
    const items = [], course = courseName(roots, doc, url), id = C.courseId(url);
    const anchors = query(roots,'a[href]');
    for (const anchor of anchors) {
      const href = C.canonicalURL(anchor.getAttribute('href'),url);
      if (!href || C.sourceFor(href) !== 'brightspace' || hidden(anchor)) continue;
      const u = new URL(href);
      const assignment = /folders_submit_files\.d2l/i.test(u.pathname) && u.searchParams.has('db');
      const quiz = /quizzing/i.test(u.pathname) && u.searchParams.has('qi') && !/attempt|results/i.test(u.pathname);
      if (!assignment && !quiz) continue;
      const row = anchor.closest('tr,[role="row"],d2l-list-item,.d2l-datalist-item');
      if (!row || hidden(row)) continue;
      const title = text(anchor);
      if (!title || /^(view|open|submit|start|continue|feedback)$/i.test(title)) continue;
      const headers = headersFor(row), cells = [...row.querySelectorAll(':scope > td,:scope > th,:scope > [role="cell"]')];
      const dueIndex = headers.findIndex(h => /due/i.test(h) && !/end|late/i.test(h));
      const dueCell = dueIndex >= 0 ? cells[dueIndex] : null;
      let raw = dueCell ? dueCell.querySelector('time[datetime]')?.getAttribute('datetime') || text(dueCell) : '';
      if (!raw) raw = labelDate(row);
      const statusIndex = headers.findIndex(h => /completion|submission|status/i.test(h));
      const status = statusOf(statusIndex >= 0 ? text(cells[statusIndex]) : text(row.querySelector('.d2l-assignment-status,[data-status]')));
      items.push({source:'brightspace', title:C.clean(title,250), course, courseId:id || C.courseId(href), url:href, pageURL:C.canonicalURL(url), status, ...C.parseDue(raw,zone,now)});
    }
    return items;
  }
  function extract(doc, url, settings = {}, now = Date.now()) {
    if (!C.allowedURL(url)) throw new Error('Unsupported site');
    const roots = allRoots(doc), zone = settings.zone || 'America/New_York', source = C.sourceFor(url);
    const login = !!query(roots,'input[type="password"]')[0] || /\/(login|signin|auth)(?:\/|$)/i.test(new URL(url).pathname);
    const kind = C.pageKind(url), links = new Map();
    for (const el of query(roots,'a[href],d2l-course-card[href]')) {
      if (hidden(el)) continue;
      const href = C.canonicalURL(el.getAttribute('href'),url);
      if (href && C.sourceFor(href) === source && C.pageKind(href)) links.set(href,{url:href,title:C.clean(text(el) || el.getAttribute('text') || 'Course page',160),source});
    }
    const raw = login || !['course','list'].includes(kind) ? [] : source === 'gradescope' ? gradescope(doc,roots,url,zone,now) : brightspace(doc,roots,url,zone,now);
    const unique = new Map(raw.map(item => [C.assignmentId(item),item]));
    return {source,pageURL:C.canonicalURL(url),title:C.clean(doc.title,160),kind,login,items:[...unique.values()].slice(0,500),links:[...links.values()].slice(0,150),
      message: login ? 'Sign in, then visit your course assignment list.' : !kind ? 'This page is not an assignment list.' : !unique.size ? 'No readable assignments on this page. Open the course Assignments or Quizzes list; check pagination and hidden courses.' : `${unique.size} assignments read. Only items loaded on this page were checked.`};
  }
  root.DNExtract = {extract,statusOf,labelDate,allRoots};
})(globalThis);
