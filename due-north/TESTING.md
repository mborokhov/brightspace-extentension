# Validation record — v0.1.0

## Verified

- **25 Node tests passed** (`npm test`): URL/host boundaries, safe crawl routes, ISO and Rails-style datetime parsing, time-zone conversion, DST ambiguity, invalid dates, missing years/times, stable assignment identity, merge/preservation rules, changed deadlines, reminder exclusions/deduplication, UTF-8 iCalendar escaping/folding, serialized writes, message-sender validation, user-tab preservation, sign-in timeouts, queue recovery after worker recreation, local completion, setting changes, reset/collection pause, rendering delays after navigation, and continuous page mutations.
- **11 in-browser DOM fixture tests passed** (`tests/browser.html`): Gradescope release/due/late distinctions, unlinked assignments, Brightspace inline and machine dates, availability-date exclusion, submission status, open shadow roots, hidden/duplicate rows, login detection, quiz summary links, and ungraded status handling.
- **Static checks passed** (`npm run check`): JavaScript parses; manifest and all referenced assets exist; HTML has no inline scripts; no all-sites host permission.
- **Interactive dashboard checks passed in the local sample preview**: search, course filtering, completion and Completed view, review filtering, archive/restore, settings dialog, invalid-zone rejection, and deadline display after changing time zone. The desktop layout was visually inspected.

These tests use synthetic DOM fixtures and mocked Chrome APIs. They are not a claim of end-to-end success against a signed-in Purdue/Gradescope account or an installed production extension. Browser notification delivery depends on actual browser/OS settings.

## Live-account acceptance check still required

1. Load `extension/` unpacked in Chrome or Edge. Verify there are no extension errors.
2. Sign into both supported sites and reload their tabs.
3. Compare one Brightspace Assignments list, one Brightspace Quizzes list, and one Gradescope course table to the dashboard. Verify titles, course identification, source links, dates, times, and submission status.
4. Include examples with no deadline, a personal extension if available, late-submission cutoffs, completed/unsubmitted work, and paginated lists.
5. Run Sync courses. Check that each expected course/list appears in Sync coverage. A home-page visit alone does not prove all courses were scanned.
6. Test expired login and MFA redirects: sign in normally, then retry sync. No credential should be pasted into the project or shared.
7. Enable reminders and click Test notification. Check OS notification permissions.
8. Export a calendar snapshot and verify a known deadline in the destination calendar’s timezone.
9. Reload the extension and browser: local records should persist; a fresh install in a different profile should start empty.

If a site layout does not match, adjust `extension/extractors.js`, add a **redacted** fixture, and rerun both test suites. Never include account data, session tokens, submitted answers, or a browser profile in the shared ZIP.

## Reproduce

```sh
npm test
npm run check
npm run preview
```

Then visit `http://127.0.0.1:4173/tests/browser.html` in a current Chrome/Edge browser. All fixtures should pass. Previewing `extension/dashboard.html` outside the extension intentionally shows labelled sample data.
