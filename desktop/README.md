# AI Creator OS Desktop

AI Creator OS Desktop is a Mac / Windows workspace app for compliant multi-account X content operations.

Supported in this v1 skeleton:

- Account Vault for workspace-scoped X accounts.
- Single-account fixed work windows for manual review and manual operation.
- Task, publishing, feedback, relationship target, and account-health views.
- Future official X OAuth and official X API publishing path.
- Local JSON storage under the operating-system app data directory.

Not supported:

- Importing X passwords.
- Importing cookies.
- Fingerprint browser behavior.
- Proxy IP evasion.
- Automated follow, like, reply, or comment actions.
- Browser click simulation or script injection into X pages.
- Batch repeated posting or rule bypassing.

## Run

```bash
cd /Users/dadada/Documents/英推
npm install
npm run desktop:doctor
npm run desktop:check
npm run desktop:dev
```

The desktop backend starts on `127.0.0.1:5288` by default and automatically tries the next available port if 5288 is busy. It does not use 4173, 4174, or 4175.

`desktop:dev` now starts the local backend first, waits for `GET /api/desktop/health`, then launches Electron with:

```text
http://127.0.0.1:<port>/manager/?desktop=1&appMode=1&devEmail=owner@guamee.local
```

If health does not pass within 10 seconds, Electron will not open.

## Troubleshooting

1. Run from `/Users/dadada/Documents/英推`.
2. Run `npm install`.
3. Run `npm run desktop:doctor`.
4. Run `npm run desktop:check`.
5. Do not open the app with `file://`.
6. If 5288 is busy, the dev launcher tries 5289, 5290, and later ports.
7. If Electron is blank, check the terminal line that starts with `Electron loading`.
8. Desktop mode is local JSON mode by default; it is not `app.guamee.org`.
9. Incognito account windows do not preserve X web login state after closing. Manual login is expected.

## Data Directory

macOS:

```text
~/Library/Application Support/AI Creator OS/
```

Windows:

```text
%APPDATA%/AI Creator OS/
```

Desktop mode initializes demo JSON files into this directory and then reads/writes runtime data there. Normal web development continues to use the repository `data/` directory.

## Account Windows

Clicking “固定窗口” opens the account with a stable local Electron profile:

```text
persist:aicos:<workspaceId>:<accountId>
```

The fixed window can keep the web login state on this computer after the user logs in manually. The app still must not read, import, export, or store raw cookies, passwords, browser fingerprints, or proxy credentials.

Official OAuth tokens are not web login cookies. If the user wants to operate in the X web UI, they must manually log in inside the account window. The app must not import cookies or passwords.

## Package

```bash
npm run desktop:pack:dir
npm run desktop:pack:mac
npm run desktop:pack:win
npm run desktop:package-check
```

`desktop:pack:dir` builds the fastest unpacked app for local smoke. `desktop:pack:mac` builds macOS `dmg`, `zip`, and `.app` directory targets. `desktop:pack:win` attempts Windows `nsis`, `portable`, and `dir` targets. On macOS, Windows packaging may require extra local dependencies such as wine, or a Windows runner.

Build output stays local:

```text
dist-desktop/
```

Do not commit or upload desktop artifacts until they pass:

```bash
npm run desktop:package-check
```

The first local builds are unsigned. macOS may show an unidentified-developer warning, and Windows may show SmartScreen. That is expected for local smoke packages. For customer distribution, add Apple Developer signing, macOS notarization, and a Windows code-signing certificate.

This packaging smoke intentionally does not configure auto update or release upload.

## Package Safety

The packaged app uses clean seed data from:

```text
desktop/seed-data/
```

It must not include repository runtime data:

- `.env`
- `.wrangler/`
- `data/latest.json`
- `data/daily/`
- `output/*.md`
- real tokens or secrets
- real posted X status URLs
- real affiliate/referral links

Runtime data is still written to appData:

```text
macOS: ~/Library/Application Support/AI Creator OS/
Windows: %APPDATA%/AI Creator OS/
```

Official icons are not finalized yet. Local smoke builds can use the default Electron icon; replace it with `assets/icon.png`, `assets/icon.icns`, and `assets/icon.ico` before public distribution.
