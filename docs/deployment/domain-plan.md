# Domain Plan

This project now has three separate deployment targets.

## guamee.org

Public website plus sanitized read-only demo.

- Build command: `npm run build:public`
- Output directory: `dist`
- Public entry: `/`
- Demo entry: `/manager/?workspaceId=workspace_default`
- Must not expose `/dashboard`
- Must not expose `/staff`
- Must not package real `data/`, `output/`, `.env`, tokens, real X accounts, posted URLs, or real affiliate links

## ad.guamee.org or admin.guamee.org

Owner-only platform admin preview behind Cloudflare Access.

- Build command: `npm run build:admin-demo`
- Output directory: `dist`
- Admin entry: `/dashboard/`
- Workspace demo entry: `/manager/?workspaceId=workspace_default`
- Uses sanitized demo data only
- Displays `受保护总后台演示`
- Must be deployed only after Cloudflare Access protects the hostname
- Still cannot live publish or write real production data

`admin.guamee.org` is clearer for visitors and operators. `ad.guamee.org` is shorter but may be read as advertising.

## app.guamee.org

Future real application.

- Requires auth
- Requires workspace isolation
- Requires a real backend
- Recommended backend direction: Cloudflare Pages Functions or Workers plus D1
- KV should be limited to low-risk cache, feature flags, and configuration
- Queues can later handle source ingest, task generation, publish jobs, and retries

This repository does not implement the real `app.guamee.org` backend yet.
