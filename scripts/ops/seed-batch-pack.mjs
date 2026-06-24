import { loadLatest } from "../lib/storage/interface.mjs";
import { readJson, writeJsonAtomic, writeTextAtomic } from "../lib/file-store.mjs";
import { buildSeedBatchPack, renderSeedBatchPackMarkdown, seedBatchRowsToCsv } from "../lib/seed-batch-pack.mjs";

const latest = await loadLatest();
if (!latest) throw new Error("data/latest.json missing. Run npm run daily first.");

const scaleRampPlan = await readJson("data/scale-ramp-plan.json", null);
if (!scaleRampPlan) throw new Error("data/scale-ramp-plan.json missing. Run npm run scale-ramp first.");

const csvPath = `output/${latest.date}-seed-batch-template.csv`;
const guidePath = `output/${latest.date}-seed-batch-pack.md`;
const jsonPath = "data/seed-batch-pack.json";
const pack = buildSeedBatchPack({
  date: latest.date,
  scaleRampPlan,
  csvPath,
  guidePath
});

await writeTextAtomic(csvPath, seedBatchRowsToCsv(pack.rows));
await writeTextAtomic(guidePath, renderSeedBatchPackMarkdown(pack));
await writeJsonAtomic(jsonPath, pack);

console.log(renderSeedBatchPackMarkdown(pack));
console.log(`Wrote ${csvPath}`);
console.log(`Wrote ${guidePath}`);
console.log(`Wrote ${jsonPath}`);
