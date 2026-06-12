# Seed Batch Pack - 2026-06-13

- Accounts: 3
- Rows: 30
- Safe test posts now: 3
- CSV: output/2026-06-13-seed-batch-template.csv

## First Batch

- AI Founder Signals: Fill 10 real candidates for AI Founder Signals; import only rows with a real URL, narrow buyer, and clear pain.
- AI Tools Lab: Fill 10 real candidates for AI Tools Lab; import only rows with a real URL, narrow buyer, and clear pain.
- AI Agent Ops: Fill 10 real candidates for AI Agent Ops; import only rows with a real URL, narrow buyer, and clear pain.

## Account Rows

- AI Founder Signals: 10 rows, missing drafts 10, missing fresh 6
  https://x.com/search?q=AI%20Founder%20Signals%20AI%20startup%20circle%20tools%20founder%20workflow&src=typed_query&f=live
- AI Tools Lab: 10 rows, missing drafts 10, missing fresh 6
  https://x.com/search?q=AI%20Tools%20Lab%20AI%20tools%20discovery%20tools%20founder%20workflow&src=typed_query&f=live
- AI Agent Ops: 10 rows, missing drafts 3, missing fresh 10
  https://x.com/search?q=AI%20Agent%20Ops%20AI%20agents%20and%20automation%20tools%20founder%20workflow&src=typed_query&f=live

Rules:
- Fill name, url, and tagline before importing.
- Leave weak rows blank.
- Keep accountId/accountName columns for your own tracking; the candidate importer will ignore extra columns safely.
- Do not import placeholder or fake URLs.
- After importing, rerun npm run daily, then check Scale ramp plan again.
