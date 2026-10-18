# Haalendar data export

+++===+++ 2026-10-18 — Hasan Alizada — HAAL-043 (FR-X-14, owner decision D-48): format and behaviour of the user data export, in the manner of Google Takeout.

## For users
Settings → **Your data**: choose the modules (Calendar, To-Do, Kanban) and whether to include images, then **Create export**. The password is asked again (the archive holds all your data). The archive is prepared in the background; the page shows its progress, says when it is ready and an e-mail is sent when the instance has mail configured. Download it within **7 days**; afterwards the archive is removed (the list still shows the export as *Expired*) and you can create a new one. One export runs at a time.

What is exported: everything **you own** — your calendars, boards and notes and everything inside them, whoever created it, **deleted items included** (with `deleted_at`). Items you created in someone else's shared calendar or board belong to its owner and are in their export.

## Archive layout
```
haalendar-export-YYYY-MM-DD.zip
├── README.html                 what is inside, record counts, file list
├── archive.json                all records in one document (the complete export)
├── schema/
│   └── haalendar-export-1.0.schema.json   JSON Schema of archive.json
├── calendar/
│   ├── <calendar name> (<id>).ics          iCalendar (RFC 5545), active events only — import into other apps
│   └── attachments/<id>-<file name>        images, only when "Include images" was chosen
├── todo/                       (with the To-Do module: notes as Markdown)
└── kanban/                     (with the Kanban module)
```
`archive.json` is the authoritative, complete copy; the other files are conveniences in standard formats.

## archive.json
Defined by the JSON Schema (draft 2020-12) shipped with the code at [`backend/src/haalendar/exports/haalendar-export-1.0.schema.json`](../../backend/src/haalendar/exports/haalendar-export-1.0.schema.json) and copied into every archive. Top level: `format` (`haalendar-export`), `schema_version`, `exported_at`, `user`, `modules`, `include_images`, then the record lists `calendars`, `events`, `notes`, `boards`, `labels`, `checklist_items`, `comments`, `links`, `reminders`, `attachments`. Every record carries `created_at`, `updated_at`, `version` and, for deleted records, `deleted_at` / `delete_batch_id`. Attachments are metadata only (name, type, size, dimensions, BLAKE3 content hash); with images included `archive_path` points to the file in the ZIP. Timestamps are UTC (RFC 3339, `Z`).

Today the calendar module fills `calendars`, the calendar `.ics` files and `attachments`; events, notes, boards and their details are filled as their modules ship, inside schema 1.x.

## Versioning
- **1.x** — new optional fields or sections. Readers must ignore what they do not know.
- **2.0** — anything that breaks existing readers (renamed or removed fields, changed meaning). The previous schema stays published.

## Operation
- A background job builds the archive (`haalendar-worker`, Procrastinate on PostgreSQL); it runs as the requesting user, so row-level security applies.
- Archives are service data: stored under `exports/<user>/<export>.zip` in the storage directory and removed once expired. The export request row stays for good. See D-48 for the rule that service data (job queue bookkeeping, caches, temporary archives) may be removed while user content and its metadata never are.
