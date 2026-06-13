# App Placeholder Deployment

`app.guamee.org` is the future real customer workspace app. At this stage it should deploy only a protected placeholder page.

## Cloudflare Pages project

```text
Project name:
ai-creator-os-app

Production branch:
main

Build command:
npm run build:app-placeholder

Output directory:
dist

Custom domain:
app.guamee.org
```

Add the custom domain from the Cloudflare Pages project's Custom domains screen. Do not rely only on a manually created DNS record.

## Cloudflare Access

Create a Zero Trust Access application:

```text
Application type:
Self-hosted

Public hostname:
app.guamee.org

Policy:
Allow only your email or a small owner/admin group
```

After Access is configured, run:

```bash
npm run verify:app-access
```

Expected protected result:

```text
PASS: app.guamee.org appears protected by Access.
```

If the domain is not connected yet, the verifier can return:

```text
WARNING: app.guamee.org is not reachable yet. Configure Pages custom domain and Access.
```

## Current limits

- `app.guamee.org` is only a protected placeholder.
- No remote D1 production writes.
- No real workspace login.
- No X OAuth.
- No X posting controls.
- No production customer data.
- Cloudflare Access protects entry, but it is not a replacement for future workspace role permissions.

## Future app work

The real app should add server-side role checks before writes:

- `GET /api/app/v1/session`
- `GET /api/app/v1/manager/summary`
- `GET /api/app/v1/manager/tasks`
- `POST /api/app/v1/manager/tasks/approve`
- `POST /api/app/v1/staff/feedback`
