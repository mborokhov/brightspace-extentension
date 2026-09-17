# Validation record — v0.2.0

## Verified

- **34 Node tests**: URL boundaries; safe page routes; timezone/DST/date parsing; stable IDs; local completion and deadline preservation; reminders and calendar export; current-semester migration and rollover; week counts across midnight; serialized writes; sender validation; sync queue restrictions/recovery; sign-in handling; user-tab preservation; optional Pearson registration; embedded-frame course association and parent-page waiting; collection timing and mutation handling.
- **17 browser DOM fixtures**: release/due/late date selection including the supplied Gradescope timeline; Brightspace quiz names, inline due dates and populated Evaluation Status; Not Submitted assignments with JavaScript links; unreadable dates; course term sections; hidden rows, shadow roots and duplicates; MyLab due/status/progress columns, plain names, completion icons and stable IDs.
- **Static checks**: JavaScript syntax, manifest/assets, no inline scripts, scoped host access. Git whitespace check passes.
- **Interactive sample dashboard**: two navigation views; deadline editing updates list/chart/calendar; restore source date; completion and Completed filter; search; month navigation; current-course dialog excludes older courses; invalid timezone rejection; first-install empty state. Overview and Calendar visually inspected; no console errors observed during these checks.

Tests use synthetic DOM fixtures and mocked Chrome APIs. They do not establish end-to-end success against a signed-in account or prove that every site layout is covered. The supplied Pearson portal URL redirected to sign-in in the available browser, so its live assignment DOM could not be verified. Notification delivery and optional permission prompts need the installed Chrome/Edge extension.

## Reproduce

```sh
npm test
npm run check
npm run preview
```

Open `http://127.0.0.1:4173/tests/browser.html` for the DOM fixtures. The sample dashboard is at `/extension/dashboard.html`; append `?empty` to inspect a fresh installation's empty state. Sample edits stay in memory.

## Live acceptance

1. Reload the unpacked extension and your school tabs. Check for extension errors.
2. Open current course lists and select unlabelled current classes in Courses. Confirm previous-semester courses are absent from the dashboard and sync queue.
3. Compare Gradescope's right-hand due date (not release or late cutoff), Brightspace quiz names/Due on lines/Evaluation Status, and Not Submitted assignment rows.
4. Edit a deadline, sync again, and confirm the edit persists in the list, chart, calendar and exported .ics. Restore the source date.
5. Enable MyLab Math's optional access and reload Homework and Tests. Confirm the course if needed. Compare titles, due dates and status with the portal/embedded table. Unsupported layouts need a redacted fixture and adapter update.
6. Check paginated lists, sign-in expiry and sync details. Try reminders while the browser is running; browser/OS settings may suppress notifications.
7. Reload the extension; local choices should persist. A fresh browser profile starts empty. The source ZIP contains no user storage.

Do not add credentials, account pages, submitted work, browser profiles, or private calendar exports to test fixtures or the shared project.
