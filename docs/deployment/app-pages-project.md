# Cloudflare Pages Project For app.guamee.org

Create a separate Cloudflare Pages project for the customer app staging surface.

## Pages Project

```text
Project name: ai-creator-os-app
Repo: guamee16888/yingtui-affiliate-system
Branch: main
Build command: npm run build:app
Output directory: dist
Custom domain: app.guamee.org
```

Add `app.guamee.org` from the Pages project's Custom domains screen. Do not rely on a manual DNS-only CNAME as the final setup.

## Environment Variables

Set these in the Pages project:

```text
APP_ENV=staging
APP_STORAGE_MODE=d1
CF_ACCESS_TEAM_DOMAIN=<your-team>.cloudflareaccess.com
CF_ACCESS_AUD=<Access application audience>
DISCORD_CLIENT_ID=<Discord OAuth client id>
DISCORD_REDIRECT_URI=https://app.guamee.org/api/app/v1/auth/discord/callback
DISCORD_REQUIRED_GUILD_ID=<Discord server id>
DISCORD_REQUIRED_ROLE_IDS=<paid role id,optional comma separated>
DISCORD_STATE_SECRET=<random long secret>
```

Set these as Pages secrets when used:

```text
DISCORD_CLIENT_SECRET=<Discord OAuth client secret>
DISCORD_BOT_TOKEN=<optional bot token for guild/role checks>
```

Discord is an entitlement gate after Cloudflare Access. A user must pass Access first, then verify the required Discord server/role before app API data is returned.

## D1 Binding

Create a staging D1 database:

```bash
npx wrangler d1 create ai_creator_os_app_staging
```

Then bind it to Pages Functions:

```text
Binding name: DB
Database name: ai_creator_os_app_staging
```

Replace `<fill-after-create>` in `wrangler.jsonc` with the real staging `database_id`.

## Apply Schema And Seed

After the D1 binding is configured:

```bash
npm run app:d1:migrate:staging -- --yes
npm run app:d1:seed:staging -- --yes
```

The seed is safe demo data only. It is not an export from local runtime `data/` or `output/`.

Create customer workspaces with Discord verification by default:

```bash
npm run app:customer:create -- --workspace-id workspace_client --workspace-name "Client Team" --manager-email owner@example.com --accounts 30 --discord-guild-id 123 --discord-role-ids 456,789
```

Add `--yes` only when you are ready to write to remote D1. Use `--no-discord` only for private internal workspaces.

## Smoke Checks

Open these after Access is configured:

```text
https://app.guamee.org/api/app/v1/session
https://app.guamee.org/manager/?appMode=1
```

Expected behavior:

- Unauthenticated visitors are intercepted by Cloudflare Access.
- Authenticated staging users can load a session.
- The manager app can read workspace tasks from D1.
- Approve, reject, and feedback save write to D1 and create audit logs.
- Live publish stays off.
