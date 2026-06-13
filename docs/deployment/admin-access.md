# Admin Access Demo Deployment

The admin demo is for `admin.guamee.org`. It previews the owner dashboard, but it is still sanitized and read-only.

Do not deploy this build to a public hostname unless Cloudflare Access is already protecting that hostname.

## Build

```bash
npm run build:admin-demo
npm run release:check:admin
```

## Expected dist contents

```text
dist/index.html
dist/dashboard/
dist/manager/
dist/data/latest.json
dist/data/publish-settings.json
dist/data/demo-manager-summary.json
```

The build intentionally does not include real `data/`, real `output/`, `.env`, tokens, live X connections, posted URLs, or real affiliate links.

## Cloudflare Pages setup

1. Create a separate Cloudflare Pages project, for example:

   ```text
   ai-creator-os-admin
   ```

2. Set the build command:

   ```bash
   npm run build:admin-demo
   ```

3. Set the output directory:

   ```text
   dist
   ```

4. Add a custom domain to the Pages project:

   ```text
   admin.guamee.org
   ```

5. In Cloudflare Zero Trust, create an Access Application.

   Suggested settings:

   ```text
   Type: Self-hosted / web application
   Public hostname: admin.guamee.org
   Policy: allow only your email, Google account, GitHub account, or a small owner/admin group
   ```

6. Test in a logged-out browser.

   Expected result:

   ```text
   Unauthenticated requests redirect to Cloudflare Access.
   Authenticated requests can view the admin demo.
   ```

## Important limits

- Cloudflare Access protects entry to the admin demo.
- Access policy is not the same as application-level workspace permissions.
- The admin demo still cannot live publish.
- The admin demo still cannot write real data.
- Real customer operations belong in the future `app.guamee.org` backend.

## Do not deploy if

- Cloudflare Access is not configured.
- `npm run release:check:admin` fails.
- The build contains real `data/`, `output/`, tokens, real X handles, posted URLs, or real affiliate links.
