import {
  loadContentSourceConfig,
  refreshSourceCandidates
} from "../lib/content-source-system.mjs";

const warnings = [];
const config = await loadContentSourceConfig(warnings);
const result = await refreshSourceCandidates(config, warnings);

console.log("# Content Source Candidates\n");
console.log(`- Enabled extra sources: ${result.enabledSources}`);
console.log(`- Newly fetched items: ${result.fetchedCount}`);
console.log(`- Cached source candidates: ${result.cachedCount}`);
console.log(`- Daily target: ${config.dailyTargets.accounts} accounts x ${config.dailyTargets.postsPerAccount} posts`);
console.log(`- Quality floor: score ${config.dailyTargets.minimumQualityScore}+ and not skip\n`);

console.log("## Circles\n");
for (const circle of config.circles) {
  console.log(`- ${circle.name} (${circle.id}): ${circle.keywords.slice(0, 8).join(", ")}`);
}

if (warnings.length) {
  console.log("\n## Warnings\n");
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (!result.enabledSources) {
  console.log("\nNo external sources are enabled yet. Use Candidate Inbox, or set a source to enabled=true in config/content-sources.json after testing it.");
}
