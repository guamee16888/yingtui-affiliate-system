import {
  loadAffiliateLinks,
  loadFeedback,
  loadHistoryData,
  loadLatest,
  loadQueues
} from "../lib/storage/interface.mjs";
import { buildDecisionReport } from "../lib/decision-engine.mjs";

const [latest, history, feedback, queues, affiliateLinks] = await Promise.all([
  loadLatest(),
  loadHistoryData(),
  loadFeedback(),
  loadQueues(),
  loadAffiliateLinks()
]);
const report = buildDecisionReport({ latest, history, feedback, queues, affiliateLinks });

console.log("# Feedback Decision Report\n");
console.log(`- Feedback entries: ${report.summary.feedbackEntries}`);
console.log(`- Tools with feedback: ${report.summary.toolsWithFeedback}`);
console.log(`- Recommendations: ${report.summary.recommendations}`);
console.log(`- Top angle: ${report.summary.topAngle ?? "暂无"}`);
console.log("\n## Recommended Actions\n");
console.log(report.recommendations.slice(0, 12).map((item, index) => {
  const status = item.alreadyQueued ? "already queued" : "not queued";
  return `${index + 1}. ${item.toolName} — ${item.queueType} — priority ${item.priorityScore} — ${status}\n   ${item.reason}\n   Evidence: score ${item.evidence.engagementScore}, bookmarks ${item.evidence.bookmarks}, replies ${item.evidence.replies}, clicks ${item.evidence.clicks}`;
}).join("\n") || "暂无。");
console.log("\n## Weak Signals\n");
console.log(report.weakSignals.map((item) => `- ${item.toolName} — ${item.reason}`).join("\n") || "暂无。");
