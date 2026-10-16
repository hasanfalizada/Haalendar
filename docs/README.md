# Haalendar — Development Documentation

+++===+++ 2026-10-14 — Hasan Alizada — Development documentation of Haalendar.
+++===+++ 2026-10-16 — Hasan Alizada — Moved into the code repository with its full history (owner decision D-35): the way the project is developed is public and part of the portfolio.

How Haalendar is specified, designed and built — requirements and every owner decision, architecture decisions, the domain model, the design system and the security baseline. The documents follow the code task by task (`HAAL-xxx`); the git history shows how they evolved.

## Contents
| Folder | Content |
|---|---|
| [`requirements/`](requirements/) | [SRS](requirements/SRS.md) with the decision log (D-xx), [legacy feature inventory](requirements/legacy-feature-inventory.md) (F-xx), [gap analysis](requirements/gap-analysis.md) |
| [`architecture/adr/`](architecture/adr/) | Architecture Decision Records ADR-0001 … ADR-0008 |
| [`architecture/`](architecture/) | [Domain model, ER diagrams and data dictionary](architecture/domain-model.md), [time handling](architecture/time-handling.md) |
| [`design/`](design/) | [Brand guidelines](design/brand-guidelines.md), [design system](design/design-system.md), [wireframes](design/wireframes.html) |
| [`security/`](security/) | [Security baseline](security/security-baseline.md) (OWASP ASVS 5.0 L2, Top 10, API Top 10 — status per control) |

## Where things live
- **`docs/` (this folder):** development documentation — requirements, architecture, ADRs, design, security, later QA and handover notes.
- **Repository root:** what users, administrators and contributors need first — [README](../README.md), [LICENSE](../LICENSE) / [NOTICE](../NOTICE), [DEVELOPMENT](../DEVELOPMENT.md), [CONTRIBUTING](../CONTRIBUTING.md), [SECURITY](../SECURITY.md). User and administrator guides (installation, configuration, backup/restore, upgrade, legacy migration) will be added under `docs/guide/`.
- **Code-level references:** the HTTP contract in [`api/`](../api/), atom contracts in [`atoms/`](../atoms/), the registry in [`project.manifest.json`](../project.manifest.json).

## Conventions
- Every change is tied to a backlog task (`HAAL-xxx`) and, where the owner decided something, to an entry in the SRS decision log.
- Each document carries `+++===+++` lines with date, author and what changed.
- Nothing secret belongs here: no credentials, hostnames of private infrastructure or real user data.
