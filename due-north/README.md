# Due North

A shareable Chrome/Edge extension that brings Purdue Brightspace and Gradescope assignments into one local dashboard. **No API key, server, subscription, or extra login.** Each user signs into the school sites normally.

**Version 0.1.0 · beta.** Core logic, the background worker, synthetic DOM fixtures, and the dashboard have been tested. The current live Purdue and Gradescope page layouts still need validation with a signed-in student account. Check collected deadlines against the original sites before relying on them.

## Install — no programming tools required

1. Extract `due-north-v0.1.0.zip` into a permanent folder.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable **Developer mode**.
4. Click **Load unpacked** and choose the **extension** folder containing `manifest.json`.
5. Pin Due North from the Extensions menu. Click the arrow icon to open the dashboard.
6. Reload any Brightspace/Gradescope tabs you had open before installation.

You do **not** need Node, Python, an API key, or a build step to install this extension. Keep the extracted folder; the browser loads the files from there. Managed browsers may disallow unpacked extensions. Firefox/Safari are not supported by this package.

## First collection

1. Sign in to Purdue Brightspace and Gradescope, including your usual MFA.
2. Visit each course. In Brightspace, open the **Assignments** and **Quizzes** lists. In Gradescope, open the course’s assignment table. Give the page several seconds to load.
3. Open additional pages in paginated lists and expand sections yourself. The extension only sees rows loaded into the page.
4. Check **Sync coverage** in the dashboard. Compare titles, times, and submission states with the original pages.
5. Use **Sync courses** to revisit discovered course/list links. A run checks at most 60 pages in temporary background tabs. Sign-in redirects may leave a tab open; sign in there and retry.

The initial home-page scan may discover your courses automatically. If a course or tool is missing, visit its assignment/quiz list manually. Sync has no special access to hidden, unreleased, or unlisted information.

## Included features

- Brightspace assignment/quiz list and Gradescope assignment table readers.
- A combined dashboard with course/search filters, next-week view, overdue count, and date-review view.
- Source links, readable sync coverage, stale-data labels, and changed-deadline notices.
- Personal completion marks and reversible archiving. These never modify the school sites.
- Optional desktop reminders using saved deadlines while the browser is running.
- `.ics` calendar **snapshot** export. It is not a live calendar subscription.
- Configurable course time zone, collection pause, and local data reset.

## Share it

Send friends the **original project ZIP**. They extract it, load its `extension` folder, and use their own browser profiles and school logins. User data lives in browser storage, not the project folder. This ZIP contains code, icons, documentation, tests, and explicitly labelled sample preview data; it contains no real assignments, credentials, cookies, or tokens.

This edition supports `purdue.brightspace.com`, `www.gradescope.com`, and `gradescope.com`. Other schools’ Brightspace hosts require an explicit code/permission update.

For one-click public installation, the extension would need to be submitted to Chrome Web Store/Edge Add-ons and pass review. This package has not been published to a store.

## Dates, accounts, and limitations

- **Time zone:** Defaults to `America/New_York`. Match this to the timezone shown by your course sites. Explicit offsets in machine timestamps take precedence. Displayed dates use the dashboard’s configured zone.
- **Missing year/time:** A missing year is inferred from the nearest date and flagged; no reminder is sent for it. A missing time remains date-only. Unrecognized or DST-ambiguous dates need source review.
- **Completion:** Submitted/graded rows can count as done. An unknown status stays open. Your checkbox is a local override; **Use source** removes it.
- **Duplicates:** An assignment listed on both platforms stays as separate records. Archive a duplicate if appropriate; automatic cross-platform merging can hide conflicting deadlines.
- **Disappearing records:** A scan does not delete unseen assignments. Archive old work yourself. This avoids losing records because a page only loaded partially.
- **No full-coverage guarantee:** It does not parse syllabus PDFs, announcements, third-party homework sites, or every Brightspace layout. Closed shadow roots and unusual/custom list markup can need adapter changes.
- **Session expiry:** Collection requires a normal authenticated browser session. There is no password, cookie extraction, login automation, or MFA bypass.
- **Account separation:** Use one school account per browser profile. Clear local data before switching accounts. Clearing pauses collection, so old open tabs do not immediately repopulate it. Re-enable collection in Settings after changing accounts.
- **Notifications:** Opt-in, once per due date, approximately once per minute while the browser is running. Stale (>7 days), completed, archived, date-only, inferred-year, and past-due records are excluded. OS settings can suppress notifications.

## Develop and test

There are no runtime or development dependencies to install. Node 20+ is needed only for these developer commands:

```sh
npm test
npm run check
npm run preview
```

Preview: `http://127.0.0.1:4173/extension/dashboard.html`

DOM fixture tests: `http://127.0.0.1:4173/tests/browser.html`

Opening the dashboard outside the installed extension shows an **interactive sample preview**, with a prominent banner. Preview changes stay in memory, do not scrape sites, and do not send notifications. A real extension installation starts with an empty workspace.

After editing extension files, click **Reload** on its Extensions page, then reload relevant school tabs. Existing local records normally persist across reloads. Removing the extension deletes its local storage.

## Project layout

```text
extension/                 Load this folder into Chrome/Edge
  manifest.json            Scoped permissions and Manifest V3 entry points
  core.js                  URL allowlist, date parsing, merge rules, reminders, ICS
  extractors.js            DOM adapters for the two sites
  content.js               Debounced page collection
  background.js            Serialized storage, persisted sync queue, notifications
  dashboard.*              Local dashboard and labelled sample preview
  help.html                Offline setup, sharing, and privacy guide
tests/                     Node tests and browser DOM fixtures
scripts/                   Validation and localhost preview server
```

See `TESTING.md` for validation scope and the remaining live-account checklist, and `PRIVACY.md` for data handling. MIT licensed. Independent project, not affiliated with Purdue, D2L, or Gradescope.

## Reference documentation

- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome local storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Loading an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world)
- [Gradescope student dashboard](https://guides.gradescope.com/hc/en-us/articles/33110246442637-Student-Dashboard)
