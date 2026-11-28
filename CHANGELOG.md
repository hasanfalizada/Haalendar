<!-- +++===+++ 2026-11-11 — Hasan Alizada — HAAL-156. The changelog of the product, one section per release. -->

# Changelog

What changed in each release of Haalendar, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html), counted from what an installation relies
on: the settings in `.env`, `compose.yaml`, the backup format and the REST API under `/api/v1`.

- **Major** (2.0.0): something of the above changes so that an installation needs more than the
  [upgrade steps](docs/operations/deployment.md#3-upgrade).
- **Minor** (1.1.0): new features; an upgrade needs nothing but the upgrade steps.
- **Patch** (1.0.1): fixes only.

At every level the database migrates forward by itself and is never migrated back: to return to an earlier version,
restore the backup made before the upgrade ([roll back](docs/operations/deployment.md#roll-back-an-upgrade)).

## [Unreleased]

## [1.2.0] - 2026-11-28

Due dates on notes and in the calendar, comments and history, converting an item to another kind, the command palette,
the day on the hours, swimlanes, and guides for users, operators and API clients. The database gets five new
migrations that run by themselves on start; nothing in `.env`, `compose.yaml` or the backup format changes, and the
REST API only grows (one field that was always empty is replaced, see Changed). Upgrade with the
[usual steps](docs/guide/admin/install.md#3-upgrade). Going back to 1.1.0 needs the backup made before the upgrade
together with the previous image ([roll back](docs/guide/admin/install.md#roll-back-an-upgrade)).

### Added

- **Due date of a note**, with an optional time, in the note editor; the note shows it with the Overdue and Due soon
  badges of the cards.
- **Due dates in the calendar**: the due dates of notes and of cards stand on their day, in the all-day row of the day
  and the week and in the month and the agenda; a click opens the note or the card. Each of the two layers is switched
  on and off under the calendars (Layers), for every device.
- **Comments on cards** (Markdown, written offline too, found by the search; a new comment tells the people assigned to
  the card) and **Activity**: the history of an event, a note or a card — who changed what and when —, on cards
  together with the comments ("Comments only" hides the changes). The history needs a connection.
- **Convert to…** makes an event a note or a card, a note an event or a card, a card an event or a note — the same
  item with its title, description, colour, priority, images, links and history; before converting it says what
  changes, and Undo brings everything back.
- **Command palette**: Ctrl+K (⌘K on a Mac) opens the search window with commands on top — go to a page, a board or
  today, create an event, a note, a list or a card, also with the words typed as its title.
- **The day on the hours**: List | Hours in the day view; Hours is the week's grid for one day with the current-time
  line. The all-day row of the week and of the day folds past three entries ("+N more").
- **Swimlanes** on a board: the cards grouped into rows by priority, assignee or label; a card dragged into another
  row takes its priority or assignee, and a card added in a row gets its value.
- **Guides** in [`docs/guide/`](docs/guide/README.md): a user guide with pictures and every keyboard shortcut (Help →
  Documentation opens it), an admin guide with every setting and its default, and the API reference written from the
  contract with an example of calling the API from a script.
- REST API: `GET /items/{id}/history`, `POST /items/{id}/convert`, comments through sync (`comment`), the settings
  `hidden_layers` and `day_layout`, and a note's `due_date` and `due_time`.

### Changed

- REST API: a note's `due_at`, which nothing ever set (always empty), is replaced by `due_date` and `due_time`.
- Accessibility is checked on every screen on a computer and on a touch phone; what it found is fixed: menus no longer
  hide the page from screen readers, buttons and rows on touch screens are at least 44 px, names of controls contain
  the words they show, and the text of another month's events keeps its contrast.
- The first page loads less JavaScript (within 300 KB, about 13 % less): the search window, the command palette, the
  formatting help and Convert to… load when they are first opened.
- The operations guide moved to the admin guide ([`docs/guide/admin/`](docs/guide/admin/README.md)); the old page
  points to it.

### Fixed

- The calendar header keeps one line, or breaks after the date, on every screen width: New event is never left alone
  on a line of its own.

## [1.1.0] - 2026-11-23

Search, its filters, personal labels for notes and a set of improvements to the calendar. The database gets three new
migrations that run by themselves on start; nothing in `.env`, `compose.yaml`, the backup format or the REST API
changes, and the data kept on devices stays as it is. Upgrade with the [usual steps](docs/operations/deployment.md#3-upgrade).
Going back to 1.0.1 needs the backup made before the upgrade together with the previous image
([roll back](docs/operations/deployment.md#roll-back-an-upgrade)).

### Added

- **Search.** A small search field in the header of Calendar, To-Do and Boards (on a phone in the top bar), or the
  `/` key, opens the search window over the dimmed page. Every word must begin a word of the title, place,
  description or checklist of an event, note or card, in any order, ignoring case and accents. Results come by module
  with the words marked; the arrow keys and Enter or a click open an event on its day with its card, a note, or a card
  on its board. A date typed as YYYY-MM-DD opens that day. It works offline, on what the device keeps.
- **Search filters** under the field: module, dates (today, this week, this month, the next 30 days or a range of
  one's own), calendar, colour, priority and label. Filters alone, without words, list what they match by day.
- **Personal labels for notes**: labels without a board, seen only by their user, on one's own notes and on notes
  shared with one; a Labels filter and Manage labels on the To-Do page.
- **Notes as a grid or a list**, and their own order: drag a note by its handle, or move it with Alt and the arrow
  keys. The choice is kept for every device.
- **Events of a day by time or by colour** (Settings → Events of a day). By colour follows the order of the earlier
  application.
- **Ctrl+S** (⌘S on a Mac) saves every editor, besides Ctrl+Enter; the browser's "Save page as" no longer opens while
  an editor is open.

### Changed

- With a mouse, the rows of a day and of the agenda are one compact line of about 30 px; touch screens keep larger
  rows.
- The calendar header starts with ‹ Today ›, so these buttons keep their place in every view and for every date. The
  clock, the week number and the day number are one framed group that is easy to read.
- Red, orange, yellow and brown are easier to tell apart: red is now crimson, brown chocolate, and an item's colour
  fill is stronger. Colour names do not change.

### Fixed

- With an event's card open, one click on another event opens that event's card at once, beside the cursor and inside
  the window.
- The page never shows a second scroll bar: a long day, agenda, week or month scrolls in its own box, and a notice above
  the calendar no longer pushes it below the window.

### Demo

- The demo stand has terms of use and a privacy section, linked from its banner
  ([demo guide](docs/operations/demo.md)).

## [1.0.1] - 2026-11-13

Fixes found in the acceptance test of 1.0.0 and a security update. The database and the data kept on devices do not
change: upgrade with the [usual steps](docs/operations/deployment.md#3-upgrade); going back to 1.0.0 needs only the
previous image, no restore.

### Fixed

- A password reset lifts a temporary sign-in lock, both by the link from the e-mail and by the one-time password an
  administrator gives. Before, the new password was refused until the lock ran out.
- A reset link that was used or has expired says so at once and offers a new one, instead of showing the form and
  failing on save (the page asks the new API operation `POST /api/v1/auth/password-reset/info`).
- The forms that set a password show a refused rule once, not as a hint and as an error together.
- After a card is added with Enter, the focus stays in the field, so the next title can be typed at once.
- On a phone the time-zone notice puts its buttons under the text at full width, and the selection hint names the long
  press instead of Ctrl+click (the board, where a long press does not select, shows no hint there).
- Ctrl+Z works in the event details card, also right after a colour was picked; other dialogs still undo nothing
  behind them.
- The repeat choice ("Only this occurrence", "This and following", "All occurrences") no longer cuts off a button.
- Dropping or picking a file that is not an image says so once, instead of ignoring it.
- The "?" overlay lists Alt with the arrow keys for moving a card and a checklist item; the checklist fields name these
  keys to screen readers and a move is announced.
- A calendar shared by another user is no longer marked "(default)"; its owner's name is shown next to it.
- Preferences changed on another device reach an open page without a reload; a Preferences form being edited keeps
  the edits and takes the other values.
- The box that shows or hides a calendar changes at once instead of waiting for the server, and goes back with a
  message if the change cannot be saved.
- A change made offline says what was done and that it is kept on this device, and offers Undo like an online one.

### Security

- No installation is listed by search engines any more: the app answers every request with
  `X-Robots-Tag: noindex, nofollow` and the page carries the same in a robots meta tag. Nothing to set; a reverse
  proxy adds nothing.
- An installation can name where security problems are reported: with `HAALENDAR_SECURITY_CONTACT` set to a `mailto:`
  or `https:` address the app serves `/.well-known/security.txt` (RFC 9116). Without it nothing changes.
- The image carries `opentelemetry-api` 1.45.2, a dependency of the web framework, which fixes CVE-2026-126360 (a
  denial of service through slow parsing of a `traceparent` header).
- The image carries `dnspython` 2.9.2, a dependency of the e-mail address check, which fixes CVE-2026-128089
  (excessive memory and CPU use). The app checks the form of an address only and makes no DNS queries for it.

## [1.0.0] - 2026-11-11

The first release of the new Haalendar: a self-hosted calendar, to-do list and kanban board for several users that
keeps working offline. It is a new application and replaces the earlier single-user calendar (Angular, PHP, SQLite),
which stays available under the tag [`legacy`](https://github.com/hasanfalizada/Haalendar/tree/legacy).

### Added

- **Calendar:** day, week, month and agenda views with ISO week numbers and an optional Week A/B label; several
  calendars with colours; priorities and an overdue counter; drag and drop to reschedule.
- **Repeating events:** every N days, weeks, months or years, on chosen weekdays, on the Nth or last weekday, until a
  date or N times; one occurrence, this and the following ones, or the whole series can be changed or deleted.
- **Reminders** for events, notes and cards: in the app and as Web Push, also with the browser closed.
- **ICS** import and export.
- **To-Do:** notes with Markdown and checklists; pin, colour, priority, archive.
- **Kanban:** boards, columns with work-in-progress limits, cards with due dates, labels, checklists and assignees;
  cards move by drag and drop, by touch or with the keyboard; filters by text, label, priority and due date.
- **Links** between events, notes and cards, and time blocking: drop a note or a card on the week to plan it.
- **Offline first:** an installable web app (PWA) that keeps changes on the device, syncs when the connection is back
  and lets the user settle a conflict field by field; changes reach the other open devices live.
- **Nothing is lost:** deleting moves to a trash with restore; undo and redo; a history of changes; the user's data as
  a ZIP export at any time.
- **Several users:** the first visit creates the administrator (with a setup token); invitations, roles and an admin
  panel; sharing of calendars, notes and boards with view or edit rights; each user's data kept apart by row-level
  security in the database.
- **Accounts:** e-mail verification, password reset, two-factor sign-in (TOTP with recovery codes), a list of the
  user's sessions, each user's own time zone.
- **Comfort:** image attachments, light and dark themes, keyboard shortcuts, multi-select with bulk actions, phone and
  touch support. The interface is in English, with every text ready for translation.
- **Installation:** one image for linux/amd64 and linux/arm64 at `ghcr.io/hasanfalizada/haalendar`, run with Docker
  Compose and PostgreSQL 18; a bundled Caddy obtains the HTTPS certificate, or the app runs behind your own reverse
  proxy. The image carries its SBOM and a signed build provenance.
- **Operating:** `backup.sh` and `restore.sh` (database, uploaded files and settings, also onto a new server),
  upgrades with automatic forward-only migrations, health endpoints, JSON logs, optional metrics at `/metrics`, an
  audit log, rate limits.
- **Demo mode** (`compose.demo.yaml`): one-click sign-in as a demo user and a reset to sample data every half hour.
- **Documentation:** [installation guide](docs/operations/deployment.md), [development guide](DEVELOPMENT.md),
  requirements, architecture decisions and the security baseline under [`docs/`](docs/README.md).
- **Licence:** Apache License 2.0.

### Removed

- The earlier application. Its data is not imported: version 1.0 starts empty and events are moved by hand.

### Known limitations

- No search yet.
- Attachments are images, stored on the server's disk.
- The minor findings of the acceptance test are open; they are listed in
  [the acceptance record](docs/requirements/uat.md#6-findings).

[Unreleased]: https://github.com/hasanfalizada/Haalendar/compare/v1.2.0...development
[1.2.0]: https://github.com/hasanfalizada/Haalendar/releases/tag/v1.2.0
[1.1.0]: https://github.com/hasanfalizada/Haalendar/releases/tag/v1.1.0
[1.0.1]: https://github.com/hasanfalizada/Haalendar/releases/tag/v1.0.1
[1.0.0]: https://github.com/hasanfalizada/Haalendar/releases/tag/v1.0.0
