# Validation record — v0.7.1

## Verified

- **126 Node tests**: URL boundaries; safe page routes; timezone/DST/date parsing; stable IDs; local completion and deadline preservation; reminders and calendar export; current-semester migration and rollover; week counts across midnight; serialized writes; sender validation; sync queue restrictions/recovery; sign-in handling; user-tab preservation; optional Pearson registration; embedded-frame course association and parent-page waiting; collection timing and mutation handling.
- **29 browser DOM fixtures**: release/due/late date selection including the supplied Gradescope timeline; Brightspace quiz names, inline due dates and populated Evaluation Status; Not Submitted assignments with JavaScript links; unreadable dates; course term sections; hidden rows, shadow roots and duplicates; MyLab due/status/progress columns, plain names, completion icons and stable IDs.
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

## v0.4.0 regression checks

- Background transport: credentialed read-only requests, manual redirect handling, HTML-only parsing, response size limits, parser reuse, cancellation, login detection, and HTTP error reporting.
- Zero-tab completion for readable selected courses; a single temporary tab reused across rendered pages and closed on completion.
- Existing tabs remain unchanged; unreadable existing pages fall back to rendering. User activation or closure relinquishes the temporary tab without spawning replacements.
- Sign-in failures skip the remaining pages on that source. Stop/Clear abort requests; old responses and old document tokens cannot advance a new page.
- The offscreen parser validates internal messages and parses detached documents under a restrictive content policy. Chrome API behavior is mocked in Node; the existing 26 browser fixtures exercise actual DOMParser extraction.

The available browser has no signed-in school tabs. Real Chrome/Edge offscreen lifecycle, session-cookie behavior, and live Brightspace/Gradescope/Pearson responses still need installed-extension verification. Background reads can legitimately fall back to the one-tab renderer.

## v0.5.0 regression checks

- Manual tasks: timed/date-only/undated, current courses or Personal, safe optional links, edit/completion persistence, soft deletion/restore, semester rollover, export and reminder behavior.
- Cross-platform groups: direct native references only, ambiguity protection, retained source links, one chart/calendar/export entry, chosen deadline, conservative source completion, local overrides, reminder deduplication, stale-primary protection, inactive-course filtering, persistence across captures and worker restart, and reversible separation that prevents automatic remerging.
- Popup worker access and privileged sender boundaries; Add activates an existing dashboard with an editor hash. No additional site permissions.
- Browser interactions: add/edit a date-only manual task; delete and Undo; merge, choose a source, and separate; edit a timed manual task to date-only and reopen its full editor; Calendar; popup completion removes the task and fills its place; empty dashboard and Add hash shortcut. No console errors observed. Exactly two navigation views remain. Dashboard, Calendar, dialogs, and popup were visually inspected; synthetic screenshots are in the release directory.
- The additional DOM fixture verifies Brightspace cross-platform links are retained with sensitive query parameters removed. All 27 fixtures passed in a real DOMParser environment.

These checks use synthetic data and mocked extension APIs. The toolbar's actual Chrome/Edge popup lifecycle, notification delivery, and signed-in integrations remain installed-extension acceptance checks. Browser viewport overrides did not apply in this preview environment, so narrow-window behavior has not been visually verified.

## v0.5.1 appearance checks

- Replaced heavy black/white bevels and repeated navy panel headers with warm surfaces, muted teal, thin outlines, subtle highlights, and restrained navy accents. The pixel compass and compact taskbar remain. No sync or storage logic changed.
- Visually inspected Overview, Calendar, manual editor, merged assignment details, and toolbar popup with synthetic data. Created a manual assignment and completed a popup task; controls still worked. Exactly two navigation views remain.
- All 90 existing Node tests and static asset/CSP checks pass. No console errors observed in the dashboard or popup. The sample-preview banner remains visible only outside the installed extension.

## v0.6.0 Apple-style presentation

- Shared visual tokens for cool gray ground, solid white content panels, thin dividers, a blue accent, capsule controls, and restrained glass navigation/overlays. Replaced the retro title strip/taskbar with a compact sidebar and local-storage footer. Overview, Calendar, popup, Help, and all eight dialogs use the same visual system. SVG/PNG compass and line icons are original code-native assets; no external fonts, icon packages, or runtime dependencies are added.
- Visually inspected manual and deadline editors, merged details, merge choices, Courses, Settings, nested Clear confirmation (cancelled), Sync details, Calendar, popup, and Help. Created a manual task; edited a deadline through Calendar and observed its new date; completed a popup task and observed its replacement; opened Add from an empty-state hash. Escape closed Settings and restored focus to its originating button. Native dialog close transitions did not prevent switching to another dialog.
- Browser diagnostics: no console errors in dashboard/popup, no broken images, exactly two navigation views, and native discrete dialog transitions supported. Dialogs have accessible names; primary controls and completion labels have generous hit areas. CSS includes reduced motion, reduced transparency, and increased contrast alternatives. OS preference variants have not been manually exercised.
- All 90 existing Node tests, 27 real-DOM parser fixtures, static JavaScript/assets/CSP checks, and Git whitespace checks pass. Browser viewport overrides still did not apply (the preview stayed at 1280px), so narrow-window layouts remain a live acceptance check. Calendar and table containers retain horizontal scrolling at small widths.

These presentation checks use sample data. Source readers, sync transport, worker privileges, and local storage schema are unchanged. Installed Chrome/Edge popup lifecycle, notifications, and signed-in school responses still need live verification.

## v0.7.0 Google Calendar sync

- 27 new mocked Calendar/worker tests cover owned event creation, durable random IDs, idempotent insert conflict recovery, same-ID date updates, completion deletion and fresh-ID restoration, timed-to-all-day transitions, reminder updates/DST, manual delete/restore, course deselection/reselection, merged-task reconciliation, offline/restart recovery, backoff, silent token renewal, concurrent completion/date edits during network requests, conditional ETag writes, deleted-calendar recovery, concurrent Connect protection, and bounded queue continuation.
- Tests verify that only matching ownership tags permit remote mutation, tokens never enter storage or GET_STATE, source pages cannot request privileged calendar actions, missing OAuth configuration/unsupported browsers fail safely, uncertain calendar creation is not automatically repeated, and Clear cannot discard pending remote cleanup. Offline disconnect can resume after explicit reauthorization without re-enabling uploads.
- Browser preview: Calendar connection controls, Settings shortcut, named connection dialog, disabled unconfigured connection, reminder options, setup guide, and unchanged two-view navigation checked with synthetic data. No dashboard console errors observed. All 27 browser extraction fixtures passed.
- All 117 Node tests and static syntax/asset/CSP checks pass. No real Google account/client is configured in this checkout; OAuth consent, actual API requests, calendar event visibility, and iPhone notification delivery remain live acceptance steps. No calendar entries were written to a real account during testing.

### Google live acceptance after configuration

1. Follow the setup guide using the installed Chrome extension ID and a test Google account; reload the same extension. Do not change its ID or manifest key. Connect and verify that only the app-created calendar scope is requested.
2. Check one incomplete assignment in the separate calendar. Edit its date in Due North and verify the same Google event moves; change the reminder and confirm its override. Switch a task to date-only and confirm there is no popup reminder.
3. Complete a task in the popup and dashboard: verify event deletion in Google and cancellation of future reminders. Uncheck it and confirm exactly one event returns. Test a source-completed assignment after a school sync too.
4. Disconnect the network, edit/complete tasks, restart Chrome, restore connectivity, and verify pending changes converge without duplicates. Revoke access to check Reconnect. Existing events can still remind while a deletion is pending offline.
5. Test merge/separate, manual delete/Undo, and course exclusion. Personal/unrelated events should remain intact. Disconnect and wait for removal before Clear/uninstall.
6. In the iPhone Google Calendar app, enable this calendar and notifications. Verify an upcoming reminder with the computer off. Already delivered notifications cannot be recalled.

## v0.7.1 chart selection and deadline-year repair

- 9 additional Node regressions (126 total) cover semester-anchored year inference, Fall-to-January rollover, inferred-year cache repair, explicit-source-year retention, manual/custom deadline preservation, local completion, merged-task baseline preservation, source timestamp/cache year mismatch, future statuses, local date-only/DST boundaries, worker course-term fallback, and updating the same Google event after a cached year correction.
- Two additional real-DOM fixtures (29 total) cover the screenshot's Brightspace course/assignment pattern with a yearless November due date collected in spring, and an explicitly older source year. The former now resolves to November 22, 2026 and In 36 days as of October 17, 2026; an explicit 2025 date stays 2025.
- Browser interactions checked selected-day fill/checkmark, filter strip, Show all assignments, repeated keyboard Enter selection and retained focus, manual November 22 deadline showing In 36 days, and November calendar day filtering. The bar hit area computed to transparent while its fill changed color. Zero-count days have no painted bar. Dashboard console showed no errors. The selected-day screenshot is in the release directory.
- JavaScript syntax, manifest/assets, CSP and Git whitespace checks pass. Existing custom edits and Google sync regressions remain green.

The provided screenshot shows the course term and month/day but not Brightspace's original source year or the extension's stored record. The exact live record was unavailable. Repairs cover the reproduced missing-year/cache failure; explicit dates are not silently shifted into a different year. Dates now show their year so an incorrect professor-supplied year is visible and can be edited locally. Signed-in Chrome/Edge and phone notification delivery remain live acceptance checks.

## Reproduce

```sh
npm test
npm run check
npm run preview
```

Open `http://127.0.0.1:4173/tests/browser.html` for the DOM fixtures. The sample dashboard is at `/extension/dashboard.html`; append `?empty` to inspect a fresh installation's empty state or `?changes` for a custom/source date conflict and stale sync example. Sample edits stay in memory.

## Live acceptance

1. Reload the unpacked extension and your school tabs. Check for extension errors. In v0.4.0 the manifest adds the offscreen permission for the hidden HTML parser.
2. Open current course lists and select unlabelled current classes in Courses. Confirm previous-semester courses are absent from the dashboard and sync queue.
3. Compare Gradescope's right-hand due date (not release or late cutoff), Brightspace quiz names/Due on lines/Evaluation Status, and Not Submitted assignment rows.
4. Edit a deadline, sync again, and confirm the edit persists in the list, chart, calendar and exported .ics. Restore the source date.
5. Enable MyLab Math's optional access and reload Homework and Tests. Confirm the course if needed. Compare titles, due dates and status with the portal/embedded table. Unsupported layouts need a redacted fixture and adapter update.
6. Check paginated lists, sign-in expiry and sync details. Try reminders while the browser is running; browser/OS settings may suppress notifications.
7. Run a sync across several courses. Background-readable pages should create no tabs; rendered pages should reuse one inactive tab. Activate or close that tab and confirm it is not replaced. Stop during a slow read and verify no late assignments arrive from that run. Sign out of one source, sync, and confirm its remaining pages are skipped with a sign-in message.
8. Click the toolbar icon: check an assignment complete, use Sync/Stop, and use Add. Confirm the existing planner activates and the editor opens. Add a task, edit it, and delete/Undo it. Merge copies from Details; choose the source, edit its deadline, sync, reload, then separate. Compare the chart, calendar, popup and export: a merged task should count once.
9. Reload the extension; local choices should persist. A fresh browser profile starts empty. The source ZIP contains no user storage.

Do not add credentials, account pages, submitted work, browser profiles, or private calendar exports to test fixtures or the shared project.
