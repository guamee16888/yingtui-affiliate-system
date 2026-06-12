import { readJson } from "./lib/file-store.mjs";
import { normalizeAccountConfig } from "./lib/account-system.mjs";

const config = normalizeAccountConfig(await readJson("config/x-accounts.json", { accounts: [] }));
const latest = await readJson("data/latest.json", null);
const strategy = latest?.accountStrategy;
const supplyPlan = latest?.supplyPlan;
const draftPlan = latest?.draftPlan;
const sourceQualityQueue = latest?.sourceQualityQueue;

console.log("# X Account Strategy\n");
console.log(`- Configured accounts: ${config.accounts.length}`);
console.log(`- Active accounts: ${config.accounts.filter((account) => account.active).length}`);
console.log(`- Mode: ${config.rotationPolicy.mode}`);
console.log(`- Same-tool cooldown: ${config.rotationPolicy.sameToolCooldownDays} days`);
console.log(`- Same-copy cooldown: ${config.rotationPolicy.sameCopyCooldownDays} days\n`);

if (supplyPlan) {
  console.log("## Supply Target\n");
  console.log(`- Target: ${supplyPlan.targetAccounts} accounts x ${supplyPlan.targetPerAccount} posts = ${supplyPlan.targetDrafts} drafts/day`);
  console.log(`- Qualified unique items: ${supplyPlan.qualifiedTools}`);
  console.log(`- Possible copy variants: ${supplyPlan.possibleDrafts}`);
  console.log(`- Gap: ${supplyPlan.totalGap}`);
  console.log(`- Status: ${supplyPlan.status}`);
  console.log(`- Note: ${supplyPlan.note}\n`);
}

if (draftPlan) {
  console.log("## Draft Plan\n");
  console.log(`- Planned posts: ${draftPlan.summary.plannedPosts}/${draftPlan.summary.targetPosts}`);
  console.log(`- Gap: ${draftPlan.summary.gap}`);
  console.log(`- Unique tools used: ${draftPlan.summary.uniqueToolsUsed}`);
  console.log(`- Accounts covered: ${draftPlan.summary.accountsCovered}/${draftPlan.summary.accounts}\n`);
}

if (sourceQualityQueue?.items?.length) {
  console.log("## Source Quality Queue\n");
  for (const item of sourceQualityQueue.items.slice(0, 5)) {
    console.log(`- ${item.circleName}: need ${item.neededCandidates}; first query: ${item.searchQueries[0]}`);
  }
  console.log("");
}

console.log("## Accounts\n");
for (const account of config.accounts) {
  console.log(`- ${account.displayName} (${account.id}) — ${account.category} — limit ${account.dailyPostLimit}/day — ${account.active ? "active" : "paused"}`);
}

console.log("\n## OAuth Binding Commands\n");
for (const account of config.accounts) {
  console.log(`- ${account.displayName}: npm run x:auth -- --account ${account.id}`);
}

console.log("\n## Today's Suggested Routing\n");
const recommendations = strategy?.toolRecommendations ?? [];
if (!recommendations.length) {
  console.log("Run `npm run daily` to generate account routing for today's tools.");
} else {
  for (const item of recommendations) {
    console.log(`- ${item.toolName} -> ${item.primary?.displayName ?? "No account"} (${item.reason})`);
  }
}
