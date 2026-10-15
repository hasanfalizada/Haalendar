# SOFTWARE REQUIREMENTS SPECIFICATION (SRS) — Haalendar

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-002 v1.0 approved by owner; HAAL-003 v1.1 adds approved gap-analysis scope. Decisions logged in section 9.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-163 v1.5: decision D-26 (setup token) approved by owner.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-164 v1.6: decision D-27 (admin panel scope) approved by owner.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-165 v1.7: decision D-28 (isolation: database roles, first protected tables) approved by owner.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-166 v1.8: decision D-29 (profile and avatars) approved by owner.

| Field | Value |
|---|---|
| Version | 1.8 |
| Status | Approved by owner (2026-10-14) |
| Owner | Hasan Alizada |
| Baseline | `requirements/legacy-feature-inventory.md` (F-01..F-34) |

---

## 1. INTRODUCTION

### 1.1 Purpose
Haalendar is an open-source, self-hosted (on-premises), multi-user productivity suite that combines three connected modules in one web application:
- **Calendar** — successor of the legacy Haalendar day calendar;
- **To-Do** — notes and checklists in the style of Google Keep;
- **Kanban** — boards, columns and cards in the style of Trello / Kanboard.

It exists to give individuals and organisations full control over their planning data, working offline and on any device, without dependence on third-party cloud services.

### 1.2 Scope
In scope for v1.0:
- The three modules above and their integration (links, due dates in calendar, cross-module search).
- Full functional parity with the legacy Haalendar (F-01..F-34).
- New features requested by the owner (U#1..U#18, see section 3).
- Multi-user accounts with data isolation, administration and sharing.
- Offline-first operation with later synchronisation.
- Responsive UI for desktop and mobile browsers; installable PWA.
- Import of legacy Haalendar SQLite databases.
- On-premises deployment with Docker Compose; public demo instance with periodic reset.

Out of scope for v1.0 (may be added later):
- Native mobile apps (iOS/Android store apps).
- Hosted SaaS operated by the project.
- Physical purge of data (trash keeps everything forever, owner decision 2026-10-14).
- Gap-analysis items marked v1.1, Later or Reject in `requirements/gap-analysis.md` (approved by owner 2026-10-14).

### 1.3 Intended Audience and Reading Suggestions
| Reader | Read first |
|---|---|
| Owner / product decision maker | 1, 2, 3, 9 |
| Developers (human or AI agents) | 2, 3, 4, 5, 8 |
| QA | 3 (acceptance rules), 4, 8 |
| Operators / admins deploying on-prem | 2.4, 4.3, 4.5, 5, 6 |
| Security reviewers | 4.3, 4.4 |

### 1.4 Definitions, Acronyms and Abbreviations
| Term | Meaning |
|---|---|
| Item | Any user object: event, note, checklist item, board, column, card, attachment |
| Active item | Item with `deleted_at` empty |
| Soft delete | Marking an item deleted by setting `deleted_at`; the row is never physically removed |
| Trash | View of all soft-deleted items of a user |
| Occurrence | One concrete date of a recurring event |
| Exception | A date removed from, or overridden in, a recurring series |
| Overdue (legacy: "expired") | See FR-CAL-17 |
| Calendar (collection) | Named set of events owned by a user, with own color and visibility; unit of sharing (FR-CAL-32) |
| Week A/B | User-configured alternating week label (FR-CAL-23) |
| Day Number | Ordinal day of the year, 1..366 |
| Owner | Hasan Alizada, product owner |
| Operator | Person/organisation running an on-prem instance |
| Admin | User with administration role inside an instance |
| PWA | Progressive Web App |
| FTS | Full-text search |
| RRULE | Recurrence rule per RFC 5545 (iCalendar) |
| F-xx | Legacy feature ID from `requirements/legacy-feature-inventory.md` |
| U#n | Owner's new-feature request number n (2026-10-14) |
| HAAL-xxx | Backlog task ID |

---

## 2. OVERALL DESCRIPTION

### 2.1 Product Perspective
Standalone product; replaces the legacy Haalendar (Angular + PHP + SQLite, single user, no auth). Integration points:
- Legacy Haalendar SQLite database (one-time import).
- SMTP server of the operator (verification, password reset).
- Optional OpenID Connect provider (Could, HAAL-168).
- Reverse proxy of the operator for TLS termination.

### 2.2 Product Functions
1. Calendar: day view, navigation, events with recurrence, details popover, colors, priority, attachments, overdue counter, Week A/B, week and day numbers.
2. To-Do: notes, checklists, labels, pin, archive, due dates.
3. Kanban: boards, columns, cards, drag-and-drop, WIP limits.
4. Cross-cutting: soft delete and trash, audit history, undo/redo, multi-select and bulk actions, keyboard navigation, unsaved-changes guard, result notifications, FTS, export to JSON.
5. Accounts: registration, login, password reset, profile, roles, admin panel, sharing.
6. Offline-first: local storage, background sync, conflict handling, PWA install.
7. Operations: Docker deployment, backup/restore, legacy import, demo mode.

### 2.3 User Classes and Characteristics
| Class | Description | Main rights |
|---|---|---|
| Regular user | Plans own time and work | CRUD on own items and items shared with edit right |
| Admin | Manages the instance | All user rights + user management, instance settings |
| Demo visitor | Uses the public demo | Regular user rights; data reset every 30 minutes |
| Operator (outside the app) | Installs, upgrades, backs up | Server/Docker access, no in-app role required |

### 2.4 Operating Environment
- **Client:** current and previous major version of Chrome, Edge, Firefox, Safari (desktop); Safari on iOS and Chrome on Android, current and previous major OS version.
- **Viewport:** 360 px wide and up; layouts for phone, tablet, desktop.
- **Server:** Linux host with Docker Engine and Docker Compose; x86_64 and arm64 images.
- **Minimum server for reference load (4.2):** 2 vCPU, 2 GB RAM, 10 GB disk + attachments.
- TLS terminated by operator's reverse proxy or the bundled proxy.

### 2.5 Design and Implementation Constraints
- Default architecture: LLM-native atomic architecture with central Project Manifest (`project.manifest.json`), contract-first API.
- Stack per ADR-0003 (accepted 2026-10-14): Python 3.14 + FastAPI + Pydantic + SQLAlchemy/Alembic, PostgreSQL 18, React + Vite SPA (TypeScript, TanStack, Tailwind + shadcn/ui, PWA), Pytest / Vitest / Playwright, uv + pnpm workspaces.
- Only open-source dependencies with licences compatible with the project licence Apache-2.0.
- No physical deletion of business data (FR-X-01).
- English UI and documentation for v1.0; code must be i18n-ready.
- No telemetry or external calls without operator opt-in.

### 2.6 Assumptions and Dependencies
- Operator provides SMTP for e-mail features; without SMTP, admin can create users and reset passwords manually.
- Operator provides TLS (certificate) for production.
- Offline sync choice depends on ADR HAAL-050.
- Gap-analysis features depend on HAAL-003 approval.

---

## 3. FUNCTIONAL REQUIREMENTS

Rule format: each requirement is testable. "Source" links to legacy features (F-xx), owner requests (U#n) and backlog tasks (HAAL-xxx).

### 3.1 Cross-cutting (all modules)

| ID | Requirement | Source |
|---|---|---|
| FR-X-01 | No business record is ever physically deleted. Deleting sets `deleted_at` (UTC). All lists show active items by default. An automated test fails if any code path executes a physical DELETE on business tables. | F-17, HAAL-030 |
| FR-X-02 | Every item stores `created_at`, `updated_at`, `deleted_at` (UTC, ISO 8601) and shows them in its details view; trash shows `deleted_at`. | U#15, HAAL-031 |
| FR-X-03 | Every mutation (create, update, delete, restore, move, share) writes an audit record: actor, timestamp, item, action, before/after snapshot. Item history is viewable by users with access to the item. | F-33, HAAL-032 |
| FR-X-04 | Trash lists all soft-deleted items of the user across modules, newest `deleted_at` first, filterable by module, with multi-select restore. Trash keeps items forever; no purge in v1.0. Restore returns the item to its original place (date, board/column, position). | F-31, HAAL-033 |
| FR-X-05 | Every interaction with persistence shows exactly one result notification: success, failure (human-readable reason), queued (offline), synced. Failures are never silent. | U#14, HAAL-034 |
| FR-X-06 | Undo (Ctrl/Cmd+Z) and Redo (Ctrl/Cmd+Shift+Z) for create, update, delete, restore, move, color change, priority change and bulk actions. A bulk action is one undo step. Undo is also offered in the result notification. History depth 50 steps per browser session. | U#16, HAAL-035 |
| FR-X-07 | Multi-select with Ctrl/Cmd+click, Shift+click (range), Ctrl/Cmd+A; on touch: long-press enters selection mode. Bulk actions: delete, restore, change color, set priority, move to next day (events). | U#17, HAAL-036 |
| FR-X-08 | All primary actions are reachable by keyboard: switch module, navigate days, move focus between items, open, create, edit, delete (Delete key), search focus, select. A shortcut overlay (`?`) lists all shortcuts. | U#4, F-16, HAAL-037 |
| FR-X-09 | Any editor with unsaved changes asks for confirmation before closing via Esc, backdrop click, close button, route change, module switch or browser tab close. No confirmation when there are no changes. | U#6, HAAL-038 |
| FR-X-10 | Full-text search over titles, descriptions/bodies, locations, checklist items and card comments of all accessible items; results grouped by module, ranked, with highlighted matches; works offline on locally stored data. Typing a date `YYYY-MM-DD` and pressing Enter opens that day in Calendar. Selecting an event result opens its date. | U#5, F-06, F-30, HAAL-039 |
| FR-X-11 | Attachments on events, notes and cards: images added by file picker, drag-and-drop or clipboard paste (screenshots). Allowed types PNG, JPEG, WebP, GIF; max 10 MB per file. Thumbnail in item, full preview on click. Attachments are soft-deleted like other items. | U#9, HAAL-040 |
| FR-X-12 | Priority on events, notes and cards: Low, Medium, High; default Medium. Visible indicator; sorting and filtering by priority. | U#13, HAAL-041 |
| FR-X-13 | Shared color palette of at least the 8 legacy colors (red, orange, yellow, green, blue, purple, brown, black); default brown; text contrast meets WCAG AA in light and dark theme. | F-12, HAAL-042 |
| FR-X-14 | Export from the user menu: one JSON file containing all items owned by the user from all three modules, including soft-deleted items with their `deleted_at`, timestamps, links and attachment metadata (file name, type, size, timestamps). All item data is exported; attachment binaries (images) are not embedded. The JSON schema is versioned and documented. | U#1, HAAL-043 |
| FR-X-15 | User menu available in every module: profile, settings, export, help, about (free/open source, author and repository links), logout. | F-34, HAAL-044 |
| FR-X-16 | Light and dark theme; follows system preference unless set in settings. | HAAL-017 |
| FR-X-17 | Layout is responsive from 360 px: on phones the module navigation collapses into a slide-out drawer menu; all features usable by touch. | Owner 2026-10-14, HAAL-170 |
| FR-X-18 | Changes made in one tab, device or by a sharing user appear in other open sessions without manual reload and without per-second polling. | F-18, HAAL-055 |
| FR-X-19 | Search filters: date range, module, calendar, color, priority, label. | C-14, HAAL-046 |
| FR-X-20 | Markdown (CommonMark) in event descriptions, note bodies, card descriptions and comments; rendered output is sanitised (no scripts, no raw HTML). | T-02, HAAL-047 |
| FR-X-21 | In-app notification center listing reminders, shares received and sync errors; unread counter; mark read. | G-01, HAAL-048 |

### 3.2 Calendar

| ID | Requirement | Source |
|---|---|---|
| FR-CAL-01 | Day view lists events occurring on the selected date: one-off events whose date range includes the date, and occurrences of recurring series. Order: all-day first, then by start time, then by title. (Legacy ordered by color name — intentionally changed.) | F-14, HAAL-060 |
| FR-CAL-02 | Mini month calendar selects a date; week starts on the day set in settings (default Monday). | F-01, HAAL-061 |
| FR-CAL-03 | Previous day, Next day, Today actions (buttons and keyboard). | F-02, F-03, HAAL-061 |
| FR-CAL-04 | Collapsible sidebar. | F-04, HAAL-061 |
| FR-CAL-05 | Header shows: selected date label ("Today" or "Month D, YYYY"), live clock (hh:mm:ss, user time zone), ISO 8601 week number **of the selected date** (legacy used today — fixed), Day Number of the selected date (1..366), Week A/B label when enabled. | F-05, U#8, U#12, HAAL-062, HAAL-082, HAAL-085 |
| FR-CAL-06 | Event fields: title (≤150 chars; empty saves as "(No title)"), all-day flag (default on), start date, start time, end date, end time (times in 15-minute steps; cleared when all-day), location, description (multi-line), color (default brown), priority, repeat, attachments. | F-10, F-13, HAAL-063 |
| FR-CAL-07 | Validation: end date-time must not be earlier than start date-time; error message shown, save blocked. When start moves after end, end is moved to start automatically. | F-11, HAAL-063 |
| FR-CAL-08 | Details popover opens on click and on right-click (context menu suppressed): title, recurrence badge, all-day badge, date-time range, location, description (first 50 chars + "more"), attachments thumbnails, priority, timestamps, actions (edit, edit this occurrence, move to next day, color, delete, delete all occurrences). On touch: tap opens it. | F-15, HAAL-064 |
| FR-CAL-09 | Delete asks for confirmation; Delete key deletes the selected event(s) after confirmation; deletion is soft. | F-16, F-17, HAAL-065 |
| FR-CAL-10 | Repeat options: none, daily, weekly (same weekday as start), monthly (same day of month; months without that day are skipped), annually (same day and month; 29 Feb only in leap years). Stored as RFC 5545 RRULE. Recurring events have no end date in v1.0 (parity); each occurrence spans one day. | F-20, HAAL-066 |
| FR-CAL-11 | Delete this occurrence: adds an exception for that date; series remains. | F-21, HAAL-067 |
| FR-CAL-12 | Delete all occurrences: soft-deletes the series. | F-21, HAAL-067 |
| FR-CAL-13 | Edit this occurrence: creates a separate one-off event for that date with the series' data and an exception in the series; editor opens on it. Cancel discards both (legacy saved on cancel — intentionally changed). | F-22, HAAL-067 |
| FR-CAL-14 | When the first occurrences of a series are removed by exceptions, the series' effective start moves to the first remaining occurrence. | F-23, HAAL-067 |
| FR-CAL-15 | Editor can be open only once; a second open attempt focuses it and shows a notice. | F-19, HAAL-069 |
| FR-CAL-16 | Duplicate-title warning: on creating an event and on changing the title of an existing event, if another active event of the same user has the same title (exact match, case-insensitive), a warning with a link to the existing event is shown; the user may proceed or cancel. | U#2, HAAL-080 |
| FR-CAL-17 | Overdue counter in sidebar: number of active one-off events whose start date is before today, plus active recurring series whose effective start (FR-CAL-14) is before today. Hidden when zero. Text: "N overdue event(s)". | F-32, HAAL-068 |
| FR-CAL-18 | Color can be changed directly in the details popover; change is saved immediately and undoable. | U#3, HAAL-081 |
| FR-CAL-19 | Event row in the day list shows an icon when the description is not empty, and an icon when attachments exist. | U#10, HAAL-083 |
| FR-CAL-20 | Move to next day: shifts start and end by +1 calendar day keeping times; for an occurrence of a series it creates an exception plus a one-off event on the next day. Available in popover and as bulk action. | U#11, HAAL-084 |
| FR-CAL-21 | Title autocomplete in search for active events ("title — date"); selecting jumps to the event date. | F-30, HAAL-039 |
| FR-CAL-22 | Day Number = ordinal day of the selected date in its year (1..365/366). | U#8, HAAL-082 |
| FR-CAL-23 | Week A/B (user settings): enable/disable; anchor week (any week the user marks as "A"); custom labels (default "A"/"B"). Label = first label when the number of whole weeks between the anchor week and the selected week is even, otherwise second label. Calculation must be correct across year boundaries and 53-week years. | U#12, HAAL-085 |
| FR-CAL-24 | Note and card due dates can be shown in the calendar as separate toggleable layers; clicking opens the source item. | HAAL-121 |
| FR-CAL-25 | Week view: 7 day columns starting on the configured week start, all-day row on top, timed events placed by time with overlapping events side by side, current-time line. | C-01, HAAL-087 |
| FR-CAL-26 | Month view: grid of weeks, events listed per day with "+N more" overflow; clicking a day opens its day view. | C-02, HAAL-088 |
| FR-CAL-27 | Agenda view: chronological list of upcoming events grouped by day, default range 30 days, configurable in settings. | C-03, HAAL-089 |
| FR-CAL-28 | Drag-and-drop rescheduling in week and month views (mouse and touch), keeping duration; for a recurring occurrence asks "this / this and following / all". Undoable. | C-04, HAAL-090 |
| FR-CAL-29 | Reminders: an event may have zero or more reminders (offset before start; for all-day events a time on the day or days before). Delivered as in-app notification (FR-X-21) and as browser notification when permission is granted, including when the app is closed (Web Push). | C-05, HAAL-091 |
| FR-CAL-30 | Extended recurrence: end never / on date / after N occurrences; interval every N days/weeks/months/years; weekly on selected weekdays; monthly by day of month, by Nth weekday (1st..4th, last) or on the last day of month. Stored as RRULE. | C-06, HAAL-092 |
| FR-CAL-31 | Edit and delete "this and following" occurrences: the series is split at the selected occurrence. | C-07, HAAL-093 |
| FR-CAL-32 | Multiple calendars per user: a default calendar is created for every user; calendars can be created, renamed, colored, hidden/shown and archived; each event belongs to one calendar; calendar is the unit of sharing (FR-ACC-10). | C-08, HAAL-094 |
| FR-CAL-33 | ICS (RFC 5545) import into a chosen calendar, including RRULE and EXDATE, with a report of imported and skipped items; export of a calendar to an .ics file. | C-09, HAAL-095 |
| FR-CAL-34 | Duplicate an event to another date (copy of all fields and attachments metadata). | C-10, HAAL-096 |
| FR-CAL-35 | ISO week numbers shown in the mini month calendar. | C-12, HAAL-097 |
| FR-CAL-36 | On touch devices, swiping left/right in day, week and month views moves to the next/previous period. | C-13, HAAL-098 |

### 3.3 To-Do (Keep-like)

| ID | Requirement | Source |
|---|---|---|
| FR-TODO-01 | Note fields: title, body, color, priority, pinned flag, archived flag, labels, due date (optional), attachments, timestamps. | HAAL-100 |
| FR-TODO-02 | Checklist notes: add, edit, check/uncheck, reorder items; checked items move to the bottom. | HAAL-101 |
| FR-TODO-03 | Pinned notes are shown above others; archived notes are shown only in the Archive view. Archive is not delete. | HAAL-100 |
| FR-TODO-04 | Labels: create, rename, assign; filter notes by label. | HAAL-102 |
| FR-TODO-05 | Grid and list layout; manual order by drag-and-drop and keyboard; order persists across devices. | HAAL-103 |
| FR-TODO-06 | A note with a due date appears in the calendar layer (FR-CAL-24). | HAAL-104 |
| FR-TODO-07 | Reminders on notes, same behaviour as FR-CAL-29. | T-01, HAAL-105 |

### 3.4 Kanban (Trello / Kanboard-like)

| ID | Requirement | Source |
|---|---|---|
| FR-KAN-01 | Boards: create, rename, archive, soft delete. | HAAL-110 |
| FR-KAN-02 | Columns: create, rename, reorder, archive; optional WIP limit with visual warning when exceeded (move still allowed). | HAAL-111 |
| FR-KAN-03 | Card fields: title, description, color, priority, due date, labels, checklist, attachments, timestamps. | HAAL-112 |
| FR-KAN-04 | Cards are moved within and between columns by drag-and-drop (mouse, touch) and keyboard; order is stable and synced; move is undoable. | HAAL-113 |
| FR-KAN-05 | Card activity shows its audit history; users can add comments. | HAAL-114 (Should) |
| FR-KAN-06 | Swimlanes. | HAAL-115 (Could) |
| FR-KAN-07 | Due-date reminders on cards, same behaviour as FR-CAL-29. | K-01, HAAL-116 |
| FR-KAN-08 | Badges on cards: overdue (due date passed) and due soon (within 24 hours). | K-02, HAAL-117 |
| FR-KAN-09 | Board filters: label, priority, due date (overdue / today / this week / none), assignee, text. | K-03, HAAL-118 |
| FR-KAN-10 | Assignees: on a shared board, cards can be assigned to one or more board members; filter "assigned to me". | K-04, HAAL-119 |

### 3.5 Integration between modules

| ID | Requirement | Source |
|---|---|---|
| FR-INT-01 | Any two items (event, note, card) can be linked; both sides show the link (backlink). Links survive soft delete and restore. | HAAL-120 |
| FR-INT-02 | Convert note ↔ card ↔ event keeping content, attachments and links. | HAAL-122 (Should) |
| FR-INT-03 | Command palette (Ctrl/Cmd+K): navigate, search, quick-create in any module. | HAAL-123 (Should) |
| FR-INT-04 | Time-blocking: dragging a note or card onto the day or week view creates an event for that time slot linked to the source item (FR-INT-01). | C-11, HAAL-124 |

### 3.6 Accounts, roles, sharing

| ID | Requirement | Source |
|---|---|---|
| FR-ACC-01 | Registration with e-mail and password; e-mail verification. Registration mode set by admin: open or invite-only (default invite-only). | HAAL-160 |
| FR-ACC-02 | Login/logout with server-side sessions (idle 30 days, absolute 90 days, list and revoke sessions); password hashing with Argon2id; minimum password length 15, checked against a common-password list; logout wipes local device data (ADR-0005). | HAAL-160 |
| FR-ACC-03 | Password reset by e-mail link (single use, expires in 1 hour); admin can reset manually when SMTP is absent. | HAAL-161 |
| FR-ACC-04 | Brute-force protection: progressive delay / temporary lockout after 5 failed attempts; optional TOTP 2FA (Should). | HAAL-162 |
| FR-ACC-05 | First start runs a setup wizard creating the first admin. | HAAL-163 |
| FR-ACC-06 | Roles: admin, user. Admin panel: list users, invite, deactivate (soft), reactivate, reset password, change role. An admin cannot deactivate the last admin. | HAAL-163, HAAL-164 |
| FR-ACC-07 | Data isolation: a user can access only own items and items explicitly shared with them. Enforced on the server for every request; covered by automated tests. | HAAL-165 |
| FR-ACC-08 | Profile: display name, avatar, time zone, locale (English only in v1.0). | HAAL-166 |
| FR-ACC-09 | Settings per user: week start day, 12/24-hour time, theme, default color, Week A/B (FR-CAL-23). Settings sync across devices. | HAAL-045 |
| FR-ACC-10 | Sharing: owner can share a calendar, note or board with other users of the instance with view or edit right; revoke at any time. | HAAL-167 (Should) |
| FR-ACC-11 | Time handling: timed events are stored as local date/time with an IANA time zone (UTC instant derived) and shown in the user's time zone; recurring events keep their wall-clock time across DST changes; all-day events are date-only and do not shift between time zones. | HAAL-169 |
| FR-ACC-12 | Optional OpenID Connect login. | HAAL-168 (Could) |

### 3.7 Offline-first and synchronisation

| ID | Requirement | Source |
|---|---|---|
| FR-OFF-01 | After the first successful login on a device, the app loads and all item features (view, create, edit, delete, restore, search, undo, export) work without network. | U#18, HAAL-051, HAAL-052 |
| FR-OFF-02 | Changes made offline are stored locally and queued; they survive page reload and browser restart. | U#18, HAAL-052 |
| FR-OFF-03 | On reconnect, queued changes sync automatically; each change is applied exactly once (idempotency). Sync status is visible (online/offline/syncing/error). | U#18, HAAL-053 |
| FR-OFF-04 | Conflicting edits of the same item never lose data silently; resolution follows ADR HAAL-050 and unresolved conflicts are shown to the user. | HAAL-054 |
| FR-OFF-05 | Functions requiring the server while offline (first login, registration, password reset, admin panel, sharing changes) show a clear "requires connection" message. | U#18 |
| FR-OFF-06 | App is installable as PWA on desktop and mobile. | HAAL-051 |

### 3.8 Migration, export, demo

| ID | Requirement | Source |
|---|---|---|
| FR-OPS-01 | Legacy import: an admin imports a legacy `db.db` into a chosen user. Mapping: events → events; daily/weekly/monthly/annually → RRULE; exclusions → exceptions; color ids → palette; `deleted=1` → soft-deleted with `deleted_at` = import time (legacy has no deletion time); legacy `create_ts`/`last_update_ts` (format `m/d/Y H:i:s TZ`) → timestamps; log → audit history. Dry-run produces a report (counts per table, unmapped values) without writing. | HAAL-130 |
| FR-OPS-02 | After import, every legacy event appears on exactly the same dates as in the legacy app (verified by automated comparison). | HAAL-130, HAAL-141 |
| FR-OPS-03 | Demo mode: seeded demo accounts and data; full reset to seed every 30 minutes; visible banner with time until next reset; stricter upload limits. | HAAL-154 |
| FR-OPS-04 | Backup and restore of database and attachments by documented commands. | HAAL-155 |

---

## 4. NON-FUNCTIONAL REQUIREMENTS

### 4.1 Performance
- API: p95 ≤ 200 ms, p99 ≤ 500 ms for item CRUD and day view at reference load (4.2), server-side.
- Local (offline store) operations reflected in UI ≤ 100 ms.
- Search: results ≤ 300 ms for 100 000 items per user.
- Web: Core Web Vitals at p75 — LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1; initial JS ≤ 300 KB gzip.
- Sync of 1 000 queued changes ≤ 10 s on a 10 Mbit/s link.

### 4.2 Scalability / capacity
- Reference install: up to 100 registered users, 50 concurrent, 100 000 items per user, 10 GB attachments.
- Stateless application containers; horizontal scaling behind a load balancer possible without code changes.

### 4.3 Security
- Target OWASP ASVS 5.0 Level 2; OWASP Top 10 and OWASP API Security Top 10 checklists pass.
- Authentication per FR-ACC-02..04; session cookies HttpOnly, Secure, SameSite; CSRF protection on state-changing requests.
- Authorization checked server-side on every request (FR-ACC-07); UUIDs for all public IDs.
- Input validation on server (schema-based); output encoding; strict Content-Security-Policy; security headers.
- Uploads: type verified by content, size limits, stored outside web root, served with safe headers.
- Rate limiting on auth and write endpoints.
- No secrets in repository; configuration via environment/secret files.
- Dependency vulnerability and licence scans in CI; SBOM per release.
- Logs never contain passwords, tokens or item contents.

### 4.4 Compliance and privacy
- Audit log of all mutations (FR-X-03).
- Data portability: user JSON export (FR-X-14).
- No external telemetry by default.
- **Open issue:** "never delete" (FR-X-01) conflicts with the GDPR right to erasure for operators in the EU. Resolution deferred to the later "trash cleanup" decision (owner, 2026-10-14). Accepted by owner as a known open issue for v1.0 (section 9).

### 4.5 Availability and reliability
- Server availability is the operator's responsibility; the app provides health/readiness endpoints, graceful shutdown and automatic restart policy in Compose.
- Client continues to work during server or network outage (FR-OFF-01).
- Backup: documented daily backup procedure; RPO ≤ 24 h, RTO ≤ 1 h with documented restore.
- Database migrations are forward-only, automatic on start, and tested on a copy of production-like data.
- Optimistic concurrency (item `version`) prevents lost updates.

### 4.6 Usability and accessibility
- WCAG 2.2 Level AA.
- Full keyboard operability (FR-X-08); visible focus.
- Responsive from 360 px (FR-X-17); touch targets ≥ 44×44 px.

### 4.7 Maintainability and testability
- Project Manifest kept current after every change; ADR for every significant decision.
- Automated tests for every feature; backend line coverage ≥ 80 %; E2E scenario for every F-xx (HAAL-141).
- Code comments include the `+++===+++` author/date marker.

### 4.8 Portability and compatibility
- Deployable with one `docker compose up` on Linux x86_64 and arm64.
- Configuration by environment variables (Twelve-Factor).
- Standards: RFC 5545 (recurrence), ISO 8601 (dates/weeks), RFC 9457 (API errors), OpenAPI 3.1+ (API contract).

### 4.9 Observability
- Structured JSON logs with correlation ID per request; metrics endpoint; log redaction.

### 4.10 Internationalisation
- English only in v1.0; all UI strings externalised; dates/times formatted by user settings.

---

## 5. CONSTRAINTS
- On-premises first; no mandatory dependency on external SaaS.
- Data stays in the operator's database and storage.
- Soft delete only; trash kept forever in v1.0.
- Product name: Haalendar.
- Licence: Apache License 2.0 with NOTICE file (author attribution, no warranty/liability).

## 6. THIRD-PARTY INTEGRATIONS AND DEPENDENCIES
| Integration | Required | Purpose |
|---|---|---|
| SMTP server (operator) | Optional | E-mail verification, password reset, invites |
| OpenID Connect provider | Optional (Could) | SSO |
| Reverse proxy / TLS | Required in production | HTTPS |
| Legacy Haalendar SQLite file | One-time | Import |

## 7. TECHNICAL SPECIFICATIONS
Defined by ADRs and contracts produced in later tasks: stack (HAAL-010), deployment (HAAL-011), auth (HAAL-012), domain model (HAAL-013), manifest (HAAL-014), API contract (HAAL-015), offline sync (HAAL-050).

---

## 8. TRACEABILITY

### 8.1 Legacy features → requirements
| Legacy | Requirement |
|---|---|
| F-01 | FR-CAL-02 |
| F-02, F-03 | FR-CAL-03 |
| F-04 | FR-CAL-04 |
| F-05 | FR-CAL-05 |
| F-06 | FR-X-10 |
| F-10, F-13 | FR-CAL-06 |
| F-11 | FR-CAL-07 |
| F-12 | FR-X-13 |
| F-14 | FR-CAL-01 |
| F-15 | FR-CAL-08 |
| F-16 | FR-CAL-09, FR-X-08 |
| F-17 | FR-X-01, FR-CAL-09 |
| F-18 | FR-X-18 |
| F-19 | FR-CAL-15 |
| F-20 | FR-CAL-10 |
| F-21 | FR-CAL-11, FR-CAL-12 |
| F-22 | FR-CAL-13 |
| F-23 | FR-CAL-14 |
| F-30 | FR-CAL-21, FR-X-10 |
| F-31 | FR-X-04 |
| F-32 | FR-CAL-17 |
| F-33 | FR-X-03 |
| F-34 | FR-X-15 |

### 8.2 Owner requests → requirements
| Request | Requirement |
|---|---|
| U#1 Export archive | FR-X-14 |
| U#2 Duplicate title warning | FR-CAL-16 |
| U#3 Color from details | FR-CAL-18 |
| U#4 Keyboard navigation | FR-X-08, FR-INT-03 |
| U#5 Full-text search | FR-X-10 |
| U#6 Unsaved-changes guard | FR-X-09 |
| U#7 Gap analysis | HAAL-003 (outside this SRS until approved) |
| U#8 Day Number | FR-CAL-05, FR-CAL-22 |
| U#9 Images/screenshots | FR-X-11 |
| U#10 Description icon | FR-CAL-19 |
| U#11 Move to next day | FR-CAL-20 |
| U#12 Week A/B | FR-CAL-05, FR-CAL-23 |
| U#13 Priority | FR-X-12 |
| U#14 Result notifications | FR-X-05 |
| U#15 Creation/deletion dates | FR-X-02 |
| U#16 Ctrl+Z | FR-X-06 |
| U#17 Multi-select | FR-X-07 |
| U#18 Offline + sync | FR-OFF-01..06 |
| Multi-user | FR-ACC-01..12 |
| Mobile | FR-X-17, FR-OFF-06 |
| Demo 30 min | FR-OPS-03 |

### 8.3 Intentional deviations from legacy
| Legacy behaviour | New behaviour | Reason |
|---|---|---|
| Day list ordered by color name | All-day, then time, then title | Defect |
| Week number of today | Week number of selected date | Defect |
| Cancel in "edit this occurrence" still saves | Cancel discards | Defect |
| 1-second polling | Push updates | Performance |
| Trash ordered by creation time | Ordered by deletion time | Defect (no deletion time existed) |
| Single user, no auth | Multi-user with auth | Owner decision |

---

### 8.4 Gap analysis (v1.0 scope) → requirements
| Gap item | Requirement |
|---|---|
| C-01 | FR-CAL-25 |
| C-02 | FR-CAL-26 |
| C-03 | FR-CAL-27 |
| C-04 | FR-CAL-28 |
| C-05 | FR-CAL-29 |
| C-06 | FR-CAL-30 |
| C-07 | FR-CAL-31 |
| C-08 | FR-CAL-32 |
| C-09 | FR-CAL-33 |
| C-10 | FR-CAL-34 |
| C-11 | FR-INT-04 |
| C-12 | FR-CAL-35 |
| C-13 | FR-CAL-36 |
| C-14 | FR-X-19 |
| T-01 | FR-TODO-07 |
| T-02 | FR-X-20 |
| K-01 | FR-KAN-07 |
| K-02 | FR-KAN-08 |
| K-03 | FR-KAN-09 |
| K-04 | FR-KAN-10 |
| G-01 | FR-X-21 |

## 9. DECISION LOG AND OPEN ISSUES

### 9.1 Owner decisions (2026-10-14)
| # | Topic | Decision | Requirement |
|---|---|---|---|
| D-01 | Users | Multi-user | FR-ACC-* |
| D-02 | Week A/B | Fully configured by user in settings | FR-CAL-23 |
| D-03 | Day Number | Day of year 1..366 | FR-CAL-22 |
| D-04 | Priority | Low / Medium / High, default Medium | FR-X-12 |
| D-05 | Export | JSON, all 3 modules, incl. soft-deleted, all data, no image binaries | FR-X-14 |
| D-06 | Duplicate warning | Exact, case-insensitive, active events only; on create and on title change | FR-CAL-16 |
| D-07 | Trash | Keeps everything forever, no purge in v1.0 | FR-X-04 |
| D-08 | Demo | Reset every 30 minutes | FR-OPS-03 |
| D-09 | Name | Haalendar | 5 |
| D-10 | Mobile | Responsive out of the box; slide-out drawer navigation | FR-X-17 |
| D-11 | Browsers | Two latest versions of Chrome, Edge, Firefox, Safari, iOS Safari, Android Chrome | 2.4 |
| D-12 | Server | x86_64 + arm64 images; min 2 vCPU, 2 GB RAM, 10 GB disk | 2.4 |
| D-13 | Undo | 50 steps per browser session | FR-X-06 |
| D-14 | Attachments | PNG, JPEG, WebP, GIF; max 10 MB per file | FR-X-11 |
| D-15 | Counter wording | Overdue | FR-CAL-17 |
| D-16 | Accounts | Invite-only by default; reset link 1 h; lockout after 5 failed attempts | FR-ACC-01, 03, 04 |
| D-17 | Legacy import | Deleted legacy events get `deleted_at` = import time | FR-OPS-01 |
| D-18 | Performance / capacity | API p95 ≤ 200 ms; 100 users, 50 concurrent; 100 000 items per user | 4.1, 4.2 |
| D-19 | Security | OWASP ASVS 5.0 Level 2 | 4.3 |
| D-20 | Reliability / quality | RPO ≤ 24 h, RTO ≤ 1 h; backend coverage ≥ 80 % | 4.5, 4.7 |
| D-21 | Licence | Apache-2.0 with NOTICE | 5 |
| D-22 | Gap analysis | All recommendations approved: 21 items into v1.0, rest per `requirements/gap-analysis.md` | 8.4 |
| D-23 | Technology stack | ADR-0003 accepted: React + Vite SPA, uv + pnpm, SQLAlchemy + Alembic instead of Next.js, Pants, Prisma/SQLModel | 2.5 |
| D-24 | Auth | ADR-0005 accepted: server sessions, password ≥ 15, admins without content access, export of owned items, RLS, logout wipes device data | FR-ACC-02, FR-X-14 |
| D-25 | Domain model | Item supertype, local time + IANA zone, delete batch id, default colors calendar blue / event brown | FR-ACC-11 |
| D-26 | First-run setup | Setup token `HAALENDAR_SETUP_TOKEN` is mandatory in production (wizard refuses without it, 403) and optional in development; the server still starts without it because the token is not needed after setup | FR-ACC-05 |
| D-27 | Admin panel | HAAL-164 also ships the minimal auth UI needed to reach it (sign-in incl. 2FA code, session gate, sign-out, re-auth dialog, invitation page, mandatory password change); the remaining auth UI moves to a new task (HAAL-171). Invitation without SMTP creates the account with a one-time password; pending invitations can be listed and revoked (kept as revoked); Idempotency-Key accepted on invitations, generic replay handling deferred to offline sync. Admins cannot act on their own account; role/status changes are serialised so one active admin always remains | FR-ACC-06 |
| D-28 | Data isolation | Two PostgreSQL roles: the owner runs migrations and `haalendar-db-bootstrap`; the app connects as a least-privilege role (no superuser, no BYPASSRLS, SELECT/INSERT/UPDATE only — no DELETE/TRUNCATE, so physical deletes are impossible); production refuses a role that bypasses RLS. Isolation is proven on the first real protected tables `calendar` and `share` (created in HAAL-165, endpoints in HAAL-094/167); account tables stay outside RLS. Unreadable resources answer 404, read-only ones 403 | FR-ACC-07 |
| D-29 | Profile and avatars | The ADR-0004 storage port with the local adapter is built now (content-addressed BLAKE3, per-user prefix, never deleted; `HAALENDAR_STORAGE_DIR`, required in production) and reused by attachments (HAAL-040). Avatars are uploaded as the raw request body (no multipart), re-encoded to a 256×256 WebP (EXIF/GPS stripped, 2 MB and 40 MP limits) and visible to every signed-in user of the instance. The profile is a section of Settings; the avatar links to it from the navigation | FR-ACC-08 |

### 9.2 Open issues
| # | Issue | Status |
|---|---|---|
| O-01 | GDPR right to erasure vs "never delete" (FR-X-01) | Accepted as known open issue for v1.0; revisit with trash cleanup design |
| O-02 | Gap-analysis features (U#7) | Closed — approved (D-22) |
