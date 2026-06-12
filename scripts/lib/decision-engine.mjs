import { calculateEngagement } from "./scoring.mjs";
import { affiliateLinkMatchesTool } from "./affiliate-links.mjs";

export function buildDecisionReport({ latest, history, feedback, queues, affiliateLinks = { links: [] } }) {
  const tools = latest?.tools ?? [];
  const feedbackEntries = feedback?.entries ?? [];
  const queueItems = queues?.items ?? [];
  const toolMap = new Map(tools.map((tool) => [tool.toolId, tool]));
  const feedbackByTool = groupFeedback(feedbackEntries, toolMap);
  const angleScores = buildAngleScores(feedbackEntries);
  const historyCounts = countHistory(history?.tools ?? []);
  const recommendations = [...feedbackByTool.values()]
    .flatMap((stats) => buildToolRecommendations({
      stats,
      tool: toolMap.get(stats.toolId),
      historyCount: historyCounts.get(stats.toolId) ?? 0,
      queueItems,
      affiliateLinks
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore || b.evidence.engagementScore - a.evidence.engagementScore);

  return {
    summary: {
      feedbackEntries: feedbackEntries.length,
      toolsWithFeedback: feedbackByTool.size,
      recommendations: recommendations.length,
      winners: recommendations.filter((item) => item.decision === "double_down").length,
      weakSignals: recommendations.filter((item) => item.decision === "pause").length,
      topAngle: angleScores[0]?.variantType ?? null
    },
    recommendations,
    winners: recommendations.filter((item) => item.decision === "double_down").slice(0, 5),
    weakSignals: recommendations.filter((item) => item.decision === "pause").slice(0, 5),
    angleScores
  };
}

function buildToolRecommendations({ stats, tool, historyCount, queueItems, affiliateLinks }) {
  const affiliateScore = tool?.scoreBreakdown?.affiliateScore ?? 0;
  const hasAffiliateLink = Boolean(tool?.affiliateLink) || matchesAffiliateConfig(tool ?? stats, affiliateLinks);
  const recommendations = [];

  if (stats.bookmarks >= 3 || stats.engagementScore >= 18) {
    recommendations.push(createRecommendation({
      stats,
      tool,
      decision: "double_down",
      queueType: "review_page",
      priorityScore: 90 + stats.bookmarks * 4 + Math.min(stats.engagementScore, 30),
      reason: "收藏或整体互动足够，适合沉淀成 SEO 测评页候选。",
      queueItems
    }));
  }

  if (stats.replies >= 2 || stats.engagementScore >= 12) {
    recommendations.push(createRecommendation({
      stats,
      tool,
      decision: "double_down",
      queueType: "thread",
      priorityScore: 80 + stats.replies * 6 + Math.min(stats.engagementScore, 25),
      reason: "回复或互动有信号，适合扩展成英文长推。",
      queueItems
    }));
  }

  if (!hasAffiliateLink && affiliateScore >= 6 && (stats.clicks >= 2 || stats.profileVisits >= 3 || stats.engagementScore >= 12)) {
    recommendations.push(createRecommendation({
      stats,
      tool,
      decision: "monetize",
      queueType: "affiliate_research",
      priorityScore: 70 + affiliateScore * 4 + stats.clicks * 5,
      reason: "有点击/访问反馈且 affiliateScore 较高，适合优先查联盟计划。",
      queueItems
    }));
  }

  if (stats.entries >= 2 && stats.impressions >= 200 && stats.engagementScore < 6) {
    recommendations.push(createRecommendation({
      stats,
      tool,
      decision: "pause",
      queueType: "watch",
      priorityScore: 30 - Math.min(historyCount, 10),
      reason: "已经测试过但互动偏弱，先放入观察，不要急着做长文。",
      queueItems
    }));
  }

  if (!recommendations.length && stats.entries > 0) {
    recommendations.push(createRecommendation({
      stats,
      tool,
      decision: "watch",
      queueType: "watch",
      priorityScore: 40 + Math.min(stats.engagementScore, 20),
      reason: "已有反馈但信号还不够强，先继续观察。",
      queueItems
    }));
  }

  return recommendations;
}

function createRecommendation({ stats, tool, decision, queueType, priorityScore, reason, queueItems }) {
  return {
    id: `${stats.toolId}:${queueType}`,
    toolId: stats.toolId,
    toolName: stats.toolName,
    toolUrl: stats.toolUrl,
    decision,
    queueType,
    priorityScore: Math.round(priorityScore),
    reason,
    suggestedAngle: bestVariant(stats)?.variantType ?? tool?.followUpAction ?? "shortPost",
    alreadyQueued: queueItems.some((item) => item.toolId === stats.toolId && item.type === queueType),
    evidence: {
      entries: stats.entries,
      engagementScore: round(stats.engagementScore),
      impressions: stats.impressions,
      likes: stats.likes,
      bookmarks: stats.bookmarks,
      replies: stats.replies,
      reposts: stats.reposts,
      clicks: stats.clicks,
      profileVisits: stats.profileVisits
    }
  };
}

function groupFeedback(entries, toolMap) {
  const map = new Map();
  for (const entry of entries) {
    const tool = toolMap.get(entry.toolId);
    const stats = map.get(entry.toolId) ?? {
      toolId: entry.toolId,
      toolName: entry.toolName,
      toolUrl: entry.toolUrl,
      entries: 0,
      engagementScore: 0,
      impressions: 0,
      likes: 0,
      bookmarks: 0,
      replies: 0,
      reposts: 0,
      clicks: 0,
      profileVisits: 0,
      variants: new Map()
    };
    const score = Number(entry.engagementScore ?? calculateEngagement(entry.metrics).engagementScore);
    stats.entries += 1;
    stats.engagementScore += score;
    for (const key of ["impressions", "likes", "bookmarks", "replies", "reposts", "clicks", "profileVisits"]) {
      stats[key] += Number(entry.metrics?.[key] ?? 0);
    }
    const variantType = entry.variantType || "unknown";
    const variant = stats.variants.get(variantType) ?? { variantType, score: 0, entries: 0 };
    variant.score += score;
    variant.entries += 1;
    stats.variants.set(variantType, variant);
    stats.toolName = tool?.name ?? stats.toolName;
    stats.toolUrl = tool?.url ?? stats.toolUrl;
    map.set(entry.toolId, stats);
  }
  return map;
}

function buildAngleScores(entries) {
  const map = new Map();
  for (const entry of entries) {
    const variantType = entry.variantType || "unknown";
    const stats = map.get(variantType) ?? {
      variantType,
      entries: 0,
      engagementScore: 0,
      bookmarks: 0,
      replies: 0,
      clicks: 0
    };
    stats.entries += 1;
    stats.engagementScore += Number(entry.engagementScore ?? calculateEngagement(entry.metrics).engagementScore);
    stats.bookmarks += Number(entry.metrics?.bookmarks ?? 0);
    stats.replies += Number(entry.metrics?.replies ?? 0);
    stats.clicks += Number(entry.metrics?.clicks ?? 0);
    map.set(variantType, stats);
  }
  return [...map.values()]
    .map((item) => ({ ...item, engagementScore: round(item.engagementScore) }))
    .sort((a, b) => b.engagementScore - a.engagementScore || b.bookmarks - a.bookmarks)
    .slice(0, 8);
}

function bestVariant(stats) {
  return [...stats.variants.values()].sort((a, b) => b.score - a.score)[0] ?? null;
}

function countHistory(records) {
  const counts = new Map();
  for (const record of records) {
    if (!record.toolId) continue;
    counts.set(record.toolId, (counts.get(record.toolId) ?? 0) + 1);
  }
  return counts;
}

function matchesAffiliateConfig(tool, affiliateLinks) {
  return (affiliateLinks.links ?? []).some((link) => affiliateLinkMatchesTool(tool, link));
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
