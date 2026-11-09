# Installing and upgrading Haalendar (Docker Compose)

+++===+++ 2026-11-01 — Hasan Alizada — HAAL-150. How an operator runs Haalendar with `compose.yaml` (ADR-0004).
Administration of users and settings in the app: the admin guide (HAAL-153).

## 1. What runs

| Service | What it does | Reachable from |
|---|---|---|
| `db` | PostgreSQL 18 (data, job queue) | the app only (internal network, never published) |
| `migrate` | creates the application's database role, runs the migrations, then exits | — |
| `app` | the API, the live stream and the web app on port 8080 | `127.0.0.1:8080` on the host (configurable), the proxy |
| `worker` | reminders, Web Push, data exports | — (sends mail and push messages out) |
| `proxy` | Caddy 2: HTTPS with automatic certificates, HTTP/2 and HTTP/3 (profile `proxy`, optional) | ports 80 and 443 |

Data lives in two volumes: `pgdata` (the database) and `data` (uploaded files and exports). The app, worker and
migration containers run as an unprivileged user with a read-only root filesystem, without capabilities and with
`no-new-privileges`. Requirements: Linux with Docker Engine 24+ and the Compose plugin, x86_64 or arm64, 2 vCPU, 2 GB
RAM, 10 GB disk.

## 2. Install

1. Put `compose.yaml`, `Caddyfile`, `scripts/backup.sh`, `scripts/restore.sh` and `.env.production.example` from the
   repository in a directory, e.g. `/opt/haalendar`.
2. `cp .env.production.example .env && chmod 600 .env`, then fill it in:
   - `HAALENDAR_PUBLIC_URL` — the address people open, `https://…`;
   - `HAALENDAR_SECRET_KEY`, `HAALENDAR_SETUP_TOKEN` — `openssl rand -hex 32` each;
   - `POSTGRES_PASSWORD`, `HAALENDAR_APP_DB_PASSWORD` — `openssl rand -hex 24` each (letters and digits only);
   - SMTP, so that invitations, e-mail verification and password resets are sent;
   - `HAALENDAR_IMAGE` — a release tag, e.g. `ghcr.io/hasanfalizada/haalendar:1.0.0`.
     <!-- +++===+++ 2026-11-08 — Hasan Alizada — HAAL-151. What a release image is and how to see what is in it. -->
     One tag serves x86_64 and arm64 (Docker picks the host's). Each release image carries the list of everything in
     it (SBOM, SPDX) and how it was built (provenance):
     `docker buildx imagetools inspect ghcr.io/hasanfalizada/haalendar:1.0.0 --format '{{ json .SBOM }}'`
     (`.Provenance` for the build). The list has two documents for each architecture: `SPDX` is the image itself
     (system and Python packages), `AdditionalSPDXs` is the stage that builds the web app (its JavaScript libraries,
     together with the tools used only to build it, such as Vite and ESLint, and that stage's system packages, which
     are not in the image). That the image was built by this project's CI from its sources, signed:
     `gh attestation verify oci://ghcr.io/hasanfalizada/haalendar:1.0.0 --repo hasanfalizada/Haalendar` (GitHub CLI).
3. Start it:
   - **with the bundled proxy** (the host is reachable from the internet on ports 80 and 443, DNS points to it): set
     `HAALENDAR_DOMAIN` to the host of the public URL and run `docker compose --profile proxy up -d`; Caddy gets the
     certificate by itself;
   - **behind your own reverse proxy**: `docker compose up -d` and forward `https://<your host>` to
     `http://127.0.0.1:8080` (keep the `Host` header, send `X-Forwarded-For` and `X-Forwarded-Proto`, do not buffer
     responses of `/api/v1/stream`, which is a live event stream). A proxy in another container joins the network
     `haalendar_web` and forwards to `http://haalendar-app-1:8080` (the container's name: other networks of the proxy
     may have an `app` too); the port on the host is then not needed.
4. Open the public URL: the first visit leads to `/setup`, where the first administrator is created with the setup
   token. The token is not needed afterwards and may be removed from `.env`.
5. Check: `docker compose ps` shows `app` and `worker` as healthy; `curl -s http://127.0.0.1:8080/api/v1/health/ready`
   answers `"status":"ready"` with `"rls_enforced":true`.

**Behind a proxy in another Compose project** (HAAL-145), e.g. a Caddy on an external network `proxy` that serves
several apps: the installation directory may be a clone of the repository (`git clone --branch <release>`), so
`compose.yaml` always matches the image; local changes go into `compose.override.yaml` next to it (ignored by git,
read by `docker compose` automatically):

```yaml
services:
  app:
    networks: [db, web, proxy]
    environment:
      # X-Forwarded-* from the proxy's network only (the subnet of `docker network inspect proxy`).
      HAALENDAR_FORWARDED_ALLOW_IPS: 172.18.0.0/16
networks:
  proxy:
    external: true
```

The proxy then forwards to `http://<project>-app-1:8080`, for Caddy:

```
calendar.example.org {
    reverse_proxy haalendar-app-1:8080
}
```

(`tls internal` inside the block when the name is not reachable from the internet: Caddy's own certificate authority,
whose root certificate — `data/caddy/pki/authorities/local/root.crt` of the Caddy container — is installed once on
each device.)

**Next to other services on the same Docker host** (HAAL-145): set `COMPOSE_PROJECT_NAME` in `.env` when anything else
there is called `haalendar` — containers, volumes and networks carry the project name, and `docker compose down -v`
in the wrong project deletes the wrong data. Pick a free `HAALENDAR_HTTP_PORT` and a `HAALENDAR_WEB_SUBNET` that no
other network uses (`docker network inspect $(docker network ls -q) --format '{{.Name}} {{range .IPAM.Config}}{{.Subnet}}{{end}}'`).

Settings beyond the example (rate limits, session lifetimes, logging, metrics, the trusted proxy network) are the
`HAALENDAR_*` variables of `.env.example`; add them to `.env`. Secrets can also be passed as files:
`HAALENDAR_SECRET_KEY_FILE=/run/secrets/secret_key`.

## 3. Upgrade

1. Back up: `./backup.sh` ([section 5](#5-back-up-and-restore)).
2. Set `HAALENDAR_IMAGE` to the new tag, then `docker compose pull && docker compose up -d` (with `--profile proxy`
   if you use it). `migrate` runs the new migrations before the app and the worker start; they are forward-only.
3. Check `docker compose ps` and the health endpoint as after the installation.

Rollback: restore the backup and set the previous tag (a migration is never undone).

## 4. Operating

- Logs: `docker compose logs -f app worker` (one JSON line per event; secrets are never logged).
- Stop: `docker compose down` (data stays in the volumes); `docker compose down -v` deletes the volumes and with them
  all data.
- A shell in the app's image: `docker compose run --rm app sh`.
- Metrics (optional): `HAALENDAR_METRICS_ENABLED=true` and a `HAALENDAR_METRICS_TOKEN`; scrape `/metrics` with
  `Authorization: Bearer <token>`.

## 5. Back up and restore

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

## 6. A public demo

<!-- +++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. -->
A stand with made-up data that resets itself every 30 minutes: [demo.md](demo.md). Never on an installation with real data.
