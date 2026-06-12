import { loadFeedback } from "./lib/data-store.mjs";

const feedback = await loadFeedback();
const entries = [...feedback.entries].sort((a, b) => Number(b.engagementScore ?? 0) - Number(a.engagementScore ?? 0));
const byVariant = new Map();
const byTool = new Map();

for (const entry of entries) {
  byVariant.set(entry.variantType, (byVariant.get(entry.variantType) ?? 0) + Number(entry.engagementScore ?? 0));
  byTool.set(entry.toolName, (byTool.get(entry.toolName) ?? 0) + Number(entry.engagementScore ?? 0));
}

console.log("# Feedback Summary\n");
console.log(`- 已发布/记录文案数量: ${entries.length}`);
console.log("\n## Top 10 engagementScore 文案\n");
console.log(entries.slice(0, 10).map((entry, index) => `${index + 1}. ${entry.toolName} — ${entry.variantType} — ${entry.engagementScore ?? 0} — ${entry.copyText}`).join("\n") || "暂无反馈。");
console.log("\n## 值得继续跟进的工具\n");
console.log([...byTool.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, score]) => `- ${name}: ${score}`).join("\n") || "暂无。");
console.log("\n## 表现最好的 angle\n");
console.log([...byVariant.entries()].sort((a, b) => b[1] - a[1]).map(([variant, score]) => `- ${variant}: ${score}`).join("\n") || "暂无。");
