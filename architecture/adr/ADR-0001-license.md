# ADR-0001: Project licence — Apache License 2.0 with NOTICE

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-004.

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-10-14 |
| Decider | Hasan Alizada (owner) |

## Context
Owner goals for the open-source release:
1. Maximum availability: anyone can use, deploy and modify Haalendar anywhere, including commercially.
2. Authorship must not be lost.
3. No warranty or liability for the author.
4. Possibility to earn money from the product.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| MIT | Simplest, most permissive | Attribution only via copyright line in LICENSE; no patent grant; no NOTICE mechanism |
| **Apache-2.0 + NOTICE** | Permissive; redistributors must keep LICENSE and NOTICE (author attribution); explicit no-warranty/no-liability; explicit patent grant; inbound=outbound contributions (Section 5) | Slightly longer licence text |
| AGPL-3.0 + commercial dual licence | Strongest monetisation lever (SaaS providers must open changes or buy) | High adoption barrier; requires CLA from contributors; contradicts goal 1 |

## Decision
Apache License 2.0 with a NOTICE file naming Hasan Alizada as original author.
Contributions are accepted under Apache-2.0 Section 5 with DCO sign-off (no CLA).
Monetisation through services around the product: paid support, installation, hosting, custom development, optional paid add-ons — all compatible with Apache-2.0.

## Consequences
- Files in code repository root: LICENSE (verbatim official text, SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`), NOTICE, CONTRIBUTING.md, CODE_OF_CONDUCT.md (Contributor Covenant 3.0), SECURITY.md.
- All dependencies must have licences compatible with Apache-2.0; CI licence check blocks incompatible (e.g. GPL/AGPL) runtime dependencies (HAAL-151).
- Third-party attributions required by dependencies are appended to NOTICE.
- Relicensing the whole project later is not possible for code contributed by others without their consent; the owner can still build proprietary add-ons on top.
