# Due North privacy information

Version 0.1.0. This extension operates locally, without a developer-operated server, analytics, advertising, tracking, or remote code.

## Data stored

In `chrome.storage.local`, scoped to the browser profile and extension:

- Assignment names, course names and IDs, site names, and assignment/page URLs.
- Due dates, original deadline text, parsing notes, and visible submission/graded status.
- First/last collection times and the previous deadline when a deadline changes.
- Local completion/archiving choices and notification deduplication markers.
- Discovered course/list URLs, sync timing, page counts, and short sync diagnostics.
- Time zone, reminder preferences, and whether page collection is enabled.

The extension does not intentionally collect credentials, cookie values, submitted answers, full assignment descriptions, grades beyond recognizing a graded submission state, names/email addresses of users, or unrelated browsing history. It does not fetch private API endpoints.

## Site access

Content scripts run only on `https://purdue.brightspace.com/*`, `https://www.gradescope.com/*`, and `https://gradescope.com/*`. They read course and assignment-list DOM content already available to the signed-in user. Unsupported submission/edit pages are skipped. A user-initiated sync opens allowed, discovered list/course pages in temporary tabs. Normal requests and authentication are handled by the school sites and browser.

Course assignments and page links remain on the device. The extension never transmits them to a developer service. A calendar export creates a local file containing assignment information; importing or sharing it is the user’s choice. Sharing the original code ZIP does not share extension storage.

## Permissions

- **Site permissions:** Read the supported course/list pages and open them during sync.
- **storage:** Save the local dashboard state. Cloud-synced storage is not used; content scripts cannot directly read the saved store.
- **alarms:** Periodic deadline checks and recovery for stalled sync pages.
- **notifications:** Optional desktop reminders. Assignment titles may be visible in OS notification surfaces.

The extension does not request access to all websites, passwords, cookies, clipboard, geolocation, camera, microphone, or browsing history. Tabs are opened through the tabs API using scoped host permissions; there is no broad `tabs` permission.

## Control and deletion

Pause collection in Settings. Clearing local data resets the workspace and pauses collection so already-open tabs cannot immediately restore it. Re-enable collection when ready. Uninstalling deletes extension local storage. Exported calendar files and calendars into which they were imported are separate and must be managed by the user.

Use a separate browser profile for each school account. This version does not detect account identity and therefore does not automatically partition records when a user changes school logins within the same profile.

This document describes the supplied source code. If you distribute a modified version, update this information to match its behavior.
