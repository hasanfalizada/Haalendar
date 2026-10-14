# SOFTWARE REQUIREMENTS SPECIFICATION (SRS) — Haalendar

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-002. Draft v0.1. Values marked **[PROPOSED]** are not yet approved by the owner and are collected in section 9.

| Field | Value |
|---|---|
| Version | 0.1 (draft) |
| Status | Awaiting owner approval |
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
- Features from the gap analysis (HAAL-003) until approved.

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
- **Client:** current and previous major version of Chrome, Edge, Firefox, Safari (desktop); Safari on iOS and Chrome on Android, current and previous major OS version. **[PROPOSED]**
- **Viewport:** 360 px wide and up; layouts for phone, tablet, desktop.
- **Server:** Linux host with Docker Engine and Docker Compose; x86_64 and arm64 images. **[PROPOSED]**
- **Minimum server for reference load (4.2):** 2 vCPU, 2 GB RAM, 10 GB disk + attachments. **[PROPOSED]**
- TLS terminated by operator's reverse proxy or the bundled proxy.

### 2.5 Design and Implementation Constraints
- Default architecture: LLM-native atomic architecture with central Project Manifest (`project.manifest.json`), contract-first API.
- Stack baseline per instructions (to be confirmed by ADR HAAL-010): Python FastAPI + Pydantic, PostgreSQL, Next.js + Tailwind + shadcn, Pytest.
- Only open-source dependencies with licences compatible with the project licence (HAAL-004).
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
| FR-X-06 | Undo (Ctrl/Cmd+Z) and Redo (Ctrl/Cmd+Shift+Z) for create, update, delete, restore, move, color change, priority change and bulk actions. A bulk action is one undo step. Undo is also offered in the result notification. History depth 50 steps per browser session. **[PROPOSED depth/scope]** | U#16, HAAL-035 |
| FR-X-07 | Multi-select with Ctrl/Cmd+click, Shift+click (range), Ctrl/Cmd+A; on touch: long-press enters selection mode. Bulk actions: delete, restore, change color, set priority, move to next day (events). | U#17, HAAL-036 |
| FR-X-08 | All primary actions are reachable by keyboard: switch module, navigate days, move focus between items, open, create, edit, delete (Delete key), search focus, select. A shortcut overlay (`?`) lists all shortcuts. | U#4, F-16, HAAL-037 |
| FR-X-09 | Any editor with unsaved changes asks for confirmation before closing via Esc, backdrop click, close button, route change, module switch or browser tab close. No confirmation when there are no changes. | U#6, HAAL-038 |
| FR-X-10 | Full-text search over titles, descriptions/bodies, locations, checklist items and card comments of all accessible items; results grouped by module, ranked, with highlighted matches; works offline on locally stored data. Typing a date `YYYY-MM-DD` and pressing Enter opens that day in Calendar. Selecting an event result opens its date. | U#5, F-06, F-30, HAAL-039 |
| FR-X-11 | Attachments on events, notes and cards: images added by file picker, drag-and-drop or clipboard paste (screenshots). Allowed types PNG, JPEG, WebP, GIF; max 10 MB per file. **[PROPOSED limits]** Thumbnail in item, full preview on click. Attachments are soft-deleted like other items. | U#9, HAAL-040 |
| FR-X-12 | Priority on events, notes and cards: Low, Medium, High; default Medium **[PROPOSED default]**. Visible indicator; sorting and filtering by priority. | U#13, HAAL-041 |
| FR-X-13 | Shared color palette of at least the 8 legacy colors (red, orange, yellow, green, blue, purple, brown, black); default brown; text contrast meets WCAG AA in light and dark theme. | F-12, HAAL-042 |
| FR-X-14 | Export from the user menu: one JSON file containing all items of the user from all three modules, including soft-deleted items with their `deleted_at`, timestamps, links and attachment metadata. The JSON schema is versioned and documented. Attachment binaries are not embedded. **[PROPOSED]** | U#1, HAAL-043 |
| FR-X-15 | User menu available in every module: profile, settings, export, help, about (free/open source, author and repository links), logout. | F-34, HAAL-044 |
| FR-X-16 | Light and dark theme; follows system preference unless set in settings. | HAAL-017 |
| FR-X-17 | Layout is responsive from 360 px: on phones the module navigation collapses to a bottom bar or drawer **[PROPOSED]**; all features usable by touch. | Owner 2026-10-14, HAAL-170 |
| FR-X-18 | Changes made in one tab, device or by a sharing user appear in other open sessions without manual reload and without per-second polling. | F-18, HAAL-055 |

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
| FR-CAL-16 | Duplicate-title warning: on creating an event, if an active event of the same user has the same title (exact match, case-insensitive), a warning with a link to the existing event is shown; the user may proceed or cancel. | U#2, HAAL-080 |
| FR-CAL-17 | Overdue counter in sidebar: number of active one-off events whose start date is before today, plus active recurring series whose effective start (FR-CAL-14) is before today. Hidden when zero. Text: "N overdue event(s)". **[PROPOSED wording; logic = legacy]** | F-32, HAAL-068 |
| FR-CAL-18 | Color can be changed directly in the details popover; change is saved immediately and undoable. | U#3, HAAL-081 |
| FR-CAL-19 | Event row in the day list shows an icon when the description is not empty, and an icon when attachments exist. | U#10, HAAL-083 |
| FR-CAL-20 | Move to next day: shifts start and end by +1 calendar day keeping times; for an occurrence of a series it creates an exception plus a one-off event on the next day. Available in popover and as bulk action. | U#11, HAAL-084 |
| FR-CAL-21 | Title autocomplete in search for active events ("title — date"); selecting jumps to the event date. | F-30, HAAL-039 |
| FR-CAL-22 | Day Number = ordinal day of the selected date in its year (1..365/366). | U#8, HAAL-082 |
| FR-CAL-23 | Week A/B (user settings): enable/disable; anchor week (any week the user marks as "A"); custom labels (default "A"/"B"). Label = first label when the number of whole weeks between the anchor week and the selected week is even, otherwise second label. Calculation must be correct across year boundaries and 53-week years. | U#12, HAAL-085 |
| FR-CAL-24 | Note and card due dates can be shown in the calendar as separate toggleable layers; clicking opens the source item. | HAAL-121 |

### 3.3 To-Do (Keep-like)

| ID | Requirement | Source |
|---|---|---|
| FR-TODO-01 | Note fields: title, body, color, priority, pinned flag, archived flag, labels, due date (optional), attachments, timestamps. | HAAL-100 |
| FR-TODO-02 | Checklist notes: add, edit, check/uncheck, reorder items; checked items move to the bottom. | HAAL-101 |
| FR-TODO-03 | Pinned notes are shown above others; archived notes are shown only in the Archive view. Archive is not delete. | HAAL-100 |
| FR-TODO-04 | Labels: create, rename, assign; filter notes by label. | HAAL-102 |
| FR-TODO-05 | Grid and list layout; manual order by drag-and-drop and keyboard; order persists across devices. | HAAL-103 |
| FR-TODO-06 | A note with a due date appears in the calendar layer (FR-CAL-24). | HAAL-104 |

### 3.4 Kanban (Trello / Kanboard-like)

| ID | Requirement | Source |
|---|---|---|
| FR-KAN-01 | Boards: create, rename, archive, soft delete. | HAAL-110 |
| FR-KAN-02 | Columns: create, rename, reorder, archive; optional WIP limit with visual warning when exceeded (move still allowed). | HAAL-111 |
| FR-KAN-03 | Card fields: title, description, color, priority, due date, labels, checklist, attachments, timestamps. | HAAL-112 |
| FR-KAN-04 | Cards are moved within and between columns by drag-and-drop (mouse, touch) and keyboard; order is stable and synced; move is undoable. | HAAL-113 |
| FR-KAN-05 | Card activity shows its audit history; users can add comments. | HAAL-114 (Should) |
| FR-KAN-06 | Swimlanes. | HAAL-115 (Could) |

### 3.5 Integration between modules

| ID | Requirement | Source |
|---|---|---|
| FR-INT-01 | Any two items (event, note, card) can be linked; both sides show the link (backlink). Links survive soft delete and restore. | HAAL-120 |
| FR-INT-02 | Convert note ↔ card ↔ event keeping content, attachments and links. | HAAL-122 (Should) |
| FR-INT-03 | Command palette (Ctrl/Cmd+K): navigate, search, quick-create in any module. | HAAL-123 (Should) |

### 3.6 Accounts, roles, sharing

| ID | Requirement | Source |
|---|---|---|
| FR-ACC-01 | Registration with e-mail and password; e-mail verification. Registration mode set by admin: open or invite-only (default invite-only). **[PROPOSED default]** | HAAL-160 |
| FR-ACC-02 | Login/logout; password hashing with Argon2id. | HAAL-160 |
| FR-ACC-03 | Password reset by e-mail link (single use, expires in 1 hour **[PROPOSED]**); admin can reset manually when SMTP is absent. | HAAL-161 |
| FR-ACC-04 | Brute-force protection: progressive delay / temporary lockout after 5 failed attempts **[PROPOSED]**; optional TOTP 2FA (Should). | HAAL-162 |
| FR-ACC-05 | First start runs a setup wizard creating the first admin. | HAAL-163 |
| FR-ACC-06 | Roles: admin, user. Admin panel: list users, invite, deactivate (soft), reactivate, reset password, change role. An admin cannot deactivate the last admin. | HAAL-163, HAAL-164 |
| FR-ACC-07 | Data isolation: a user can access only own items and items explicitly shared with them. Enforced on the server for every request; covered by automated tests. | HAAL-165 |
| FR-ACC-08 | Profile: display name, avatar, time zone, locale (English only in v1.0). | HAAL-166 |
| FR-ACC-09 | Settings per user: week start day, 12/24-hour time, theme, default color, Week A/B (FR-CAL-23). Settings sync across devices. | HAAL-045 |
| FR-ACC-10 | Sharing: owner can share a calendar, note or board with other users of the instance with view or edit right; revoke at any time. | HAAL-167 (Should) |
| FR-ACC-11 | Time handling: timed events stored in UTC and shown in the user's time zone; all-day events are date-only and do not shift between time zones. | HAAL-169 |
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
| FR-OPS-01 | Legacy import: an admin imports a legacy `db.db` into a chosen user. Mapping: events → events; daily/weekly/monthly/annually → RRULE; exclusions → exceptions; color ids → palette; `deleted=1` → soft-deleted with `deleted_at` = import time (legacy has no deletion time) **[PROPOSED]**; legacy `create_ts`/`last_update_ts` (format `m/d/Y H:i:s TZ`) → timestamps; log → audit history. Dry-run produces a report (counts per table, unmapped values) without writing. | HAAL-130 |
| FR-OPS-02 | After import, every legacy event appears on exactly the same dates as in the legacy app (verified by automated comparison). | HAAL-130, HAAL-141 |
| FR-OPS-03 | Demo mode: seeded demo accounts and data; full reset to seed every 30 minutes; visible banner with time until next reset; stricter upload limits. | HAAL-154 |
| FR-OPS-04 | Backup and restore of database and attachments by documented commands. | HAAL-155 |

---

## 4. NON-FUNCTIONAL REQUIREMENTS

### 4.1 Performance **[PROPOSED values]**
- API: p95 ≤ 200 ms, p99 ≤ 500 ms for item CRUD and day view at reference load (4.2), server-side.
- Local (offline store) operations reflected in UI ≤ 100 ms.
- Search: results ≤ 300 ms for 100 000 items per user.
- Web: Core Web Vitals at p75 — LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1; initial JS ≤ 300 KB gzip.
- Sync of 1 000 queued changes ≤ 10 s on a 10 Mbit/s link.

### 4.2 Scalability / capacity **[PROPOSED values]**
- Reference install: up to 100 registered users, 50 concurrent, 100 000 items per user, 10 GB attachments.
- Stateless application containers; horizontal scaling behind a load balancer possible without code changes.

### 4.3 Security
- Target OWASP ASVS 5.0 Level 2 **[PROPOSED]**; OWASP Top 10 and OWASP API Security Top 10 checklists pass.
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
- **Open issue:** "never delete" (FR-X-01) conflicts with the GDPR right to erasure for operators in the EU. Resolution deferred to the later "trash cleanup" decision (owner, 2026-10-14). See section 9.

### 4.5 Availability and reliability
- Server availability is the operator's responsibility; the app provides health/readiness endpoints, graceful shutdown and automatic restart policy in Compose.
- Client continues to work during server or network outage (FR-OFF-01).
- Backup: documented daily backup procedure; RPO ≤ 24 h, RTO ≤ 1 h with documented restore **[PROPOSED]**.
- Database migrations are forward-only, automatic on start, and tested on a copy of production-like data.
- Optimistic concurrency (item `version`) prevents lost updates.

### 4.6 Usability and accessibility
- WCAG 2.2 Level AA.
- Full keyboard operability (FR-X-08); visible focus.
- Responsive from 360 px (FR-X-17); touch targets ≥ 44×44 px.

### 4.7 Maintainability and testability
- Project Manifest kept current after every change; ADR for every significant decision.
- Automated tests for every feature; backend line coverage ≥ 80 % **[PROPOSED]**; E2E scenario for every F-xx (HAAL-141).
- Code comments include the `+++===+++` author/date marker.

### 4.8 Portability and compatibility
- Deployable with one `docker compose up` on Linux x86_64 and arm64 **[PROPOSED]**.
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
- Licence: to be decided (HAAL-004).

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

## 9. ITEMS AWAITING OWNER APPROVAL
1. Supported browsers and OS versions (2.4).
2. Server architectures and minimum hardware (2.4).
3. Undo depth 50 and per-session scope (FR-X-06).
4. Attachment types and 10 MB limit (FR-X-11).
5. Default priority Medium (FR-X-12).
6. Export without embedded attachment binaries (FR-X-14).
7. Mobile navigation pattern: bottom bar or drawer (FR-X-17).
8. "Overdue" wording instead of "expired" (FR-CAL-17).
9. Duplicate warning only on create, or also on title change in edit (FR-CAL-16).
10. Registration default invite-only (FR-ACC-01); reset link 1 h (FR-ACC-03); lockout after 5 attempts (FR-ACC-04).
11. Deleted legacy events get `deleted_at` = import time (FR-OPS-01).
12. Performance and capacity targets (4.1, 4.2).
13. ASVS 5.0 Level 2 target (4.3).
14. RPO/RTO (4.5); coverage 80 % (4.7).
15. GDPR erasure vs "never delete" — accept as known open issue for v1.0 (4.4).
16. Licence (HAAL-004).
