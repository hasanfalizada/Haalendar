# ADR-0005: Authentication, sessions, roles, data ownership and sharing

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-012. Accepted by owner 2026-10-14; all recommended options chosen (section 9).

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-10-14 |
| Decider | Hasan Alizada (owner) |
| Depends on | ADR-0003 (stack), ADR-0004 (single-origin deployment) |

## 1. Context
- SRS: FR-ACC-01..12 (invite-only default, Argon2id, reset link 1 h, lockout after 5 attempts, optional TOTP, roles admin/user, isolation, sharing view/edit, optional OIDC), FR-OFF-01..05 (offline after first login), FR-X-03 (audit actor), 4.3 (OWASP ASVS 5.0 Level 2).
- ADR-0004: SPA and API on one origin; HTTPS via Caddy profile or operator proxy.
- Offline-first: the client must keep working with local data when the server is unreachable or the session has expired.

## 2. Sessions vs tokens
| Option | Pros | Cons |
|---|---|---|
| **A. Server-side sessions, opaque ID in HttpOnly cookie** | Instant revocation (logout, deactivation, password change); token not readable by JS (XSS cannot steal it); simplest with single origin | Session lookup per request (one indexed query; cacheable) |
| B. JWT access + refresh tokens in browser storage | Stateless | Readable by any XSS; revocation needs deny-lists; more moving parts |
| C. JWT inside cookies | Stateless-ish | Same revocation problem as B, no benefit for one backend |

**Decision: A.**
- Cookie `__Host-haalendar_session`: `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`. HTTPS is mandatory (except `localhost` for development).
- Session token: 256-bit random; only its SHA-256 hash is stored in PostgreSQL (`sessions`: user, created, last_seen, expires, user agent summary, IP prefix).
- New session ID on login and on privilege change; all sessions of a user revoked on password reset, deactivation, role downgrade.
- Lifetime: sliding idle timeout 30 days, absolute maximum 90 days. Re-authentication (password or TOTP) required for sensitive actions within the last 15 minutes: password/e-mail change, 2FA settings, admin actions.
- Profile shows active sessions (device, last seen) with "log out" per session and "log out all other sessions".
- CSRF: `SameSite=Lax` + synchronizer CSRF token (bound to session, sent in `X-CSRF-Token` header on every unsafe method) + `Origin` check.
- Personal API tokens for scripts: v1.1 (gap item G-03), stored hashed, scoped, revocable.

## 3. Local accounts and passwords
- Argon2id via argon2-cffi, RFC 9106 low-memory profile (library default); parameters stored in the hash; transparent rehash on login when parameters change.
- Password rules (NIST SP 800-63B / ASVS): minimum length 15 characters (passphrases encouraged); maximum ≥ 128; any Unicode, no composition rules, no periodic rotation; rejected if in a bundled list of common/breached passwords (offline, no external call; optional Have I Been Pwned k-anonymity check only if the operator enables it).
- Registration: invite-only by default (admin sends invite link); open registration as instance setting. E-mail verification required before first login (token single-use, 24 h).
- Password reset: single-use token, 1 h, stored hashed; generic responses ("if the account exists, an e-mail was sent") — no account enumeration on login, reset or registration.
- Brute force: after 5 failed attempts the account is temporarily locked with progressive delay (15 min, doubling, max 24 h) plus per-IP rate limiting — no permanent lockout (prevents lockout-as-DoS). Admin can unlock.
- Without SMTP: admin creates users and sets one-time passwords that must be changed on first login.

## 4. Second factor and federated login
- TOTP (RFC 6238) optional per user, with 10 single-use recovery codes (stored hashed). Instance setting "require 2FA for admins", off by default.
- Passkeys (WebAuthn): Later.
- OIDC (Could, HAAL-168): Authorization Code flow with PKCE run by the backend as a confidential client (Authlib); after callback the same session cookie is issued. Validate `state`, `nonce`, issuer, audience; exact redirect URI match. Account linking only for a verified e-mail and with explicit confirmation by the logged-in user.

## 5. Roles
- Instance roles: `admin`, `user`. First admin created by the setup wizard; the last active admin cannot be deactivated or downgraded.
- **Admins manage accounts, not content:** no implicit read access to other users' calendars, notes or boards. Admin actions are audited.
- Deactivation is soft (`deactivated_at`): login blocked, sessions revoked, data kept.

## 6. Data ownership and sharing model
- Every item has `owner_id`. Access is resolved at **container** level:
  | Container | Contains |
  |---|---|
  | Calendar | events, recurrence exceptions, reminders, event attachments |
  | Note | checklist items, labels assignment, note attachments |
  | Board | columns, cards, card checklists, comments, card attachments |
- `shares` table: container type + id, grantee user, permission `view` or `edit`, granted by, timestamps, `revoked_at` (soft).
- Permissions:
  | Action | Owner | Edit | View |
  |---|---|---|---|
  | Read container and items | yes | yes | yes |
  | Create, update, move, soft-delete, restore items | yes | yes | no |
  | Rename, archive, delete container | yes | no | no |
  | Share / revoke | yes | no | no |
- Card assignees (FR-KAN-10) must have access to the board.
- Links between items (FR-INT-01): visible only if the user can read both ends; otherwise shown as "restricted item".
- Search, notifications, calendar layers and sync return only readable data.
- Export (FR-X-14) contains only items owned by the user; shared items are exported by their owners.
- Audit records store the acting user for every mutation, including on shared containers.

## 7. Enforcement
- One authorization policy atom (`authz.check(user, action, resource)`) used by every endpoint and by the sync API; default deny; covered by a permission-matrix test suite (FR-ACC-07).
- Defense in depth with PostgreSQL row-level security on owner/share-filtered tables, with `SET LOCAL app.user_id` per transaction.
- Public IDs are UUIDs; no sequential IDs in URLs.

## 8. Offline behaviour
- After the first online login the client caches the user profile and data locally; the app boots offline and works on local data (FR-OFF-01).
- Session expiry while offline does not block local work. When the server answers 401, the user is asked to log in; the outbox is sent only after login **as the same user**.
- Revoked shares propagate as tombstones in sync; the client removes the local copies.
- Logout: pending changes are synced first (warning if offline), then all local data and caches of the user are wiped from the device.
- Web Push subscriptions are bound to user and device and removed on logout/revocation.

## 9. Owner decisions (2026-10-14)
1. Session: sliding idle 30 days, absolute 90 days.
2. Minimum password length: 15 characters.
3. 2FA for admins: optional, enforceable by instance setting (off by default).
4. Admins have no access to user content.
5. Export: owned items only.
6. PostgreSQL row-level security as second layer.
7. Logout wipes local data on the device.
