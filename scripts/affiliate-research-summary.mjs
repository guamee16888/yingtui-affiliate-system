import { loadAffiliateResearch, loadLatest } from "./lib/data-store.mjs";

const [research, latest] = await Promise.all([loadAffiliateResearch(), loadLatest()]);
const highScore = (latest?.tools ?? []).filter((tool) => !tool.affiliateLink && (tool.scoreBreakdown?.affiliateScore ?? 0) >= 6);

console.log("# Affiliate Research\n");
console.log("## 还未研究的高分工具\n");
console.log(highScore.map((tool) => `- ${tool.name} — affiliateScore ${tool.scoreBreakdown.affiliateScore} — 搜索: \"${tool.name}\" affiliate program`).join("\n") || "暂无。");
console.log("\n## 研究记录\n");
console.log(research.items.length ? research.items.map((item) => `- ${item.toolName} — ${item.status} — ${item.programUrl || "no url"}`).join("\n") : "暂无。");
