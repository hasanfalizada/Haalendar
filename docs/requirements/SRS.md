# SOFTWARE REQUIREMENTS SPECIFICATION (SRS) — Haalendar

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-002 v1.0 approved by owner; HAAL-003 v1.1 adds approved gap-analysis scope. Decisions logged in section 9.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-163 v1.5: decision D-26 (setup token) approved by owner.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-164 v1.6: decision D-27 (admin panel scope) approved by owner.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-165 v1.7: decision D-28 (isolation: database roles, first protected tables) approved by owner.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-166 v1.8: decision D-29 (profile and avatars) approved by owner.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-167 v1.9: decision D-30 (sharing scope) approved by owner.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-169 v1.10: decisions D-31 (time handling) and D-32 (OIDC deferred to v1.1) approved by owner.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-171 v1.11: decision D-33 (auth UI scope) approved by owner.
+++===+++ 2026-10-16 — Hasan Alizada — HAAL-030 v1.12: decision D-34 (soft delete enforcement) approved by owner.
+++===+++ 2026-10-16 — Hasan Alizada — v1.13: decision D-35 (development documentation public in the code repository) approved by owner.
+++===+++ 2026-10-16 — Hasan Alizada — HAAL-031 v1.14: decision D-36 (record timestamps) approved by owner.
+++===+++ 2026-10-16 — Hasan Alizada — HAAL-032 v1.15: decision D-37 (audit log) approved by owner.
+++===+++ 2026-10-16 — Hasan Alizada — HAAL-033 v1.16: decision D-38 (trash) approved by owner.
+++===+++ 2026-10-16 — Hasan Alizada — HAAL-034 v1.17: decision D-39 (result notifications and local drafts) approved by owner.
+++===+++ 2026-10-16 — Hasan Alizada — HAAL-035 v1.18: decision D-40 (undo / redo) approved by owner.
+++===+++ 2026-10-16 — Hasan Alizada — HAAL-036 v1.19: decision D-41 (multi-select and bulk actions) approved by owner.
+++===+++ 2026-10-16 — Hasan Alizada — HAAL-037 v1.20: decision D-42 (keyboard navigation and shortcut overlay) approved by owner.
+++===+++ 2026-10-16 — Hasan Alizada — HAAL-038 v1.21: decision D-43 (unsaved-changes guard) approved by owner.
+++===+++ 2026-10-17 — Hasan Alizada — v1.22: decision D-44 (all commits directly on revamp) approved by owner.
+++===+++ 2026-10-17 — Hasan Alizada — HAAL-040 v1.23: decision D-45 (attachments and the item supertype) approved by owner; HAAL-039 postponed until HAAL-050..052 and the first item module exist.
+++===+++ 2026-10-17 — Hasan Alizada — HAAL-041 v1.24: decision D-46 (priority) approved by owner.
+++===+++ 2026-10-18 — Hasan Alizada — HAAL-042 v1.25: decision D-47 (shared palette and contrast) approved by owner.
+++===+++ 2026-10-18 — Hasan Alizada — HAAL-043 v1.26: decision D-48 (Takeout-style export, background jobs, service data) approved by owner; revises D-05.
+++===+++ 2026-10-19 — Hasan Alizada — HAAL-044 v1.27: decision D-49 (user menu, Help and About) approved by owner.
+++===+++ 2026-10-19 — Hasan Alizada — HAAL-045 v1.28: decision D-50 (user settings) approved by owner.
+++===+++ 2026-10-19 — Hasan Alizada — HAAL-047 v1.29: decision D-51 (Markdown rendering and editor) approved by owner.
+++===+++ 2026-10-19 — Hasan Alizada — HAAL-048 v1.30: decision D-52 (notification center) approved by owner.
+++===+++ 2026-10-21 — Hasan Alizada — HAAL-170 v1.31: decision D-53 (mobile rules) approved by owner.
+++===+++ 2026-10-21 — Hasan Alizada — HAAL-050. v1.32: decision D-54 (offline-first and sync, ADR-0009) approved by owner.
+++===+++ 2026-10-21 — Hasan Alizada — HAAL-051. v1.33: decision D-55 (installable app and offline start) approved by owner.
+++===+++ 2026-10-21 — Hasan Alizada — HAAL-053. v1.34: decision D-56 (sync API, amends ADR-0009) approved by owner; HAAL-053 done before HAAL-052.
+++===+++ 2026-10-21 — Hasan Alizada — HAAL-052. v1.35: decision D-57 (local store and outbox) approved by owner.
+++===+++ 2026-10-22 — Hasan Alizada — HAAL-054. v1.36: decision D-58 (conflict resolution) approved by owner.
+++===+++ 2026-10-22 — Hasan Alizada — HAAL-055. v1.37: decision D-59 (live updates) approved by owner.
+++===+++ 2026-10-22 — Hasan Alizada — HAAL-066. v1.38: decision D-60 (events and recurrence) approved by owner; HAAL-066 done before HAAL-060.
+++===+++ 2026-10-22 — Hasan Alizada — HAAL-060. v1.39: decision D-61 (day view and day order) approved by owner.
+++===+++ 2026-10-22 — Hasan Alizada — HAAL-061. v1.40: decision D-62 (calendar navigation and sidebar) approved by owner.
+++===+++ 2026-10-23 — Hasan Alizada — HAAL-062. v1.41: decision D-63 (calendar header) approved by owner.
+++===+++ 2026-10-23 — Hasan Alizada — HAAL-063. v1.42: decision D-64 (event editor) approved by owner.
+++===+++ 2026-10-23 — Hasan Alizada — HAAL-064. v1.43: decision D-65 (event details) approved by owner.
+++===+++ 2026-10-23 — Hasan Alizada — HAAL-065. v1.44: decision D-66 (deleting events) approved by owner.

| Field | Value |
|---|---|
| Version | 1.44 |
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
- Offline sync: custom outbox + Dexie, server pull/push, field-level conflict merge (ADR-0009, D-54).
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
| D-30 | Sharing | Generic sharing API for all container kinds (calendar available now, board/note with their tables); reusable share dialog wired into containers by their tasks (calendars: HAAL-094) plus a Settings overview; an unknown e-mail is reported explicitly (instance-internal, signed-in users only); grantees may leave a share (soft revoke of their own share, RLS policy share_leave); no e-mail notification — in-app `share_received` comes with HAAL-048 | FR-ACC-10 |
| D-31 | Time handling | The approved model stays: event wall-clock times + IANA tzid, UTC derived; "store UTC" in HAAL-169 means instants. Conversions are atoms time.local_to_utc.v1 (RFC 5545 gap/overlap rules) and time.event_days.v1 (viewer's days), TypeScript without dependencies on Intl; backend uses only the pinned tzdata; DB sessions in UTC; display in the profile zone with a device/profile mismatch notice. Details: architecture/time-handling.md | FR-ACC-11 |
| D-32 | OIDC/SSO | HAAL-168 (Could) is deferred to v1.1; v1.0 ships local accounts, invitations and optional TOTP only | FR-ACC-12 |
| D-33 | Auth UI | HAAL-171 also implements the instance settings (registration mode, admin 2FA policy; enabling the policy is refused while the acting admin has no 2FA) and the session list with revoke one / all others; TOTP QR codes are rendered in the browser with uqr (no network, no innerHTML); new endpoints: verification resend (generic 202, 5-minute throttle, old links revoked) and recovery-code regeneration (re-auth) | FR-ACC-01..04 |
| D-34 | Soft delete enforcement | Four layers: soft_delete/live/restore_batch helpers; SQLAlchemy guards refusing ORM deletes, delete() and DELETE/TRUNCATE SQL; no DELETE/TRUNCATE privilege for the app role; BEFORE DELETE/TRUNCATE triggers on every table for every role. Tests fail on delete constructs in the code (explicit `physical-delete-allowed` markers only), on contract DELETE operations without `x-soft-delete`, and on tables without triggers. Maintenance only as superuser with session_replication_role = replica (throw-away databases; demo reset and a possible erasure procedure for O-01 must be designed against this) | FR-X-01 |
| D-35 | Development documentation | The development documentation moves into `docs/` of the public code repository with its full history (git subtree); the separate private repository is no longer updated. Nothing secret is kept in `docs/` | ADR-0002 §6 |
| D-36 | Record timestamps | Database triggers keep `updated_at` current on every UPDATE (soft delete and restore included) and keep `created_at` unchangeable on every table; tests fail for a table without them. Display: relative for the last 7 days, otherwise date and time, exact value in the tooltip and `<time datetime>`, profile time zone. Actor shown only as "by you" until the audit history (HAAL-032); `deleted_by` = `updated_by` of the deleted row | FR-X-02 |
| D-37 | Audit log | Written by SECURITY DEFINER database triggers on every audited table (the app role has SELECT only, under RLS; audit_log is append-only for every role). Audited: content and shares, plus account changes relevant to admins (role, status, profile, instance settings) without secret or login-bookkeeping columns; sessions, tokens, recovery codes and logins stay in the structured logs. Snapshots: full row on create, changed fields only otherwise; technical columns ignored. Actions derived (create/update/delete/restore/move/share/unshare). Readers: container owner and grantees (share history: owner only); account history: the account and admins. Kept forever (GDPR O-01 open). Every table is audited or listed as exempt (test) | FR-X-03 |
| D-38 | Trash | Reusable multi-select hook built with the trash (checkbox, Shift range, select all, Esc, long press); HAAL-036 adds bulk actions on it. One entry per delete batch with counts of its contents; restoring an entry restores the batch; an item whose container is still in the trash is refused with parent_in_trash and the UI offers to restore the container too. The trash shows everything the user may restore (own content, containers shared with edit permission; deleted containers only for the owner) with who deleted it. Nothing is purged. Sources register per type (calendar now) | FR-X-04, FR-X-07 |
| D-39 | Result notifications and local drafts | Toasts with Sonner (bundled stylesheet, the CSP stays `style-src 'self'`). Every write from the UI goes through one wrapper (`runWrite`) that reports exactly one result: success (4 s), or failure with a human-readable reason (no connection, no answer within 30 s, changed elsewhere, invalid fields, no permission, too large, session expired with "Sign in", server error with a request reference) that stays until dismissed and offers Retry where repeating can help; failures are announced as alerts. Inside an open dialog the dialog shows the failure; full-page sign-in/sign-up flows show the result on the page. A test fails when a module writes without the wrapper. "Queued" and "synced" notifications are provided for the offline outbox (HAAL-052/053). Forms keep their values on failure; closing the tab while a write is in flight asks first. New requirement: text being edited is kept as a local draft on the device (IndexedDB, per user, one second after typing and when the tab is hidden) until the server confirms the save, and offered for restore after a failure, a conflict, a reload or a crash; drafts never contain passwords, codes or tokens and are deleted on sign-out (which asks first when drafts exist). Existing in-page result banners were replaced by notifications | FR-X-05, FR-X-09, FR-OFF-02 |
| D-40 | Undo / redo | Client-side: an undo step is data (kind, label, payload) turned into the inverse request by a handler registered per kind — create ↔ soft delete, delete ↔ restore of the delete batch, update ↔ previous values with If-Match. The history ("per browser session", D-13) lives in the tab's sessionStorage: it survives a reload, ends with the tab, belongs to the signed-in user and is cleared on sign-out; 50 steps, a new action clears redo, steps run one after another, a bulk action is one step. A step whose record was changed meanwhile is dropped with "cannot undo"; one that failed for lack of connection stays. Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y (not inside text fields, not behind an open dialog); every undoable write offers Undo in its notification (design system amended: not only destructive and move actions). First users: sharing (give access, change permission, remove access; leaving a share is not undoable) | FR-X-06, D-13 |
| D-41 | Multi-select and bulk actions | Built before the item modules: complete selection (checkbox, Ctrl/Cmd+click, Shift+click range, Ctrl/Cmd+A = all loaded rows of the list, Esc, long press then tap on touch), a shared bulk bar ("N of M selected", only actions every selected row supports) and `POST /bulk` with a source registry; calendars are the first kind (delete, restore, color; owner only; the default calendar cannot be deleted). Priority and "move to next day" arrive with notes, cards and events, which register their kinds. Contract amended: typed targets (containers too), per-target color / priority (one request undoes a change of mixed values), new versions in the answer. All-or-nothing: one refused target refuses the request and the problem names every refused target (/targets/{index} with not_found, forbidden, version_conflict, unsupported, invalid_state); only conflicts → 412, otherwise 422. A bulk action is one notification and one undo step | FR-X-07, FR-X-06 |
| D-42 | Keyboard navigation | One shortcut registry: every shortcut is registered with a group and a label; keys are matched by physical position (any keyboard layout), Mod = Ctrl or Cmd; single keys never fire in text fields and nothing fires behind an open dialog. The "?" overlay (also a keyboard button in the rail) lists only what works on the current page. Lists: one Tab stop (roving focus), ↑/↓, Home/End, Shift+↑/↓ extend, Space selects, Enter/E open, Delete deletes the selection or the focused row after a confirmation whose focused button makes it Delete → Enter (legacy F-16); the trash has no Delete (nothing is purged). F6 / Shift+F6 move between the regions of the page; Alt+1..3 stay the module keys. Module keys (T, ←/→, D/W/M/A, N, Shift+N, Ctrl+K, /) register with their modules. No user remapping in v1.0 | FR-X-08 |
| D-43 | Unsaved-changes guard | One hook for every editor: in-app navigation (links, Alt+1..3, browser back) is held by the router history and asks in an app dialog; dialog editors ask on Esc, backdrop, close button and Cancel; closing or reloading the tab shows the browser's own prompt (also while a write is in flight). Answers: Keep editing (focused; Esc), Discard changes, and for editors with a local draft also "Leave, keep the draft". Nothing is asked without changes or after saving. Ctrl/Cmd+Enter saves the editor holding the focus. Applied to profile, instance settings, password change, invitation and share dialogs; sign-in, sign-up, reset and setup pages are not guarded | FR-X-09 |
| D-44 | Repository workflow | Until v1.0 every task is committed directly on `revamp` (no feature branches or pull requests per task); the owner commits and pushes; `revamp` is merged into `master` later as a whole (ADR-0002 section 7) | ADR-0002 |
| D-45 | Attachments | The `item` supertype table (domain model 5.4, without its endpoints and full-text column) is created with HAAL-040 because attachments hang off it; its modules add subtypes and endpoints. Attachments copy the item's container_kind / container_id, so row-level security (content policies: read = container owner or any share; write = owner or edit share) and the audit log treat them like their item. Upload as the raw request body with the name in X-File-Name (no multipart); type by content; still PNG/JPEG/WebP re-encoded without metadata (EXIF/GPS) — PNG lossless, JPEG/WebP quality 95 — GIF and animated WebP kept as sent; limits 10 MB, 40 megapixels, 300 frames, 20 per item, no per-user quota; WebP thumbnail ≤ 320 px made at upload; served only through the API (nosniff, sandbox CSP, private cache). Soft delete keeps the files; attachments are restorable from the trash and undoable. HAAL-039 (search) is postponed until its dependencies (HAAL-050..052, first item module) are done | FR-X-11, FR-X-04, FR-X-06 |
| D-46 | Priority | Atom items.priority.v1 (Python and TypeScript, one set of vectors): missing = medium; order high → low with a module tie-break (events: start, cards: position, notes: change time); filter by a set of levels, empty = all; the server sorts and filters in SQL with the same order (rank_sql / filter_sql). Badge = icon + text (icon-only keeps a screen-reader label); details and editors show all three levels, list rows only high and low. Picker = Low / Medium / High radio buttons; filter = toggle buttons, kept in the address (`?priority=high,medium`). Bulk set_priority and set_color for events, notes and cards now (container access decided in SQL); their delete/restore come with the modules. Wiring into lists and editors is done by the modules | FR-X-12, FR-X-07 |
| D-47 | Shared palette | The 8 legacy colors in fixed order, brown by default (items), one list in the web app (`lib/palette.ts`) checked against the contract and the backend by a test. Theme variants so the color bar and swatches reach ≥ 3:1 against the page (WCAG 1.4.11): yellow `#B88A00` in the light theme, brown `#A8622A` in the dark theme; text sits on a 16 % tint in the normal foreground color (≥ 4.5:1). Both rules are checked automatically for every color in both themes. Color picker = named radio swatches with a check mark on the chosen one. Legacy color ids (0..7) are mapped by the legacy import (HAAL-130) after checking the real legacy table; a per-user default color comes with the settings task | FR-X-13 |
| D-48 | Export (Google-Takeout style; revises D-05) | The user chooses modules and whether to include images; a background job (Procrastinate on PostgreSQL, process `haalendar-worker`) builds a ZIP: `archive.json` (complete, schema `haalendar-export-1.0`, the schema itself inside the archive), `.ics` per calendar (active events), images when chosen, `README.html`; one export at a time; a password confirmation is needed; ready is announced in the app and by e-mail; the archive can be downloaded for 7 days, then it is removed while the request row stays. "Mine" = the containers the user owns and everything in them, deleted records included; nothing from other people's containers (ADR-0005). Schema versioning: 1.x additive, 2.0 breaking. Rule clarified by the owner: user content and its metadata are never physically deleted; service data (job queue bookkeeping, caches, temporary archives) may be — such tables are listed explicitly (`SERVICE_TABLES`, today only the worker registry) and checked by tests. Scheduled exports: v1.1 | FR-X-14, FR-X-01 |
| D-49 | User menu (FR-X-15) | The avatar in the rail opens a dropdown (name, e-mail; Profile, Settings, Export your data; Help, About Haalendar; Sign out); on phones the profile block in the drawer expands into the same items. Profile and Export lead to their sections of Settings (`/settings#profile`, `#export`), which are scrolled to and focused, also when Settings is already open; Settings stays a single page (sub-pages later if needed); the Settings icon stays in the rail. Help: keyboard shortcuts (the "?" overlay), documentation (`docs/` in the repository), report a problem (GitHub issues). About: logo, name, version of the build (from `package.json`), "free and open-source, no usage restrictions", Apache-2.0, links to the author's website, the repository and the licence text (legacy F-34); the links are fixed in the code as the project's attribution. External links open in a new tab with `rel="noopener noreferrer"`. Sign out from the menu and from the profile share one flow (asks first when drafts exist, D-39). No new shortcut | FR-X-15 |
| D-50 | User settings (FR-ACC-09) | Stored on the server in `user_settings` (one row per user, owner-only row-level security, never deleted, version for If-Match; rows of existing users created by the migration, a new user's row on first use); `GET/PATCH /me/settings` (JSON merge patch). Defaults: week starts Monday, 24-hour time, theme follows the system, brown for new items, agenda 30 days, Week A/B off with labels A/B. The theme is the server's value on every device; the browser caches it for the first paint and the sign-in pages. Settings → Preferences is one form saved with If-Match (unsaved-changes guard, local draft, Ctrl/Cmd+Enter); the theme is previewed at once and stored on Save, leaving without saving restores it. 12/24-hour applies to every time shown. Week A/B follows the approved atom `calendar.week_ab_label.v1`: weeks cut by the user's week start, anchor = any date of the first-label week, labels trimmed, 1–10 characters, different (case-insensitive); the form previews this and next week's label. Settings are part of the export (`settings` in archive.json, schema 1.x). Not audited (preferences: neither content nor an account change relevant to administrators, D-37). Editing needs a connection until HAAL-052 | FR-ACC-09, FR-CAL-23, FR-CAL-27, FR-X-16 |
| D-51 | Markdown (FR-X-20) | Rendered in the browser only with react-markdown (React elements, no innerHTML); CommonMark + GFM autolinks, strikethrough, tables and read-only task boxes; a single line break is a break (legacy plain text keeps its lines). Raw HTML is never interpreted and is shown as literal text; links keep only http(s), mailto and tel and open in a new tab with `rel="noopener noreferrer nofollow"`, other URLs become text; Markdown images are never loaded (shown as a link; pictures are attachments). Headings are shifted below the page's own (h1 → h4). The server stores and returns the source unchanged (API, export, ICS DESCRIPTION); no server rendering. `MarkdownEditor`: text area with Write/Preview, Ctrl/Cmd+B and Ctrl/Cmd+I, "Formatting help" (cheat sheet rendered by the same renderer plus a scratch area), also in Help → Text formatting. `toPlainText` for one-line previews and later search. The renderer is a lazily loaded chunk. Fields use these components as their modules ship (063, 100, 112, 114) | FR-X-20, T-02 |
| D-52 | Notification center (FR-X-21) | Table `notification` (one row per notification and user, owner-only row-level security, never deleted, not audited; only read_at / delivered_push_at may change). Notifications for other users are written by database triggers with SECURITY DEFINER functions: share granted → `share_received`, revoked by the owner → `share_revoked` for the grantee, nothing when the grantee leaves. The worker adds `export_ready` for the user's own export (new kind, contract additive). Payload holds display data only; the client builds the text from kind + payload (i18n, plain text). `GET /notifications` (newest first, pages of 20 in the UI, unread count), `POST /notifications/read` (ids or all, 204). Bell in the rail with the unread count (99+) and a popover list; on phones a drawer entry opening it full screen; opening a notification marks it read and goes to its place (Settings #sharing / #export); Mark all read; Show more. Checked every 60 s while the tab is visible and on return to it until SSE (HAAL-055). Sync errors live on the device (IndexedDB per user, wiped on sign-out) and are merged into the list; their source is the outbox (HAAL-052/053). Reminders (HAAL-091), assignments and comments (HAAL-119/114) use the same table; browser / Web Push delivery comes with HAAL-091 | FR-X-21, G-01 |
| D-53 | Mobile layout (FR-X-17) | Touch targets follow the pointer type: 44 px on touch devices of any size and on phones, compact only with a mouse from 768 px (`h-11 pointer-fine:md:h-8`), applied in the base components (Button, Input, Select, menu items, priority and colour pickers, dialog close, rail) and a global rule for check boxes / radio buttons and their labels. Fields use 16 px text on touch (no iOS zoom). Standalone links are 44 px targets, links in a sentence keep the line. Tables become cards on phones; long text wraps. All existing screens were audited at 360 × 640, 390 × 844, 640 × 360 and 768 × 1024 and fixed (admin cards widened by long e-mails, dialog close 40 px, About/Help links 36 px, formatting cheat sheet wider than the screen, sign-in page links 20 px). Rules and a per-screen checklist in design-system 5.1; automated viewport checks in HAAL-143; module layouts (floating New, full-screen editors, swipe, Kanban column) with their modules. `useCoarsePointer` for behaviour CSS cannot express | FR-X-17 |
| D-54 | Offline-first and sync (FR-OFF-01..05, FR-X-18) | ADR-0009. Custom outbox with Dexie (IndexedDB) as the local database; the server stays our FastAPI through `sync/pull` and `sync/push` — every write keeps RLS, audit, validation, soft delete and versions; no sync service, no logical replication, OSI licences only (PowerSync, ElectricSQL, Zero, Replicache, RxDB, TanStack DB, Yjs/Automerge evaluated and rejected; TanStack DB re-evaluated at 1.0). Pull: global `sync_seq` plus the writing transaction id, cursor = last number + transactions in progress, so nothing is skipped; tombstones for containers no longer readable; first sync paged. Push: mutations by `mutation_id`, applied once through the regular services, recorded in the service table `sync_mutation` (kept); results applied / duplicate / conflict / rejected. Conflicts: disjoint fields merge; the same field changed elsewhere keeps the server value and turns the local value into a conflict record (keep mine / keep theirs, shown in the item and the notification center); edit of a deleted item offers restore; positions and sets merge without conflicts; lost access keeps the text as a conflict record. Client: one syncing tab (Web Locks) + BroadcastChannel, TanStack Query reading Dexie (local writes ≤ 100 ms), 401 pauses the outbox until the same user signs in, sign-out syncs then wipes, local schema changes rebuild from a pull. Device data unencrypted (accepted risk, wiped on sign-out). Implemented in HAAL-051..055 | FR-OFF-01..05, FR-X-18 |
| D-55 | PWA (FR-OFF-01, FR-OFF-05, FR-OFF-06) | `vite-plugin-pwa` 2.0 generateSW in production builds: precaches the app shell only (JS, CSS, fonts, icons, index.html, no source maps), every app address opens from it without network except `/api/`, `/metrics`, `/health`; no API answer is ever cached (user data offline is the local database, HAAL-052). A new version waits for the user ("A new version is available — Reload"). Manifest: standalone, start `/calendar`, theme colours, icons incl. maskable, shortcuts Calendar / To-Do / Kanban. The last profile (no CSRF token) is kept on the device and stands in when the server cannot be reached (no answer, 502/503/504), so the app starts offline after a sign-in; it is re-checked every 30 s and on reconnect and forgotten on sign-out. Offline banner above the content (offline / server unreachable; until HAAL-052 it says changes need a connection). "Install app" in the user menu while the browser allows installing; iOS: hint in Help. Production serving rules (`sw.js`, manifest, index.html no-cache) in DEVELOPMENT, applied in HAAL-150 | FR-OFF-01, FR-OFF-05, FR-OFF-06 |
| D-56 | Sync API (FR-OFF-02..04) | Order changed by the owner: HAAL-053 (server) before HAAL-052 (client), so the client is verified against the real server. Migration 0014: global sequence and stamp trigger (`sync_seq`, `sync_xid`, transaction id taken first) on calendar, share, item, attachment, user_settings; existing rows numbered with triggers off; audit treats `sync_xid` as bookkeeping; `sync_mutation` (owner-only, kept). `GET /sync/pull`: one statement reads all tables and the snapshot; cursor = last number + transactions in progress (410 `cursor_invalid` when unusable); last page jumps to the high-water mark (`haalendar_sync_high_water()`); tombstone for a revoked or left share; a new share brings the container's content (de-duplicated); internal columns stay on the server. `POST /sync/push`: up to 500 mutations, each in a savepoint through the planning services (rights by the authz atom, validation, soft delete with batch, audit), exactly once by `mutation_id`; results applied / duplicate / conflict / rejected. Conflicts by `base` values per field (amends ADR-0009). Scope today: pull calendars, shares, items, attachment metadata, settings; push calendar create/update/delete/restore, item update/move/delete/restore | FR-OFF-02, FR-OFF-03, FR-OFF-04 |
| D-57 | Local store and outbox (FR-OFF-01..03) | Dexie 4 over IndexedDB, one database per user (`haalendar-<id>`) with the server's rows (calendars, items, attachment metadata, shares, settings), `outbox`, `conflicts`, `meta` (cursor, local schema). A change and its local effect are one transaction; unsent edits of the same record merge (update+update keeps the first `base`, update after create folds in, delete+restore cancel; never into a change being sent). Pulled rows are overlaid with the waiting outbox, tombstones remove a container with its content. One tab syncs (Web Lock `haalendar-sync-<id>`; others use a BroadcastChannel); runs on start, reconnect, local write (debounced), visibility and every 60 s while visible; retries 2 s … 5 min; 401 pauses until the same user signs in, 410 starts over. Push results: applied/duplicate leave the outbox; conflict/rejected are kept with both versions plus a notification on this device. Only content writes (calendars, items) use the outbox; account, settings, sharing, admin and export stay online-only. Offline writes say "saved on this device", their arrival "N changes synced"; the status shows syncing / N not sent / error; a full device storage is named as such; `navigator.storage.persist()` is requested. Sign-out sends what it can (5 s), names the unsent changes, then deletes the local database. Item create via sync waits for the server side (push accepts item update/move/delete/restore today) | FR-OFF-01, FR-OFF-02, FR-OFF-03 |
| D-58 | Conflict resolution (FR-OFF-04) | Unresolved conflicts are shown in the connection indicator ("N sync conflicts — resolve", link), in Settings → Sync (`#sync`: status, last sync, changes not sent, "Sync now", the conflicts), from the notification center (`sync_error` → `#sync`) and the user menu ("Sync and conflicts"), and inside a record (`ConflictNotice`, for the module screens). Same fields changed: both values side by side, a choice per field plus "Keep all mine" / "Keep all theirs"; mine is sent again as an update on the current server version with its values as the base. Deleted elsewhere (`rejected` `invalid_state` with `current`): "Restore with my changes" (restore + update / move) or "Discard my changes". Other refusals: localized reason, my values, "Copy my changes", "Dismiss". Discard / dismiss ask first. Resolved records are kept, marked `resolved_at` + `resolution` (user content; they leave the device only with the local database at sign-out). Delete of a record changed elsewhere: applies, push answers `edited_elsewhere`, the user gets a notification leading to the trash. Values shown readably (colour swatch and name, priority badge, Markdown as plain text folded at 160 characters). A push answer missing results no longer resends the batch in a loop (the rest waits for the retry) | FR-OFF-04 |
| D-59 | Live updates (FR-OFF-03, U#18) | SSE `GET /stream` (sse-starlette 3.5.0) instead of WebSocket (one direction, proxies, same cookie). PostgreSQL LISTEN/NOTIFY as the bus (migration 0015: AFTER trigger on calendar, share, item, attachment, user_settings, notification; delivered on commit; no Redis). Audience: owner and current grantees of the container (`haalendar_sync_audience`), grantee and granter on share changes, the owner for settings and notifications. Events without data: `changes` (client pulls with its cursor), `notification`, `ping` every 25 s; first event `changes`; bursts merged (250 ms). Session checked at each ping without sliding its expiry; revoked/expired → stream ends. Limits 10 per user, 1000 per process (429); gauge `haalendar_sse_connections`; open/close logged with reason. Client: only the syncing tab holds the stream; no 60 s sync timer or notification polling while it is open; reopened after 5 s … 5 min. `demo_reset` reserved for the demo mode | FR-OFF-03 |
| D-60 | Events and recurrence (FR-CAL-06/07/10) | HAAL-066 before HAAL-060 (owner's order). Migration 0016: `event` (1:1 with an item of kind `event`, same id, container copied; wall-clock dates/times + `tzid`, derived `start_utc`/`end_utc` for timed events, `location`, `rrule`) and `recurrence_exception` (operations in HAAL-067); CHECKs for end ≥ start, all-day without times, RRULE in {FREQ=DAILY, WEEKLY, MONTHLY, YEARLY}, a series spans one day; RLS like content, no physical delete, audited. Atom `calendar.recurrence.v1` (Python + TypeScript, shared vectors): occurrence dates in a window ≤ 367 days, weekly = weekday of the start, monthly skips months without the day, 29 February only in leap years, exceptions left out; own implementation instead of dateutil / rrule.js (identical results both sides). Sync: item create (kind `event`) and event fields in update; times on the wire as HH:MM; title ≤ 150, empty → "(No title)"; zone defaults to the owner's profile zone; the whole event is checked after every change; time fields (all_day, dates, times, zone, rule) conflict as one group; moving an event only between calendars. REST `/events` and `/occurrences` stay planned (offline client works through sync) | FR-CAL-06, FR-CAL-07, FR-CAL-10 |
| D-61 | Day view (FR-CAL-01, F-14) | `/calendar?date=YYYY-MM-DD` (default today in the profile zone; an invalid date falls back to today). Data from the local database (offline, follows sync and live updates). An event is on the date when its viewer days (time.event_days.v1) include it; series expanded one day around the date (calendar.recurrence.v1) so cross-zone shifts are caught; a rule the client cannot expand is left out and logged. Times in the viewer's zone and 12/24-hour setting; timed events that started earlier "continue" ("Until 02:00"), those ending later "go on" ("From 22:00"). Order: atom `calendar.day_order.v1` (Python + TypeScript): all-day first, then by start (continuing = 00:00 and first), then title ignoring case and accents (NFKD, marks removed, lower case; code points otherwise — no locale collation, so both implementations agree), then creation time and key; colour never counts (legacy order removed). Row: colour bar and tint, time, title, place, repeat mark; empty state. Navigation HAAL-061, header HAAL-062, details HAAL-064 | FR-CAL-01 |
| D-62 | Calendar navigation (FR-CAL-02..04, F-01..F-04) | Header: ‹ Today › (44 px on touch, Today disabled on today) and the keys ← / → / T (D-42, listed in the ? overlay); the date stays in `?date=` and moving between days replaces the history entry. Mini month: six weeks from the settings' week start, weekday names in the interface language, neighbouring months dimmed but selectable, today ringed, selection filled, a dot under days with events (same day computation as the list, offline); ‹ › page months without changing the day, the calendar follows the selected day; ARIA grid keyboard (one Tab stop, arrows, PageUp/PageDown, Home/End, Enter/Space; its keys never reach the page's day keys); full date labels with "today" / "has events". Sidebar 248 px: inline and collapsible on desktops (≥ 1024, remembered per device in localStorage), an overlay sheet on tablets (768–1023), a bottom sheet behind the date button on phones (< 768). ISO week numbers in the mini month: HAAL-097 | FR-CAL-02, FR-CAL-03, FR-CAL-04 |
| D-63 | Calendar header (FR-CAL-05, F-05) | The page heading is the date title — "Today" or the long date in the interface language ("December 31, 2026"), the module name read first by screen readers ("Calendar: …") — with the weekday beside it. Live clock hh:mm:ss in the profile time zone and 12/24-hour setting; ticks on the second boundary; stops while the tab is hidden and is right again when it returns; role timer without announcements. ISO 8601 week of the SELECTED date (legacy showed today's week) from atom `calendar.iso_week.v1` (Python + TypeScript, shared vectors: year boundaries, 52/53-week years); "Week 53 · 2026" when the ISO year differs from the calendar year, tooltip "ISO week N of YYYY". Phones: the title is the button that opens the mini month, clock and week on a second line. Day number (HAAL-082) and Week A/B (HAAL-085) join the same line later | FR-CAL-05 |
| D-64 | Event editor (FR-CAL-06/07, F-10/F-11/F-13) | Opens from "New event" (header; floating + on phones), the key N, and a click on a row (until the details popover of HAAL-064 offers Edit). Dialog on larger screens, full-screen sheet on phones. Fields: title (≤ 150, counter, empty saves as "(No title)"), all day (default on; off fills the next quarter hour today / 09:00 otherwise, one hour), From / To dates, start / end time as 15-minute choices (12/24 h; a stored off-grid time stays selectable), repeat none/daily/weekly/monthly/yearly (a series lasts one day: To date hidden), calendar (own and edit-shared), location (≤ 500), Markdown description, colour (the user's default), priority; attachments once the event exists. End before start: message, Save disabled; a start moved past the end takes the end along (end := start, as FR-CAL-07 states). Times in the event's own zone, named when it differs from the viewer's. Saving through the local store (offline: "saved on this device"), new events send the profile zone so they show at once; edits send only changed fields with their starting values (field-level merge), a new calendar as a move; undo: create ↔ soft delete/restore, edit ↔ previous values. Draft on the device, unsaved-changes question, Ctrl+Enter saves. Without a writable calendar, "My calendar" is created with the first event (default calendar formally in HAAL-094). Editing a series edits all occurrences (this / following: HAAL-067/093) | FR-CAL-06, FR-CAL-07 |
| D-65 | Event details (FR-CAL-08, F-15) | Opens on click / tap, right-click (the browser menu is suppressed), Enter / Space on the focused row; a popover next to the row on tablets and desktops, a bottom sheet on phones; Esc closes and gives the focus back to the row. Shows: title ("(No title)"), badges "Repeats: …", "All day", priority (not the default) and "View only", the range of THIS occurrence in the viewer's zone (dates for all-day events), location, calendar name, the description (first 50 characters as plain text, "more" shows it in full as Markdown, "less" folds it), attachments (list from the local database, so it is there offline; thumbnails from the server; the existing viewer), created / updated times; no ID. Actions today: Edit (button and key E) when the calendar is own or shared with "edit", otherwise "View only"; edit this occurrence, move to next day, colour, delete, delete all occurrences and duplicate come with HAAL-065/067/081/084/096 | FR-CAL-08 |
| D-66 | Deleting events (FR-CAL-09, F-16/F-17) | From the details card (Delete button, danger style, next to Edit; also the Delete key while the card is open) and with the Delete key on the focused row of the day list; not from the editor. Always after a confirmation "Delete event?" naming the title, its Delete button focused (Delete → Enter, Esc cancels); for a series the text says all occurrences go (one occurrence: HAAL-067). Soft and offline-first: the local store marks the row deleted at once and the outbox sends the delete; the server moves the event and its attachments to the trash as one batch. The toast offers Undo (restore); the trash restores later: events are a trash source (one entry with its attachments inside, restored with them by the calendar's owner or an edit share, refused while the calendar is in the trash); an event deleted with its calendar is shown inside the calendar's entry and restored with it. For a calendar shared for viewing there is no Delete button and the key answers "This calendar is view only". The day list has one Tab stop (↑/↓, Home/End, Enter / E open the card, Delete); multi-select and bulk actions in the day view come with HAAL-084 | FR-CAL-09, FR-X-01, FR-X-08 |

### 9.2 Open issues
| # | Issue | Status |
|---|---|---|
| O-01 | GDPR right to erasure vs "never delete" (FR-X-01) | Accepted as known open issue for v1.0; revisit with trash cleanup design |
| O-02 | Gap-analysis features (U#7) | Closed — approved (D-22) |
