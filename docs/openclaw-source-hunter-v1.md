# OpenClaw Source Hunter v1

OpenClaw is the upstream content intelligence layer for AI Creator OS.

It does not publish. It does not create tasks directly. It only turns public source signals into scored `raw-candidates` for later conversion by AI Creator OS.

With `ZHIPUAI_API_KEY` configured, OpenClaw runs in `llm-judge` mode using Zhipu `glm-4.7` after the public-source fetch and rule pre-filter. Without the key it falls back to `fetch-only` mode.

## Structure

- `AI Hunter`: AI tools, agents, workflows, developer tools, SaaS launches.
- `Crypto Hunter`: DeFi, wallets, onchain tooling, protocol dashboards, builder-facing crypto signals.
- `Founder Hunter`: SaaS, founder growth, pricing, onboarding, launch, churn, build-in-public signals.
- `OpenClaw Source Hub`: merges hunter output into `data/raw-candidates.json`.

Each hunter is paired with its own GLM judge profile:

- `ai_signal_judge`: accepts AI/SaaS/productivity signals with a clear content angle.
- `crypto_signal_judge`: accepts builder-facing protocol, wallet, DeFi, and onchain-tool signals while rejecting trading bait.
- `founder_signal_judge`: accepts founder, pricing, growth, onboarding, churn, and launch signals.

## Pipeline

```text
OpenClaw
  -> fetch public sources
  -> filter duplicates, noise, ads, and crypto signal bait
  -> rule score freshness, discussion, controversy, ad fit, affiliate fit, and source trust
  -> GLM-4.7 judge profile checks whether the signal is worth turning into content
  -> write selected items to raw-candidates

AI Creator OS
  -> raw_candidates
  -> topics
  -> copy
  -> tasks
  -> publish
  -> feedback
```

## Commands

Run the full daily job. This writes `raw-candidates`, writes the latest OpenClaw report, and converts accepted candidates into the AI Creator OS review pipeline:

```bash
npm run openclaw:daily
```

Dry run without writing candidates:

```bash
npm run openclaw:hunt -- --dry-run --limit 30
```

Write candidates into the local data store:

```bash
npm run openclaw:hunt -- --limit 200
```

Run one hunter only:

```bash
npm run openclaw:hunt -- --hunter openclaw_ai_hunter --dry-run
npm run openclaw:hunt -- --hunter openclaw_crypto_hunter --dry-run
npm run openclaw:hunt -- --hunter openclaw_founder_hunter --dry-run
```

Regenerate the report from the latest real run:

```bash
npm run openclaw:report
```

Install the macOS daily scheduler:

```bash
npm run openclaw:install-scheduler
```

The scheduler has two triggers:

- `RunAtLoad`: run once after login/load, so a missed 08:10 run is caught up.
- `StartCalendarInterval`: run every day at 08:10.

`openclaw:daily` is idempotent by default. If today's report already exists, it exits with `Mode: skipped` instead of writing duplicate candidates. To intentionally run again:

```bash
npm run openclaw:daily -- --force
```

Force fetch-only mode:

```bash
npm run openclaw:hunt -- --dry-run --no-llm
```

Force GLM mode for manual verification:

```bash
npm run openclaw:hunt -- --dry-run --require-llm --strict-llm --limit 3
```

## Acceptance Criteria

- The daily scheduler is installed as `com.guamee.openclaw.daily`.
- `npm run openclaw:daily` runs with `LLM: llm-judge · zhipu/glm-4.7`.
- The latest report marks `Target status: covered` only when at least 50 candidates were imported.
- Each accepted candidate stores GLM metadata: `reasons`, `topicAngle`, `contentAngle`, `accountDirection`, and `riskFlags`.
- If the daily run imports fewer than 50 candidates, the report says `short` instead of pretending the target is met.

Scheduler logs are written under:

```text
output/openclaw-daily.out.log
output/openclaw-daily.err.log
```

## Environment

```bash
ZHIPUAI_API_KEY=your-zhipu-api-key
OPENCLAW_LLM_PROVIDER=zhipu
OPENCLAW_LLM_MODEL=glm-4.7
```

## v1 Notes

- GitHub live sources are configured but `planned` by default, because public API/network latency can block daily runs without caching.
- Product Hunt RSS is active, but v1 keyword scoring can be conservative. A dedicated Product Hunt parser should read tags/categories next.
- DefiLlama is pre-filtered to avoid CEX/exchange noise and keep crypto output builder-facing.
- Premium sources such as Kaito, Messari, The Block Pro, and Nansen should remain API-key gated before becoming active.
