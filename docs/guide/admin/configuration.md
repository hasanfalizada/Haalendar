# Settings of a Haalendar installation

+++===+++ 2026-11-26 — Hasan Alizada — HAAL-153 (D-129). Every setting in one place, with its default and what it does.
`backend/tests/test_admin_guide.py` fails when a setting of the app, of `compose.yaml`, of `.env.production.example`
or of the backup scripts is missing here, or when a default here differs from the app's.

Settings are environment variables, written in the `.env` file next to `compose.yaml`
([install.md](install.md#2-install)); `docker compose up -d` applies a change. An empty value means "not set", so the
default applies. Every secret can also be given as a file: `HAALENDAR_<NAME>_FILE=/run/secrets/<file>` (a Docker
secret) instead of `HAALENDAR_<NAME>`; a value set directly wins. The app refuses to start with an unsafe production
setting (the error names it): a missing or short secret key, a public address without `https://`, the development
database, or SMTP credentials over an unencrypted connection.

Settings the administrators change in the app itself (sign-up by invitation or open, two-factor sign-in for
administrators) are in [users.md](users.md#instance-settings).

## Installation

Read by `compose.yaml`; the first nine are in `.env.production.example`.

| Variable | Default | What it does |
|---|---|---|
| `HAALENDAR_IMAGE` | `ghcr.io/hasanfalizada/haalendar:latest` | The image to run. Name a release (`…/haalendar:1.1.0`), so that an upgrade happens only when you decide it |
| `HAALENDAR_PUBLIC_URL` | `http://localhost:8080` | The address people open, `https://…` (required in production). Its host is the only one accepted besides loopback, its origin the only one that may send changes; HTTPS turns on HSTS and secure cookies |
| `HAALENDAR_DOMAIN` | — | With the bundled proxy only (`--profile proxy`): the host of the public address; Caddy gets its certificate for it |
| `HAALENDAR_SECRET_KEY` | — | Required in production, at least 32 random characters (`openssl rand -hex 32`). Encrypts the two-factor and Web Push secrets in the database: keep it with the backups, never change it on a running installation |
| `HAALENDAR_SETUP_TOKEN` | — | Required in production until the first administrator exists: asked at `/setup`. May be removed afterwards |
| `POSTGRES_PASSWORD` | — | Required. Password of the database owner, used by the migrations only. Letters and digits (`openssl rand -hex 24`) |
| `HAALENDAR_APP_DB_PASSWORD` | — | Required. Password of the app's own database role, which has no superuser rights, cannot bypass row-level security and cannot delete rows. Letters and digits |
| `HAALENDAR_HTTP_BIND` | `127.0.0.1` | The host address the app's port is published on, for your own reverse proxy |
| `HAALENDAR_HTTP_PORT` | `8080` | That port |
| `HAALENDAR_HTTP_PUBLIC_PORT` | `80` | The bundled proxy's HTTP port (certificates, redirect to HTTPS) |
| `HAALENDAR_HTTPS_PORT` | `443` | The bundled proxy's HTTPS port (TCP and UDP for HTTP/3) |
| `HAALENDAR_WEB_SUBNET` | `172.30.250.0/24` | The Docker network of the app and the proxy; `X-Forwarded-*` headers are trusted from it only. Change it if it clashes with another network |
| `COMPOSE_PROJECT_NAME` | `haalendar` (the directory's name) | Prefix of the containers, volumes and networks; set it when anything else on the host is called `haalendar` |

## E-mail

Without `HAALENDAR_SMTP_HOST` no mail is sent: an invitation then creates the account at once and a password reset
gives the administrator a one-time password to hand over ([users.md](users.md)). Open sign-up needs mail, as each new
account confirms its address by a link. With mail, a finished data export is announced by e-mail too; reminders
always come as push and in-app notifications, never by mail.

| Variable | Default | What it does |
|---|---|---|
| `HAALENDAR_SMTP_HOST` | — | The mail server |
| `HAALENDAR_SMTP_PORT` | `587` | Its port (`465` with `ssl`) |
| `HAALENDAR_SMTP_SECURITY` | `starttls` | `starttls`, `ssl` or `none`; `none` is refused together with a user name |
| `HAALENDAR_SMTP_USERNAME` | — | User name at the mail server |
| `HAALENDAR_SMTP_PASSWORD` | — | Its password (secret) |
| `HAALENDAR_MAIL_FROM` | `Haalendar <no-reply@localhost>` | Sender of every message. Also the contact sent to the Web Push services when the public address is not HTTPS |
| `HAALENDAR_MAIL_DIR` | — | Development only: without SMTP, messages are written there as `.eml` files (default: `haalendar-mail` in the system's temporary directory). Production never writes them |

## Security and limits

| Variable | Default | What it does |
|---|---|---|
| `HAALENDAR_SECURITY_CONTACT` | — | Where security problems with this installation are reported: one `mailto:` or `https:` address. Served as `/.well-known/security.txt` (RFC 9116); without it there is none |
| `HAALENDAR_EXTRA_ALLOWED_HOSTS` | — | More host names accepted in the `Host` header, comma-separated (the public host and loopback always are) |
| `HAALENDAR_EXTRA_ALLOWED_ORIGINS` | — | More origins allowed to send changes, comma-separated (the public address always is) |
| `HAALENDAR_FORWARDED_ALLOW_IPS` | `127.0.0.1` | Addresses or networks of the reverse proxies whose `X-Forwarded-*` headers are trusted. `compose.yaml` sets it to `HAALENDAR_WEB_SUBNET`; for a proxy on another network, set it in `compose.override.yaml` ([install.md](install.md#2-install)) |
| `HAALENDAR_RATE_LIMIT_PER_MINUTE` | `600` | Requests per minute per client, sustained (`0` turns the limit off) |
| `HAALENDAR_RATE_LIMIT_BURST` | `120` | Requests a client may send at once above that |
| `HAALENDAR_AUTH_RATE_LIMIT_PER_MINUTE` | `20` | The same for sign-in, sign-up and password reset (`/api/v1/auth/*`) |
| `HAALENDAR_AUTH_RATE_LIMIT_BURST` | `10` | Their burst |
| `HAALENDAR_MAX_REQUEST_BODY_BYTES` | `1048576` | Largest request body, in bytes. Uploads have their own limits (10 MB per image, 5 MB per `.ics` file) |
| `HAALENDAR_HSTS_MAX_AGE_SECONDS` | `31536000` | How long browsers keep to HTTPS for the public host (HSTS, with an `https://` address only; `0` turns it off) |
| `HAALENDAR_SESSION_IDLE_DAYS` | `30` | A sign-in ends after this many days without use |
| `HAALENDAR_SESSION_ABSOLUTE_DAYS` | `90` | …and after this many days in any case |
| `HAALENDAR_PUSH_EXTRA_HOSTS` | — | Web Push services beyond the known ones (Google, Mozilla, Microsoft, Apple), comma-separated hosts. The server sends push messages to those only, so a forged subscription cannot make it call another host |

## Database

`compose.yaml` builds the two database addresses from the passwords above; set these only for a database of your own.

| Variable | Default | What it does |
|---|---|---|
| `HAALENDAR_DATABASE_URL` | — (the development database) | The app's connection (`postgresql+psycopg://…`), as its own role. Required in production |
| `HAALENDAR_MIGRATION_DATABASE_URL` | — (the development database) | The owner's connection, used by the migrations and by creating the app's role |
| `HAALENDAR_DB_POOL_SIZE` | `5` | Connections each process keeps open |
| `HAALENDAR_DB_MAX_OVERFLOW` | `5` | Connections it may open beyond that for a burst |
| `HAALENDAR_DB_POOL_TIMEOUT_SECONDS` | `5.0` | How long a request waits for a free connection |
| `HAALENDAR_DB_CONNECT_TIMEOUT_SECONDS` | `5` | How long a new connection may take |
| `HAALENDAR_DB_SLOW_QUERY_MS` | `200` | Statements slower than this are logged (never their parameters); `0` turns it off |

## Logs and metrics

| Variable | Default | What it does |
|---|---|---|
| `HAALENDAR_LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING` or `ERROR` |
| `HAALENDAR_LOG_FORMAT` | `json` | `json` (one line per event, for a log collector) or `console` (for reading). Secrets are never logged |
| `HAALENDAR_METRICS_ENABLED` | `false` | Prometheus metrics at `/metrics` |
| `HAALENDAR_METRICS_TOKEN` | — | Required with metrics, at least 24 characters: scrape with `Authorization: Bearer <token>` |

## Backups

Read by `scripts/backup.sh` ([backup.md](backup.md)).

| Variable | Default | What it does |
|---|---|---|
| `HAALENDAR_BACKUP_DIR` | `./backups` | Where backups go |
| `HAALENDAR_BACKUP_KEEP` | `14` | How many of the newest stay; older ones are removed after each successful backup |

## Set by the image or by Compose

Leave these as they are; they are listed so that nothing is unexplained.

| Variable | Default | What it does |
|---|---|---|
| `HAALENDAR_ENV` | `development` | `production` in the image: unsafe settings stop the start, interactive API docs are off |
| `HAALENDAR_STORAGE_DIR` | — | `/data/storage` in the image (the `data` volume): uploaded files, stored by content and never deleted, and data exports. Required in production |
| `HAALENDAR_STATIC_DIR` | — | `/app/static` in the image: the built web app the server serves |
| `HAALENDAR_BIND_HOST` | `0.0.0.0` | The address the server listens on inside the container |
| `HAALENDAR_PORT` | `8080` | Its port inside the container |
| `HAALENDAR_DEMO_MODE` | `false` | Set by `compose.demo.yaml` only: a public demo with made-up data, reset every 30 minutes ([demo.md](../../operations/demo.md)). Never on an installation with real data |
| `HAALENDAR_VERSION` | the release | Set by the image: the version the health endpoint reports |
