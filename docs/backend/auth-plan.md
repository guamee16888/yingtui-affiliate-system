# Auth Plan

## Roles

- `admin`: platform owner. Can access `admin.guamee.org` and global data.
- `manager`: workspace manager. Can access one or more workspaces on `app.guamee.org`.
- `staff`: operator. Can access assigned accounts and tasks inside a workspace.

## Domain protection

`admin.guamee.org` should be protected first with Cloudflare Access. Only the owner/admin identity should pass.

`app.guamee.org` can also use Cloudflare Access during internal beta. Later it should move to a real workspace login system.

`guamee.org` does not require login because it serves only marketing pages and sanitized read-only demo data.

## Permission checks

- Admin can read global platform data.
- Manager can read and write only within assigned workspace IDs.
- Staff can read and write only assigned tasks and feedback.
- Demo pages cannot write.
- Unauthenticated requests cannot call `app.guamee.org` write APIs.

## Token handling

X OAuth token material must never enter static files, browser JSON, repo commits, or public demo output.

`x_connections` stores only `token_ref`, `status`, `scopes`, and `last_verified_at`. The real token belongs in a server-side secret store.

Basic Auth is not a production login plan.
