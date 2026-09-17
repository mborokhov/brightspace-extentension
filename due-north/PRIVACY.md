# Due North privacy information

Version 0.2.1. Local browser storage only; no developer server, analytics, advertising, remote code, or cloud-synced storage.

## Stored information

Assignment titles, course names/IDs/semester labels, supported source/page URLs, due dates and original deadline text, submission state, sync timestamps/diagnostics, local completion and deadline overrides, course choices, reminder markers, and settings are saved in `chrome.storage.local`. Content scripts cannot directly read this store.

The extension does not collect passwords, cookie values, submitted answers, full assignment descriptions, account email addresses, or unrelated browsing history. Displayed grades are inspected only to recognize completion; numerical scores are not saved. No private API endpoints are fetched. Unneeded URL query parameters and fragments are removed before storage.

## Site access

Required hosts: `purdue.brightspace.com`, `www.gradescope.com`, and `gradescope.com` over HTTPS.

Optional MyLab Math hosts, enabled through the MyLab Math button: `mylabmastering.pearson.com`, `www.mathxl.com`, `mylab.pearson.com`, and `xlitemprod.pearsoncmg.com`. The reader can run inside embedded frames on these hosts. Unsupported player/submission pages are skipped.

Readers inspect visible course/list information available to your signed-in session. Course metadata is discovered to determine the semester. Assignments from unselected or older courses are not saved. Sync opens only home pages and selected current course/list pages, up to 60 pages per run. Temporary MyLab sync tabs can open the same-course Assignments menu; existing user tabs are not navigated. Your browser and the school sites handle normal network traffic and authentication.

## Permissions

- Scoped host access: read supported pages and open them during sync.
- `storage`: save local records and preferences.
- `alarms`: check deadlines and stalled syncs.
- `notifications`: optional desktop reminders; assignment titles can appear in OS notifications.
- `scripting`: register the optional Pearson reader after you grant its host access.

No all-sites, passwords, cookies, clipboard, geolocation, camera, microphone, browsing-history, or broad tabs permission is requested.

## Sharing and control

The project ZIP contains code and synthetic examples, not your browser storage. Calendar export creates a local file containing assignment information; importing or sharing that file is your choice. There is no Google Calendar connection in this release.

Settings lets you pause collection or clear all local data. Clearing pauses collection so open tabs cannot immediately restore records. Old-semester records from previous versions stay local but are excluded from the dashboard and sync. Uninstalling deletes extension storage. Exported files and imported calendar events must be managed separately.

Use a separate browser profile for each school account. The extension does not identify account ownership or automatically separate accounts used in the same profile.
