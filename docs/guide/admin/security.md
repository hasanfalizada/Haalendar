# Running Haalendar securely

+++===+++ 2026-11-26 — Hasan Alizada — HAAL-153 (D-129). What the operator of an installation looks after; what the app
does by itself is in the [security baseline](../../security/security-baseline.md).

The operator of an installation decides who uses it and keeps its data, so they are the one responsible for that
data (the controller, in GDPR terms). The app does the rest by default: HTTPS-only cookies, a strict Content Security
Policy, rate limits, locks after wrong passwords, row-level security in the database, and no data sent anywhere.

## Before the first users

- [ ] The public address is `https://`, with a valid certificate (the bundled Caddy gets one by itself).
- [ ] `HAALENDAR_SECRET_KEY`, `HAALENDAR_SETUP_TOKEN`, `POSTGRES_PASSWORD` and `HAALENDAR_APP_DB_PASSWORD` are random
      and each one different; `.env` is readable by its owner only (`chmod 600 .env`).
- [ ] The app's port is published on `127.0.0.1` only (the default) or not at all; the database is never published.
- [ ] Mail is configured, so that resets and invitations go to the person's own address
      ([configuration.md](configuration.md#e-mail)).
- [ ] New accounts by invitation only, unless anyone reaching the address may sign up ([users.md](users.md#instance-settings)).
- [ ] Two-factor sign-in on for each administrator, then **Administrators must use 2FA**.
- [ ] `HAALENDAR_SECURITY_CONTACT` set, so that people who find a problem with your installation know where to say so.
- [ ] Nightly backups with a copy on another machine, and one restore tried ([backup.md](backup.md)).

## While it runs

- **Upgrades:** watch the [releases](https://github.com/hasanfalizada/Haalendar/releases) and the
  [security advisories](https://github.com/hasanfalizada/Haalendar/security/advisories) (GitHub can notify you: Watch
  → Custom → Releases and Security alerts). A fix comes as a patch version; upgrade with the usual steps
  ([install.md](install.md#3-upgrade)).
- **The image** you run is the one this project's CI built and signed; check it before an upgrade
  ([install.md](install.md#2-install), `gh attestation verify`).
- **Logs** never hold passwords, tokens or the content of calendars, notes and boards. Failed sign-ins and locks show as
  `login_failed` and `account_locked` events; many of them from many addresses mean someone is guessing passwords.
- **Metrics**, if turned on, need their token; keep `/metrics` off the public address at your proxy if you can.
- **A reverse proxy of your own** must pass `Host`, `X-Forwarded-For` and `X-Forwarded-Proto`, and the app must trust
  only that proxy (`HAALENDAR_FORWARDED_ALLOW_IPS`), or rate limits and logs see the proxy instead of the clients.

## When something goes wrong

- **A lost device:** its owner ends that session in Settings → Security; an administrator's password reset ends every
  session of the account.
- **A leaked secret:** replace it in `.env` and run `docker compose up -d`. `HAALENDAR_APP_DB_PASSWORD` needs nothing
  more: `migrate` gives the app's role the new password at the start. `POSTGRES_PASSWORD` is changed in the database
  first, then in `.env`: `docker compose exec db psql -U haalendar -d haalendar`, then `\password haalendar` asks for
  the new one twice (it never shows up in the shell history), `\q`.
  `HAALENDAR_SECRET_KEY` is the exception: the two-factor and Web Push secrets in the database are encrypted with it,
  and the app cannot yet read them with a new one. After a change, people with two-factor sign-in can sign in only
  with a recovery code (then turn two-factor sign-in off and on again), and push notifications stop. Change it only
  when it has leaked, and tell the users first.
- **A problem in Haalendar itself:** report it privately as the [security policy](../../../SECURITY.md) says, not as
  a public issue.
