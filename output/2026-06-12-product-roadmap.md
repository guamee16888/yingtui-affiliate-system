# Product Roadmap - 2026-06-12

- Objective: Product-grade multi-account X content ops system with review-first publishing.
- Overall score: 38/100
- Level: prototype
- Blockers: 5
- Deferred: 1

## Top Blockers

1. Feedback learning loop — 0/100
   Why it matters: The system cannot learn angles, accounts, or topics until posted content gets metrics back into JSON.
   Next: Mark every manual post as posted with accountId.
2. Affiliate monetization readiness — 5/100
   Why it matters: Traffic without real affiliate programs becomes vanity; fake links or unverified claims are worse.
   Next: Use the Affiliate research workbench and save real program findings.
3. Account-level content calendar — 9/100
   Why it matters: A daily target is not real until it fits account cooldowns and human review time.
   Next: Run npm run content-calendar after every daily generation.
4. Daily high-quality content supply — 18/100
   Why it matters: 20 accounts need a real candidate pipeline; weak or repeated posts will hurt the whole system.
   Next: Run npm run source-queue and fill the largest circle gap first.
5. Thread and SEO review engine — 35/100
   Why it matters: The compounding upside is not one-off tweets; it is threads, review pages, and affiliate pages from proven winners.
   Next: Open Promotion review and manually queue the ready items.

## Next Sprint

1. Mark every manual post as posted with accountId.
2. Paste X Analytics export into feedback import after posts have data.
3. Use the Affiliate research workbench and save real program findings.
4. Only move approved real links into config/affiliate-links.json.
5. Run npm run content-calendar after every daily generation.
6. Lower per-account daily targets or reduce cooldown hours before scaling.
7. Run npm run source-queue and fill the largest circle gap first.
8. Fill the generated source-pack rows, preview scoring, then import only candidates with a clear buyer, pain, and URL.

## Dimensions

### X account switching and binding

- Score: 15/100
- Status: deferred
- Why it matters: The project has account profiles, but real multi-account OAuth switching is intentionally deferred.
- Evidence: 20 active account profiles configured. 0 accounts have local post records.
- Gaps: Need account selector enforcement at publish time. Need per-account OAuth binding and token health checks before real switching. Need same-tool cooldown across accounts before any scale-up.
- Next: Keep account switching as a separate safety-gated milestone. Do not build unattended multi-account publishing until feedback and quality gates are real.

### Daily high-quality content supply

- Score: 18/100
- Status: blocked
- Why it matters: 20 accounts need a real candidate pipeline; weak or repeated posts will hurt the whole system.
- Evidence: 25/200 planned unique drafts. 25 qualified tools. 73 source candidates needed by the queue. 100 source-pack rows generated, 100 still need real candidates.
- Gaps: Need 175 more unique drafts for the current target. Need more manual/imported sources from AI startup, indie, SaaS, and crypto circles.
- Next: Run npm run source-queue and fill the largest circle gap first. Fill the generated source-pack rows, preview scoring, then import only candidates with a clear buyer, pain, and URL.

### Account-level content calendar

- Score: 9/100
- Status: blocked
- Why it matters: A daily target is not real until it fits account cooldowns and human review time.
- Evidence: 17/200 posts scheduled into review slots. 154 slots impossible under current cooldown settings. 175 drafts missing.
- Gaps: Current cooldown settings cannot fit the configured daily target. Not enough drafts to fill the calendar.
- Next: Run npm run content-calendar after every daily generation. Lower per-account daily targets or reduce cooldown hours before scaling.

### Feedback learning loop

- Score: 0/100
- Status: blocked
- Why it matters: The system cannot learn angles, accounts, or topics until posted content gets metrics back into JSON.
- Evidence: 0 posted feedback rows. 0 rows have impressions. 0 accounts have post records.
- Gaps: No posted feedback rows yet.
- Next: Mark every manual post as posted with accountId. Paste X Analytics export into feedback import after posts have data.

### Affiliate monetization readiness

- Score: 5/100
- Status: blocked
- Why it matters: Traffic without real affiliate programs becomes vanity; fake links or unverified claims are worse.
- Evidence: 0 configured affiliate links. 0 affiliate research records. 1 current high-affiliate candidates. 1 candidates in affiliate research workbench.
- Gaps: High-affiliate candidates still need program research. No configured affiliate links detected.
- Next: Use the Affiliate research workbench and save real program findings. Only move approved real links into config/affiliate-links.json.

### Source diversity

- Score: 73/100
- Status: watch
- Why it matters: A multi-account system needs more than one launch feed, especially for SaaS, indie, and crypto angles.
- Evidence: 2 enabled extra sources. 21 source candidates in the daily merge. 0 candidate inbox items in the daily merge. 2 healthy sources, 0 tune sources, 0 disable candidates.
- Gaps: Need more reliable sources beyond Product Hunt and two RSS feeds. Need a larger manual/imported candidate bench.
- Next: Run npm run source-health and fix the worst source first. Add source packs by circle instead of turning on noisy feeds blindly. Keep disabled sources disabled until they prove they produce useful candidates.

### Quality and safety gates

- Score: 85/100
- Status: good
- Why it matters: The system is valuable only if it protects account quality, avoids fake claims, and blocks stale posts.
- Evidence: 0 generation warnings. 24 fresh publish candidates. Manual-confirm publishing is the default mode.
- Gaps: No major gap detected.
- Next: Keep Fresh today/Fresh 48h as the paid publish gate. Add fact-check notes for topic/news-style candidates before scaling.

### Thread and SEO review engine

- Score: 35/100
- Status: blocked
- Why it matters: The compounding upside is not one-off tweets; it is threads, review pages, and affiliate pages from proven winners.
- Evidence: 0 thread queue items. 0 review page queue items. 0 active follow-up items. 7 promotion review items are ready to queue.
- Gaps: No active follow-up queue items. Promotion review has ready items that still need manual queue approval. No review page candidates have been promoted into the queue.
- Next: Open Promotion review and manually queue the ready items. Generate review outlines only after the tool has signal or clear affiliate fit.

### Public product surface

- Score: 82/100
- Status: good
- Why it matters: The public repo and Vercel demo help people understand the product and contact you.
- Evidence: README has product positioning and contact. Vercel static dashboard is deployable. Public demo banner explains local-only actions.
- Gaps: Need screenshots/GIFs to make the public repo easier to judge quickly.
- Next: Add screenshots/GIFs to README after the UI stabilizes.

## Product Principles

- Quality gates beat volume targets.
- Every paid or API publish action must remain manually confirmed.
- One candidate should not be sprayed across accounts.
- Feedback should decide what gets repeated, expanded, or monetized.
- No fake affiliate links, fake earnings claims, or invented facts.
