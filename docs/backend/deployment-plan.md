# Deployment Plan

## Current public site

`guamee.org` remains a static public site. It serves the landing page and a sanitized read-only manager demo.

The public build must not include:

- `/dashboard`
- `/staff`
- real `data/`
- real `output/`
- `.env`
- tokens or live posted URLs

## Private admin

`admin.guamee.org` is the Cloudflare Access protected platform admin demo. It should remain private before any production data is reachable.

## Real app

`app.guamee.org` is the future real workspace app. The first backend can use:

- Cloudflare Pages or Workers for API endpoints
- Cloudflare D1 as the main relational database
- Cloudflare KV only for low-risk cache, feature flags, or public config
- Cloudflare Queues later for source ingest and publish jobs

## First deploy sequence

1. Keep `guamee.org` static and read-only.
2. Keep `admin.guamee.org` behind Cloudflare Access.
3. Add `app.guamee.org` behind Cloudflare Access for internal beta.
4. Validate local D1 with `npm run d1:migrate:local`, `npm run d1:migrate:dry-run`, and `npm run d1:import:local`.
5. Create staging D1 from `db/migrations/0001_initial.sql`.
6. Apply `db/migrations/0002_app_entitlements.sql`.
7. Configure Discord OAuth env vars for `app.guamee.org`.
8. Move manager workspace reads to D1.
9. Move write actions to D1 with audit logs.
10. Only after audit, workspace permission, and Discord entitlement checks, consider publish worker work.

## Not in this stage

- no remote D1 production connection
- no live Cloudflare Worker API
- no automatic X publish
- no public customer self-signup
