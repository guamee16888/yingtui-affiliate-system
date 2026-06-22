# AI Creator OS New Mac Migration

AI Creator OS should be rebuilt on a new Mac from two sources:

- GitHub repository: product code and public build assets.
- Local migration package: current uncommitted worktree changes plus Desktop runtime JSON/config/output.

Do not copy the whole `Documents` folder. Do not upload local runtime data to GitHub.

## Current Source Of Truth

Repository:

```text
https://github.com/guamee16888/yingtui-affiliate-system.git
```

Recommended new path:

```text
~/Guamee/projects/ai-creator-os
```

Desktop runtime path:

```text
~/Library/Application Support/AI Creator OS/
```

## Old Mac: Export A Migration Package

From the current checkout:

```bash
cd /Users/dadada/Documents/英推
npm run migration:export
```

This creates a folder like:

```text
~/Guamee/backups/ai-creator-os/YYYY-MM-DDTHH-MM-SS/
```

The package contains:

- `git-info.txt`: branch, remote, recent commits, git status.
- `uncommitted-code.patch`: tracked local code/config/docs changes not yet committed.
- `untracked-files.tar.gz`: new untracked project files that GitHub does not have yet.
- `desktop-runtime-data.tar.gz`: local Desktop `data/`, `config/`, `output/`, and `logs/`.
- `.env.keys.txt`: environment variable names only, not secret values.
- `README-RESTORE.md`: copyable restore steps.

The runtime archive may include local OAuth/API runtime JSON such as X account tokens. Keep it private and transfer it only to your own new Mac.

## New Mac: Clone Code

Install Homebrew, Git, and Node first if needed, then run:

```bash
mkdir -p ~/Guamee/projects
git clone https://github.com/guamee16888/yingtui-affiliate-system.git ~/Guamee/projects/ai-creator-os
cd ~/Guamee/projects/ai-creator-os
```

## New Mac: Restore Current Local Code

Because the current old Mac has uncommitted changes, apply the migration package:

```bash
cd ~/Guamee/projects/ai-creator-os
git apply --3way /path/to/migration/uncommitted-code.patch
tar -xzf /path/to/migration/untracked-files.tar.gz -C ~/Guamee/projects/ai-creator-os
npm install
npm run check
npm test
```

After these changes are committed and pushed, future Macs can use `setup/bootstrap-ai-creator-os.sh` directly.

## New Mac: Restore Desktop Runtime

Quit the app first:

```bash
osascript -e 'quit app "AI Creator OS"' || true
mkdir -p "$HOME/Library/Application Support/AI Creator OS"
tar -xzf /path/to/migration/desktop-runtime-data.tar.gz -C "$HOME/Library/Application Support/AI Creator OS"
```

The migration package intentionally does not export Electron browser Cookie files. If X web login state is missing, log in manually again inside the account work window.

## New Mac: Restore Secrets

Secret values are not included in the migration package.

Use `.env.keys.txt` to recreate `.env` from 1Password, Bitwarden, provider consoles, or your own private vault:

```bash
cd ~/Guamee/projects/ai-creator-os
cp .env.example .env 2>/dev/null || touch .env
```

Then fill values manually.

## Build And Install Desktop App

```bash
cd ~/Guamee/projects/ai-creator-os
npm run desktop:pack:dir
npm run desktop:install:mac
open -n "/Applications/AI Creator OS.app"
```

Verify:

```bash
curl http://127.0.0.1:5288/api/desktop/health
npm run check
npm test
```

## What Not To Move

Do not move these as source-of-truth code:

- `node_modules/`
- `dist/`
- `dist-desktop/`
- `.wrangler/`
- `.vercel/`
- `release-local/`
- raw `.env` through GitHub

They can be rebuilt or reconnected on the new Mac.
