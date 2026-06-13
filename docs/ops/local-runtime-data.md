# Local Runtime Data

This project separates product code from local operating data.

`npm run daily` and related planning commands update local JSON and Markdown files that reflect the current operator workflow. Those files are useful locally, but they are not product source code and should not be pushed to GitHub unless they are intentionally sanitized demo fixtures.

## What Counts As Runtime Data

Common runtime outputs include:

- `data/latest.json`
- `data/daily/`
- generated planning files under `data/`
- generated reports under `output/`
- exported JSON-to-D1 SQL at `db/seed/from-json.sql`

Some files under `data/` and `output/` are still tracked because this repository uses demo, seed, and snapshot fixtures. Do not add a blanket ignore rule for all of `data/` or `output/` without replacing those fixtures first.

## Backup Before Cleaning

Before restoring local runtime changes, back them up outside the repository:

```bash
mkdir -p /Users/dadada/Documents/英推-runtime-backups
```

A safe backup directory looks like:

```text
/Users/dadada/Documents/英推-runtime-backups/YYYY-MM-DD-HHMMSS/
```

Keep the original relative paths inside the backup so files can be restored later if needed.

## Public And Admin Builds

`guamee.org` is a public product preview. It must only use sanitized demo data.

`admin.guamee.org` is an Access-protected admin demo. It may include admin UI surfaces, but it must not include real tokens, real posted URLs, live publish credentials, or real affiliate links.

Real operating data should stay local today. In the future it should move into a private database such as D1 or Postgres with workspace permissions and audit logs.

## Before Committing

Run these checks before committing:

```bash
git status --short
npm run git:safety
npm run release:check:public
npm run release:check:admin
npm run check
npm test
```

If `npm run git:safety` warns about `data/latest.json`, `data/daily/`, or `output/*.md`, back up the files and restore the runtime changes before committing product code.
