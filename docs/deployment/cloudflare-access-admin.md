# Cloudflare Access for Admin Demo

This checklist protects `admin.guamee.org` before the owner dashboard demo is shared.

## Pages project

1. Open Cloudflare Dashboard.
2. Go to Workers & Pages.
3. Create a new Pages project.
4. Connect the GitHub repository.
5. Use this project name:

   ```text
   ai-creator-os-admin
   ```

6. Set the build command:

   ```bash
   npm run build:admin-demo
   ```

7. Set the output directory:

   ```text
   dist
   ```

8. Deploy the project.
9. Add a custom domain:

   ```text
   admin.guamee.org
   ```

## Access application

1. Open Cloudflare Zero Trust.
2. Go to Access.
3. Open Applications.
4. Create an application.
5. Choose Self-hosted.
6. Set the public hostname:

   ```text
   admin.guamee.org
   ```

7. Add an allow policy for only one of these:

   ```text
   your email
   your Google identity
   your GitHub identity
   a small owner/admin group
   ```

8. Save the application.

## Verification

Before sharing the URL, run:

```bash
npm run verify:admin-access
```

Expected result when Access is configured:

```text
PASS: Admin domain appears protected by Access.
```

If the command says the admin demo is publicly accessible, do not share the URL.

## Manual browser check

1. Open an incognito/private browser window.
2. Visit:

   ```text
   https://admin.guamee.org
   ```

3. Expected unauthenticated result:

   ```text
   Cloudflare Access blocks the page or redirects to an Access login flow.
   ```

4. Log in with the allowed identity.
5. Expected authenticated result:

   ```text
   The page shows 受保护总后台演示.
   ```

## Limits

- Access only protects the entry point.
- Access is not a replacement for future app-level workspace roles.
- The current admin demo is still read-only.
- The current admin demo uses sanitized demo data.
- Do not make real writes from this build.
- Do not enable X live publish from this build.
- Do not upload real `data/`, `output/`, `.env`, tokens, or secrets.

The future real application belongs on `app.guamee.org` with auth, D1, write APIs, audit logs, and workspace isolation.
