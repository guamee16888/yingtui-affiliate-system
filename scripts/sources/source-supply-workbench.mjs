import { readJson, writeJsonAtomic, writeTextAtomic } from "../lib/file-store.mjs";
import {
  buildSourceDiscoveryPack,
  buildSourceHealth,
  buildSourceQualityQueue,
  buildSourceSupplyWorkbench,
  loadContentSourceConfig,
  loadSourceCandidates,
  renderSourceSupplyWorkbenchMarkdown
} from "../lib/content-source-system.mjs";

const warnings = [];
const [latest, config, candidateInbox, sourceCandidates] = await Promise.all([
  readJson("data/latest.json", null),
  loadContentSourceConfig(warnings),
  readJson("data/candidate-inbox.json", { version: 1, items: [] }),
  loadSourceCandidates()
]);

if (!latest) throw new Error("latest.json missing. Run npm run daily first.");

const queue = latest.sourceQualityQueue ?? buildSourceQualityQueue({
  supplyPlan: latest.supplyPlan,
  contentSourceConfig: config
});
const discovery = latest.sourceDiscovery ?? buildSourceDiscoveryPack({
  date: latest.date,
  sourceQualityQueue: queue,
  contentSourceConfig: config
});
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
  sourceQualityQueue: queue
});
const workbench = buildSourceSupplyWorkbench({
  date: latest.date,
  supplyPlan: latest.supplyPlan,
  sourceQualityQueue: queue,
  sourceDiscovery: discovery,
  sourceHealth: health,
  candidateInbox,
  sourceCandidates
});
const jsonPath = "data/source-supply-workbench.json";
const markdownPath = `output/${latest.date}-source-supply-workbench.md`;
const markdown = renderSourceSupplyWorkbenchMarkdown(workbench);

await writeJsonAtomic(jsonPath, {
  version: 1,
  ...workbench
});
await writeTextAtomic(markdownPath, markdown);

console.log(markdown);
console.log(`\nWrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);

for (const warning of warnings) {
  console.warn(`Warning: ${warning}`);
}
