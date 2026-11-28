# Installing and upgrading Haalendar (Docker Compose)

+++===+++ 2026-11-01 — Hasan Alizada — HAAL-150. How an operator runs Haalendar with `compose.yaml` (ADR-0004).
+++===+++ 2026-11-26 — Hasan Alizada — HAAL-153 (D-129). Moved here from `docs/operations/deployment.md` into the admin
guide; the backup moved to [backup.md](backup.md). Users and settings in the app: [users.md](users.md).

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
   - optionally `HAALENDAR_SECURITY_CONTACT` — where security problems with your installation are reported, a
     `mailto:` or `https:` address; the app then serves it as `/.well-known/security.txt` (RFC 9116);
   - `HAALENDAR_IMAGE` — a release tag, e.g. `ghcr.io/hasanfalizada/haalendar:1.2.0`.
     <!-- +++===+++ 2026-11-08 — Hasan Alizada — HAAL-151. What a release image is and how to see what is in it. -->
     One tag serves x86_64 and arm64 (Docker picks the host's). Each release image carries the list of everything in
     it (SBOM, SPDX) and how it was built (provenance):
     `docker buildx imagetools inspect ghcr.io/hasanfalizada/haalendar:1.2.0 --format '{{ json .SBOM }}'`
     (`.Provenance` for the build). The list has two documents for each architecture: `SPDX` is the image itself
     (system and Python packages), `AdditionalSPDXs` is the stage that builds the web app (its JavaScript libraries,
     together with the tools used only to build it, such as Vite and ESLint, and that stage's system packages, which
     are not in the image). That the image was built by this project's CI from its sources, signed:
     `gh attestation verify oci://ghcr.io/hasanfalizada/haalendar:1.2.0 --repo hasanfalizada/Haalendar` (GitHub CLI).
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

Settings beyond the example (rate limits, session lifetimes, logging, metrics, the trusted proxy network): every one
with its default in [configuration.md](configuration.md); add them to `.env`. Secrets can also be passed as files:
`HAALENDAR_SECRET_KEY_FILE=/run/secrets/secret_key`.

## 3. Upgrade

1. Back up: `./backup.sh` ([backup.md](backup.md)).
2. Set `HAALENDAR_IMAGE` to the new tag, then `docker compose pull && docker compose up -d` (with `--profile proxy`
   if you use it). `migrate` runs the new migrations before the app and the worker start; they are forward-only.
3. Check `docker compose ps` and the health endpoint as after the installation.

Which versions exist and what each one changed: the [changelog](../../../CHANGELOG.md). Name an exact version in
`HAALENDAR_IMAGE` (`…/haalendar:1.2.0`) rather than `latest`, so that an upgrade happens only when you decide it. A
major version (2.0.0) may need more than these steps; its release notes then say what.

### Roll back an upgrade

<!-- +++===+++ 2026-11-11 — Hasan Alizada — HAAL-156. Going back to the previous version, step by step. -->
A migration is never undone, so going back means returning to the backup made in step 1, with the previous image.
Whatever was saved after that backup is lost, as after any restore ([backup.md](backup.md)).

1. Set `HAALENDAR_IMAGE` in `.env` back to the previous version. The backup names the image it was made with in its
   `info.txt`.
2. Restore the backup made before the upgrade: `./restore.sh backups/haalendar-<UTC time>`. It stops the app and the
   worker, replaces the database and the files, and starts the previous version.
3. With the bundled proxy, start it too: `docker compose --profile proxy up -d`.
4. Check `docker compose ps` and the health endpoint: `/api/v1/health/ready` answers the version that runs.

Setting the previous image alone, without the restore, is enough only when the newer version brought no migration.
Otherwise `migrate` stops, because the database is newer than the image (`docker compose logs migrate` ends with
`Can't locate revision identified by …`), and the app does not start; nothing is damaged by that, so go on with
step 2.

If a release turns out to be faulty, its image is not replaced: the fix comes as the next patch version, and the
faulty one stays as it was published.

## 4. Operating

- Logs: `docker compose logs -f app worker` (one JSON line per event; secrets are never logged).
- Stop: `docker compose down` (data stays in the volumes); `docker compose down -v` deletes the volumes and with them
  all data.
- A shell in the app's image: `docker compose run --rm app sh`.
- Metrics (optional): `HAALENDAR_METRICS_ENABLED=true` and a `HAALENDAR_METRICS_TOKEN`; scrape `/metrics` with
  `Authorization: Bearer <token>`.
- Search engines: the app asks them not to list your installation (`X-Robots-Tag: noindex, nofollow` on every
  response and the same in the page). There is no setting for it and no `robots.txt` is needed.
