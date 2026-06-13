# JSON to D1 Migration Plan

## Source files

- `data/workspaces.json` -> `workspaces`
- `data/users.json` -> `users`
- `data/x-accounts.json` -> `x_accounts`
- `data/assignments.json` -> `assignments`
- `data/content-lanes.json` -> `content_lanes`
- `data/workspace-lanes.json` -> `workspace_lanes`
- `data/source-connectors.json` -> `source_connectors`
- `data/source-feeds.json` -> `source_feeds`
- `data/raw-candidates.json` -> `raw_candidates`
- `data/tools.json` -> `tools`
- `data/topics.json` -> `topics`
- `data/copy-library.json` -> `copy_library`
- `data/post-tasks.json` -> `post_tasks`
- `data/post-ledger.json` -> `post_ledger`
- `data/feedback.json` -> `feedback`
- `data/publish-settings.json` -> `publish_settings`
- `data/x-connections.json` -> `x_connections`
- `data/publish-jobs.json` -> `publish_jobs`
- `data/publish-attempts.json` -> `publish_attempts`

## Steps

1. Run local JSON checks with `npm run check`.
2. Create a timestamped backup of all JSON files.
3. Run migration dry-run and report row counts, missing IDs, and cross-workspace violations.
4. Export SQL insert statements without writing to D1.
5. Test import into local D1.
6. Run API contract tests against local D1.
7. Import to a staging D1 database.
8. Protect `app.guamee.org` with Cloudflare Access.
9. Cut one internal workspace over first.
10. Keep JSON export rollback until the D1 path is proven.

## Idempotency

Every migration row must use stable IDs. Re-running a migration should upsert or skip unchanged rows, not duplicate them.

## What not to migrate

- raw X tokens
- local `.env`
- public demo files
- source connector secrets
- browser-only temporary state
