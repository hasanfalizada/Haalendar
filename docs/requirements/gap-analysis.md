# Gap Analysis — Haalendar vs Google Calendar, Outlook, Google Keep, Trello, Kanboard

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-003. Shortlist of features missing in SRS v1.0, **Approved by owner 2026-10-14 without changes.** Principle: borrow what makes the product credible, do not copy everything (U#7).

## 1. Method
- Baseline: SRS v1.0 (`requirements/SRS.md`) = legacy parity + owner requests + accounts + offline.
- Compared against current public feature sets (checked 2026-10-14): Google Calendar (incl. task time-blocking, Nov 2025), new Outlook (drag-and-drop reschedule, conditional formatting, ICS preview — 2026), Google Keep (reminders, OCR, Gemini lists, "Talk to Keep" — 2026), Trello (Inbox, Planner — 2025/2026), Kanboard (board/list/calendar/Gantt views, swimlanes, automatic actions, recurring tasks, time tracking, iCal feeds, JSON-RPC API).
- Only features **not already covered** by SRS are listed.
- **Value:** H / M / L for a self-hosted personal + team planner.
- **Cost (relative):** S ≈ up to 2 days, M ≈ up to 1 week, L ≈ more than 1 week.
- **Recommendation:** `v1.0` (include now) · `v1.1` (next release) · `Later` · `Reject`.

## 2. Calendar
| ID | Feature | Seen in | Value | Cost | Rec. | Rationale |
|---|---|---|---|---|---|---|
| C-01 | Week view | Google, Outlook | H | M | v1.0 | Day-only view is the main limitation of a "serious" calendar |
| C-02 | Month view | Google, Outlook, Kanboard | H | M | v1.0 | Overview of the month; standard expectation |
| C-03 | Agenda view (upcoming N days list) | Google, Outlook | H | S | v1.0 | Reuses day list; best view on phones |
| C-04 | Drag-and-drop reschedule in week/month views | Google, Outlook (2026) | H | M | v1.0 | Natural with C-01/C-02; undoable |
| C-05 | Reminders (in-app + browser notifications, N min before) for events | Google, Outlook | H | M | v1.0 | Core calendar function missing in legacy |
| C-06 | Recurrence: end date / count, every N, chosen weekdays, Nth weekday of month, last day of month | Google, Outlook | H | S | v1.0 | RRULE already chosen; mostly UI |
| C-07 | Edit/delete "this and following" occurrences | Google, Outlook | H | M | v1.0 | Completes recurrence operations |
| C-08 | Multiple calendars per user (e.g. Personal, Work) with show/hide and color | Google, Outlook | H | M | v1.0 | Needed anyway for calendar sharing (FR-ACC-10) |
| C-09 | ICS import / export (RFC 5545) | Google, Outlook, Kanboard | H | M | v1.0 | Migration from Google/Outlook; adoption driver |
| C-10 | Duplicate event to another date | Google, Outlook | M | S | v1.0 | Legacy already had clone internally |
| C-11 | Schedule a note/card into the calendar by drag (time-blocking) | Google (task blocks), Trello Planner | H | M | v1.0 | The core value of a 3-in-1 suite |
| C-12 | Week numbers in mini calendar | Outlook | M | S | v1.0 | Owner works with weeks (week no., Week A/B) |
| C-13 | Swipe left/right to change day on mobile | Google mobile | M | S | v1.0 | Required for comfortable mobile use |
| C-14 | Search filters: date range, calendar, color, priority | Google, Outlook | M | S | v1.0 | Small add-on to FTS |
| C-15 | Subscribe to external ICS (public holidays etc.), read-only | Google, Outlook | M | M | v1.1 | Useful, not critical |
| C-16 | Private ICS feed URL to show Haalendar in phone/desktop calendar apps | Kanboard, Google | M | M | v1.1 | Read-only bridge to native apps |
| C-17 | Natural-language quick add ("Lunch tomorrow 13:00") | Google | M | M | v1.1 | Nice, language-dependent |
| C-18 | Per-event time zone | Google, Outlook | M | M | v1.1 | User time zone already covered |
| C-19 | Year view | Google | L | S | v1.1 | Rarely needed |
| C-20 | Print / PDF of day/week | Google, Outlook | L | S | v1.1 | Low demand |
| C-21 | Multi-day recurring occurrences | Google, Outlook | L | M | Later | Rare; legacy never had it |
| C-22 | CalDAV server (two-way sync with native apps) | — (Nextcloud-class) | H | L | Later | Big scope, overlaps own sync |
| C-23 | Attendees, invitations, RSVP, free/busy, scheduling assistant | Google, Outlook | L | L | Reject | E-mail-suite territory, not this product |
| C-24 | Video-conference links | Google, Outlook | L | S | Reject | Out of product focus |
| C-25 | Conditional formatting / categories | Outlook | L | M | Reject | Colors + priority + labels are enough |
| C-26 | Working hours / focus-time / Do Not Disturb | Google | L | M | Reject | Team-office feature |

## 3. To-Do (Keep)
| ID | Feature | Seen in | Value | Cost | Rec. | Rationale |
|---|---|---|---|---|---|---|
| T-01 | Reminders on notes (uses C-05) | Keep | H | S | v1.0 | Main reason people use Keep |
| T-02 | Markdown formatting in notes and all descriptions (sanitised) | Kanboard, Trello | M | S | v1.0 | Readable rich text at low cost |
| T-03 | Repeating reminders on notes | Keep | M | S | v1.1 | Reuses RRULE |
| T-04 | Quick capture inbox (one input, lands in To-Do, later dragged to board/calendar) | Trello Inbox, Keep | M | S | v1.1 | Covered partly by command palette |
| T-05 | Link previews for URLs | Keep | L | M | Later | Needs outbound fetch; privacy concerns |
| T-06 | OCR text from images | Keep | M | L | Later | Heavy server dependency |
| T-07 | Drawing / handwriting notes | Keep | L | L | Reject | Out of focus |
| T-08 | Audio notes, voice journaling | Keep (2026) | L | L | Reject | Out of focus |
| T-09 | AI list generation / assistant | Keep (Gemini), Trello AI | M | L | Later | Optional self-hosted AI module after v1 |

## 4. Kanban (Trello / Kanboard)
| ID | Feature | Seen in | Value | Cost | Rec. | Rationale |
|---|---|---|---|---|---|---|
| K-01 | Due-date reminders on cards (uses C-05) | Trello, Kanboard | H | S | v1.0 | Consistency across modules |
| K-02 | Overdue / due-soon badges on cards | Trello, Kanboard | H | S | v1.0 | Basic usability |
| K-03 | Board filters: label, priority, due date, assignee, text | Trello, Kanboard | H | S | v1.0 | Boards become unusable without it |
| K-04 | Card assignees (members) on shared boards | Trello, Kanboard | H | M | v1.0 | Required by multi-user sharing |
| K-05 | Board list view (table of cards) | Kanboard | M | S | v1.1 | Alternative view, cheap |
| K-06 | Board templates / copy board | Trello, Kanboard | M | S | v1.1 | Convenience |
| K-07 | Card cover image (from attachments) | Trello | L | S | v1.1 | Cosmetic |
| K-08 | Recurring cards | Kanboard, Trello | M | M | v1.1 | Reuses RRULE |
| K-09 | Automatic actions / rules (e.g. moved to Done → set completed) | Kanboard, Trello Butler | M | L | Later | Powerful but large |
| K-10 | Time tracking on cards | Kanboard | L | M | Later | Niche for personal use |
| K-11 | Gantt view | Kanboard | L | L | Later | Project-management niche |
| K-12 | Analytics (cumulative flow, lead time) | Kanboard | L | M | Later | Niche |
| K-13 | Create card by e-mail | Kanboard, Trello | L | M | Later | Needs inbound mail |

## 5. Platform / cross-cutting
| ID | Feature | Seen in | Value | Cost | Rec. | Rationale |
|---|---|---|---|---|---|---|
| G-01 | In-app notification center (reminders, shares, sync errors) | All | H | S | v1.0 | Home for C-05/T-01/K-01 and sharing events |
| G-02 | Import from Trello JSON and Google Keep Takeout | Migration paths | M | M | v1.1 | Adoption driver after ICS (C-09) |
| G-03 | Personal API tokens for scripts/integrations | Kanboard API, Trello API | M | S | v1.1 | API exists; tokens make it usable |
| G-04 | Outgoing webhooks | Kanboard, Trello | L | M | Later | Integrations ecosystem |
| G-05 | E-mail reminders and daily digest | Google, Kanboard | M | M | Later | Depends on SMTP; browser reminders first |

## 6. Summary of recommendation
- **v1.0 (add to scope): 21 items** — C-01..C-14, T-01, T-02, K-01..K-04, G-01.
  Largest: C-01, C-02, C-04, C-05, C-07, C-08, C-09, C-11, K-04 (each M).
- **v1.1: 14 items** — C-15..C-20, T-03, T-04, K-05..K-08, G-02, G-03.
- **Later: 12 items** — C-21, C-22, T-05, T-06, T-09, K-09..K-13, G-04, G-05.
- **Reject: 6 items** — C-23..C-26, T-07, T-08.

## 7. Impact on SRS if approved
New requirement groups for v1.0: views (week/month/agenda), reminders and notification center, extended recurrence, multiple calendars, ICS import/export, time-blocking of notes/cards, Markdown, board filters, assignees. SRS will be updated to v1.1 and backlog tasks created from HAAL-086.
