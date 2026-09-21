# Validation record — v0.3.0

## Verified

- **56 Node tests**: URL boundaries; safe page routes; timezone/DST/date parsing; stable IDs; local completion and deadline preservation; reminders and calendar export; current-semester migration and rollover; week counts across midnight; serialized writes; sender validation; sync queue restrictions/recovery; sign-in handling; user-tab preservation; optional Pearson registration; embedded-frame course association and parent-page waiting; collection timing and mutation handling.
- **26 browser DOM fixtures**: release/due/late date selection including the supplied Gradescope timeline; Brightspace quiz names, inline due dates and populated Evaluation Status; Not Submitted assignments with JavaScript links; unreadable dates; course term sections; hidden rows, shadow roots and duplicates; MyLab due/status/progress columns, plain names, completion icons and stable IDs.
- **Static checks**: JavaScript syntax, manifest/assets, no inline scripts, scoped host access. Git whitespace check passes.
- **Interactive sample dashboard**: two navigation views; deadline editing updates list/chart/calendar; restore source date; completion and Completed filter; search; month navigation; current-course dialog excludes older courses; invalid timezone rejection; first-install empty state. Overview and Calendar visually inspected; no console errors observed during these checks.

Tests use synthetic DOM fixtures and mocked Chrome APIs. They do not establish end-to-end success against a signed-in account or prove that every site layout is covered. The available browser blocked navigation to Pearson (`ERR_BLOCKED_BY_CLIENT`), so its authenticated assignment DOM could not be verified. Notification delivery and optional permission prompts need the installed Chrome/Edge extension.

## v0.2.1 regression checks

Screenshot-derived fixtures cover MyLab’s Due-first table with `09/06/26 11:59pm`, course headers, Course Home date badges, varying embedded list routes, and Brightspace View Event duplicates. Tests verify existing-record cleanup, edit preservation, ambiguity protection, cross-course/site separation, player exclusion, and navigation limited to temporary sync tabs. Screenshots establish visible layout requirements; the actual authenticated DOM remains unverified.

## v0.3.0 regression checks

- Preserved Brightspace group parameters and singular submission routes; legacy-link course fallback and worker recovery from a 500 error.
- Native-ID rename reconciliation, explicit resets, removed source deadlines, custom-date baselines, and timezone changes.
- Successful/unchanged/empty versus unreadable/partial/sign-in outcomes; failed reads retain the prior success timestamp. Discovery alone does not count as an assignment sync.
- Fresh open-tab reuse, stale-reader background refresh, request matching, two-minute cache bypass, and borrowed-tab preservation on Stop/Clear.
- DOM checks for partial/empty diagnostics, missed rows, MyLab td headers, and error pages.
- Sample dashboard visually checked for stale/partial source state and simultaneous source/custom dates. Restoring the source date updated the list and weekly counts. Calendar and Sync details opened correctly; no console errors observed. Exactly two navigation views remain.

## Reproduce

```sh
npm test
npm run check
npm run preview
```

Open `http://127.0.0.1:4173/tests/browser.html` for the DOM fixtures. The sample dashboard is at `/extension/dashboard.html`; append `?empty` to inspect a fresh installation's empty state or `?changes` for a custom/source date conflict and stale sync example. Sample edits stay in memory.

## Live acceptance

1. Reload the unpacked extension and your school tabs. Check for extension errors.
2. Open current course lists and select unlabelled current classes in Courses. Confirm previous-semester courses are absent from the dashboard and sync queue.
3. Compare Gradescope's right-hand due date (not release or late cutoff), Brightspace quiz names/Due on lines/Evaluation Status, and Not Submitted assignment rows.
4. Edit a deadline, sync again, and confirm the edit persists in the list, chart, calendar and exported .ics. Restore the source date.
5. Enable MyLab Math's optional access and reload Homework and Tests. Confirm the course if needed. Compare titles, due dates and status with the portal/embedded table. Unsupported layouts need a redacted fixture and adapter update.
6. Check paginated lists, sign-in expiry and sync details. Try reminders while the browser is running; browser/OS settings may suppress notifications.
7. Reload the extension; local choices should persist. A fresh browser profile starts empty. The source ZIP contains no user storage.

Do not add credentials, account pages, submitted work, browser profiles, or private calendar exports to test fixtures or the shared project.
