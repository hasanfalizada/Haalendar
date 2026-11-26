# Users and instance settings

+++===+++ 2026-11-26 — Hasan Alizada — HAAL-153 (D-129). What administrators do in the app: the first administrator,
accounts, invitations and the settings of the installation (ADR-0005).

Administrators manage accounts, never content: they see names, e-mail addresses, roles and statuses, but nobody's
calendars, notes or boards, unless those are shared with them like with anyone else. The admin panel is
**Users** in the main navigation, shown to administrators only.

Every change in the panel asks for the password again when it was last entered more than 15 minutes ago (with
two-factor sign-in, the code instead). Administrators cannot change, deactivate or reset their own account in the
panel, and the last active administrator cannot lose the role or be deactivated.

## The first administrator

On a new installation the first visit opens `/setup`: name, e-mail, password and the setup token
(`HAALENDAR_SETUP_TOKEN`, [configuration.md](configuration.md#installation)). Setup is possible once, while no
administrator exists; afterwards the token is not needed.

## Inviting people

**Invite** in the panel: the e-mail address, the role (user or administrator) and, optionally, the name.

- **With mail configured** an invitation link valid for 7 days is e-mailed; the person chooses a name and a password.
  A new invitation to the same address replaces the previous one. **Pending invitations** lists the open ones;
  **Revoke** stops a link (the invitation is kept as revoked).
- **Without mail** the account is created at once with a one-time password, shown once: hand it over on a safe
  channel. It must be replaced at the first sign-in.

## Accounts

The list can be searched by name or e-mail and filtered by status:

| Status | Meaning |
|---|---|
| Active | Can sign in |
| Unverified | Signed up but has not confirmed the e-mail address yet; cannot sign in until then |
| Locked | Five wrong passwords in a row: signing in is blocked for 15 minutes, twice as long after each further five, at most 24 hours. Never permanent |
| Deactivated | Cannot sign in; nothing of the account is deleted |

Actions of the row menu:

| Action | What it does |
|---|---|
| Make administrator / Make regular user | Changes the role. Administrators manage accounts and these settings, nothing else |
| Unlock | Ends a lock at once (a password reset ends it too) |
| Reset password | Signs the account out everywhere; e-mails a reset link valid for one hour, or without mail gives a one-time password to hand over. Not for a deactivated account |
| Deactivate | Signs the account out everywhere and blocks signing in. Calendars, notes and boards stay, also those shared with others |
| Reactivate | Lets it sign in again |

An account is never deleted. Its owner can export all its data in Settings → Your data
([export format](../../export/README.md)).

## Instance settings

At the top of the panel, under **Instance**:

| Setting | Default | What it does |
|---|---|---|
| New accounts | By invitation only | **Open sign-up** lets anyone who reaches the installation create an account, confirming the address by e-mail, so it needs mail. Leave it on invitations otherwise |
| Administrators must use 2FA | off | Administrators without two-factor sign-in cannot use the panel. Turn on your own first (Settings → Security): the setting is refused while you have none, so nobody locks themselves out |

The panel also says whether mail is configured and whether the installation runs as a demo; both come from the
[settings](configuration.md), not from the panel.

## Everyone's own security

In Settings → Security every person can change their password (at least 15 characters, common and leaked passwords
are refused), turn on two-factor sign-in with an authenticator app and keep its recovery codes, and see and end
their sessions on other devices. When a device is lost, the owner ends its session there; an administrator can
reset the password, which ends all of them.
