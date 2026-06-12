import { readJson } from "./lib/file-store.mjs";
import { normalizeAccountConfig } from "./lib/account-system.mjs";

const config = normalizeAccountConfig(await readJson("config/x-accounts.json", { accounts: [] }));
const latest = await readJson("data/latest.json", null);
const strategy = latest?.accountStrategy;

console.log("# X Account Strategy\n");
console.log(`- Configured accounts: ${config.accounts.length}`);
console.log(`- Active accounts: ${config.accounts.filter((account) => account.active).length}`);
console.log(`- Mode: ${config.rotationPolicy.mode}`);
console.log(`- Same-tool cooldown: ${config.rotationPolicy.sameToolCooldownDays} days`);
console.log(`- Same-copy cooldown: ${config.rotationPolicy.sameCopyCooldownDays} days\n`);

console.log("## Accounts\n");
for (const account of config.accounts) {
  console.log(`- ${account.displayName} (${account.id}) — ${account.category} — limit ${account.dailyPostLimit}/day — ${account.active ? "active" : "paused"}`);
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
