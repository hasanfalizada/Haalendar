# Installing and upgrading Haalendar (Docker Compose)

+++===+++ 2026-11-01 — Hasan Alizada — HAAL-150. How an operator runs Haalendar with `compose.yaml` (ADR-0004).
Backup and restore: HAAL-155. Administration of users and settings in the app: the admin guide (HAAL-153).

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

1. Put `compose.yaml`, `Caddyfile` and `.env.production.example` from the repository in a directory, e.g.
   `/opt/haalendar`.
2. `cp .env.production.example .env && chmod 600 .env`, then fill it in:
   - `HAALENDAR_PUBLIC_URL` — the address people open, `https://…`;
   - `HAALENDAR_SECRET_KEY`, `HAALENDAR_SETUP_TOKEN` — `openssl rand -hex 32` each;
   - `POSTGRES_PASSWORD`, `HAALENDAR_APP_DB_PASSWORD` — `openssl rand -hex 24` each (letters and digits only);
   - SMTP, so that invitations, e-mail verification and password resets are sent;
   - `HAALENDAR_IMAGE` — a release tag, e.g. `ghcr.io/hasanfalizada/haalendar:1.0.0`.
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

1. Back up (HAAL-155).
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
