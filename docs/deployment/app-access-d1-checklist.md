# App Access And D1 Checklist

Use this checklist before treating `app.guamee.org` as ready for internal testing.

## Access

- [ ] Cloudflare Access application exists for `app.guamee.org`.
- [ ] Policy only allows owner/internal test emails.
- [ ] Pages default domain cannot bypass Access.
- [ ] `CF_ACCESS_TEAM_DOMAIN` is set.
- [ ] `CF_ACCESS_AUD` is set.
- [ ] Unauthenticated access does not show the manager app.
- [ ] `npm run verify:app-staging -- --expect-protected` passes.

## D1

- [ ] D1 database `ai_creator_os_app_staging` exists.
- [ ] Pages Functions binding name is `DB`.
- [ ] `APP_STORAGE_MODE=d1`.
- [ ] `APP_ENV=staging`.
- [ ] `db/migrations/0001_initial.sql` has been applied.
- [ ] `db/seed/app-staging-demo.sql` has been imported.
- [ ] Seed contains no token, secret, real X handle, posted URL, affiliate link, or real output markdown.

## App API

- [ ] `/api/app/v1/session` returns the logged-in Access user.
- [ ] `/api/app/v1/workspace` returns only the user's workspace.
- [ ] `/api/app/v1/manager/summary` returns D1 tasks for the workspace.
- [ ] Approve writes D1.
- [ ] Reject writes D1.
- [ ] Feedback writes D1.
- [ ] Audit logs are created for writes.

## Boundaries

- [ ] `guamee.org` remains public build only.
- [ ] `admin.guamee.org` remains admin demo only.
- [ ] `app.guamee.org` does not include `/dashboard`.
- [ ] X live publish remains off.
- [ ] No public registration.
- [ ] No Discord login.
- [ ] No billing.

