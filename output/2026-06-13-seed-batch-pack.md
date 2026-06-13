# Seed Batch Pack - 2026-06-13

- Accounts: 3
- Rows: 30
- Safe test posts now: 3
- CSV: output/2026-06-13-seed-batch-template.csv

## First Batch

- AI Agent Ops: Fill 10 real candidates for AI Agent Ops; import only rows with a real URL, narrow buyer, and clear pain.
- Ecommerce Ops: Fill 10 real candidates for Ecommerce Ops; import only rows with a real URL, narrow buyer, and clear pain.
- Market Map Notes: Fill 10 real candidates for Market Map Notes; import only rows with a real URL, narrow buyer, and clear pain.

## Account Rows

- AI Agent Ops: 10 rows, missing drafts 8, missing fresh 10
  https://x.com/search?q=AI%20Agent%20Ops%20AI%20agents%20and%20automation%20tools%20founder%20workflow&src=typed_query&f=live
- Ecommerce Ops: 10 rows, missing drafts 9, missing fresh 10
  https://x.com/search?q=Ecommerce%20Ops%20ecommerce%20and%20Shopify%20tools%20founder%20workflow&src=typed_query&f=live
- Market Map Notes: 10 rows, missing drafts 9, missing fresh 10
  https://x.com/search?q=Market%20Map%20Notes%20market%20mapping%20tools%20founder%20workflow&src=typed_query&f=live

Rules:
- Fill name, url, and tagline before importing.
- Leave weak rows blank.
- Keep accountId/accountName columns for your own tracking; the candidate importer will ignore extra columns safely.
- Do not import placeholder or fake URLs.
- After importing, rerun npm run daily, then check Scale ramp plan again.
