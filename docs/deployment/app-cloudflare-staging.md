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
→ Discord entitlement check in D1
→ D1 storage adapter through env.DB
→ manager app shell
```

Online staging does not trust `devEmail` or a plain email header. It verifies the Access JWT, extracts the email from the verified payload, then maps that email to a D1 user and workspace.

Discord is not the primary login system. It is the inner entitlement gate after Cloudflare Access. Customer workspaces can require a verified Discord server and role before any app API data is returned.

## What Exists

- `functions/api/app/v1/[[path]].mjs` routes API requests to the existing app API handlers.
- `scripts/lib/app-api/cloudflare-access-auth.mjs` verifies Cloudflare Access JWTs.
- `scripts/lib/app-api/discord-auth.mjs` starts and verifies Discord OAuth without storing Discord access tokens.
- `scripts/lib/app-api/discord-routes.mjs` exposes `/api/app/v1/auth/discord/*`.
- `scripts/lib/d1-storage-adapter.mjs` provides D1-backed workspace, task, feedback, audit, auth, and manager summary data.
- `db/seed/app-staging-demo.sql` provides safe staging demo rows.

## Discord Environment

Set these on the `ai-creator-os-app` Pages project when a customer workspace requires Discord verification:

```text
DISCORD_CLIENT_ID=<Discord OAuth client id>
DISCORD_CLIENT_SECRET=<Discord OAuth client secret>
DISCORD_REDIRECT_URI=https://app.guamee.org/api/app/v1/auth/discord/callback
DISCORD_REQUIRED_GUILD_ID=<Discord server id>
DISCORD_REQUIRED_ROLE_IDS=<paid role id,optional comma separated>
DISCORD_BOT_TOKEN=<optional bot token for guild/role checks>
DISCORD_STATE_SECRET=<random long secret>
```

If `DISCORD_BOT_TOKEN` is set, the OAuth authorization URL only asks for `identify`; the server checks guild membership and roles through the bot. Without a bot token, OAuth asks for `identify guilds.members.read`.

Customer provisioning requires Discord by default:

```bash
npm run app:customer:create -- --workspace-id workspace_client --workspace-name "Client Team" --manager-email owner@example.com --accounts 30 --discord-guild-id 123 --discord-role-ids 456,789
```

Use `--no-discord` only for private internal workspaces.

## What Does Not Exist Yet

- No X live publish.
- No automatic tweeting.
- No billing.
- No public registration.
- No production customer onboarding.
- No raw X token storage.
