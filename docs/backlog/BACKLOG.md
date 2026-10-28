# Haalendar backlog

<!-- +++===+++ 2026-10-23 — Hasan Alizada — Backlog moved into the project; the agent manages it (owner decision). -->

**This file is the single source of tasks for Haalendar.** The owner keeps one card on his board ("Haalendar backlog executed by the agent"); there is no other copy. Whoever manages the backlog lives where the backlog lives: here, that is the agent.

## Rules for every agent and session

1. **Read this file before choosing or starting work.** Never take a task from memory, from a conversation or from another list, and never invent a task. A new task appears here only when the owner gives it; then it is added verbatim with its source.
2. **Next task:** the first task whose dependencies are all Done, by priority Must → Should → Could, then by epic and number; v1.1 / v1.1+ tasks belong to a later release and wait until the owner opens it. Postponed and Blocked tasks are skipped until the owner releases them. The owner of a task does not matter: the agent proposes the next task whoever it is assigned to — never hands a list of tasks to the owner while taking another one itself.
3. **Propose and wait:** name the task and why it is next; start only after the owner confirms (analysis → options with a recommendation → confirmation → work, as in the owner's working rules).
4. **While working:** status In progress. **After the work** (full checks green, live check done): status Done with the date, a short result line in the Done table; the commit hash is filled in once the owner has committed (the owner commits and pushes himself).
5. **Report after each task:** "Done: HAAL-xxx (status in the backlog → Done). Next: HAAL-yyy — why. Waiting for confirmation." together with the usual report and the commit message.
6. Statuses: **To do**, **In progress**, **Blocked** (say by what), **Postponed** (by the owner), **Done**. Owner column: who the task is assigned to (— = not assigned).

## Deadlines

| Due | What | Where it is enforced |
|---|---|---|
| 2026-10-30 | Override serialize-javascript 7.1.2 → 7.1.3 and remove its exception (GHSA-m5mm-p8h7-m29v, build time only; 7.1.3 passes the 7-day minimum on 2026-10-29 21:24 UTC) | `backend/audit-ignores.json` (npm_ignores), `pnpm-workspace.yaml`, `backend/tests/test_audit_ignores.py` |
| 2026-11-11 | Review deepmerge 4.3.1 (GHSA-gcqx-w48m-w2h4, low, build time only via workbox-build): no fixed version yet — upgrade or replace the parent if a fix exists, otherwise review and extend the exception | `backend/audit-ignores.json` (npm_ignores), `pnpm-workspace.yaml`, `backend/tests/test_audit_ignores.py` |

## Open tasks

| ID | Epic | Task | Priority | Depends on | Refs | Status | Owner | Source |
|---|---|---|---|---|---|---|---|---|
| HAAL-039 | E02 Cross-cutting | Full-text search across all modules with highlighting, offline local index; keeps title autocomplete and YYYY-MM-DD jump | Must | 016, 052 | — | Postponed | — | owner, 2026-10-19 (chat) |
| HAAL-046 | E02 Cross-cutting | Search filters: date range, module, calendar, color, priority, label | Must | 039 | C-14 | Postponed | — | owner, 2026-10-19 (chat) |
| HAAL-069 | E04 Calendar parity | Single editor instance guard | Should | 063 | F-19 | To do | — | owner backlog file |
| HAAL-087 | E05 Calendar new | Week view: 7 columns from week start, all-day row, timed events by time, overlaps side by side, current-time line | Must | 060, 066 | C-01 | To do | — | owner backlog file |
| HAAL-088 | E05 Calendar new | Month view: week grid, events per day, +N more, click day opens day view | Must | 060 | C-02 | To do | — | owner backlog file |
| HAAL-089 | E05 Calendar new | Agenda view: upcoming events grouped by day, default 30 days, configurable | Must | 060 | C-03 | To do | — | owner backlog file |
| HAAL-090 | E05 Calendar new | Drag-and-drop reschedule in week/month views (mouse, touch), keep duration, this/following/all for occurrences, undoable | Must | 087, 088, 035 | C-04 | To do | — | owner backlog file |
| HAAL-091 | E05 Calendar new | Reminders: 0..n per event, in-app + browser notifications incl. Web Push when app closed | Must | 063, 051, 048 | C-05 | To do | — | owner backlog file |
| HAAL-092 | E05 Calendar new | Extended recurrence: end date/count, every N, weekdays, Nth weekday, last day of month (RRULE) | Must | 066 | C-06 | To do | — | owner backlog file |
| HAAL-093 | E05 Calendar new | Edit/delete this and following occurrences (series split) | Must | 067 | C-07 | To do | — | owner backlog file |
| HAAL-094 | E05 Calendar new | Multiple calendars per user: default calendar, create, rename, color, hide/show, archive; unit of sharing | Must | 013 | C-08 | To do | — | owner backlog file |
| HAAL-095 | E05 Calendar new | ICS import (RRULE, EXDATE, report) into chosen calendar and .ics export | Must | 092, 094 | C-09 | To do | — | owner backlog file |
| HAAL-096 | E05 Calendar new | Duplicate event to another date | Must | 064 | C-10 | To do | — | owner backlog file |
| HAAL-097 | E05 Calendar new | ISO week numbers in mini month calendar | Must | 061 | C-12 | To do | — | owner backlog file |
| HAAL-098 | E05 Calendar new | Swipe left/right to change period on touch devices | Must | 060, 170 | C-13 | To do | — | owner backlog file |
| HAAL-100 | E06 To-Do | Notes: title, body, color, priority, pin, archive, soft delete | Must | 015, 030 | — | To do | — | owner backlog file |
| HAAL-101 | E06 To-Do | Checklists: add, check, reorder, checked to bottom | Must | 100 | — | To do | — | owner backlog file |
| HAAL-102 | E06 To-Do | Labels and filter | Should | 100 | — | To do | — | owner backlog file |
| HAAL-103 | E06 To-Do | Grid/list view, drag and keyboard reorder | Should | 100 | — | To do | — | owner backlog file |
| HAAL-104 | E06 To-Do | Due date on note, visible in calendar | Should | 100 | — | To do | — | owner backlog file |
| HAAL-105 | E06 To-Do | Reminders on notes (same as event reminders) | Must | 091, 100 | T-01 | To do | — | owner backlog file |
| HAAL-110 | E07 Kanban | Boards: create, rename, archive | Must | 015, 030 | — | To do | — | owner backlog file |
| HAAL-111 | E07 Kanban | Columns: create, rename, reorder, archive, optional WIP limit | Must | 110 | — | To do | — | owner backlog file |
| HAAL-112 | E07 Kanban | Cards: title, description, color, priority, due date, labels, checklist, attachments, timestamps | Must | 111 | — | To do | — | owner backlog file |
| HAAL-113 | E07 Kanban | Drag-and-drop cards (mouse, touch, keyboard), stable order, undoable | Must | 112 | — | To do | — | owner backlog file |
| HAAL-114 | E07 Kanban | Card activity (from audit log) and comments | Should | 112, 032 | — | To do | — | owner backlog file |
| HAAL-115 | E07 Kanban | Swimlanes | Could | 111 | — | To do | — | owner backlog file |
| HAAL-116 | E07 Kanban | Due-date reminders on cards | Must | 091, 112 | K-01 | To do | — | owner backlog file |
| HAAL-117 | E07 Kanban | Overdue and due-soon (24 h) badges on cards | Must | 112 | K-02 | To do | — | owner backlog file |
| HAAL-118 | E07 Kanban | Board filters: label, priority, due date, assignee, text | Must | 112 | K-03 | To do | — | owner backlog file |
| HAAL-119 | E07 Kanban | Card assignees on shared boards; filter assigned to me | Must | 112, 167 | K-04 | To do | — | owner backlog file |
| HAAL-120 | E08 Integration | Links between events, notes, cards; backlinks | Must | 013 | — | To do | — | owner backlog file |
| HAAL-121 | E08 Integration | Note/card due dates as toggleable calendar layers | Must | 104, 112, 060 | — | To do | — | owner backlog file |
| HAAL-122 | E08 Integration | Convert note/card/event between types keeping content, attachments, links | Should | 120 | — | To do | — | owner backlog file |
| HAAL-123 | E08 Integration | Ctrl+K command palette: navigate, search, quick-create | Should | 037, 039 | — | To do | — | owner backlog file |
| HAAL-124 | E08 Integration | Time-blocking: drag note/card onto day/week view creates linked event | Must | 087, 100, 112, 120 | C-11 | To do | — | owner backlog file |
| HAAL-130 | E09 Migration | Legacy SQLite importer into a chosen user: events, RRULE, exclusions, colors, deleted kept as deleted (deleted_at = import time), log, timestamp parsing, dry-run report (CRITICAL) | Must | 066, 030, 160 | — | To do | — | owner backlog file |
| HAAL-140 | E10 QA | Test strategy: unit, integration, contract, E2E Playwright, coverage gate 80% | Must | 010 | — | To do | — | owner backlog file |
| HAAL-141 | E10 QA | Legacy regression suite: one E2E scenario per F-01..F-34 (docs repo: requirements/legacy-feature-inventory.md) (CRITICAL) | Must | 140, 060, 067 | — | To do | — | owner backlog file |
| HAAL-142 | E10 QA | Offline/sync tests: network cut, offline reload, concurrent edits, conflicts | Must | 054 | — | To do | — | owner backlog file |
| HAAL-143 | E10 QA | Accessibility (WCAG 2.2 AA, axe), Lighthouse, Core Web Vitals, mobile viewport checks | Should | 017, 170 | — | To do | — | owner backlog file |
| HAAL-144 | E10 QA | Security testing: SAST, dependency/license scans, DAST on demo, multi-user isolation tests | Must | 020, 165 | — | To do | — | owner backlog file |
| HAAL-145 | E10 QA | UAT by owner on migrated real data; written sign-off | Must | 130, 141 | — | To do | — | owner backlog file |
| HAAL-150 | E11 Delivery | Docker images (x86_64 + arm64) + docker compose for on-prem, volumes, env config | Must | 011, 016 | — | To do | — | owner backlog file |
| HAAL-151 | E11 Delivery | CI/CD GitHub Actions: lint, tests, build, SBOM, license check, image publish on tag | Must | 006, 140 | — | To do | — | owner backlog file |
| HAAL-152 | E11 Delivery | README in English: features, screenshots, quick start, config, backup, upgrade, legacy migration, demo link | Must | 150 | — | To do | — | owner backlog file |
| HAAL-153 | E11 Delivery | Public user and admin guides in code repo; API docs from OpenAPI | Should | 015 | — | To do | — | owner backlog file |
| HAAL-154 | E11 Delivery | Demo stand: demo mode, seeded demo accounts, full reset every 30 min, reset banner, strict upload limits | Must | 150 | — | To do | — | owner backlog file |
| HAAL-155 | E11 Delivery | Backup and restore of DB + attachments (RPO 24 h, RTO 1 h) | Must | 150 | — | To do | — | owner backlog file |
| HAAL-156 | E11 Delivery | Release v1.0.0: semver, changelog, release notes, tag, rollback notes | Must | 141, 145, 151, 152 | — | To do | — | owner backlog file |
| HAAL-157 | E11 Delivery | S3-compatible attachment storage adapter (AWS S3, Garage, SeaweedFS, Ceph RGW) | v1.1 | 040 | — | To do | — | owner backlog file |
| HAAL-158 | E11 Delivery | OpenTelemetry tracing (API, worker, DB) with optional OTLP exporter | v1.1+ | 019 | — | To do | — | owner backlog file |
| HAAL-168 | E12 Accounts | Optional OIDC/SSO login | Could | 160 | — | To do | — | owner, 2026-10-19 (chat) |

## Done

Evidence is the commit that names the task (the latest one when several do). Task titles of done work are not reconstructed: the commit subject says what was delivered.

| ID | Done | Commit | Delivered |
|---|---|---|---|
| HAAL-002 | 2026-10-14 | f617030 | docs(requirements): approve SRS v1.0 (HAAL-002) |
| HAAL-003 | 2026-10-14 | 2491728 | docs(requirements): approve gap analysis, update SRS to v1.1 (HAAL-003) |
| HAAL-004 | 2026-10-14 | 67374c5 | chore(license): adopt Apache-2.0 with NOTICE and community files (HAAL-004) |
| HAAL-005 | 2026-10-14 | 7e98ab0 | docs(design): add brand guidelines for concept B (HAAL-005) |
| HAAL-006 | 2026-10-14 | e5c0b57 | docs(adr): ADR-0002 branching strategy and repository rules (HAAL-006) |
| HAAL-007 | 2026-10-14 | b701091 | chore(repo): remove legacy Angular/PHP code and old docs (HAAL-007) |
| HAAL-010 | 2026-10-14 | 4eac66f | docs(adr): accept ADR-0003 technology stack; SRS v1.2 (HAAL-010) |
| HAAL-011 | 2026-10-14 | 5320426 | docs(adr): accept ADR-0004 deployment topology (HAAL-011) |
| HAAL-012 | 2026-10-14 | 8a896c3 | docs(adr): accept ADR-0005 auth and sharing model; SRS v1.3 (HAAL-012) |
| HAAL-013 | 2026-10-14 | aaa4557 | docs(architecture): approve domain model v1.0; SRS v1.4 (HAAL-013) |
| HAAL-014 | 2026-10-14 | a62dd73 | docs(adr): accept ADR-0006 project manifest and atom layout (HAAL-014) |
| HAAL-015 | 2026-10-14 | fd71e4a | docs(adr): accept ADR-0007 API design and contract-first workflow (HAAL-015) |
| HAAL-016 | 2026-10-14 | e038ee9 | feat(backend): add FastAPI skeleton with config, logging, health and migrations (HAAL-016) |
| HAAL-017 | 2026-10-15 | dedba4c | feat(frontend): add React + Vite app shell with routing, theme and i18n (HAAL-017) |
| HAAL-018 | 2026-10-14 | 3a39589 | docs(design): approve wireframes and design system v1.0 (HAAL-018) |
| HAAL-019 | 2026-10-15 | 76d2ff7 | docs(adr): accept ADR-0008 observability — logs, correlation, metrics (HAAL-019) |
| HAAL-020 | 2026-10-15 | ea6a59a | docs(security): add security baseline mapped to ASVS 5.0 L2 and OWASP Top 10 (HAAL-020) |
| HAAL-030 | 2026-10-16 | 95a39c7 | docs: record soft delete enforcement D-34 (HAAL-030) |
| HAAL-031 | 2026-10-16 | bc29757 | feat(data): record timestamps (HAAL-031); publish development documentation in docs/ (D-35) |
| HAAL-032 | 2026-10-16 | 2ef17a2 | feat(audit): tamper-proof audit log of all changes with per-record history (HAAL-032) |
| HAAL-033 | 2026-10-16 | 3299155 | feat(trash): unified trash with batch restore and multi-select (HAAL-033) |
| HAAL-034 | 2026-10-16 | 214dfc8 | feat(feedback): result notification for every write, local drafts (HAAL-034) |
| HAAL-035 | 2026-10-16 | 3cf9a3c | feat(undo): undo / redo with Ctrl+Z, Ctrl+Shift+Z and toast Undo (HAAL-035) |
| HAAL-036 | 2026-10-16 | 8c05d88 | feat(bulk): multi-select with Ctrl/Shift click, Ctrl+A, bulk bar and atomic POST /bulk (HAAL-036) |
| HAAL-037 | 2026-10-16 | 7621853 | feat(keyboard): shortcut registry, "?" overlay, list navigation with Delete, F6 regions (HAAL-037) |
| HAAL-038 | 2026-10-17 | 3a207ab | feat(editors): unsaved-changes guard for route change, dialogs and tab close; Ctrl+Enter saves (HAAL-038) |
| HAAL-040 | 2026-10-17 | 60a0af8 | feat(attachments): image attachments with thumbnails, preview, paste and drop; item supertype table (HAAL-040) |
| HAAL-041 | 2026-10-18 | b3a32ea | feat(priority): priority atom, SQL sort/filter, badge, picker, filter; bulk priority and color for items (HAAL-041) |
| HAAL-042 | 2026-10-18 | 5c9357d | feat(palette): shared 8-colour palette, colour picker, WCAG contrast checked in both themes (HAAL-042) |
| HAAL-043 | 2026-10-18 | d8ee660 | feat(export): Takeout-style data export in background jobs: ZIP with archive.json, schema, ICS, images; 7-day download (HAAL-043) |
| HAAL-044 | 2026-10-19 | 4bfbd49 | feat(shell): user menu with profile, settings, export, help, about and sign out (HAAL-044) |
| HAAL-045 | 2026-10-19 | fd4011f | feat(settings): per-user settings on the server with Preferences form, theme sync and Week A/B atom (HAAL-045) |
| HAAL-047 | 2026-10-20 | fc8901a | feat(markdown): sanitised Markdown renderer, editor and formatting help (HAAL-047) |
| HAAL-048 | 2026-10-20 | 624821e | feat(notifications): in-app notification center with unread counter, share and export notifications (HAAL-048) |
| HAAL-050 | 2026-10-21 | 841fd7a | docs(adr): ADR-0009 offline-first and sync — custom outbox with Dexie, server pull/push, field-level conflicts (HAAL-050) |
| HAAL-051 | 2026-10-21 | 58b850e | feat(pwa): installable app with app-shell service worker, offline start and offline banner (HAAL-051) |
| HAAL-052 | 2026-10-21 | 3fcbc73 | feat(offline): local store and outbox — Dexie per user, background sync with conflicts, offline status and safe sign-out (HAAL-052) |
| HAAL-053 | 2026-10-21 | 5702ed3 | feat(sync): server sync API — cursor pull with tombstones and push applied exactly once with field-level conflicts (HAAL-053) |
| HAAL-054 | 2026-10-22 | f2edbd6 | feat(offline): conflict resolution — Settings → Sync, per-field keep mine/theirs, restore deleted with my changes, told about deletes of changed records (HAAL-054) |
| HAAL-055 | 2026-10-22 | 128f5f9 | feat(sync): live updates over SSE with PostgreSQL LISTEN/NOTIFY — changes and notifications reach tabs, devices and shared users without polling (HAAL-055) |
| HAAL-060 | 2026-10-22 | e5ad2d4 | feat(calendar): day view — events and occurrences of the selected day in the viewer's zone, ordered all-day, start, title (HAAL-060) |
| HAAL-061 | 2026-10-22 | 7d9a0f8 | feat(calendar): navigation — mini month, previous/next day, Today, collapsible sidebar (HAAL-061) |
| HAAL-062 | 2026-10-23 | 66ad05f | feat(calendar): header — date title, live clock, ISO week of the selected date (HAAL-062) |
| HAAL-063 | 2026-10-23 | f91d578 | feat(calendar): event editor — create and edit events with 15-minute times, repeat, calendar, colour and priority (HAAL-063) |
| HAAL-064 | 2026-10-23 | 6baa911 | feat(calendar): event details — popover with this occurrence, description preview, attachments and Edit (HAAL-064) |
| HAAL-065 | 2026-10-23 | 757a35d | feat(calendar): delete events — confirmation, Delete key, soft delete with undo, events in the trash (HAAL-065) |
| HAAL-066 | 2026-10-22 | 3b9dd9e | feat(calendar): events and recurrence — event table, RRULE daily/weekly/monthly/yearly, recurrence atom, events through sync (HAAL-066) |
| HAAL-067 | 2026-10-23 | 1a64291 | feat(calendar): single occurrences — delete or edit only this occurrence, effective series start (HAAL-067) |
| HAAL-068 | 2026-10-25 | 9aa81d0 | feat(calendar): overdue counter — legacy rule with effective series start, under the mini month (HAAL-068) |
| HAAL-080 | 2026-10-25 | 3a76281 | feat(calendar): duplicate-title warning — other active events with the same title, asked on Save (HAAL-080) |
| HAAL-083 | 2026-10-28 | bb23bdb | feat(calendar): description and attachment icons in the day list, read out as the row's description (HAAL-083) |
| HAAL-084 | 2026-10-28 | c6bb8f2 | feat(calendar): move to next day from the details card and for a selection in the day list (HAAL-084) |
| HAAL-085 | 2026-10-28 | — | feat(calendar): Week A/B badge of the selected date after the ISO week in the header (HAAL-085) |
| HAAL-082 | 2026-10-28 | 72bdeda | feat(calendar): Day Number of the selected date after the ISO week in the header (HAAL-082) |
| HAAL-081 | 2026-10-25 | 155e11a | feat(calendar): colour from the details card — saved at once with undo, one write per choice (HAAL-081) |
| HAAL-160 | 2026-10-15 | 27255ce | docs(architecture): note user_account table name in domain model (HAAL-160) |
| HAAL-161 | 2026-10-15 | fd59738 | feat(accounts): add password reset, re-authentication and admin reset (HAAL-161) |
| HAAL-162 | 2026-10-15 | 30a39d2 | docs(security): mark ASVS V6/V7, A07 and API2 as implemented (HAAL-162) |
| HAAL-163 | 2026-10-15 | 7283b0f | feat(accounts): add admin/user roles and first-run admin setup wizard (HAAL-163) |
| HAAL-164 | 2026-10-15 | ffdf409 | docs: record admin panel decision D-27 and HAAL-164 security status |
| HAAL-165 | 2026-10-15 | 79d4362 | feat(security): enforce per-user data isolation with authz atom and row-level security (HAAL-165) |
| HAAL-166 | 2026-10-15 | 2f734d4 | docs: record profile decision D-29 and HAAL-166 security status |
| HAAL-167 | 2026-10-15 | aeaf0fa | docs(srs): record sharing decision D-30 (HAAL-167) |
| HAAL-169 | 2026-10-15 | 922370a | feat(time): add time zone atoms, pinned tzdata and display in the profile zone (HAAL-169) |
| HAAL-170 | 2026-10-21 | 19d959c | feat(mobile): touch-size rules in the base components and a 360 px audit of all screens (HAAL-170) |
| HAAL-171 | 2026-10-15 | 8f970a1 | docs: record auth UI decision D-33 and session management status (HAAL-171) |

