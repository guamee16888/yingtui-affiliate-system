# Windows Packaging

`npm run desktop:pack:win` is configured for:

- NSIS installer
- Portable exe
- Unpacked directory build

On macOS, Windows packaging can fail because the local machine is missing Windows packaging dependencies such as wine, or because electron-builder cannot fetch the required NSIS artifacts.

If that happens, treat it as an environment limitation, not as an app runtime failure. Use one of these options:

```bash
npm install
npm run desktop:pack:win
```

on a Windows machine, or add a future GitHub Actions workflow that builds Windows artifacts on `windows-latest`.

This project does not upload releases automatically. Do not add auto-publish until signing, package checks, and customer distribution rules are ready.

Before sending any Windows package to a customer, run:

```bash
npm run desktop:package-check
```

Unsigned Windows builds may trigger SmartScreen. Production distribution needs a Windows code-signing certificate.
