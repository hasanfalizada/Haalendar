# Backing up and restoring Haalendar

+++===+++ 2026-11-26 — Hasan Alizada — HAAL-153 (D-129). Moved here from section 5 of `docs/operations/deployment.md`.

## Back up and restore

<!-- +++===+++ 2026-11-09 — Hasan Alizada — HAAL-155. Daily backups and the restore, RPO 24 h and RTO 1 h (SRS 4.5). -->
Each installation backs itself up on its own host; nothing is sent anywhere. Run the scripts from the installation
directory. In a clone of the repository they are `scripts/backup.sh` and `scripts/restore.sh`, run from its root.

**Back up.** `./backup.sh` runs while the app is in use and writes a directory `backups/haalendar-<UTC time>`:

| File | What it is |
|---|---|
| `db.dump` | The database (`pg_dump`, one consistent moment) |
| `files.tar` | The `data` volume: attachments and data exports |
| `env` | A copy of `.env`. `HAALENDAR_SECRET_KEY` decrypts two-factor and Web Push secrets stored in the database |
| `info.txt`, `SHA256SUMS` | Time, image and migration of the backup; checksums |

It checks that the dump and the archive can be read, and its exit code is 0 only for a complete backup. To lose at most
one day of data, run it every night (`crontab -e`) and watch for its errors, which cron sends as mail if mail is set up:

```text
0 3 * * * cd /opt/haalendar && ./backup.sh
```

Settings, in `.env` or the environment: `HAALENDAR_BACKUP_DIR` (default `./backups`) and `HAALENDAR_BACKUP_KEEP` (default
14: older backups are removed after each successful one, so make sure the disk holds that many).

**Keep a copy elsewhere.** A backup on the same disk does not survive the loss of the server. Copy the directories to
another machine, encrypted: they hold every password in `.env` and all user data (for example `rsync` over SSH to a
machine you trust, or `tar` piped through `age` or `gpg`).

**Restore.** All data of the installation is replaced by the backup, so it asks first (`--yes` skips that):

```bash
./restore.sh backups/haalendar-20270101T030000Z
```

1. It verifies the checksums, stops the app and the worker, and replaces the database and the `data` volume.
2. It starts the app, and a newer image migrates the restored database. To go back to an older version, use the image
   named in `info.txt`: a migration is never undone.
3. With the bundled proxy, start it too: `docker compose --profile proxy up -d`.

On a **new server**, install Docker, put `compose.yaml`, `Caddyfile` and `restore.sh` in a directory with the backup, and
run it: without a `.env` it takes the one from the backup. If `.env` exists with another `HAALENDAR_SECRET_KEY`, the
restore refuses to start, since two-factor sign-in and Web Push of the restored data would stop working.

**After a restore,** devices sync from the start by themselves. Whatever was saved after the backup is gone from the
server and from synced devices; changes a device had not sent yet are still sent, and any that no longer apply are listed
under Settings → Sync.

How long it takes grows with the data and the disk. Measured once with a 3 GB database and 6 GB of files on a development server:
about 2.5 minutes for the backup and 30 seconds for the restore, far below the target of one hour. Try a restore on a
spare machine to know your own numbers. `scripts/dev/compose-check.sh` runs backup and restore on every CI run.
