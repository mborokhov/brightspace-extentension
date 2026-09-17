# Due North

A shareable Chrome/Edge extension for Purdue Brightspace, Gradescope, and MyLab Math. No API key, server, or build step. Each person uses their own school login and browser storage.

**Version 0.2.0 · beta.** Local tests cover the supplied layouts. Signed-in site layouts, especially Pearson, still need live verification.

## Install or update

1. Download/extract the project into a permanent folder.
2. Open `chrome://extensions` or `edge://extensions` and enable **Developer mode**.
3. Choose **Load unpacked**, then select `due-north/extension` (or `extension` inside the project ZIP).
4. Select the **folder**, not `manifest.json`. The folder chooser may show only the `icons` subfolder; this is normal.
5. Pin Due North and open it. Reload any school tabs already open.

For an existing installation pointing at this folder, click **Reload** on its extension card. If you moved the source folder, load the new `extension` folder. Avoid leaving two copies enabled. Keep the source folder in place while using the extension.

## Collect current assignments

1. Sign into Brightspace and Gradescope normally.
2. Visit your course lists. Brightspace: open **Assignments** and **Quizzes**. Gradescope: open each course assignment table. Allow several seconds to render; expand sections and visit additional pages yourself.
3. In Due North, open **Courses**. Courses labelled with the current semester are included automatically. If a site does not show a semester, confirm that course here once. Older or inactive courses are excluded from collection, sync, charts, and export.
4. Click **Sync** to revisit discovered current course/list pages. **Sync details** shows coverage and failures.
5. For MyLab Math, click **MyLab Math** and grant its optional site access. Open your course's **Homework and Tests** page, reload it, then confirm the course in **Courses** if needed. Embedded lists on supported Pearson hosts are included.

A sync checks up to 60 pages in background tabs. It does not start assignments or quizzes. Sign-in tabs may stay open so you can sign in normally and retry. Pages/sections that are not loaded must be opened manually.

Semester detection uses Spring (January–May), Summer (June–July), and Fall (August–December), in the configured course time zone. It checks course labels, not assignment due dates. Unlabelled courses are excluded until you select them. On upgrade from v0.1, existing records with no semester label require this confirmation; old records remain stored but hidden.

## Dashboard

- **Overview:** a Monday–Sunday chart of incomplete assignments, week navigation, and a searchable assignment list. Click a bar to filter by day.
- **Calendar:** month navigation and assignments on their due dates. Click an assignment to edit its deadline.
- **Edit date:** sets a local deadline, optionally without a time. Later syncs preserve it. **Use source date** restores the latest source deadline. Edits affect the chart, calendar, reminders, and export; they never modify the school site.
- **Completion:** checkboxes are local overrides. **Use source status** removes an override. On Brightspace quiz lists, any populated Evaluation Status cell means completed; attempts alone do not. “Not Submitted” assignments stay pending.
- **Dates:** Gradescope uses the right-hand due date, excluding the release date and late cutoff. Brightspace uses the “Due on” line under the assignment/quiz name.
- **Export .ics:** downloads a snapshot of all current-course incomplete assignments with readable dates. Google Calendar live sync is not implemented yet. Importing an .ics file does not create ongoing synchronization.

There are two navigation views: Overview and Calendar. Settings, course selection, and sync details open in dialogs.

## Share

Send the project ZIP or repository link. Friends load their own `extension` folder and use their own browser profile. The source contains no real assignments, cookies, credentials, or browser storage. No programming tools are needed for installation. This is an unpacked extension, not a published Chrome/Edge store listing. Firefox and Safari are not supported.

## Settings and limits

- Time zone defaults to `America/New_York`. Match the zone shown on your course pages. Explicit timestamp offsets take precedence. Local edits preserve their selected instant if you later change the display time zone.
- Missing times remain date-only; missing years are inferred and cannot trigger reminders until corrected. Unreadable deadlines remain undated and can be edited.
- Reminders are opt-in, checked about once per minute while the browser runs. Completed, past-due, undated/date-only, inferred-year, and more-than-seven-days-stale records are excluded. OS settings can suppress notifications.
- Partial scans do not delete assignments that disappeared from the page. Cross-platform duplicates remain separate; mark an unwanted duplicate complete locally.
- Only loaded list rows are read. Syllabus PDFs, announcements, closed shadow roots, and unsupported/custom layouts are outside coverage. MyLab Math support currently targets visible assignment tables/cards with due labels on the supported hosts; live verification of your signed-in layout remains necessary.
- Use one school account per browser profile. Before switching accounts, clear local data in Settings. Clearing pauses collection; enable it again after signing into the new account.

## Develop

No package dependencies are required. Node 20+ is only needed for developer commands:

```sh
npm test
npm run check
npm run preview
```

Dashboard preview: `http://127.0.0.1:4173/extension/dashboard.html`

Parser fixtures: `http://127.0.0.1:4173/tests/browser.html`

Outside the installed extension, the dashboard shows labelled sample data. Preview edits stay in memory. Real installations start empty. Reload the extension and school tabs after changing its files.

`extension/` contains the distributable app; `tests/` contains Node and browser fixtures; `scripts/` contains static checks and the preview server. See [TESTING.md](TESTING.md) and [PRIVACY.md](PRIVACY.md). MIT licensed. Independent project, not affiliated with Purdue, D2L, Gradescope, or Pearson.
