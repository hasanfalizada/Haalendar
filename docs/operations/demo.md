# The public demo stand

<!-- +++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. How the demo runs (FR-OPS-03, D-103). -->
The demo is an ordinary installation ([deployment.md](deployment.md)) with one more Compose file, `compose.demo.yaml`.
**Never start it on an installation with real data:** every 30 minutes it removes the database and all uploaded files.
The reset refuses a database that has any account other than the demo accounts, but that is a last safeguard, not a
way of working.

## What it does

| | |
|---|---|
| Accounts | Mira Novak and Alex Stone, regular users with a published password; the sign-in page has a button for each. They share a calendar and a board. There is no administrator. |
| Reset | At every full and half hour UTC. A minute before, a new database is built next to the current one (migrations, made-up data with dates of the current week); at the mark the two swap names and the files are removed. If the build fails, the stand stays as it is and the next mark tries again. |
| After a reset | Visitors are signed out and devices sync from the start, dropping what is gone. The worker loses its connection and is restarted by Docker. Also on every start of the service `demo`. |
| Banner | The time until the next reset and that everything is public, in the app and on the sign-in page. |
| Refused (403) | Registration, first-run setup, password change and reset, e-mail verification, invitations, two-factor sign-in, ending sessions, Web Push subscriptions, data exports: each would let one visitor lock out the others, or make the stand send something or fill its disk. Wrong passwords do not lock a demo account. |
| Limits | 1 MB per upload, 100 MB of attachments per account, 300 requests per minute per client. No mail, whatever `.env` says. |
| On the host | Memory, CPU and process limits per container, logs limited to 30 MB per container. No port is open beyond the one for the reverse proxy. |

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

## Scanning it

`scripts/dev/dast-demo.sh https://demo.example.org` runs the full DAST against the stand: the web pages, signed in,
with their headers, what the app calls while going through them, and the HTTPS setup. Every operation of the API is scanned by `scripts/dev/dast.sh`. It sends attacks to that address, so run it only against a demo of
your own. Start it right after a reset (it takes up to 25 minutes). Reports go to `.dev/dast-demo/`.
