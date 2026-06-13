# App Cloudflare Staging

`app.guamee.org` is the real app staging surface for AI Creator OS.

```text
app.guamee.org
= Cloudflare Access protected
= Cloudflare Pages project
= build command: npm run build:app
= output: dist
= Pages Functions route: /api/app/v1/*
= D1 binding: DB
= APP_ENV=staging
= APP_STORAGE_MODE=d1
```

## Boundaries

- `guamee.org` remains the public sales site and sanitized product preview.
- `admin.guamee.org` remains the Access-protected owner/admin demo.
- `app.guamee.org` is the only staging surface that should run writable app APIs.
- Staging is for internal testing first, not paying customers.
- Staging uses a dedicated D1 database: `ai_creator_os_app_staging`.
- The app API must not cross workspace scope.
- The app build must not include `/dashboard`, `/staff`, real `data/`, real `output/`, tokens, secrets, posted URLs, or affiliate links.

## Runtime Flow

```text
Cloudflare Access
→ Cf-Access-Jwt-Assertion
→ Pages Function /api/app/v1/*
→ Access JWT verification
→ D1 storage adapter through env.DB
→ manager app shell
```

Online staging does not trust `devEmail` or a plain email header. It verifies the Access JWT, extracts the email from the verified payload, then maps that email to a D1 user and workspace.

## What Exists

- `functions/api/app/v1/[[path]].mjs` routes API requests to the existing app API handlers.
- `scripts/lib/app-api/cloudflare-access-auth.mjs` verifies Cloudflare Access JWTs.
- `scripts/lib/d1-storage-adapter.mjs` provides D1-backed workspace, task, feedback, audit, auth, and manager summary data.
- `db/seed/app-staging-demo.sql` provides safe staging demo rows.

## What Does Not Exist Yet

- No X live publish.
- No automatic tweeting.
- No Discord login.
- No billing.
- No public registration.
- No production customer onboarding.
- No raw X token storage.

