import { mkdir } from "node:fs/promises";
import path from "node:path";
import { readJson, rootDir, writeTextAtomic } from "./lib/file-store.mjs";
import {
  buildSourceImportPackRows,
  buildSourceQualityQueue,
  loadContentSourceConfig,
  sourceImportRowsToCsv
} from "./lib/content-source-system.mjs";

const latest = await readJson("data/latest.json", null);
if (!latest) throw new Error("latest.json missing. Run npm run daily first.");

const config = await loadContentSourceConfig([]);
const queue = latest.sourceQualityQueue ?? buildSourceQualityQueue({
  supplyPlan: latest.supplyPlan,
  contentSourceConfig: config
});
const rows = buildSourceImportPackRows({
  sourceQualityQueue: queue,
  contentSourceConfig: config,
  totalRows: 100,
  date: latest.date
});
const outDir = `output/source-import-pack`;
await mkdir(path.join(rootDir, outDir), { recursive: true });

const csvPath = `${outDir}/${latest.date}-source-import-template.csv`;
const guidePath = `${outDir}/${latest.date}-source-import-guide.md`;
const csv = sourceImportRowsToCsv(rows);
const guide = `# Source Import Pack - ${latest.date}

This pack gives you 100 rows for manual candidate collection.

Rules:
- Fill name, url, and tagline before importing.
- Keep circle as one of: ai_startups, indie_hackers, saas_founders, crypto_builders.
- Use candidateType=product for tools and candidateType=topic for market/founder/news signals.
- Do not import rows with placeholder or empty URLs.

Priority gaps:
${queue.items?.length ? queue.items.map((item) => `- ${item.circleName}: need ${item.neededCandidates}; ${item.importHint}`).join("\n") : "- No gaps detected."}

CSV file:
${csvPath}
`;

await writeTextAtomic(csvPath, csv);
await writeTextAtomic(guidePath, guide);

console.log(guide);
console.log(`Wrote ${csvPath}`);
console.log(`Wrote ${guidePath}`);
