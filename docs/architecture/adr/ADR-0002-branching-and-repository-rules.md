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
- `master`: changes only via PR from `release/*` or `hotfix/*`; block force pushes and deletion; require status checks once CI exists (HAAL-151); require conversation resolution.
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
