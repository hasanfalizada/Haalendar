# ADR-0002: Branching strategy and repository rules

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-006. Accepted by owner 2026-10-14 (decisions in section 5).

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-10-14 |
| Decider | Hasan Alizada (owner) |

## Context
- Instructions require Gitflow (5 branch types), protected main branch, Conventional Commits, PR-based delivery, no self-approval.
- Code repository: `github.com/hasanfalizada/Haalendar` (public). Existing branches: `master` (legacy release), `development` (legacy integration), `revamp` (rewrite), 6 old feature branches, 29 stale Dependabot branches for the legacy Angular frontend.
- Currently a single maintainer; the owner commits and pushes personally.

## Decision
### Branch model (Gitflow)
| Branch | Purpose | Created from | Merged into |
|---|---|---|---|
| `master` | Released versions only; every merge tagged `vX.Y.Z` | — | — |
| `development` | Integration of finished work | — | `release/*` |
| `feature/HAAL-xxx-short-name` | One backlog task | `development` | `development` (PR) |
| `release/X.Y.Z` | Release stabilisation, version bump, changelog | `development` | `master` + `development` |
| `hotfix/X.Y.Z` | Urgent fix of a release | `master` | `master` + `development` |

The existing name `development` is kept (instead of `develop`) to avoid churn.

### Repository rules (GitHub Rulesets)
- `master`: changes only via PR from `release/*` or `hotfix/*`; block force pushes and deletion; require status checks once CI exists (HAAL-151: the jobs of `.github/workflows/ci.yml`, DEVELOPMENT.md → CI); require conversation resolution.
- `development`: changes via PR; block force pushes and deletion; required checks once CI exists.
- Required approvals: 0 while there is a single maintainer (GitHub does not allow approving one's own PR); raise to 1 with code-owner review when a second maintainer joins.

### Commits
- Conventional Commits; task ID in footer `Refs: HAAL-xxx`.
- DCO sign-off (`git commit -s`) required for external contributors (ADR-0001); enforced by the DCO GitHub App once installed.
- Merge strategy into `development`: squash merge (one commit per task, PR title = Conventional Commit). Into `master`: merge commit (keeps release history).

### Files
`.gitignore`, `.gitattributes` (LF everywhere), `.editorconfig`, `.github/ISSUE_TEMPLATE/*` (bug, feature, security link, blank issues disabled), `.github/pull_request_template.md`, `.github/CODEOWNERS`.

## Consequences
- Every backlog task maps to exactly one `feature/*` branch and one PR — traceable from board to code.
- Line endings are normalised to LF regardless of `core.autocrlf` on Windows.
- Stale legacy branches stay on the remote (owner decision); they are not part of the workflow.

## 5. Owner decisions (2026-10-14)
1. **`revamp` is the working trunk until v1.0.** The owner may commit directly to `revamp`; larger tasks may use `feature/HAAL-xxx-*` branches created from and merged back into `revamp`. Release path for v1.0: `revamp` → PR into `development` → `release/1.0.0` → `master` (tag `v1.0.0`). After v1.0 the full Gitflow above applies and `revamp` is retired.
2. **Stale remote branches are kept** (29 Dependabot, 6 legacy feature branches).
3. **Merge strategy accepted:** squash into `development`, merge commit into `master`.

## 6. Amendment (2026-10-16) — development documentation in the code repository
+++===+++ 2026-10-16 — Hasan Alizada — Owner decision D-35.
- The development documentation (requirements, ADRs, domain model, design, security baseline) moved from the separate private repository into `docs/` of this repository, **with its full history** (`git subtree add --prefix=docs`). The way the project is developed is public.
- The former separate docs repository is no longer updated.
- Rule: documentation changes go through the same branches and commits as code; nothing secret is stored in `docs/` (no credentials, private hostnames or real user data).

## 7. Amendment (2026-10-17) — every commit directly on `revamp`

+++===+++ 2026-10-17 — Hasan Alizada — owner decision D-44.

Until v1.0 every task is committed directly on `revamp`: no `feature/HAAL-xxx-*` branches and no pull request per task (amends decision 1 of section 5). The owner makes the commits and pushes. `revamp` is merged into `master` later as a whole; the exact release path (directly or through `development` / `release/1.0.0`) is decided at release time. Rules for `master` (section 3) are unchanged.

## 8. Amendment (2026-11-11) — the release of v1.0.0

+++===+++ 2026-11-11 — Hasan Alizada — HAAL-156, owner decision D-104.

The release path left open in section 7: `revamp` → branch `release/1.0.0` → pull request into `master`, merged with a merge commit and tagged `v1.0.0`. `development` held nothing of its own, so the release branch is made from `revamp` directly. The head of `master` before the merge (the earlier application) is tagged `legacy`: without `v`, so that CI does not take it for a release.

After the release `development` is brought to `master`, `revamp` is no longer worked on (it stays on the remote like the other old branches) and the branches of section 2 apply: work goes into `development`, a release through `release/X.Y.Z`, an urgent fix through `hotfix/X.Y.Z`. Dependabot's pull requests go into `development`. The steps of a release are in `DEVELOPMENT.md` (Releases).
