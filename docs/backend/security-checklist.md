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
- `x_connections` only stores `token_ref`, `status`, `scopes`, and `last_verified_at`.
- `.env` must not enter `dist`.

## Audit

- Every write action creates an `audit_logs` row.
- API calls create summarized `api_events` rows.
- Audit logs store event summary, actor, target, status, and timestamp, not sensitive body text.
