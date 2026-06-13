# Public Demo Deployment

`guamee.org` is the public marketing surface. It is safe to show to strangers because it only contains a product page and a sanitized manager demo running in demo mode.

## Cloudflare Pages project

```text
Project name:
ai-creator-os-public

Git provider:
GitHub

Repository:
guamee16888/yingtui-affiliate-system

Production branch:
main

Build command:
npm run build:public

Output directory:
dist

Custom domain:
guamee.org
```

The previous `ai-creator-os` Pages project was a direct-upload project. It should no longer own `guamee.org`; keep the domain on `ai-creator-os-public` so GitHub pushes trigger automatic public deployments.

## Build

```bash
npm run build:public
npm run release:check:public
```

Legacy aliases remain valid:

```bash
npm run build:demo
npm run release:check
```

## Expected dist contents

```text
dist/index.html
dist/public/
dist/manager/
dist/data/demo-manager-summary.json
```

## Must not be included

```text
dist/dashboard/
dist/staff/
dist/output/
real data files
.env
tokens
real X handles
real posted URLs
real affiliate links
```

## Runtime behavior

- The root page links only to the manager demo, GitHub, and Telegram.
- `/manager/` reads `/data/demo-manager-summary.json` when no API exists.
- Write buttons keep their visual shape but do not write in the public demo.
- Product Hunt refresh, feedback writes, queue writes, affiliate writes, and X publishing stay local-only.

Do not add `/dashboard` back to this build.
