import { todayString } from "./ids.mjs";
import { loadFeedback, loadHistoryData, loadLatest, loadQueues } from "./data-store.mjs";
import { writeJsonAtomic, writeTextAtomic } from "./file-store.mjs";

export async function generateWeeklyReport(date = todayString()) {
  const report = await buildWeeklyReport(date);
  await writeJsonAtomic(report.dataPath, report.data);
  await writeTextAtomic(report.filePath, report.markdown);
  return report;
}

export async function buildWeeklyReport(date = todayString()) {
  const [latest, history, feedback, queues] = await Promise.all([
    loadLatest(),
    loadHistoryData(),
    loadFeedback(),
    loadQueues()
  ]);
  const dateRange = getDateRange(date, 7);
  const recentDates = getRecentDates(history.tools ?? [], date);
  const topFeedback = [...(feedback.entries ?? [])]
    .sort((a, b) => Number(b.engagementScore ?? 0) - Number(a.engagementScore ?? 0))
    .slice(0, 5);
  const reviewCandidates = (queues.items ?? []).filter((item) => item.type === "review_page").slice(0, 5);
  const affiliateCandidates = (queues.items ?? []).filter((item) => item.type === "affiliate_research").slice(0, 5);
  const dailyTrend = buildDailyTrend({ dates: dateRange, history: history.tools ?? [], feedback: feedback.entries ?? [] });
  const topAngles = buildTopAngles(feedback.entries ?? []);
  const data = {
    date,
    summary: {
      dailyDays: recentDates.size,
      toolsSeen: history.tools?.length ?? 0,
      postsTracked: feedback.entries?.length ?? 0,
      queueItems: queues.items?.length ?? 0,
      topAngle: topAngles[0]?.variantType ?? null
    },
    topFeedback,
    reviewCandidates,
    affiliateCandidates,
    dailyTrend,
    topAngles
  };
  const markdown = formatWeeklyMarkdown({ data, latest, topFeedback, reviewCandidates, affiliateCandidates });
  const dataPath = `data/weekly/${date}.json`;
  const filePath = `output/${date}-weekly-report.md`;

  return { data, markdown, dataPath, filePath };
}

function getRecentDates(records, date) {
  const cutoff = new Date(`${date}T00:00:00.000Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 6);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  return new Set(
    records
      .map((item) => item.date)
      .filter((recordDate) => recordDate && recordDate >= cutoffDate && recordDate <= date)
  );
}

function getDateRange(endDate, days) {
  const end = new Date(`${endDate}T00:00:00.000Z`);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (days - index - 1));
    return date.toISOString().slice(0, 10);
  });
}

function buildDailyTrend({ dates, history, feedback }) {
  return dates.map((date) => {
    const dayRecords = history.filter((item) => item.date === date);
    const uniqueTools = new Set(dayRecords.map((item) => item.toolId || item.toolName));
    const dayFeedback = feedback.filter((entry) => feedbackDate(entry) === date);
    return {
      date,
      toolsSeen: uniqueTools.size,
      topScore: Math.max(0, ...dayRecords.map((item) => Number(item.score ?? 0))),
      postsTracked: dayFeedback.length,
      engagementScore: round(dayFeedback.reduce((sum, item) => sum + Number(item.engagementScore ?? 0), 0)),
      bookmarks: dayFeedback.reduce((sum, item) => sum + Number(item.metrics?.bookmarks ?? 0), 0),
      clicks: dayFeedback.reduce((sum, item) => sum + Number(item.metrics?.clicks ?? 0), 0)
    };
  });
}

function buildTopAngles(entries) {
  const byVariant = new Map();
  for (const entry of entries) {
    const variantType = entry.variantType || "unknown";
    const stats = byVariant.get(variantType) ?? {
      variantType,
      posts: 0,
      engagementScore: 0,
      bookmarks: 0,
      replies: 0,
      clicks: 0
    };
    stats.posts += 1;
    stats.engagementScore += Number(entry.engagementScore ?? 0);
    stats.bookmarks += Number(entry.metrics?.bookmarks ?? 0);
    stats.replies += Number(entry.metrics?.replies ?? 0);
    stats.clicks += Number(entry.metrics?.clicks ?? 0);
    byVariant.set(variantType, stats);
  }
  return [...byVariant.values()]
    .map((item) => ({ ...item, engagementScore: round(item.engagementScore) }))
    .sort((a, b) => b.engagementScore - a.engagementScore || b.bookmarks - a.bookmarks || b.clicks - a.clicks)
    .slice(0, 8);
}

function feedbackDate(entry) {
  return entry.sourceDate || String(entry.postedAt || entry.createdAt || "").slice(0, 10);
}

function formatWeeklyMarkdown({ data, latest, topFeedback, reviewCandidates, affiliateCandidates }) {
  return `# Weekly Affiliate Topic Review - ${data.date}

## Summary
- Daily days with data: ${data.summary.dailyDays}
- Tools seen: ${data.summary.toolsSeen}
- Tracked X posts: ${data.summary.postsTracked}
- Queue items: ${data.summary.queueItems}
- Top angle: ${data.summary.topAngle ?? "暂无"}

## 7-Day Trend
${formatTrend(data.dailyTrend)}

## Best Performing Posts
${topFeedback.length ? topFeedback.map((item) => `- ${item.toolName} — ${item.engagementScore ?? 0} — ${item.variantType}`).join("\n") : "数据还少，先连续跑几天 daily 并录入发推反馈。"}

## Top Angles
${data.topAngles.length ? data.topAngles.map((item) => `- ${item.variantType} — score ${item.engagementScore} — posts ${item.posts} — bookmarks ${item.bookmarks} — clicks ${item.clicks}`).join("\n") : "暂无。"}

## Best Tool Candidates
${(latest?.tools ?? []).slice(0, 5).map((tool) => `- ${tool.name} — ${tool.score} — ${tool.followUpAction}`).join("\n")}

## Affiliate Research Priorities
${affiliateCandidates.length ? affiliateCandidates.map((item) => `- ${item.toolName} — ${item.status}`).join("\n") : "暂无。"}

## Review Page Candidates
${reviewCandidates.length ? reviewCandidates.map((item) => `- ${item.toolName} — ${item.status}`).join("\n") : "暂无。"}

## What To Skip
${(latest?.skippedTools ?? []).slice(0, 5).map((tool) => `- ${tool.name} — ${tool.reason}`).join("\n") || "暂无。"}

## Patterns Observed
- 数据还少时，不要过早判断收益。
- 优先观察 bookmarks、replies、clicks，而不是只看 likes。

## Next Week Action Plan
1. 连续运行 daily 并发 3 条。
2. 给表现好的工具录入反馈。
3. 只给真实有反馈的工具生成 review outline。
`;
}

function formatTrend(trend) {
  const maxScore = Math.max(1, ...trend.map((item) => Number(item.engagementScore || item.topScore || item.toolsSeen || 0)));
  return trend.map((item) => {
    const value = item.engagementScore || item.topScore || item.toolsSeen || 0;
    return `- ${item.date} ${asciiBar(value, maxScore)} tools ${item.toolsSeen}, posts ${item.postsTracked}, engagement ${item.engagementScore}`;
  }).join("\n");
}

function asciiBar(value, max) {
  const width = Math.round((Number(value || 0) / max) * 16);
  return `[${"#".repeat(width)}${".".repeat(16 - width)}]`;
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
