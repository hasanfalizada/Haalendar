# syntax=docker/dockerfile:1
# +++===+++ 2026-11-01 — Hasan Alizada — HAAL-150. The Haalendar image (ADR-0004): one image for the API with the web app,
# the worker and the migrations. Stage 1 builds the web app with Node; the runtime is Python 3.14-slim with the backend
# installed by uv from uv.lock, without Node. Base images are pinned by digest and were at least 7 days old when chosen
# (supply-chain rule); they are multi-arch, so the same file builds linux/amd64 and linux/arm64 (buildx, HAAL-151).
# Build: docker build -t haalendar .        Roles: see docker/entrypoint.sh

# ---------- web app ----------
FROM --platform=$BUILDPLATFORM node:24.22.0-slim@sha256:91acba91b842bec0bf7ea6f5e09c644c7ccad72c4996ed9616d861d1c7cd60d4 AS web
# +++===+++ 2026-11-08 — Hasan Alizada — HAAL-151. The SBOM covers this stage too: by default BuildKit scans only the
# final stage, where the web app is bundled files and React, Dexie and the rest cannot be seen. The price: the SBOM also
# lists what is used only to build (Vite, ESLint, the Node image's packages), which is better than leaving code out.
ARG BUILDKIT_SBOM_SCAN_STAGE=true
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=true
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/
COPY e2e/package.json e2e/
RUN pnpm install --frozen-lockfile --filter haalendar-frontend
COPY api/ api/
COPY atoms/ atoms/
# The password policy shares its list of common passwords with the backend (atom accounts.password_policy).
COPY backend/src/haalendar/accounts/data/ backend/src/haalendar/accounts/data/
COPY frontend/ frontend/
RUN pnpm --filter haalendar-frontend build

# ---------- runtime ----------
FROM ghcr.io/astral-sh/uv:0.13.5@sha256:32a7bb39b496babbd997b0a39a4d66c126bdaf5661b302bf6f06abda8deca6ff AS uv
FROM python:3.14.9-slim@sha256:35caba83af2fe6da9a5d922f9b0156f21d1246a48278c58a08bd253303ba42e8 AS runtime
ARG VERSION=0.1.0
LABEL org.opencontainers.image.title="Haalendar" \
      org.opencontainers.image.description="Self-hosted calendar, to-do and kanban that works offline" \
      org.opencontainers.image.source="https://github.com/hasanfalizada/haalendar" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.version="${VERSION}"
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_NO_CACHE=1 UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv PATH=/app/.venv/bin:$PATH \
    HAALENDAR_ENV=production HAALENDAR_STATIC_DIR=/app/static HAALENDAR_STORAGE_DIR=/data/storage \
    HAALENDAR_BIND_HOST=0.0.0.0 HAALENDAR_PORT=8080 HAALENDAR_VERSION="${VERSION}"
WORKDIR /app
COPY --from=uv /uv /usr/local/bin/uv
# Dependencies first (their own layer), then the backend itself; uv.lock decides every version (--frozen).
COPY pyproject.toml uv.lock .python-version ./
COPY backend/pyproject.toml backend/
RUN uv sync --frozen --no-dev --package haalendar-backend --no-install-workspace
COPY backend/alembic.ini backend/
COPY backend/migrations/ backend/migrations/
COPY backend/src/ backend/src/
RUN uv sync --frozen --no-dev --package haalendar-backend && rm /usr/local/bin/uv
COPY --from=web /src/frontend/dist/ /app/static/
COPY docker/entrypoint.sh /app/entrypoint.sh
# An unprivileged user; the only writable places at run time are /data (volume) and /tmp (compose: read-only root).
RUN groupadd --system --gid 10001 haalendar \
 && useradd --system --uid 10001 --gid haalendar --home-dir /nonexistent --shell /usr/sbin/nologin haalendar \
 && mkdir -p /data/storage && chown -R haalendar:haalendar /data
USER haalendar
VOLUME ["/data"]
EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["api"]
