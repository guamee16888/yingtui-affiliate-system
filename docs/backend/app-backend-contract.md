# AI Creator OS App Backend Contract v1

## Purpose

This contract defines the boundary for the future writable AI Creator OS app. It does not connect a real database, real login, or live X publishing in this stage.

## Domains

- `guamee.org`: public marketing site plus sanitized, read-only manager demo.
- `admin.guamee.org`: Cloudflare Access protected platform admin demo for the owner only.
- `app.guamee.org`: future authenticated workspace app for customers, managers, and operators.

## Product split

`guamee.org` must never use real operational data. It can show product positioning and a sanitized manager demo that cannot write.

`admin.guamee.org` is the platform owner surface. It can see all workspaces, source connectors, content lanes, candidate supply, queue health, system config, and release checks. This is not a public demo surface.

`app.guamee.org` is the real workspace app. In the first real app version, manager review and staff execution can be combined into one workspace management flow. A workspace controls up to 30 X accounts by default. Operators work inside the same workspace task pool instead of seeing a separate public staff entry.

## Writable API boundary

Writable APIs are allowed only on `app.guamee.org` or `admin.guamee.org` after authentication and workspace authorization:

- approve or reject tasks
- assign account or operator
- record copied, posted, skipped, and feedback states
- append post ledger entries
- update publish settings
- create publish jobs after review gates
- write audit logs and API events

## Read-only surfaces

`guamee.org` is read-only. It can serve static HTML, CSS, JS, and sanitized demo JSON. It cannot call live write APIs.

## D1 Local MVP status

The repository now includes a local-only Cloudflare D1 foundation:

- executable schema: `db/migrations/0001_initial.sql`
- sanitized demo seed: `db/seed/demo.sql`
- JSON to D1 dry-run/export/import scripts
- first D1 storage adapter behind the storage-adapter interface
- audit log tables and adapter write hooks
- subscription and Discord entitlement tables in `db/migrations/0002_app_entitlements.sql`

Default runtime storage remains JSON. `APP_STORAGE_MODE=d1` is reserved for the future app runtime and the current local static server returns a clear error for manager/staff write routes when no D1 binding exists.

## Entitlement gate

Cloudflare Access remains the outer gate for `app.guamee.org`. Discord verification is the inner customer entitlement gate.

Customer workspaces require a `subscriptions` row. By default, new customers require Discord verification, and the verified identity is stored in `user_identities`. Discord OAuth tokens are not stored.

## Not in v1

- no remote D1 production connection
- no full login system
- no cloud token storage
- no automatic X live publishing
- no direct production data upload to public static builds
- no public `/dashboard` owner console
- no public `/staff` entry
