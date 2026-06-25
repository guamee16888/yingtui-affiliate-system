# AI Creator OS Pre-Share Checklist

Use this checklist before sending AI Creator OS to another person.

## Safe To Share

- The GitHub source branch after it passes verification.
- A source-only archive rebuilt from Git source.
- `.env.example`, docs, tests, scripts, public demo assets, and sanitized fixtures.
- OpenClaw source code and `config/openclaw-source-hunters.json`.

## Do Not Share

- `.env` or any `.env.*` file except `.env.example`.
- `~/Library/Application Support/AI Creator OS/`.
- Any migration package containing `desktop-runtime-data.tar.gz`.
- Repository `data/` or `output/` from the current working folder.
- OpenClaw runtime data or reports, including `data/openclaw-source-hunter-latest.json` and `output/*openclaw*`.
- `node_modules/`, `dist/`, `dist-desktop/`, `release/`, `release-local/`, `.vercel/`, and `.wrangler/`.

## OpenClaw Boundary

OpenClaw has two parts:

- Shareable source: scripts, tests, docs, and hunter topology config.
- Private runtime: GLM/Zhipu/OpenAI keys in `.env`, local run results, scoring reports, and raw candidate output.

The pairing for OpenClaw is not a public code. It is the private local environment plus provider API keys. Share code without those values.

## Required Checks

Run:

```bash
npm run delivery:preflight
npm run git:safety
npm run lint
npm run check
npm test
npm run build:public
npm run release:check:public
```

If `delivery:preflight` reports modified local runtime data, do not zip the current workspace folder. Use the GitHub branch or rebuild a no-runtime source archive.

## Handoff Rule

For another person, send only source. For your own new Mac, use the private migration/runtime package separately.
