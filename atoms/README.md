<!-- +++===+++ 2026-10-14 — Hasan Alizada — HAAL-014. Contributor guide to the atom layout. Architecture rationale: docs/architecture/adr/ADR-0006-project-manifest-and-atoms.md. -->

# Atoms

Haalendar is built from **atoms**: small, self-contained units of functionality with a strictly defined contract (for example `calendar.week_ab_label.v1`). The registry of all atoms is [`project.manifest.json`](../project.manifest.json) in the repository root.

## Layout

```
atoms/<domain>.<name>.v<major>/
  contract.json   single source of truth: input/output (JSON Schema 2020-12), errors, events, invariants, requirements
  vectors.json    language-neutral test cases; every implementation must pass all of them
  examples.md     3-5 scenarios in contract terms
```

Implementations live in the application packages and are referenced from the manifest:

| Language | Location | Used for |
|---|---|---|
| Python | `backend/src/haalendar/atoms/<domain>/<name>.py` | server |
| TypeScript | `frontend/src/atoms/<domain>/<name>.ts` | client, offline |

An atom may have one or both implementations; both are tested against the same `vectors.json`.

## Rules

1. **Contract first.** Change `contract.json` and `vectors.json` first, then tests, then the implementation.
2. **No direct imports between atom implementations.** Atoms depend on other atoms only through their contracts (`deps` in the manifest).
3. **Breaking change = new major version** (`.v2` folder); the old version is marked `deprecated` in the manifest.
4. **Keep atoms small:** contract ≤ 300 lines, vectors ≤ 400 lines.
5. **Update the manifest in the same pull request:** status, references, `hash` (BLAKE3 of `contract.json` + `vectors.json`, LF line endings).

## Creating an atom

Copy [`_template/`](_template/) to `atoms/<domain>.<name>.v1/`, replace every `TODO`, add the entry to `project.manifest.json`.
