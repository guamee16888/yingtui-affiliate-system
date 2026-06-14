# Auth Plan

## Roles

- `admin`: platform owner. Can access `admin.guamee.org` and global data.
- `manager`: workspace manager. Can access one or more workspaces on `app.guamee.org`.
- `staff`: operator. Can access assigned accounts and tasks inside a workspace.

## Domain protection

`admin.guamee.org` should be protected first with Cloudflare Access. Only the owner/admin identity should pass.

`app.guamee.org` can also use Cloudflare Access during internal beta. Later it should move to a real workspace login system.

`guamee.org` does not require login because it serves only marketing pages and sanitized read-only demo data.

## Discord entitlement

Discord is an entitlement gate, not the primary login system.

The app flow is:

```text
Cloudflare Access login
→ verified Access email maps to a D1 user
→ D1 workspace membership selects allowed workspaces
→ D1 subscription decides whether Discord verification is required
→ Discord OAuth verifies required server / role
→ user_identities stores the verified Discord identity
```

Every `/api/app/v1/*` request checks the workspace subscription and Discord identity before returning manager or staff data. Front-end buttons are only UX; they are not permission checks.

## Permission checks

- Admin can read global platform data.
- Manager can read and write only within assigned workspace IDs.
- Staff can read and write only assigned tasks and feedback.
- Demo pages cannot write.
- Unauthenticated requests cannot call `app.guamee.org` write APIs.
- Customer workspaces require Discord verification by default unless explicitly provisioned as internal.

## Token handling

X OAuth token material must never enter static files, browser JSON, repo commits, or public demo output.

`x_connections` stores only `token_ref`, `status`, `scopes`, and `last_verified_at`. The real token belongs in a server-side secret store.

Discord access tokens are not stored. The app stores only provider user id, username, guild id, role ids, verification status, and timestamps in `user_identities`.

Basic Auth is not a production login plan.
