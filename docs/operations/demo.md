# The public demo stand

<!-- +++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. How the demo runs (FR-OPS-03, D-103). -->
The demo is an ordinary installation ([install.md](../guide/admin/install.md)) with one more Compose file, `compose.demo.yaml`.
**Never start it on an installation with real data:** every 30 minutes it removes the database and all uploaded files.
The reset refuses a database that has any account other than the demo accounts, but that is a last safeguard, not a
way of working.

## What it does

| | |
|---|---|
| Accounts | Mira Novak and Alex Stone, regular users with a published password; the sign-in page has a button for each. They share a calendar and a board. There is no administrator. |
| Reset | At every full and half hour UTC. A minute before, a new database is built next to the current one (migrations, made-up data with dates of the current week); at the mark the two swap names and the files are removed. If the build fails, the stand stays as it is and the next mark tries again. |
| After a reset | Visitors are signed out and devices sync from the start, dropping what is gone. The worker loses its connection and is restarted by Docker. Also on every start of the service `demo`. |
| Banner | The time until the next reset, that everything is public, and a link to the [privacy](#privacy) and [terms of use](#terms-of-use) below, in the app and on the sign-in page. |
| Refused (403) | Registration, first-run setup, password change and reset, e-mail verification, invitations, two-factor sign-in, ending sessions, Web Push subscriptions, data exports: each would let one visitor lock out the others, or make the stand send something or fill its disk. Wrong passwords do not lock a demo account. |
| Limits | 1 MB per upload, 100 MB of attachments per account, 300 requests per minute per client. No mail, whatever `.env` says. |
| security.txt | `/.well-known/security.txt` names the project's private vulnerability report form on GitHub (set in `compose.demo.yaml`). |
| On the host | Memory, CPU and process limits per container, logs limited to 30 MB per container. No port is open beyond the one for the reverse proxy. |

## Privacy

<!-- +++===+++ 2026-11-16 20:04 +04 — Hasan Alizada — HAAL-181. What the demo keeps about a visitor, checked against the code and the
demo host; a description for visitors, not a legal notice. -->
What the stand keeps about a visitor, and for how long:

| | |
|---|---|
| What is entered | Everything, files included, is removed at the next reset, at most 30 minutes later. Everything is public meanwhile: enter nothing personal. |
| On the device | The app keeps a copy of the data in the browser's storage for offline use; it goes nowhere else and is wiped on sign-out. |
| Cookie | One: the session, needed for signing in (`HttpOnly`, `Secure`). |
| Session | The start of the address (/24 for IPv4, /48 for IPv6) and the browser name, shown to the user in the list of sessions; removed at the next reset. |
| Logs of the app | Each request with its method, path, status and duration, without the address or the browser; overwritten after 30 MB per container. |
| Web server of the host | Not part of Haalendar. On the stand it logs each request with the visitor's address, time, page, browser and referring page, and deletes the log after 14 days. |
| Third parties | None: no analytics, no advertising, no fonts or scripts from elsewhere (the Content Security Policy allows only the stand's own address). Search engines are asked not to list it. |

## Terms of use

<!-- +++===+++ 2026-11-17 19:52 +04 — Hasan Alizada — HAAL-183. The terms for visitors of the demo, linked from its banner; a
plain statement of how the stand is run, not reviewed as a legal text. -->
By using the demo a visitor accepts that:

- The stand is for trying Haalendar. It is provided as is, without any warranty, and may be unavailable, changed or
  reset at any time.
- Everything entered is seen by other visitors and removed at the next reset; nothing of it is backed up or returned.
- Nothing personal or confidential is entered, nothing unlawful and nothing that infringes the rights of others, and
  the stand is not attacked or used to store or spread anything.
- What breaks these terms may be removed, and access blocked, at any time.
- A security problem is reported privately as the [security policy](../../SECURITY.md) says.

The software itself is under the [Apache License 2.0](../../LICENSE).

## Install behind a reverse proxy on the host

Choose a free port and a free Docker subnet first; the demo must not touch what else runs there:

```bash
sudo ss -ltn
docker network inspect $(docker network ls -q) --format '{{.Name}} {{range .IPAM.Config}}{{.Subnet}}{{end}}'
```

In a new directory, with the release in place of `<tag>`:

```bash
base=https://raw.githubusercontent.com/hasanfalizada/Haalendar/<tag>
curl -fsSO $base/compose.yaml -fsSO $base/compose.demo.yaml -fsSO $base/Caddyfile
cat > .env <<ENV
COMPOSE_PROJECT_NAME=haalendar-demo
COMPOSE_FILE=compose.yaml:compose.demo.yaml
HAALENDAR_IMAGE=ghcr.io/hasanfalizada/haalendar:<version>
HAALENDAR_PUBLIC_URL=https://demo.example.org
HAALENDAR_SECRET_KEY=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
HAALENDAR_APP_DB_PASSWORD=$(openssl rand -hex 24)
HAALENDAR_HTTP_BIND=127.0.0.1
HAALENDAR_HTTP_PORT=<free port>
HAALENDAR_WEB_SUBNET=<free subnet>/24
ENV
chmod 600 .env
docker compose up -d
```

`COMPOSE_FILE` makes every later `docker compose` command in this directory use both files. Then forward the public
name to the port. For nginx (certificate paths as on your host):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name demo.example.org;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name demo.example.org;
    ssl_certificate     /etc/letsencrypt/live/demo.example.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/demo.example.org/privkey.pem;
    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:<free port>;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # The live stream: answered as it comes, and it stays open.
    location = /api/v1/stream {
        proxy_pass http://127.0.0.1:<free port>;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
```

The security headers (HSTS, CSP and the rest) come from the app; do not add them in the proxy. Among them is
`X-Robots-Tag: noindex, nofollow`: the demo is not listed by search engines, so a search finds the project and not
its sample data.

Check: `docker compose ps` shows everything up and healthy, `docker compose logs demo | grep demo_reset` shows
`demo_reset_done` and no `demo_reset_failed`, and the public address shows the banner.

## Upgrade and remove

Upgrade: set `HAALENDAR_IMAGE` to the new tag, take the new Compose files, `docker compose pull && docker compose up -d`.
There is nothing to back up: all of it is made up.

Remove: `docker compose down -v` in this directory removes its containers, networks and volumes, then remove the
proxy's site. With `COMPOSE_PROJECT_NAME` set as above, nothing of another project is touched.

## If the stand is attacked

<!-- +++===+++ 2026-11-16 20:57 +04 — Hasan Alizada — HAAL-182. The incident plan of the demo: rebuild, do not repair. -->
The stand holds nothing that must be kept, so it is rebuilt rather than repaired:

1. Stop it at once: `docker compose down -v` in its directory.
2. Find how it happened (the app's and the proxy's logs), and report a fault in Haalendar as a vulnerability
   ([SECURITY.md](../../SECURITY.md)).
3. New secrets in `.env` (`HAALENDAR_SECRET_KEY`, `POSTGRES_PASSWORD`, `HAALENDAR_APP_DB_PASSWORD`, made as in the
   install above), the release with the fix, then `docker compose up -d`.
4. The host itself is checked by its administrator: the stand may share it with other services.

## Scanning it

`scripts/dev/dast-demo.sh https://demo.example.org` runs the full DAST against the stand: the web pages, signed in,
with their headers, what the app calls while going through them, and the HTTPS setup. Every operation of the API is scanned by `scripts/dev/dast.sh`. It sends attacks to that address, so run it only against a demo of
your own. Start it right after a reset (it takes up to 25 minutes). Reports go to `.dev/dast-demo/`.
