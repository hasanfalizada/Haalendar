# ADR-0004: Deployment topology (Docker Compose), database, attachment storage

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-011. Accepted by owner 2026-10-14 (decisions in section 7).

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-10-14 |
| Decider | Hasan Alizada (owner) |
| Depends on | ADR-0003 (stack) |

## 1. Context
- SRS 2.4: Linux + Docker Compose, x86_64 and arm64, minimum 2 vCPU / 2 GB RAM / 10 GB disk; TLS by operator's reverse proxy or bundled proxy.
- SRS 4.2: stateless app containers, horizontal scaling possible without code changes.
- SRS 4.5: health/readiness endpoints, automatic restart, forward-only automatic migrations, RPO 24 h / RTO 1 h.
- FR-X-11: image attachments up to 10 MB, soft-deleted like other data.
- FR-OPS-03: demo instance reset every 30 minutes.
- ADR-0003: one Python backend (API + static SPA), PostgreSQL 18, Procrastinate jobs, no Node.js in production.

## 2. Options — topology
| Option | Services | Pros | Cons |
|---|---|---|---|
| A. All-in-one container (app + jobs + embedded DB) | 1 | Simplest start | DB inside app container breaks upgrades/backups; not stateless; against SRS 4.2 |
| **B. App + worker + PostgreSQL (+ optional proxy)** | 3 (+1) | Clear responsibilities, stateless app/worker from one image, standard DB ops | Slightly more YAML |
| C. Separate frontend (nginx) + API + worker + DB + Redis | 5 | Classic microservice layout | Extra services without benefit: SPA is static, queue lives in PostgreSQL |

## 3. Decision — topology (option B)
```
                 Internet / LAN
                       │ 443
            ┌──────────▼──────────┐
            │ proxy (optional)    │  Caddy 2 — automatic HTTPS
            │ profile: "proxy"    │  (skip if operator has own reverse proxy)
            └──────────┬──────────┘
                       │ 8080 (only published port without proxy)
            ┌──────────▼──────────┐        ┌─────────────────────┐
            │ app                 │        │ worker              │
            │ uvicorn + FastAPI   │        │ same image,         │
            │ /api, SSE, SPA      │        │ cmd: worker         │
            │ static, attachments │        │ reminders, e-mail,  │
            └───┬────────────┬────┘        │ Web Push, demo reset│
                │            │             └───┬────────────┬────┘
                │  internal network only       │            │
        ┌───────▼────────┐  ┌▼────────────────▼┐           │
        │ db             │  │ volume: data      │◄──────────┘
        │ PostgreSQL 18  │  │ /data/attachments │
        │ volume: pgdata │  └───────────────────┘
        └────────────────┘
   migrate (one-shot, same image): runs Alembic, exits; app and worker start after it succeeds
```

| Service | Image | Role | Restart | Healthcheck |
|---|---|---|---|---|
| `db` | `postgres:18` (official, multi-arch) | Data, FTS, job queue | `unless-stopped` | `pg_isready` |
| `migrate` | `ghcr.io/hasanfalizada/haalendar:<ver>` | `alembic upgrade head`, then exit | `no` | — |
| `app` | same image | API, SSE, static SPA, attachment download/upload | `unless-stopped` | `GET /health/ready` |
| `worker` | same image | Procrastinate worker + periodic tasks | `unless-stopped` | worker heartbeat in DB |
| `proxy` (profile `proxy`) | `caddy:2` | TLS termination, HTTP/2-3, compression | `unless-stopped` | — |

Rules:
- Start order via `depends_on` conditions: `db` healthy → `migrate` completed successfully → `app`, `worker`. No migration race between replicas.
- `db` is on an internal network and never published.
- App serves the SPA itself (single origin: no CORS, simple secure cookies); hashed assets `Cache-Control: immutable`, `index.html` `no-cache`.
- Containers run as non-root, read-only root filesystem, writable only `/data` and `/tmp`; `no-new-privileges`.
- One image for app/worker/migrate (multi-stage build: Node stage builds SPA → Python 3.14-slim runtime with uv-installed deps). Multi-arch `linux/amd64` + `linux/arm64` via buildx, published to GHCR, tags `X.Y.Z`, `X.Y`, `latest`.
- Estimated memory: db ~250 MB, app ~200 MB, worker ~150 MB, proxy ~40 MB → well under 2 GB.

## 4. Database
- PostgreSQL 18 official image. **Volume mounted at `/var/lib/postgresql`** (changed in the 18 image; data lives in `/var/lib/postgresql/18/docker`, which also allows `pg_upgrade --link` to 19 later). Mounting the pre-18 path `/var/lib/postgresql/data` would not persist correctly.
- External/managed PostgreSQL supported by setting `DATABASE_URL`; the bundled `db` service is then disabled.
- Required extensions only from core PostgreSQL (e.g. `pg_trgm`, `unaccent` for search) — no third-party extensions, so any managed PostgreSQL works.
- Backup: `pg_dump` custom format via documented command/script + attachments volume copy (HAAL-155); restore tested in CI.

## 5. Attachment storage
| Option | Pros | Cons |
|---|---|---|
| **Local volume (`/data/attachments`)** | Zero extra services, simplest backup, works on 2 GB host | Multi-instance needs a shared volume (NFS/SMB) |
| S3-compatible object storage | Scales, external durability | Extra service to run; MinIO CE is archived (images stopped Oct 2025, repo read-only 2026); alternatives Garage (AGPL), SeaweedFS (Apache-2.0), Ceph RGW, AWS S3/R2 |

Decision: **storage port with adapters**, behind one interface (`put`, `get` stream, `stat`, `soft-delete marker`); files addressed by content hash (BLAKE3) under per-user prefixes; metadata (name, type, size, owner, timestamps, `deleted_at`) in PostgreSQL. Physical files are never deleted (FR-X-01).
- `local` adapter — default, part of v1.0.
- `s3` adapter (any S3-compatible endpoint) — v1.1 (decision 7.1); multi-instance in v1.0 uses a shared volume (NFS/SMB).
- Downloads always go through the app with an authorization check; served with `Content-Disposition`, `X-Content-Type-Options: nosniff`, image types verified by content.

## 6. Configuration and secrets
- Twelve-factor: all settings via environment variables; `.env.example` documented in the code repo.
- Secrets (`SECRET_KEY`, DB password, SMTP password, VAPID private key) also accepted as `<NAME>_FILE` pointing to Docker secrets.
- Files shipped in the code repo: `compose.yaml` (production default), `compose.demo.yaml` (overlay: `DEMO_MODE=true`, seed data, reset job every 30 min, stricter upload limits), `.env.example`.
- Upgrade procedure: backup → `docker compose pull` → `docker compose up -d` (migrate runs automatically) → smoke check. Rollback = restore backup + previous image tag (migrations are forward-only).
- Kubernetes/Helm chart: Later (not in v1.0).

## 7. Owner decisions (2026-10-14)
1. **S3 adapter:** v1.0 ships the `local` adapter only; multi-instance deployments use a shared volume; `s3` adapter planned for v1.1.
2. **Bundled proxy:** optional Caddy 2 service (compose profile `proxy`) with automatic HTTPS is included; external reverse proxies remain supported and documented.
3. **Container registry:** GitHub Container Registry — `ghcr.io/hasanfalizada/haalendar`.
