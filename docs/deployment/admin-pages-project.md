# Admin Pages Project

Use a separate Cloudflare Pages project for the protected owner dashboard demo.

## Recommended project settings

```text
Project name:
ai-creator-os-admin

Production branch:
main

Build command:
npm run build:admin-demo

Output directory:
dist

Custom domain:
admin.guamee.org
```

`admin.guamee.org` is recommended over `ad.guamee.org` because the purpose is clearer and it is less likely to be read as an advertising domain.

## Domain split

```text
guamee.org
= public demo
= build:public

admin.guamee.org
= protected admin demo
= build:admin-demo
= must be behind Cloudflare Access

app.guamee.org
= future real app
= auth + database + write APIs
```

## Hard rules

- Do not mix the admin demo into the `guamee.org` public Pages project.
- If using the same GitHub repo, create a separate Pages project with a different build command.
- Run `npm run admin:preflight` before connecting or redeploying the admin Pages project.
- Do not share `admin.guamee.org` until Cloudflare Access is active.
- Do not configure X tokens, real source API keys, or production secrets in the admin demo Pages project.
- Do not upload real `data/` or `output/` as static assets.

## Expected build output

```text
dist/index.html
dist/dashboard/
dist/manager/
dist/data/latest.json
dist/data/publish-settings.json
dist/data/demo-manager-summary.json
```

The admin demo output is still sanitized. It exists to preview the owner console behind Access, not to run live operations.
