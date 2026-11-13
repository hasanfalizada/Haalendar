# Haalendar backlog

<!-- +++===+++ 2026-10-23 — Hasan Alizada — Backlog moved into the project. -->
<!-- +++===+++ 2026-11-10 — Hasan Alizada — Only the tasks and the legend of their statuses are kept here. -->

**This file is the single source of tasks for Haalendar.** There is no other copy.

Statuses: **To do**, **In progress**, **Blocked** (say by what), **Postponed** (by the owner), **Done**, **Closed** (by the owner without implementation; listed under "Closed", never under "Done"). Owner column: who the task is assigned to (— = not assigned).

## Deadlines

| Due | What | Where it is enforced |
|---|---|---|
| 2026-12-11 | Review deepmerge 4.3.1 (GHSA-gcqx-w48m-w2h4, low, build time only via workbox-build; reviewed 2026-11-08, still no fix, extended): no fixed version yet — upgrade or replace the parent if a fix exists, otherwise review and extend the exception | `backend/audit-ignores.json` (npm_ignores), `pnpm-workspace.yaml`, `backend/tests/test_audit_ignores.py` |

## Open tasks

| ID | Epic | Task | Priority | Depends on | Refs | Status | Owner | Source |
|---|---|---|---|---|---|---|---|---|
| HAAL-039 | E02 Cross-cutting | Full-text search across all modules with highlighting, offline local index; keeps title autocomplete and YYYY-MM-DD jump | Must | 016, 052 | — | Postponed | — | owner, 2026-10-19 (chat) |
| HAAL-046 | E02 Cross-cutting | Search filters: date range, module, calendar, color, priority, label | Must | 039 | C-14 | Postponed | — | owner, 2026-10-19 (chat) |
| HAAL-069 | E04 Calendar parity | Single editor instance guard | Should | 063 | F-19 | To do | — | owner backlog file |
| HAAL-102 | E06 To-Do | Labels and filter | Should | 100 | — | To do | — | owner backlog file |
| HAAL-103 | E06 To-Do | Grid/list view, drag and keyboard reorder | Should | 100 | — | To do | — | owner backlog file |
| HAAL-104 | E06 To-Do | Due date on note, visible in calendar | Should | 100 | — | To do | — | owner backlog file |
| HAAL-114 | E07 Kanban | Card activity (from audit log) and comments | Should | 112, 032 | — | To do | — | owner backlog file |
| HAAL-115 | E07 Kanban | Swimlanes | Could | 111 | — | To do | — | owner backlog file |
| HAAL-121 | E08 Integration | Note/card due dates as toggleable calendar layers | Must | 104, 112, 060 | — | To do | — | owner backlog file |
| HAAL-122 | E08 Integration | Convert note/card/event between types keeping content, attachments, links | Should | 120 | — | To do | — | owner backlog file |
| HAAL-123 | E08 Integration | Ctrl+K command palette: navigate, search, quick-create | Should | 037, 039 | — | To do | — | owner backlog file |
| HAAL-143 | E10 QA | Accessibility (WCAG 2.2 AA, axe), Lighthouse, Core Web Vitals, mobile viewport checks | Should | 017, 170 | — | To do | — | owner backlog file |
| HAAL-153 | E11 Delivery | Public user and admin guides in code repo; API docs from OpenAPI | Should | 015 | — | To do | — | owner backlog file |
| HAAL-157 | E11 Delivery | S3-compatible attachment storage adapter (AWS S3, Garage, SeaweedFS, Ceph RGW) | v1.1 | 040 | — | To do | — | owner backlog file |
| HAAL-158 | E11 Delivery | OpenTelemetry tracing (API, worker, DB) with optional OTLP exporter | v1.1+ | 019 | — | To do | — | owner backlog file |
| HAAL-168 | E12 Accounts | Optional OIDC/SSO login | Could | 160 | — | To do | — | owner, 2026-10-19 (chat) |

## Closed

<!-- +++===+++ 2026-10-30 — Hasan Alizada — Tasks the owner closed without implementation. -->

| ID | Closed | Task | Decision |
|---|---|---|---|
| HAAL-130 | 2026-10-30 | Legacy SQLite importer into a chosen user: events, RRULE, exclusions, colors, deleted kept as deleted (deleted_at = import time), log, timestamp parsing, dry-run report (CRITICAL) | Owner, 2026-10-30 (chat): not implemented; the owner moves his own legacy data by hand after testing the finished product (SRS D-100, FR-OPS-01/02 dropped) |

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
| HAAL-085 | 2026-10-28 | 10ddb0e | feat(calendar): Week A/B badge of the selected date after the ISO week in the header (HAAL-085) |
| HAAL-087 | 2026-10-28 | 7c78aae | feat(calendar): week view with a Day / Week switch — all-day row, timed grid with overlaps side by side, current-time line (HAAL-087) |
| HAAL-088 | 2026-10-28 | 231168e | feat(calendar): month view — weeks of the month, events per day with +N more, days open the day view (HAAL-088) |
| HAAL-089 | 2026-10-28 | c1e833b | feat(calendar): agenda view — days with events for the user's range, rows like the day list, headings open the day (HAAL-089) |
| HAAL-090 | 2026-10-28 | 7f9d3ae | feat(calendar): drag and drop rescheduling in the week and month views, only this or all occurrences, undoable (HAAL-090; this and following: HAAL-093) |
| HAAL-091 | 2026-10-28 | e7a443e, e7abe0f | feat(calendar): event reminders (stage 1: editor, worker, notification center) and Web Push to closed browsers (stage 2) (HAAL-091) |
| HAAL-092 | 2026-10-29 | 4098ec1 | feat(calendar): extended repeat rules — every N, weekdays, Nth or last weekday, last day of month, until a date or N times (HAAL-092) |
| HAAL-093 | 2026-10-29 | 9bf4f63 | feat(calendar): edit, delete and move this and following occurrences — the series is split at the occurrence (HAAL-093) |
| HAAL-094 | 2026-10-29 | 613d5f5, e109f25 | feat(calendar): multiple calendars — default for every user, archive, hidden calendars (stage 1) and the calendar list in the sidebar with sharing (stage 2) (HAAL-094) |
| HAAL-095 | 2026-10-29 | 119e701 | feat(calendar): ICS import into a chosen calendar with a report and ICS export, also in the data export (HAAL-095) |
| HAAL-096 | 2026-10-29 | c6eb1cf | feat(calendar): duplicate an event to another date with its reminders and attachments (HAAL-096) |
| HAAL-097 | 2026-10-29 | cc36206 | feat(calendar): ISO week numbers in the mini month (HAAL-097) |
| HAAL-098 | 2026-10-29 | 599e796 | feat(calendar): swipe left or right to change the period on touch devices (HAAL-098) |
| HAAL-100 | 2026-10-29 | 87796d9, 5f4c2b8 | feat(todo): notes — own container, sync, archive, trash and export (stage 1) and the To-Do page with pin, colour, archive, delete and the note editor (stage 2) (HAAL-100) |
| HAAL-101 | 2026-10-29 | 1361d79, c8245e6 | feat(todo): checklists — items on the server with sync, note rights, trash and export (stage 1) and in the note editor and on the cards (stage 2) (HAAL-101) |
| HAAL-105 | 2026-10-29 | 31bfbdb, 01307a6 | feat(todo): reminders on notes — a date and time fired once on the server (stage 1), set in the note editor, a bell on the card, the notification opens the note (stage 2) (HAAL-105) |
| HAAL-110 | 2026-10-29 | 168358e, b9f7ce7 | feat(kanban): boards — on the server with sharing, trash and export (stage 1) and the boards page with the board header, rename, archive, share, leave and delete with undo (stage 2) (HAAL-110) |
| HAAL-111 | 2026-10-29 | 9907580, bbf3811 | feat(kanban): board columns — on the server with WIP limit, archive, trash and export (stage 1) and on the board side by side with add, rename, WIP limit, drag and menu moves, archive, delete with undo and starting columns for new boards (stage 2) (HAAL-111) |
| HAAL-112 | 2026-10-30 | 796e712, ef6cbf0, 886d335 | feat(kanban): cards and board labels — on the server with due date and time, column moves, checklist, attachments, labels, trash and export (stage 1), cards on the board and the card editor (stage 2) and board labels in the card editor (stage 3) (HAAL-112) |
| HAAL-113 | 2026-10-30 | 145b694 | feat(kanban): move cards by drag and drop (mouse, touch) and Alt+arrows, column and position merged as a pair, undoable (HAAL-113) |
| HAAL-116 | 2026-10-30 | 8a35dad, 1735659 | feat(kanban): due-date reminders on cards — event forms from the due date in the board owner's zone, notification and web push (stage 1), reminders in the card editor, bell on the card, ?card= from the notification (stage 2) (HAAL-116) |
| HAAL-117 | 2026-10-30 | 1d1d8e2 | feat(kanban): overdue and due-soon badges on cards and in the card editor — whole-day dates, word and sign besides the colour (HAAL-117) |
| HAAL-118 | 2026-10-30 | d78be55 | feat(kanban): board filters — text, labels, priority and due date in the address, phone panel, moves among the cards shown (HAAL-118; assignee filter with HAAL-119) |
| HAAL-119 | 2026-10-30 | c692422, 4576aac | feat(kanban): card assignees — board members, sync add and remove, assigned notification, trash and export (stage 1), assignees in the card editor, initials on cards, assignee filter and the notification opening the card (stage 2) (HAAL-119) |
| HAAL-120 | 2026-10-30 | a9522db, 5cf0bab | feat(links): links between events, notes and cards — either end reads, one writable end changes, sync, live updates, export (stage 1), links in the card and note editors and the event details, add link search, backlinks (stage 2) (HAAL-120) |
| HAAL-124 | 2026-10-30 | cc155a5 | feat(calendar): time blocking — a Notes & cards panel in the day and week views, drop a note or card on the week to make a linked event, Schedule… through the editor (HAAL-124) |
| HAAL-140 | 2026-10-31 | e600db4, 32c0cc2 | test: test strategy with coverage gates (stage 1); contract conformance of every route and every tested response, Playwright end-to-end tests with a clean-console guard (stage 2) |
| HAAL-141 | 2026-10-31 | 6fc4300, c8eb0ec | test(e2e): legacy regression suite — one Playwright scenario per F-01..F-34 (F-06/F-30 wait for HAAL-039, F-19 for HAAL-069, F-33's screen for HAAL-114) and a completeness check; attachments asked only once an event or note is on the server |
| HAAL-142 | 2026-10-31 | 7d16989, 5b14676 | test(e2e): offline and sync on the production build — network cut, offline reload, server unreachable, a lost answer applied once, two tabs, sign-out with unsent changes, concurrent edits (merge, a choice per field, restore or discard what was deleted elsewhere, a delete of something changed elsewhere told); local reads offline, live session before sending, indicator fixes, every merged field named in a conflict |
| HAAL-144 | 2026-11-01 | 22a6fa5, 2ed40cf, 8f87b58 | test(security): isolation over the whole API (every contract operation with another user's ids, as a stranger and as an administrator); ESLint security rules, gitleaks secret scan and a licence gate with the owner's licence policy in check-all; DAST of the API with OWASP ZAP (scripts/dev/dast.sh), the full DAST on the demo stand with HAAL-154 |
| HAAL-145 | 2026-11-08 | aa46ef6, e9c2b84, efb9382, ccfc799, c5116d8, ad68a7f, 5a23452 | docs(qa): UAT of v1.0 by the owner — 53 scenarios on a development stand and the owner's devices (installation, iPhone touch, push with the app closed); findings F1–F7 and F23 fixed and re-tested (commit before the answer, export with exceptions and reminders, pasted screenshots, drop off the grid, details popover height, bulk colour/priority/delete, note sharing, times to the minute); signed off "accepted with remarks" at ad68a7f, the minor findings F8–F22 in HAAL-174 |
| HAAL-150 | 2026-11-01 | ae190e7, cd7f7ff | build(docker), feat(deploy): one image for the API with the web app, the worker and the migrations; compose.yaml (PostgreSQL 18, migrate, app, worker, optional Caddy), Caddyfile, .env.production.example and the installation guide; scripts/dev/compose-check.sh runs the whole E2E suite on it; arm64 with HAAL-151 |
| HAAL-151 | 2026-11-08 | a6c939b, 0ae78ce, 9d28cca, 914269a | ci: GitHub Actions — every push and pull request runs check-all by steps (--only), the workflow lint (actionlint, zizmor) and compose-check on native x86_64 and arm64 runners; a tag vX.Y.Z publishes one multi-architecture image to GHCR with SBOM (image and web stage) and signed provenance; the atom registry is verified (test_manifest, ADR-0006); Dependabot for the pinned actions. The publishing was tested with v0.0.0-ci.1 and v0.0.0-ci.2 (the published image passed compose-check on x86_64; arm64 from the same sources in CI, not pulled back). Found on the way: a discarded draft could come back (fixed); schedule, Run workflow and Dependabot start once `revamp` is merged into the default branch |
| HAAL-152 | 2026-11-08 | 862f4b3 | docs(readme): the README in English — features checked against what is done (search across modules, note labels and OIDC are not claimed), screenshots from the real app with made-up data (`scripts/dev/screenshots.sh`), a quick start run from the file itself in a clean folder, configuration, upgrade, no automatic import from the old version (D-100); the demo link and the backup commands come with HAAL-154 and HAAL-155 |
| HAAL-154 | 2026-11-10 | 218216f, e3f3e1a, b8071a6, 78c3d50, dae7bb1 | feat(demo): the public demo stand at https://demo.staging.hasanalizada.net — `compose.demo.yaml` adds demo mode and a service that resets everything at each full and half hour UTC (D-103), two demo accounts with one-click sign-in, a banner with the time left, 1 MB per upload and 100 MB per account, no mail; installed on the owner's staging server behind its nginx (`docs/operations/demo.md`), image 1.0.0-rc.4. The full DAST (`scripts/dev/dast-demo.sh`, OWASP ZAP signed in, AJAX spider): web pages 115 addresses, 0 FAIL, 0 WARN; every API operation (`scripts/dev/dast.sh`) 0 FAIL, 0 WARN; decisions in `scripts/dev/dast-rules.tsv` (inline styles in the CSP, D-39; source maps stay served). The README links the demo. Found on the way and fixed, each with a test: the stand failed to start at random (two bootstraps at once), text came back on the device after signing out, signing out hung on the unsaved-changes question, the image showed version 0.1.0, signing out of Settings asked the server again after the session had ended, an editor test failed on one calendar day and a reminder test from 2026-11-10 on |
| HAAL-155 | 2026-11-09 | d7a81fe | feat(backup): `scripts/backup.sh` and `scripts/restore.sh` with one cron line (D-102): database, `data` volume and `.env`, checked and private, the newest 14 kept, a restore also on a new server; compose-check runs it on x86_64 and arm64 (lost volumes and .env, then rows, files, secrets, an attachment and signing in all back). Found on the way: after a restore devices could miss new changes and kept rows the server no longer had — fixed (the cursor names its database, the client removes such rows) |
| HAAL-156 | 2026-11-11 | b549b04, a499c22, 5fb40fa, 9a321a4 | chore(release): version 1.0.0 — released through `release/1.0.0` and a pull request into `master` with a merge commit, tagged `v1.0.0` (D-104, ADR-0002 section 8); the image `ghcr.io/hasanfalizada/haalendar` carries the tags `1.0.0`, `1.0`, `1` and `latest` for linux/amd64 and linux/arm64, and the quick start of the README was walked with it; the changelog, the release notes on GitHub, the rollback steps in the installation guide and the release steps in the development guide are written; About shows the version the image was built with instead of 0.1.0; the earlier application is kept under the tag `legacy`; `development` starts from `master` again; the demo stand runs 1.0.0 |
| HAAL-172 | 2026-10-29 | 1f5a541 | fix(calendar): an event reminder due in the minute of its first check fires at once (HAAL-172) |
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

| HAAL-173 | 2026-11-07 | a6005cb | docs: Code of Conduct contact is ha@hasanalizada.net (qaqa.dev goes away); HAAL-173 in the backlog (HAAL-173) |
| HAAL-175 | 2026-11-10 | b661077 | chore(repo): nothing personal in the repository — the notes for AI agents and the working rules leave the repository, the names of development machines give way to neutral words, and such files are git-ignored; the author's website in About is https://hasanalizada.net/; owner, 2026-11-10 (chat) (HAAL-175) |
| HAAL-176 | 2026-11-11 | 4390ebe | feat(security): no installation is listed by search engines — the app answers every request with `X-Robots-Tag: noindex, nofollow` and the page carries the same in a robots meta tag, on every installation and without a setting (D-105); no `robots.txt` with `Disallow`, which would hide the rule from a crawler; the image check and the demo scan look for the header; the demo stand gets it with the next release; owner, 2026-11-11 (chat) (HAAL-176) |
| HAAL-174 | 2026-11-12 | d5db800, 53fb1a8, a2286a5 | fix: the minor findings F8–F22 of the v1.0 UAT, in three pull requests — accounts (a password reset lifts the sign-in lock, D-106; a used or expired reset link says so at once through `POST /auth/password-reset/info`; a refused password rule shown once), calendar, board and notes (focus kept after adding a card; phone time-zone notice and touch selection hint; Ctrl+Z in the event details card; repeat choice not cut off; non-image files reported; Alt+arrows in the "?" overlay and announced checklist moves; a shared calendar not marked "(default)" and its owner named), sync and offline (preferences from another device without a reload; the calendar show box changes at once; offline writes name what was done and offer Undo); F20, the share list of F21 and "no Unlock" of F10 not reproduced; SRS v1.91–v1.92; owner, 2026-11-07 (chat, UAT option A) (HAAL-174) |
| HAAL-177 | 2026-11-13 | — | feat(security): security.txt (RFC 9116) when the operator names a contact — `HAALENDAR_SECURITY_CONTACT` (one `mailto:` or `https:` address, checked at start) makes the app serve `/.well-known/security.txt` with Contact, Expires 180 days ahead, Preferred-Languages and Canonical; without it a 404 as before (D-107, SRS v1.93); the demo names the project's private report form on GitHub; the guides, both `.env` examples and `SECURITY.md` name the setting; owner, 2026-11-13 (chat, option A) (HAAL-177) |
