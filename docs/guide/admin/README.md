# Haalendar admin guide

+++===+++ 2026-11-26 — Hasan Alizada — HAAL-153 (D-129). For whoever installs and runs a Haalendar installation.

Haalendar runs on one Linux host with Docker Compose: the app, its worker and PostgreSQL, optionally behind the
bundled Caddy for HTTPS. Each installation is on its own: nothing is sent to this project or anyone else.

| Page | What is in it |
|---|---|
| [install.md](install.md) | What runs, installing, reverse proxies, upgrading and rolling back, logs and metrics |
| [configuration.md](configuration.md) | Every setting, with its default |
| [users.md](users.md) | The first administrator, invitations, accounts, sign-up and two-factor rules |
| [backup.md](backup.md) | Nightly backups, the copy elsewhere, restoring, moving to a new server |
| [security.md](security.md) | A checklist before the first users, what to watch, what to do when something goes wrong |
| [demo.md](../../operations/demo.md) | A public demo with made-up data that resets itself |

**The short way:** [install](install.md#2-install) → create the first administrator at `/setup` → turn on two-factor
sign-in → [invite people](users.md#inviting-people) → [set up nightly backups](backup.md#back-up-and-restore).

Which versions exist and what changed: the [changelog](../../../CHANGELOG.md). Problems with Haalendar itself:
[support](../../../SUPPORT.md); security problems privately, as the [security policy](../../../SECURITY.md) says.
