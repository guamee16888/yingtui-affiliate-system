# Security Checklist

## Public demo

- `guamee.org` uses sanitized demo data only.
- `guamee.org` cannot write.
- `guamee.org` does not expose `/dashboard` or `/staff` as public entry points.
- Static dist must not include `.env`.
- Static dist must not include real `data/` or `output/` folders.

## Workspace isolation

- Manager APIs require workspace membership.
- Staff APIs require assigned task or assigned account access.
- No API may return another workspace's tasks, feedback, ledger, accounts, or publish jobs.
- Workspace account creation must respect the 30 account default limit unless admin changes the plan.
- Customer workspaces require an active subscription row.
- Customer workspaces require Discord verification by default.
- Discord verification must be checked in backend API code on every app request.
- A verified Discord identity must match the workspace required guild and at least one required role when roles are configured.

## Publish safety

- No task can publish before approval.
- No task over 280 weighted characters can publish.
- No duplicate-checker block task can publish.
- No fake affiliate link can be inserted.
- No unreviewed raw candidate can enter publish.

## Secrets

- Do not return token values.
- Do not return source connector secret values.
- Do not store plaintext X tokens in D1.
- Do not store Discord OAuth access tokens.
- `x_connections` only stores `token_ref`, `status`, `scopes`, and `last_verified_at`.
- `user_identities` stores Discord identity metadata only: provider user id, username, guild id, role ids, status, and timestamps.
- `.env` must not enter `dist`.
- `db/seed/from-json.sql` is generated from operational JSON and must stay gitignored unless it is a deliberately sanitized demo fixture.
- JSON -> D1 export strips token/secret-like fields and live posted URLs in sanitized mode.

## Audit

- Every write action creates an `audit_logs` row.
- API calls create summarized `api_events` rows.
- Audit logs store event summary, actor, target, status, and timestamp, not sensitive body text.
- D1 storage adapter writes audit rows for task status updates, ledger append, and feedback upsert.
- JSON mode keeps `data/audit-logs.json` as the local audit-log shape until app APIs move to D1.
