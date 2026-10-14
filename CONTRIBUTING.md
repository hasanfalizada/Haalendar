<!-- +++===+++ 2026-10-14 — Hasan Alizada — HAAL-004. Contribution rules. Development setup section must be filled in once the stack skeleton exists (HAAL-016, HAAL-017). -->

# Contributing to Haalendar

Thank you for your interest in Haalendar! Contributions of all kinds are welcome: bug reports, feature ideas, documentation, translations and code.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting bugs and requesting features

- Search existing issues first to avoid duplicates.
- Use the issue templates and include: version/commit, environment (browser, OS, deployment type), steps to reproduce, expected and actual result, screenshots or logs (without personal data).
- **Security vulnerabilities must not be reported in public issues** — see [SECURITY.md](SECURITY.md).

## Pull requests

1. Open or comment on an issue first for anything larger than a small fix, so the approach can be agreed before you invest time.
2. Fork the repository and create a branch from `development` named `feature/<short-name>` or `fix/<short-name>`.
3. Keep pull requests small and focused on one change.
4. Write or update automated tests for every change; a bug fix starts with a failing test.
5. Update user or admin documentation when behaviour changes.
6. Make sure linting and all tests pass locally and in CI.
7. Fill in the pull request template: what, why, how it was tested, screenshots for UI changes.
8. At least one maintainer review is required before merge; self-approval is not allowed.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

<body: what and why>

Refs: <issue or task id>
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`.

## Developer Certificate of Origin (DCO)

All commits must be signed off to certify that you have the right to submit the contribution under the project's license ([DCO 1.1](https://developercertificate.org/)):

```
git commit -s -m "fix(calendar): correct week number for selected date"
```

This adds a line `Signed-off-by: Your Name <your.email@example.com>` to the commit message.

## License of contributions

Haalendar is licensed under the [Apache License 2.0](LICENSE). Unless you explicitly state otherwise, any contribution you intentionally submit for inclusion in the project is licensed under the same license, as described in Section 5 of the Apache License 2.0. The original authorship notice in [NOTICE](NOTICE) must be preserved.

## Development setup

Instructions will be added here once the new application skeleton is available.
