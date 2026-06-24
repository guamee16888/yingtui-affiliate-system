import { readJson, writeJsonAtomic, writeTextAtomic } from "../lib/file-store.mjs";
import {
  buildSourceDiscoveryPack,
  buildSourceQualityQueue,
  loadContentSourceConfig,
  renderSourceDiscoveryMarkdown
} from "../lib/content-source-system.mjs";

const warnings = [];
const latest = await readJson("data/latest.json", null);
if (!latest) throw new Error("latest.json missing. Run npm run daily first.");

const config = await loadContentSourceConfig(warnings);
const queue = latest.sourceQualityQueue ?? buildSourceQualityQueue({
  supplyPlan: latest.supplyPlan,
  contentSourceConfig: config
});
const discovery = buildSourceDiscoveryPack({
  date: latest.date,
  sourceQualityQueue: queue,
  contentSourceConfig: config
});
const jsonPath = "data/source-discovery.json";
const markdownPath = `output/${latest.date}-source-discovery.md`;
const markdown = renderSourceDiscoveryMarkdown(discovery);

await writeJsonAtomic(jsonPath, {
  version: 1,
  ...discovery
});
await writeTextAtomic(markdownPath, markdown);

console.log(markdown);
console.log(`\nWrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);

for (const warning of warnings) {
  console.warn(`Warning: ${warning}`);
}
