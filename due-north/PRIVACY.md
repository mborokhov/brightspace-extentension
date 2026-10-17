# Due North privacy information

Version 0.7.1. Assignment storage is local by default. Optional Google Calendar sync sends selected assignment information to Google after you connect. No developer server, analytics, advertising, remote code, or Chrome cloud-synced storage.

## Stored information

Assignment titles, course names/IDs/semester labels, supported source/page URLs, due dates and original deadline text, submission state, sync timestamps/diagnostics, local completion and deadline overrides, course choices, manually entered tasks/links, reversible merge membership and source choices, deleted manual task markers, reminder markers, deadline parsing context/version, and settings are saved in `chrome.storage.local`. Content scripts cannot directly read this store. If connected, it also stores the Google calendar ID, a random installation ownership marker, task-to-event IDs, desired-event fingerprints (which include task metadata), reminder choices, retry state, and last sync/error status. Access tokens are handled by Chrome Identity and held transiently for requests; they are never put in extension storage, exported, or returned to the dashboard/content scripts.

Manual HTTPS links are stored as entered and opened only when you click them; they are never crawled by sync. Avoid putting credentials or authentication tokens in a manual link. Merging retains the separate source records locally; it does not alter school data.

The extension does not collect passwords, cookie values, submitted answers, full assignment descriptions, account email addresses, or unrelated browsing history. Displayed grades are inspected only to recognize completion; numerical scores are not saved. No private API endpoints are fetched. Unneeded URL query parameters and fragments are removed before storage. Course, assignment, and Brightspace group parameters are retained for working links.

## Site access

Required hosts: `purdue.brightspace.com`, `www.gradescope.com`, and `gradescope.com` over HTTPS.

Optional Google host: `https://www.googleapis.com/*`, requested only when you click Connect. Requests use the official Google Calendar API with a browser-managed OAuth access token, without school cookies.

Optional MyLab Math hosts, enabled through the MyLab Math button: `mylabmastering.pearson.com`, `www.mathxl.com`, `mylab.pearson.com`, and `xlitemprod.pearsoncmg.com`. The reader can run inside embedded frames on these hosts. Unsupported player/submission pages are skipped.

Readers inspect course/list information available to your signed-in session, either from downloaded HTML or rendered pages. Downloaded HTML is parsed transiently in a detached document; the full HTML is never saved or uploaded. Remote scripts are not executed by the hidden parser, and its content policy blocks remote subresources. Background requests use browser-managed session credentials without reading cookie values. Course metadata is discovered to determine the semester. Assignments from unselected or older courses are not saved. Sync downloads only supported home pages and selected current course/list pages, up to 60 pages per run. Fetch redirects are not followed; pages requiring navigation fall back to rendered collection. Sync reuses suitable open pages without navigating them, or opens at most one reusable inactive tab per run. Temporary MyLab sync tabs can open the same-course Assignments menu; existing user tabs are not navigated. The temporary tab is closed after the run; active tabs, user tabs, and sign-in pages are preserved. An expired session skips the remaining pages on that platform until the next sync attempt. Assignment tabs opened by a regular Due North click can redirect to the course list if Brightspace reports a 500/404 error. Your browser and the school sites handle normal network traffic and authentication.

## Permissions

- Scoped host access: read supported pages and open them during sync.
- `storage`: save local records and preferences.
- `alarms`: check deadlines and stalled syncs.
- `notifications`: optional desktop reminders; assignment titles can appear in OS notifications.
- `offscreen`: parse downloaded HTML in a hidden extension document without opening tabs.
- `scripting`: register the optional Pearson reader after you grant its host access.
- `identity`: optional Google sign-in/token management. The extension requests only `calendar.app.created`, to manage a separate calendar it creates. No Google email/profile scope is requested.

No all-sites, passwords, cookies, clipboard, geolocation, camera, microphone, browsing-history, or broad tabs permission is requested.

## Sharing and control

The project ZIP contains code and synthetic examples, not your browser storage. Calendar export creates a local file containing assignment information; importing or sharing that file is your choice. Google Calendar connection is optional. Connecting sends active task titles, course names, dates, source/manual links, and task/installation identifiers to your own Google account. It does not upload full school pages, scores, submitted answers, or unrelated browsing history. These events and reminders are processed by Google under its policies and your account settings; their titles can appear on your phone’s lock screen.

Settings lets you pause collection or clear all local data. Disconnect Google Calendar and wait for event cleanup before clearing data or uninstalling. Disconnect deletes only events tracked by this installation with matching ownership markers, leaving your other events and the secondary calendar in place. Authorization remains managed by Chrome/Google; revoke it separately through your Google account to remove the grant entirely. If offline, cleanup remains pending and reminders can still fire until Google confirms deletion. Uninstalling before cleanup leaves remote events to be removed manually. Clearing pauses collection so open tabs cannot immediately restore records. Old-semester records from previous versions stay local but are excluded from the dashboard and sync. Uninstalling deletes extension storage. Exported files and imported calendar events must be managed separately.

Use a separate browser profile for each school account. The extension does not identify account ownership or automatically separate accounts used in the same profile.
