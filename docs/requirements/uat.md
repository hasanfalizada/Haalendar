# User acceptance test (UAT) — Haalendar v1.0

+++===+++ 2026-11-01 — Hasan Alizada — HAAL-145. Acceptance of the rewrite by the owner on his own data, with a written
sign-off. Requirements: [`SRS.md`](SRS.md) §3; legacy features: [`legacy-feature-inventory.md`](legacy-feature-inventory.md).

## 1. Purpose and scope

The owner uses the new Haalendar with his real calendar, notes and boards, entered by hand (no importer, D-100), and
confirms that it does what the SRS promises and can replace the legacy calendar. Automated tests already cover each
requirement (`docs/architecture/test-strategy.md`); this test is about real use: the data, the devices, the feel.

- **In scope:** every requirement of SRS §3 whose backlog task is done (section 4).
- **Out of scope:** tasks not built yet (section 5). They are accepted later with a short follow-up UAT of the same form.
- **Result:** the sign-off in section 7 is a precondition of the v1.0 release (HAAL-156).

## 2. Stand and preparation

| | |
|---|---|
| Address | `https://haalendarnew.apps.home.hasanalizada.net` (app server, behind its Caddy with an internal certificate) |
| Installation | `compose.yaml` with project name `haalendarnew`, image built from branch `revamp`; guide: `docs/operations/deployment.md` |
| Version under test | commit `aa46ef6` (installed 2026-11-01; updated when the stand is) |
| Devices | laptop (Chrome or Edge, Firefox), phone (Android or iOS) over the VPN |
| Data | the owner's real events, notes and boards, entered by hand; a second account (`uat-second@…`) for sharing |
| Backup | the app server VM backup; additionally "Export your data" before each stand update |

Preparation:

1. Install the root certificate of the app server's Caddy on the laptop and the phone (the address then opens without
   a warning; offline mode, installing as an app and push notifications need it).
2. Open the address, create the administrator with the setup token (UAT-01), enter part of the real data
   (UAT-02), then go through the scenarios in any order.

## 3. How results are recorded

Each scenario gets a result: **✅ pass**, **❌ fail** or **— skipped** (with the reason), and a note when something is
surprising even if it passes. A failure or remark goes to the findings log (section 6) with a severity:

- **blocker** — data lost or wrong, a promised function does not work, a security problem; v1.0 is not accepted with
  an open blocker;
- **major** — works, but hinders daily use;
- **minor** — cosmetic or a wish.

The owner reports results in the chat by scenario number ("UAT-14 ✅", "UAT-20 ❌ …"); they are recorded here. Each
finding is decided by the owner: a backlog task, a fix within HAAL-145, or no change.

## 4. Scenarios

### 4.1 Start and accounts

| # | Scenario | Expected | Covers | Result | Note |
|---|---|---|---|---|---|
| UAT-01 | Open the address the first time; create the administrator with the setup token | The setup wizard asks for the token, name, e-mail and password (≥ 15 characters, common passwords refused); afterwards the app opens signed in | FR-ACC-05, FR-ACC-02 | | |
| UAT-02 | Enter a week of real events, a few notes and one board | Every save shows one result notification; nothing is lost after a reload | FR-X-05, FR-OFF-02 | | |
| UAT-03 | Sign out and in again; sign in five times with a wrong password | Sign-out removes the device's data (asks first when changes are unsent); wrong passwords lead to a temporary lockout with a clear message | FR-ACC-02, FR-ACC-04 | | |
| UAT-04 | Turn on two-factor sign-in, sign in with the code, keep the recovery codes | Sign-in asks for the code; a recovery code works once | FR-ACC-04 | | |
| UAT-05 | Admin panel: invite the second account, change its role, deactivate and reactivate it; try to deactivate yourself as the last admin | The invitation creates the account (without SMTP at once, with a one-time password shown to the admin); the last admin cannot be deactivated | FR-ACC-01, FR-ACC-06 | | |
| UAT-06 | Password reset: "Forgot password" for the second account (or the admin's manual reset without SMTP) | The link works once and expires; the manual reset gives a new password | FR-ACC-03 | | |
| UAT-07 | Profile: name, avatar, time zone; Settings: week start, 12/24 h, theme, default color, Week A/B; open on the phone | Changes apply at once and appear on the other device | FR-ACC-08, FR-ACC-09, FR-X-16 | | |
| UAT-08 | Sessions list in Settings: sign in on the phone, revoke that session from the laptop | The phone is signed out | FR-ACC-02 | | |

### 4.2 Calendar

| # | Scenario | Expected | Covers | Result | Note |
|---|---|---|---|---|---|
| UAT-10 | Day view of a busy day: compare with the legacy calendar | The same events; all-day first, then by time, then by title | FR-CAL-01, F-14 | | |
| UAT-11 | Mini calendar, previous/next/today by buttons and keys, collapse the sidebar | Dates change as expected; ISO week numbers in the mini calendar | FR-CAL-02..04, FR-CAL-35 | | |
| UAT-12 | Header for a past, today's and a future date | "Today" or the date, live clock, ISO week and day number of the selected date, Week A/B when on | FR-CAL-05, FR-CAL-22, FR-CAL-23 | | |
| UAT-13 | Create a timed event with location, description (Markdown), color, priority, attachment; end before start | End before start is refused; moving the start past the end moves the end; Markdown is rendered | FR-CAL-06, FR-CAL-07, FR-X-20, FR-X-11 | | |
| UAT-14 | Create an event with the title of an existing one | A warning links to the existing event; you may continue | FR-CAL-16 | | |
| UAT-15 | Details: click and right-click an event; change its color there; move it to the next day | The popover shows all fields and timestamps; color and move are saved at once and can be undone | FR-CAL-08, FR-CAL-18, FR-CAL-20, FR-X-02 | | |
| UAT-16 | Recurring series of your real life (weekly meeting, monthly bill, birthday on 29 Feb or 31st): daily/weekly/monthly/annually, every N, selected weekdays, Nth weekday, last day, end on date / after N | Occurrences on exactly the expected dates, also across months without the day and leap years | FR-CAL-10, FR-CAL-30, F-20 | | |
| UAT-17 | On a series: delete this occurrence; edit this occurrence (and cancel once); edit and delete "this and following"; delete all | Each acts only on what was chosen; cancel leaves the series unchanged | FR-CAL-11..14, FR-CAL-31 | | |
| UAT-18 | Overdue counter with past one-off events and a series that started in the past | The count matches; hidden at zero | FR-CAL-17 | | |
| UAT-19 | Day list icons for description and attachments | Shown only when present | FR-CAL-19 | | |
| UAT-20 | Week, month and agenda views with real data; drag an event in week and month view, also an occurrence of a series | Overlaps side by side, current-time line, "+N more"; drag keeps the duration and asks this / following / all for a series; undo works | FR-CAL-25..28 | | |
| UAT-21 | Phone: swipe between days, weeks, months; drag by touch | Periods change by swipe; touch drag works | FR-CAL-36, FR-X-17 | | |
| UAT-22 | Reminders: a reminder 5 minutes ahead on a timed event and one on an all-day event; allow notifications; close the app | In-app notification and a browser/phone notification also with the app closed | FR-CAL-29, FR-X-21 | | |
| UAT-23 | Several calendars: create, rename, color, hide, archive; move an event to another calendar | Hidden calendars' events disappear and come back | FR-CAL-32 | | |
| UAT-24 | ICS: import an .ics exported from another calendar (with repeats and exceptions); export a calendar and open it elsewhere | Report of imported and skipped items; dates match | FR-CAL-33 | | |
| UAT-25 | Duplicate an event to another date | A full copy on the new date | FR-CAL-34 | | |
| UAT-26 | Time zones: change the profile time zone; check timed, all-day and recurring events around a DST change | Timed events shift with the zone, all-day ones do not, series keep their wall-clock time | FR-ACC-11 | | |

### 4.3 To-Do

| # | Scenario | Expected | Covers | Result | Note |
|---|---|---|---|---|---|
| UAT-30 | Notes: create with title, body (Markdown), color, priority, attachment; pin; archive; unarchive | Pinned on top; archived only in Archive; archive is not delete | FR-TODO-01, FR-TODO-03 | | |
| UAT-31 | Checklist note: add, edit, check, uncheck, reorder items | Checked items move to the bottom; order kept after reload | FR-TODO-02 | | |
| UAT-32 | Reminder on a note | Delivered like an event reminder | FR-TODO-07 | | |

### 4.4 Kanban

| # | Scenario | Expected | Covers | Result | Note |
|---|---|---|---|---|---|
| UAT-40 | Board of a real project: create, rename, archive; columns with a WIP limit | Exceeding the limit warns but allows the move | FR-KAN-01, FR-KAN-02 | | |
| UAT-41 | Cards with description, color, priority, due date, labels, checklist, attachment; move by mouse, touch and keyboard; undo a move | Order is stable after reload and on the other device | FR-KAN-03, FR-KAN-04 | | |
| UAT-42 | Due dates: one passed, one within 24 h, one with a reminder | Overdue and due-soon badges; the reminder arrives | FR-KAN-07, FR-KAN-08 | | |
| UAT-43 | Filters: label, priority, due (overdue / today / this week / none), text; on a shared board assign a card and filter "assigned to me" | Only matching cards remain | FR-KAN-09, FR-KAN-10 | | |

### 4.5 Across modules

| # | Scenario | Expected | Covers | Result | Note |
|---|---|---|---|---|---|
| UAT-50 | Delete an event, a note and a card; open Trash; restore two at once | Newest first, filter by module; restored items return to their date, column and position | FR-X-01, FR-X-04 | | |
| UAT-51 | Undo and redo with keys and from the notification: create, edit, delete, color, move, a bulk action | Each step undone and redone; a bulk action is one step | FR-X-06 | | |
| UAT-52 | Multi-select with Ctrl+click, Shift+click, Ctrl+A, long-press on the phone; bulk delete, restore, color, priority, next day | Applied to all selected | FR-X-07 | | |
| UAT-53 | Keyboard only for a few minutes; press `?` | Everything reachable; the overlay lists the shortcuts | FR-X-08 | | |
| UAT-54 | Close an editor with unsaved changes by Esc, backdrop, button, another module, the browser tab | Asks first; no question without changes | FR-X-09 | | |
| UAT-55 | Attachments: file picker, drag and drop, paste a screenshot; a file over 10 MB; a PDF | Thumbnail and preview; too large and wrong types refused with a reason | FR-X-11 | | |
| UAT-56 | Priority and colors in light and dark theme | Readable in both themes; sorting and filtering by priority | FR-X-12, FR-X-13 | | |
| UAT-57 | Export your data from the user menu; open the JSON | All your items including deleted ones, timestamps, links, attachment metadata | FR-X-14 | | |
| UAT-58 | User menu: profile, settings, export, help, about, sign out | All present in every module; About shows version, licence and links | FR-X-15 | | |
| UAT-59 | Link an event with a note and a card; delete and restore one of them | Both sides show the link; it survives delete and restore | FR-INT-01 | | |
| UAT-60 | Drag a note or card onto the day or week view | An event at that time, linked to the source | FR-INT-04 | | |
| UAT-61 | Notification center: reminders, a received share, a sync error | Unread counter, mark read | FR-X-21 | | |

### 4.6 Sharing and live updates

| # | Scenario | Expected | Covers | Result | Note |
|---|---|---|---|---|---|
| UAT-70 | Share a calendar, a note and a board with the second account: view, then edit; revoke | The second account sees, edits only with edit right, loses access on revoke | FR-ACC-10, FR-ACC-07 | | |
| UAT-71 | Laptop and phone open at the same time; change something on one | Appears on the other within seconds without reload | FR-X-18 | | |

### 4.7 Offline and installation

| # | Scenario | Expected | Covers | Result | Note |
|---|---|---|---|---|---|
| UAT-80 | Install as an app on the laptop and the phone | Installs; opens in its own window | FR-OFF-06 | | |
| UAT-81 | Flight mode on the phone: open the app, view, create, edit, delete, restore, undo; reload; close and reopen | Everything works; status shows offline; changes kept | FR-OFF-01, FR-OFF-02 | | |
| UAT-82 | Network back | Changes sync once; status shows syncing, then online | FR-OFF-03 | | |
| UAT-83 | Change the same event on both devices while one is offline (same field, then different fields) | Different fields merged; the same field offered for a choice in Settings → Sync; nothing lost | FR-OFF-04 | | |
| UAT-84 | Offline: open admin panel, sharing, password change | "Requires connection" message | FR-OFF-05 | | |

### 4.8 Real use

| # | Scenario | Expected | Covers | Result | Note |
|---|---|---|---|---|---|
| UAT-90 | Use the new app instead of the legacy calendar for at least a week (the legacy one stays as reference) | No moment where the legacy calendar was needed for something v1.0 promises | all | | |
| UAT-91 | Legacy features one by one (F-01..F-34) | Each present or intentionally changed as the inventory says | F-xx | | |

## 5. Out of scope of this UAT (not built yet)

| Requirement | Task |
|---|---|
| Full-text search, date jump, title autocomplete; search filters (FR-X-10, FR-CAL-21, FR-X-19) | HAAL-039, HAAL-046 (postponed) |
| Single editor instance (FR-CAL-15) | HAAL-069 |
| Note labels, grid/list and manual order, note due dates; due dates as calendar layers (FR-TODO-04..06, FR-CAL-24) | HAAL-102, HAAL-103, HAAL-104, HAAL-121 |
| Card activity and comments; swimlanes (FR-KAN-05, FR-KAN-06) | HAAL-114, HAAL-115 |
| Convert between types; command palette (FR-INT-02, FR-INT-03) | HAAL-122, HAAL-123 |
| OpenID Connect (FR-ACC-12) | HAAL-168 |
| Demo mode; backup and restore (FR-OPS-03, FR-OPS-04) | HAAL-154, HAAL-155 |

## 6. Findings

| # | Scenario | Severity | What happened | Decision (owner) | Status |
|---|---|---|---|---|---|
| | | | | | |

## 7. Sign-off

| | |
|---|---|
| Version accepted | commit `________` |
| Period of the test | ____ – ____ |
| Scenarios | ✅ __ · ❌ __ · — __ |
| Open findings | blocker 0 · major __ · minor __ (listed in section 6 with their tasks) |
| Decision | ☐ accepted · ☐ accepted with remarks · ☐ not accepted |
| Owner | Hasan Alizada |
| Date | ____ |

The sign-off is given by the owner's commit of this file with the table above filled in.
