# Due North privacy information

Version 0.4.0. Local browser storage only; no developer server, analytics, advertising, remote code, or cloud-synced storage.

## Stored information

Assignment titles, course names/IDs/semester labels, supported source/page URLs, due dates and original deadline text, submission state, sync timestamps/diagnostics, local completion and deadline overrides, course choices, reminder markers, and settings are saved in `chrome.storage.local`. Content scripts cannot directly read this store.

The extension does not collect passwords, cookie values, submitted answers, full assignment descriptions, account email addresses, or unrelated browsing history. Displayed grades are inspected only to recognize completion; numerical scores are not saved. No private API endpoints are fetched. Unneeded URL query parameters and fragments are removed before storage. Course, assignment, and Brightspace group parameters are retained for working links.

## Site access

Required hosts: `purdue.brightspace.com`, `www.gradescope.com`, and `gradescope.com` over HTTPS.

Optional MyLab Math hosts, enabled through the MyLab Math button: `mylabmastering.pearson.com`, `www.mathxl.com`, `mylab.pearson.com`, and `xlitemprod.pearsoncmg.com`. The reader can run inside embedded frames on these hosts. Unsupported player/submission pages are skipped.

Readers inspect course/list information available to your signed-in session, either from downloaded HTML or rendered pages. Downloaded HTML is parsed transiently in a detached document; the full HTML is never saved or uploaded. Remote scripts are not executed by the hidden parser, and its content policy blocks remote subresources. Background requests use browser-managed session credentials without reading cookie values. Course metadata is discovered to determine the semester. Assignments from unselected or older courses are not saved. Sync downloads only supported home pages and selected current course/list pages, up to 60 pages per run. Fetch redirects are not followed; pages requiring navigation fall back to rendered collection. Sync reuses suitable open pages without navigating them, or opens at most one reusable inactive tab per run. Temporary MyLab sync tabs can open the same-course Assignments menu; existing user tabs are not navigated. The temporary tab is closed after the run; active tabs, user tabs, and sign-in pages are preserved. An expired session skips the remaining pages on that platform until the next sync attempt. Assignment tabs opened by a regular Due North click can redirect to the course list if Brightspace reports a 500/404 error. Your browser and the school sites handle normal network traffic and authentication.

## Permissions

- Scoped host access: read supported pages and open them during sync.
- `storage`: save local records and preferences.
- `alarms`: check deadlines and stalled syncs.
- `notifications`: optional desktop reminders; assignment titles can appear in OS notifications.
- `offscreen`: parse downloaded HTML in a hidden extension document without opening tabs.
- `scripting`: register the optional Pearson reader after you grant its host access.

No all-sites, passwords, cookies, clipboard, geolocation, camera, microphone, browsing-history, or broad tabs permission is requested.

## Sharing and control

The project ZIP contains code and synthetic examples, not your browser storage. Calendar export creates a local file containing assignment information; importing or sharing that file is your choice. There is no Google Calendar connection in this release.

Settings lets you pause collection or clear all local data. Clearing pauses collection so open tabs cannot immediately restore records. Old-semester records from previous versions stay local but are excluded from the dashboard and sync. Uninstalling deletes extension storage. Exported files and imported calendar events must be managed separately.

Use a separate browser profile for each school account. The extension does not identify account ownership or automatically separate accounts used in the same profile.
