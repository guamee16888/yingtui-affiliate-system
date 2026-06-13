# Data Boundary

## Public demo data

`guamee.org` can only serve sanitized demo data. Demo data must not contain:

- real X handles
- X tokens or token references
- posted URLs from real accounts
- real affiliate links
- source connector secrets
- raw customer data
- private notes from the owner dashboard

## Private platform admin data

`admin.guamee.org` is owner-only. It can access platform-wide data:

- all workspaces
- global content lanes
- source connectors and source feeds
- raw candidate supply
- tool and topic pools
- publish safety configuration
- global duplicate risk
- audit logs and API events

This data must not be exposed from `guamee.org`.

## Workspace data

`app.guamee.org` manager views can only access the selected workspace:

- workspace accounts
- workspace users and operators
- workspace tasks
- workspace publish jobs
- workspace feedback
- workspace ledger rows

A manager cannot query another workspace by guessing an ID.

## Operator data

Staff or operator users can only see assigned accounts and tasks inside their workspace. The product may combine manager and operator execution into one workspace UI, but API scope still must enforce user and task boundaries.

## Account limit

The default workspace account cap is 30. This cap belongs in `workspaces.account_limit` and should be enforced before creating new account assignments.

## Cross-boundary rules

- `guamee.org` cannot write.
- `guamee.org` cannot expose `/dashboard` or `/staff` as public entry points.
- `admin.guamee.org` requires owner/admin access.
- `app.guamee.org` requires authenticated workspace access.
- No API response returns raw tokens, connector secrets, or cross-workspace records.
