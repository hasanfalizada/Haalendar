# Sync and conflicts

+++===+++ 2026-11-26 — Hasan Alizada — HAAL-153 (D-129, stage 2).

## Without a connection

Haalendar keeps your calendars, notes and boards on each device you signed in on. Without a connection you go on
working: create, change, move, delete. Each change waits on the device, and the dot under your picture says how many
wait; once the connection is back they are sent in the order you made them, and what changed on your other devices
arrives. Changes of other people show up within seconds while you are online.

Needs a connection: settings, sharing, adding images, `.ics` import and export, data exports, and the history.

**Unsaved text** of an open editor is kept on the device too: if the page closes before you save, the editor offers it
the next time (**Restore** or **Discard**).

## When the same thing changed twice

Changes of **different fields** merge: you change the title on your phone, someone else the time on a computer — both
stay. When the **same field** was changed on two devices, or something you changed was deleted elsewhere, nothing is
overwritten: the change waits under **Settings → Sync** (the dot and the item say so too, with **Resolve**).

There you see both values side by side, **Mine (this device)** and **Theirs (server)**, and choose per field, or
**Keep all mine** / **Keep all theirs**. A change to something deleted elsewhere can be **restored with my changes** or
discarded. A change the server did not accept (for example after access was taken away) can be copied before you
dismiss it. **Sync now** sends and fetches at once.

If you delete something that had been changed on another device, it is deleted, and the app tells you it is in the
trash should you need the other version.
