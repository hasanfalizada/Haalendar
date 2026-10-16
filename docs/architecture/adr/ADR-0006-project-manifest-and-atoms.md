# ADR-0006: Project Manifest and atom layout

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-014.

| Field | Value |
|---|---|
| Status | Accepted (deviation approved by owner 2026-10-14) |
| Date | 2026-10-14 |
| Decider | Hasan Alizada (owner) |

## Context
Instructions Section V require an LLM-native atomic architecture: atoms with JSON contracts, a central `project.manifest.json`, contract-first workflow, BLAKE3 hashes, no direct imports between implementations. ADR-0003 fixed a polyglot stack (Python backend, TypeScript SPA) and the offline-first requirement means some logic must run both on the client and on the server.

## Decision
- **Manifest** `project.manifest.json` in the code repository root, validated by `manifest.schema.json` (JSON Schema 2020-12). Fields per atom: `id`, `status`, `purpose`, `contract`, `examples`, `vectors`, `capabilities`, `tests_ref`, `impl_ref`, `hash`, `deps`, `requirements`, `notes`, optional `embedding_ref`. `flows` describe how atoms compose (dependency map).
- **Atom id**: `<domain>.<name>.v<major>`.
- **Atom folder** `atoms/<id>/`: `contract.json` (input/output JSON Schema, errors, events, invariants, requirements), `vectors.json` (language-neutral test cases), `examples.md`. Template in `atoms/_template/`.
- **Implementations** live in the application packages (`backend/src/haalendar/atoms/...`, `frontend/src/atoms/...`), referenced from the manifest — keeps standard Python/TS packaging and tooling.
- **Hash** = BLAKE3 over `contract.json` + `vectors.json` with LF line endings (`.gitattributes` guarantees LF in the repository). CI (HAAL-151) will verify hashes, schema validity, vectors against contract schemas, and the import ban between atom implementations.

## Deviation from instructions
- Instruction: `impl_ref` points to "the only implementation".
- Here: `impl_ref` and `tests_ref` are per language (`python`, `typescript`). Reason: offline-first logic (e.g. recurrence expansion, Week A/B, overdue counter) must run in the browser and on the server. Parity is guaranteed by one contract and one shared `vectors.json` that both implementations must pass.

## Consequences
- An agent reads the manifest, then only the involved contracts and vectors — no full-codebase scans.
- Contract changes are visible as hash changes; an implementation may only be updated against an unchanged hash or with a new major version.
- First atom registered: `calendar.week_ab_label.v1` (contract + 10 vectors, verified against an independent reference computation; implementations in HAAL-085).
