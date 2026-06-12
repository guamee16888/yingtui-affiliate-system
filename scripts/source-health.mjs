import { readJson, writeJsonAtomic, writeTextAtomic } from "./lib/file-store.mjs";
import {
  buildSourceHealth,
  loadContentSourceConfig,
  loadSourceCandidates,
  renderSourceHealthMarkdown
} from "./lib/content-source-system.mjs";

const warnings = [];
const [latest, config, sourceCandidates] = await Promise.all([
  readJson("data/latest.json", null),
  loadContentSourceConfig(warnings),
  loadSourceCandidates()
]);

if (!latest) throw new Error("latest.json missing. Run npm run daily first.");

const health = latest.sourceHealth ?? buildSourceHealth({
  date: latest.date,
  sourceCandidates,
  scored: [...(latest.tools ?? []), ...(latest.skippedTools ?? [])].map((tool) => ({
    toolId: tool.toolId,
    tool,
    score: tool.score,
    followUpAction: tool.followUpAction
  })),
  contentSourceConfig: config,
  sourceQualityQueue: latest.sourceQualityQueue
});
const jsonPath = "data/source-health.json";
const markdownPath = `output/${latest.date}-source-health.md`;
const markdown = renderSourceHealthMarkdown(health);

await writeJsonAtomic(jsonPath, {
  version: 1,
  ...health
});
await writeTextAtomic(markdownPath, markdown);

console.log(markdown);
console.log(`\nWrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);

for (const warning of warnings) {
  console.warn(`Warning: ${warning}`);
}
