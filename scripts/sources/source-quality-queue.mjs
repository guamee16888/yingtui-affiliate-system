import { readJson, writeJsonAtomic, writeTextAtomic } from "../lib/file-store.mjs";
import {
  buildSourceQualityQueue,
  loadContentSourceConfig,
  renderSourceQualityQueueMarkdown
} from "../lib/content-source-system.mjs";

const warnings = [];
const latest = await readJson("data/latest.json", null);
if (!latest) throw new Error("latest.json missing. Run npm run daily first.");

const config = await loadContentSourceConfig(warnings);
const queue = latest.sourceQualityQueue ?? buildSourceQualityQueue({
  supplyPlan: latest.supplyPlan,
  contentSourceConfig: config
});
const markdown = renderSourceQualityQueueMarkdown(queue);
const jsonPath = "data/source-quality-queue.json";
const markdownPath = `output/${latest.date}-source-quality-queue.md`;

await writeJsonAtomic(jsonPath, {
  version: 1,
  date: latest.date,
  generatedAt: new Date().toISOString(),
  queue
});
await writeTextAtomic(markdownPath, markdown);

console.log(markdown);
console.log(`\nWrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);

for (const warning of warnings) {
  console.warn(`Warning: ${warning}`);
}
