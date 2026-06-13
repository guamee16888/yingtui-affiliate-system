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

`ad.guamee.org` is the future private platform admin console. It should be protected by Cloudflare Access before any production data is reachable.

## Real app

`app.guamee.org` is the future real workspace app. The first backend can use:

- Cloudflare Pages or Workers for API endpoints
- Cloudflare D1 as the main relational database
- Cloudflare KV only for low-risk cache, feature flags, or public config
- Cloudflare Queues later for source ingest and publish jobs

## First deploy sequence

1. Keep `guamee.org` static and read-only.
2. Add `ad.guamee.org` behind Cloudflare Access.
3. Add `app.guamee.org` behind Cloudflare Access for internal beta.
4. Create staging D1 from `docs/backend/d1-schema.sql`.
5. Build a D1 adapter behind the storage adapter interface.
6. Move manager workspace reads to D1.
7. Move write actions to D1 with audit logs.
8. Only after audit and permission checks, consider publish worker work.

## Not in this stage

- no real D1 connection
- no live Cloudflare Worker API
- no automatic X publish
- no customer login system
