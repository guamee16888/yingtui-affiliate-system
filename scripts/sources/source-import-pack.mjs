import { mkdir } from "node:fs/promises";
import path from "node:path";
import { readJson, rootDir, writeJsonAtomic, writeTextAtomic } from "../lib/file-store.mjs";
import {
  buildSourceImportPack,
  buildSourceQualityQueue,
  loadContentSourceConfig,
  sourceImportRowsToCsv
} from "../lib/content-source-system.mjs";

const latest = await readJson("data/latest.json", null);
if (!latest) throw new Error("latest.json missing. Run npm run daily first.");

const config = await loadContentSourceConfig([]);
const queue = latest.sourceQualityQueue ?? buildSourceQualityQueue({
  supplyPlan: latest.supplyPlan,
  contentSourceConfig: config
});
const outDir = `output/source-import-pack`;
await mkdir(path.join(rootDir, outDir), { recursive: true });

const csvPath = `${outDir}/${latest.date}-source-import-template.csv`;
const guidePath = `${outDir}/${latest.date}-source-import-guide.md`;
const dataPath = `data/source-import-pack/${latest.date}.json`;
const latestDataPath = "data/source-import-pack/latest.json";
const pack = buildSourceImportPack({
  date: latest.date,
  sourceQualityQueue: queue,
  contentSourceConfig: config,
  totalRows: 100,
  csvPath,
  guidePath
});
const csv = sourceImportRowsToCsv(pack.rows);
const guide = `# Source Import Pack - ${latest.date}

This pack gives you 100 rows for manual candidate collection.

Rules:
- Fill name, url, and tagline before importing. Leave weak rows blank.
- Keep circle as one of: ai_startups, indie_hackers, saas_founders, crypto_builders.
- Use candidateType=product for tools and candidateType=topic for market/founder/news signals.
- Do not import rows with placeholder or empty URLs.
- researchUrl is the search link to open; sourceUrl is prefilled with the same link for traceability.
- Extra columns such as researchId, priority, researchProvider, researchQuery, and acceptanceChecklist are safe to keep in the CSV paste.

First batch:
${pack.collectionPlan?.firstBatch?.length ? pack.collectionPlan.firstBatch.map((item) => `- ${item.circleName}: ${item.instruction}`).join("\n") : "- No collection batch needed."}

Priority gaps:
${queue.items?.length ? queue.items.map((item) => `- ${item.circleName}: need ${item.neededCandidates}; ${item.importHint}`).join("\n") : "- No gaps detected."}

Provider split:
${pack.rowsByResearchProvider?.length ? pack.rowsByResearchProvider.map((item) => `- ${item.researchProvider}: ${item.rows} rows`).join("\n") : "- No provider split available."}

CSV file:
${csvPath}
`;

await writeTextAtomic(csvPath, csv);
await writeTextAtomic(guidePath, guide);
await writeJsonAtomic(dataPath, pack);
await writeJsonAtomic(latestDataPath, await readJson(dataPath));

console.log(guide);
console.log(`Wrote ${csvPath}`);
console.log(`Wrote ${guidePath}`);
console.log(`Wrote ${dataPath}`);
console.log(`Wrote ${latestDataPath}`);
