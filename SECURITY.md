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

## Scope

In scope: the Haalendar application code and the official Docker images in this repository.
Out of scope: vulnerabilities in third-party deployments, operator infrastructure, or the public demo instance's data (it is reset every 30 minutes).
