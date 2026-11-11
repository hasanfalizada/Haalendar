# Haalendar — Legacy Feature Inventory (MVP baseline)

+++===+++ 2026-10-14 — Hasan Alizada — Captured from `master` @ `c0b67ee` (2019-08-04) before the full rewrite on branch `revamp`. This file is the functional baseline for the new MVP.

## 1. Product summary
- Self-hosted, single-user, desktop web calendar. No authentication, no installation, owner keeps full control of the DB.
- Stack (legacy): Angular 9-next + Angular Material 8 (SPA) → PHP `backend/rest.php` (one file) → SQLite `backend/db.db`.
- Deployment: static build copied to `<webroot>/haalendar/`, backend into `<webroot>/haalendar/backend/`.
- Main UI = **day view**: list of events of the selected day. No week/month grid.

## 2. Functional features (F-xx = keep in MVP unless decided otherwise)

### Navigation and date
| ID | Feature | Source |
|----|---------|--------|
| F-01 | Month calendar in side panel; clicking a date selects the day (week starts Monday, `en-GB` locale) | `sidenav.component.*` |
| F-02 | Previous day / Next day buttons | `sidenav.component.*`, `dateprovider.service.ts` |
| F-03 | "Today" button (jump back to today) | `sidenav.component.ts:today()` |
| F-04 | Collapsible side panel (toggle button in header) | `app.component.ts`, `header.component.*` |
| F-05 | Header: "Events for today / <Month D, YYYY>", live clock (seconds) and ISO week number | `header.component.html`, `dateprovider.service.ts` |
| F-06 | Jump to date by typing `YYYY-MM-DD` in search box + Enter | `header.component.ts:search()` |

### Events
| ID | Feature | Source |
|----|---------|--------|
| F-10 | Create event: title (max 150 chars, default "(No title)"), date from/to, all-day toggle (default on), time from/to in 15-min steps, location, description (multiline), color, repeat | `create-event-dialog.component.*` |
| F-11 | Validation: "To" cannot be earlier than "From"; changing From auto-moves To forward | `create-event-dialog.component.ts:onYesClick()/syncDates()` |
| F-12 | Colors: fixed palette of 8 (red, orange, yellow, green, blue, purple, brown, black); default brown | `colors` table, `styles` |
| F-13 | Edit event (same dialog, prefilled) | `create-event-dialog.component.ts:fillEvent()` |
| F-14 | Day list: events of selected day, colored bars; sorted by color name, then title (not by time) | `rest.php:today()`, `eventslist.component.*` |
| F-15 | Click / right-click an event → details popover: title, ID, recurrence badge, all-day badge, date-time range, location, description (truncated at 50 chars + "more") and action buttons | `eventslist.component.*` |
| F-16 | Delete event with "Are you sure?" confirmation; keyboard `Delete` key deletes selected event | `eventslist.component.ts`, `confirmation-dialog.*` |
| F-17 | Soft delete (flag `deleted=1`) | `rest.php:deleteEvent()` |
| F-18 | Live refresh: day list and search index polled every 1 s | `dataprovider.service.ts` |
| F-19 | Guard: "You're already here!" snackbar if the edit dialog is already open | `eventslist.component.ts` |

### Recurrence
| ID | Feature | Source |
|----|---------|--------|
| F-20 | Repeat: none / daily / weekly (same weekday) / monthly (same day-of-month) / annually (same day+month). No end date; "To date" hidden for recurring | `rest.php:today()`, dialog |
| F-21 | Delete **this occurrence** (adds date to `exclusions`) or **all occurrences** | `rest.php:deleteEvent()` |
| F-22 | Edit **this occurrence**: clone event as a one-off on the selected date + exclude that date from the series (Cancel in this mode still saves the clone) | `eventslist.component.ts:updateSingleEvent()`, `rest.php:cloneEvent()` |
| F-23 | Series start auto-advances when leading occurrences are excluded (`cleanExclusions`) | `rest.php:cleanExclusions()` |

### Search, trash, misc
| ID | Feature | Source |
|----|---------|--------|
| F-30 | Search autocomplete over titles of all active events ("ID n - title"); picking one jumps to its start date | `header.component.*`, `rest.php:getActiveEvents()` |
| F-31 | Trash dialog: list deleted events (newest-created first), multi-select, Restore | `trash-dialog.*`, `rest.php:trash()/restoreEvent()` |
| F-32 | "N expired events!" counter in side panel (active events with start date < today) | `rest.php:getExpiredEvents()` |
| F-33 | Audit log table: update (before/after JSON), delete, occurrence delete, clone. Create is **not** logged; no UI | `rest.php:toLog()` |
| F-34 | Help/About dialog: "free, no restrictions", links to author site and GitHub repo | `help-dialog.*` |

## 3. Legacy API (`rest.php?op=…`, all HTTP GET)
`today`, `createEvent`, `updateEvent`, `getEventById`, `deleteEvent`, `cloneEvent`, `getColors`, `getActiveEvents`, `trash`, `restoreEvent`, `getExpiredEvents`.

## 4. Legacy data model (SQLite)
- `events(id, title, datefrom, timefrom, dateto, timeto, allday, location, color→colors.id, description, deleted, create_ts, daily, weekly, monthly, annually, last_update_ts)` — dates `YYYY-MM-DD`, times `HH:MM`, timestamps as text `m/d/Y H:i:s TZ`, recurrence as 4 nullable flags.
- `exclusions(event_id, dt)` — skipped occurrences.
- `colors(id, color)` — 0..7 palette.
- `log(id, ts, msg, data)` — audit.
- Shipped DB is empty except `colors`.

## 5. Defects and gaps found (do NOT carry over)
1. **SQL injection** in every endpoint (raw `$_GET` concatenated into SQL).
2. All writes via **GET**; `Access-Control-Allow-Origin: *`; no auth; errors returned with HTTP 200.
3. Endpoint hard-coded to `http://localhost/haalendar/backend/rest.php` in `dataprovider.service.ts`.
4. 1-second polling of two endpoints; clock `setInterval(…, 1)` (every 1 ms).
5. Client `sanitize()` turns `'` into `"`.
6. Week number is for today, not for the selected date.
7. Day list ordered by color name instead of time.
8. Trash ordered by `create_ts` (commit 853 claims "delete timestamp" — no such column).
9. No permanent delete / empty trash; no recurrence end date; monthly on 29–31 silently skips months.
10. Multiple DB connections opened per request; timestamps stored as locale strings.
11. Tests: only CLI-generated "should create" stubs; e2e is Protractor (deprecated).
12. Outdated stack: Angular 9-next/Material 8 mix, TSLint, Protractor, `entryComponents`, hammerjs.

## 6. Regression tests (HAAL-141)
+++===+++ 2026-10-31 — Hasan Alizada — One Playwright scenario per feature in `e2e/tests/legacy/`, named after it
(`F-14 …`); a feature the new app does not have yet is a `test.fixme` naming its task, so the report lists it as skipped.

| F-xx | Scenario | State |
|------|----------|-------|
| F-01..F-05 | `navigation.spec.ts` | runs |
| F-06 | `navigation.spec.ts` | fixme — search is HAAL-039 (postponed) |
| F-10..F-17 | `events.spec.ts` | runs |
| F-18 | `live.spec.ts` (a second browser context as the other device) | runs |
| F-19 | `events.spec.ts` | fixme — HAAL-069 |
| F-20..F-23 | `recurrence.spec.ts` (F-23 seen through the overdue counter, which uses the effective start) | runs |
| F-30 | `misc.spec.ts` | fixme — search is HAAL-039 (postponed) |
| F-31, F-32, F-34 | `misc.spec.ts` | runs |
| F-33 | `misc.spec.ts` | fixme — the history screen is HAAL-114; the audit log itself is covered by the backend tests (`backend/tests/test_audit.py`) |

`inventory.spec.ts` fails when a feature of §2 has no scenario, more than one, or a scenario names a feature that is
not in §2.
