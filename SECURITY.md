<!-- +++===+++ 2026-10-14 — Hasan Alizada — HAAL-004. Vulnerability reporting policy. Update "Supported versions" with every release. -->

# Security Policy

## Supported versions

Haalendar is being rewritten. Until the first stable release (v1.0.0), only the latest commit of the default branch receives security fixes.

| Version | Supported |
|---|---|
| Latest release | Yes |
| Older releases | No |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public issues, discussions or pull requests.**

Report privately via GitHub: open the repository's **Security** tab and click **Report a vulnerability**
(https://github.com/hasanfalizada/Haalendar/security/advisories/new).

Please include:
- affected version or commit;
- description of the issue and its impact;
- steps to reproduce or a proof of concept;
- any known mitigation.

## What to expect

- Acknowledgement of your report within 7 days.
- An assessment and, if confirmed, a remediation plan within 30 days.
- Credit in the release notes once the fix is published, unless you prefer to stay anonymous.

This is a community project maintained on a best-effort basis. As stated in the [LICENSE](LICENSE), the software is provided "AS IS", without warranties or liability of any kind.

## Security design

Haalendar targets **OWASP ASVS 5.0 Level 2** and is reviewed against the OWASP Top 10:2025 and the OWASP API Security Top 10:2023. Built-in protections:

- Strict security headers on every response (Content-Security-Policy without inline scripts, HSTS on HTTPS, `nosniff`, no framing, no `Server` header).
- Host header allow-list, cross-site request rejection (Origin and Fetch Metadata checks), per-client rate limiting, request size and content-type limits.
- Strict input models (unknown fields rejected); errors as RFC 9457 problems without internal details.
- Image uploads validated by file signature (no SVG or other active content), size-limited, with sanitised file names; profile photos are re-encoded on the server, which removes location and camera metadata and any hidden payload.
- Production refuses insecure configuration (default secret key, plain HTTP); secrets can be supplied as files.
- The first-run admin wizard is open only while no administrator exists; in production it additionally requires a setup token from the server configuration, so nobody can claim a freshly deployed instance first.
- Every user sees only their own data and data explicitly shared with them: one authorization policy decides every request, and PostgreSQL row-level security enforces the same rules in the database. The application connects with a least-privilege role that cannot bypass these rules and cannot delete rows.
- Administrators manage accounts, never content. Every admin change requires a recent password confirmation, admins cannot change their own account in the admin panel, deactivation is soft (data kept, all sessions ended), and one active administrator always remains.
- Logs are structured and never contain passwords, tokens or cookies; metrics are off by default and token-protected.
- Supply chain: exact version pins and lockfiles, packages younger than 7 days are refused, install scripts are blocked, dependencies are audited (`pnpm security:audit`).

Operators should run Haalendar behind HTTPS and keep the instance updated.

## Scope

In scope: the Haalendar application code and the official Docker images in this repository.
Out of scope: vulnerabilities in third-party deployments, operator infrastructure, or the public demo instance's data (it is reset every 30 minutes).
