"""Server-side atom implementations; contracts live in atoms/<id>/ at the repository root (ADR-0006).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-160. No imports between atom implementations (contracts only).
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-169. Exception: an atom may import the atoms listed in its manifest `deps`.
"""
