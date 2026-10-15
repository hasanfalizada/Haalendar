# Haalendar — Security Baseline

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-020. Verification target OWASP ASVS 5.0 Level 2 (SRS 4.3, D-19), plus OWASP Top 10:2025 and OWASP API Security Top 10:2023. Living document: update the status column with every security-relevant task.

Legend: ✅ implemented and tested · 🟡 partially implemented · ⏳ planned (task) · — not applicable.

## 1. Controls implemented in HAAL-016 … HAAL-020

| Control | Where | Tests |
|---|---|---|
| RFC 9457 errors, no internal details or stack traces to clients | `errors.py`, `middleware.py` | `test_errors_and_headers.py` |
| Security headers: nosniff, Referrer-Policy no-referrer, COOP/CORP same-origin, Permissions-Policy, HSTS on https, no Server header, `Cache-Control: no-store` for API | `middleware.py` | `test_errors_and_headers.py` |
| CSP: API `default-src 'none'; frame-ancestors 'none'`; SPA strict same-origin (no inline script, no eval, no framing, no plugins) | `middleware.py` (`API_CSP`, `SPA_CSP`) | `test_security.py` |
| Host header allow-list (public host + loopback + configured extras) | `security/guards.py` `HostGuard` | `test_security.py` |
| Rate limiting: token bucket per client IP, 600/min sustained, burst 120, 429 + Retry-After + IETF RateLimit headers; health probes exempt; bounded memory (LRU 10 000 clients) | `RateLimitGuard`, `TokenBucketLimiter` | `test_security.py` |
| Request body limit 1 MiB (declared and streamed) → 413; content-type allow-list for unsafe methods (`application/json`, `application/merge-patch+json`, `multipart/form-data`) → 415 | `BodyGuard` | `test_security.py` |
| CSRF layer 1: Fetch Metadata (`Sec-Fetch-Site: cross-site`) and `Origin` allow-list for unsafe methods → 403 `csrf_failed` | `CsrfOriginGuard` | `test_security.py` |
| Mass-assignment protection: API models reject unknown fields, immutable | `security/schemas.py` `ApiModel` | `test_security.py` |
| Image upload validation by signature (PNG/JPEG/GIF/WebP only, no SVG), 10 MB, safe file names | `security/uploads.py` | `test_security.py` |
| Secrets: never in repo; `*_FILE` Docker secrets; production refuses default secret key and plain http | `config.py` | `test_config_and_logging.py` |
| Logging: redaction of secrets (nested), correlation ids, slow SQL without parameters | `logging.py`, `observability.py` | `test_config_and_logging.py`, `test_observability.py` |
| `/metrics` disabled by default; bearer token ≥ 24 chars, constant-time compare | `observability.py` | `test_observability.py` |
| Supply chain: pnpm `minimumReleaseAge` 7 days, install scripts blocked, telemetry denied; exact pins + lockfiles (`uv.lock`, `pnpm-lock.yaml`) | `pnpm-workspace.yaml`, `pyproject.toml` | `pnpm install` enforces |
| Dependency vulnerability scan: `pnpm security:audit` = `pnpm audit` (all severities) + `pip-audit` on the hashed lockfile export | root `package.json` | Run 2026-10-15: 0 known vulnerabilities |
| Containers non-root, read-only rootfs, internal DB network | ADR-0004 | ⏳ HAAL-150 |

Findings fixed during HAAL-020: 6 high / 4 moderate advisories in development tools only (js-yaml via @hey-api/openapi-ts → pnpm override 4.3.2; lodash, uuid, @faker-js/faker, braces via Prism → Prism removed from dependencies and run on demand with `pnpm dlx`). Nothing affected the shipped application.

## 2. OWASP ASVS 5.0 (Level 2) chapter status

| Chapter | Status | Notes / task |
|---|---|---|
| V1 Encoding and Sanitization | 🟡 | ORM parameterised SQL only; React output encoding; Markdown sanitising ⏳ HAAL-047 |
| V2 Validation and Business Logic | 🟡 | `ApiModel` strict schemas; per-endpoint validation with each feature |
| V3 Web Frontend Security | 🟡 | CSP, headers, CSRF layer 1 ✅; SPA served with CSP ⏳ HAAL-150; per-session CSRF token ⏳ HAAL-160 |
| V4 API and Web Service | 🟡 | Content-type/body limits, RFC 9457, merge-patch, If-Match ✅/contract; per-endpoint enforcement with features |
| V5 File Handling | 🟡 | Signature check, limits, names ✅; storage outside web root, metadata stripping, download headers ⏳ HAAL-040 |
| V6 Authentication | ⏳ | HAAL-160..162 (Argon2id, 15-char passwords, lockout, TOTP) per ADR-0005 |
| V7 Session Management | ⏳ | HAAL-160 (server sessions, `__Host-` cookie, idle 30 d / abs 90 d, revoke) |
| V8 Authorization | ⏳ | HAAL-165 (authz atom, permission matrix tests, PostgreSQL RLS) |
| V9 Self-contained Tokens | — | No JWT in v1.0 (ADR-0005); personal API tokens v1.1 are opaque |
| V10 OAuth and OIDC | ⏳ | HAAL-168 (Could): backend confidential client, PKCE, state/nonce |
| V11 Cryptography | 🟡 | Standard libraries only (argon2-cffi, BLAKE3, TLS by proxy); key management with HAAL-160 |
| V12 Secure Communication | 🟡 | HTTPS required in production, HSTS ✅; TLS termination via Caddy ⏳ HAAL-150 |
| V13 Configuration | 🟡 | Twelve-factor, secrets files, production guards, docs off outside dev ✅; container hardening ⏳ HAAL-150 |
| V14 Data Protection | 🟡 | No sensitive data in logs/URLs ✅; soft delete + export ⏳ HAAL-030/043; GDPR erasure open (O-01) |
| V15 Secure Coding and Architecture | 🟡 | Dependency pinning, release-age policy, audit ✅; SBOM + licence gate ⏳ HAAL-151 |
| V16 Security Logging and Error Handling | ✅ | Structured logs, redaction, correlation, generic errors, security events logged (host/CSRF/rate-limit rejections) |
| V17 WebRTC | — | Not used |

## 3. OWASP Top 10:2025

| Risk | Mitigation |
|---|---|
| A01 Broken Access Control | ⏳ authz atom + RLS + permission tests (HAAL-165); CSRF layer 1 ✅; SSRF: no server-side fetch of user URLs in v1.0 |
| A02 Security Misconfiguration | ✅ secure defaults, production guards, headers, docs disabled outside dev, Host allow-list |
| A03 Software Supply Chain Failures | ✅ pins, lockfiles, 7-day release age, blocked install scripts, audits; ⏳ SBOM/licence gate/signing (HAAL-151) |
| A04 Cryptographic Failures | 🟡 TLS + HSTS; Argon2id and token hashing with HAAL-160 |
| A05 Injection | ✅ ORM parameters, no shell/eval; 🟡 Markdown sanitising (HAAL-047) |
| A06 Insecure Design | ✅ threat-driven requirements, ADRs, contract-first, soft delete |
| A07 Authentication Failures | ⏳ HAAL-160..162 |
| A08 Software or Data Integrity Failures | 🟡 lockfile hashes; optimistic concurrency (If-Match) in contract; ⏳ image signing (HAAL-151) |
| A09 Security Logging & Alerting Failures | ✅ security events logged with correlation; metrics for alerting |
| A10 Mishandling of Exceptional Conditions | ✅ global handlers fail closed with generic 500, guards reject early, readiness reports not crashes |

## 4. OWASP API Security Top 10:2023

| Risk | Mitigation |
|---|---|
| API1 Broken Object Level Authorization | ⏳ container-level authz on every request + RLS (HAAL-165); UUIDv7 IDs |
| API2 Broken Authentication | ⏳ HAAL-160..162 |
| API3 Broken Object Property Level Authorization | ✅ `ApiModel` forbids unknown fields; response schemas explicit in contract |
| API4 Unrestricted Resource Consumption | ✅ rate limit, body limits, pagination ≤ 200, upload ≤ 10 MB, DB pool/timeouts |
| API5 Broken Function Level Authorization | ⏳ admin/owner checks in authz atom (HAAL-164/165) |
| API6 Unrestricted Access to Sensitive Business Flows | ⏳ registration invite-only, reset/register throttling (HAAL-160..162) |
| API7 Server Side Request Forgery | ✅ no outbound requests driven by user input in v1.0 (link previews rejected, gap T-05 Later) |
| API8 Security Misconfiguration | ✅ as A02 |
| API9 Improper Inventory Management | ✅ single versioned contract (`/api/v1`), manifest, docs only in dev |
| API10 Unsafe Consumption of APIs | — no third-party APIs consumed in v1.0 (ICS import parses files with limits ⏳ HAAL-095) |

## 5. Baseline decisions
1. Rate limiter is in-process (per replica). Sufficient for the reference load (SRS 4.2); a shared limiter (PostgreSQL-based) is considered only if horizontal scaling is used.
2. CSRF is two-layered: Origin/Fetch-Metadata check now; per-session token with authentication (ADR-0005).
3. Prism mock is not a project dependency (vulnerable transitive packages, dev-only); it runs via `pnpm dlx` on demand.

## 6. Recurring checks
- Before every PR: `pnpm check`, `pnpm backend:check`, `pnpm security:audit`.
- In CI (HAAL-151): the same plus secret scanning, SAST, SBOM, licence gate; scheduled weekly audit.
