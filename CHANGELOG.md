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
- The image carries `opentelemetry-api` 1.45.2, a dependency of the web framework, which fixes CVE-2026-126360 (a
  denial of service through slow parsing of a `traceparent` header).

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

[Unreleased]: https://github.com/hasanfalizada/Haalendar/compare/v1.0.0...development
[1.0.0]: https://github.com/hasanfalizada/Haalendar/releases/tag/v1.0.0
