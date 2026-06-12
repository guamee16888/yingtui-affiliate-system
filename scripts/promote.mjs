import { loadAffiliateLinks, loadFeedback, loadHistoryData, loadLatest } from "./lib/data-store.mjs";
import { buildPromotionSuggestions } from "./lib/promotion-engine.mjs";

const [latest, history, feedback, affiliateLinks] = await Promise.all([
  loadLatest(),
  loadHistoryData(),
  loadFeedback(),
  loadAffiliateLinks()
]);
const suggestions = buildPromotionSuggestions({ latest, history, feedback, affiliateLinks });

console.log("# Promotion Suggestions\n");
for (const type of ["thread candidate", "review page candidate", "affiliate priority", "watch", "skip"]) {
  const items = suggestions.filter((item) => item.suggestion === type);
  console.log(`## ${type}\n`);
  console.log(items.length ? items.map((item) => `- ${item.toolName} — ${item.reason}`).join("\n") : "暂无。");
  console.log("");
}
