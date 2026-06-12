import { calculateEngagement } from "./scoring.mjs";

export function buildPromotionSuggestions({ latest, history, feedback, affiliateLinks = { links: [] } }) {
  const tools = latest?.tools ?? [];
  const historyCounts = countHistory(history?.tools ?? []);
  const feedbackByTool = groupFeedback(feedback?.entries ?? []);

  return tools.map((tool) => {
    const feedbackStats = feedbackByTool.get(tool.toolId) ?? emptyStats();
    const historyCount = historyCounts.get(tool.toolId) ?? 0;
    const hasAffiliateLink = Boolean(tool.affiliateLink) || matchesAffiliateConfig(tool, affiliateLinks);
    const freshForPosting = isFreshForPosting(tool, latest);
    const suggestion = decideSuggestion(tool, feedbackStats, historyCount, hasAffiliateLink, freshForPosting);

    return {
      toolId: tool.toolId,
      toolName: tool.name,
      toolUrl: tool.url,
      score: tool.score,
      affiliateScore: tool.scoreBreakdown?.affiliateScore ?? 0,
      riskScore: tool.scoreBreakdown?.riskScore ?? 0,
      feedback: feedbackStats,
      historyCount,
      hasAffiliateLink,
      freshForPosting,
      suggestion,
      reason: suggestionReason(tool, feedbackStats, historyCount, hasAffiliateLink, freshForPosting, suggestion)
    };
  });
}

function decideSuggestion(tool, feedbackStats, historyCount, hasAffiliateLink, freshForPosting) {
  const affiliateScore = tool.scoreBreakdown?.affiliateScore ?? 0;
  const riskScore = tool.scoreBreakdown?.riskScore ?? 0;

  if (riskScore >= 8 && feedbackStats.engagementScore < 5) return "skip";
  if (feedbackStats.clicks >= 5 && affiliateScore >= 6) return "affiliate priority";
  if (feedbackStats.bookmarks >= 3 || (hasAffiliateLink && feedbackStats.engagementScore >= 12)) return "review page candidate";
  if (feedbackStats.engagementScore >= 10 || feedbackStats.replies >= 2) return "thread candidate";
  if (!hasAffiliateLink && affiliateScore >= 6) return "affiliate priority";
  if (!freshForPosting && feedbackStats.entries === 0) return "watch";
  if (historyCount >= 3 && feedbackStats.entries === 0) return "watch";
  if (tool.followUpAction === "skip") return "skip";
  return tool.followUpAction || "watch";
}

function suggestionReason(tool, stats, historyCount, hasAffiliateLink, freshForPosting, suggestion) {
  if (suggestion === "affiliate priority") {
    return stats.clicks > 0
      ? "clicks 和 affiliateScore 都有信号，适合优先查联盟计划。"
      : "affiliateScore 较高但还没有联盟链接，适合先查 program。";
  }
  if (suggestion === "review page candidate") {
    return stats.entries > 0
      ? "收藏或整体互动较好，适合沉淀成 SEO 测评页候选。"
      : "内容分和当前 follow-up action 较好，可先作为测评页候选观察。";
  }
  if (suggestion === "thread candidate") {
    return stats.entries > 0
      ? "互动或回复足够，可以扩展成英文长推。"
      : "当前评分和文案角度适合先测试英文长推。";
  }
  if (suggestion === "watch") {
    if (!freshForPosting && stats.entries === 0) return "不是 48 小时内的新鲜候选，先观察，不建议花 API credits 发。";
    return `历史出现 ${historyCount} 次但反馈还少，先观察。`;
  }
  if (suggestion === "skip") return "风险偏高或反馈不足，暂时跳过。";
  if (hasAffiliateLink) return "已有联盟链接，可以继续观察真实反馈。";
  return tool.reason || "保持当前 follow-up action。";
}

function isFreshForPosting(tool, latest) {
  if (tool?.seenBefore) return false;
  const published = new Date(tool?.published);
  if (Number.isNaN(published.getTime())) return false;
  const reference = new Date(latest?.generatedAt ?? Date.now());
  if (Number.isNaN(reference.getTime())) return false;
  const ageHours = Math.max(0, (reference.getTime() - published.getTime()) / 3600000);
  return ageHours <= 48;
}

function countHistory(records) {
  const counts = new Map();
  for (const record of records) {
    if (!record.toolId) continue;
    counts.set(record.toolId, (counts.get(record.toolId) ?? 0) + 1);
  }
  return counts;
}

function groupFeedback(entries) {
  const map = new Map();
  for (const entry of entries) {
    const stats = map.get(entry.toolId) ?? emptyStats();
    const score = entry.engagementScore ?? calculateEngagement(entry.metrics).engagementScore;
    stats.entries += 1;
    stats.engagementScore += score;
    stats.likes += Number(entry.metrics?.likes ?? 0);
    stats.bookmarks += Number(entry.metrics?.bookmarks ?? 0);
    stats.replies += Number(entry.metrics?.replies ?? 0);
    stats.reposts += Number(entry.metrics?.reposts ?? 0);
    stats.clicks += Number(entry.metrics?.clicks ?? 0);
    stats.profileVisits += Number(entry.metrics?.profileVisits ?? 0);
    stats.impressions += Number(entry.metrics?.impressions ?? 0);
    map.set(entry.toolId, stats);
  }
  return map;
}

function emptyStats() {
  return {
    entries: 0,
    engagementScore: 0,
    impressions: 0,
    likes: 0,
    bookmarks: 0,
    replies: 0,
    reposts: 0,
    clicks: 0,
    profileVisits: 0
  };
}

function matchesAffiliateConfig(tool, affiliateLinks) {
  const haystack = `${tool.name} ${tool.url} ${tool.tagline}`.toLowerCase();
  return (affiliateLinks.links ?? []).some((link) => {
    const terms = [link.match, ...(link.keywords ?? []), ...(link.domains ?? [])].filter(Boolean);
    return terms.some((term) => haystack.includes(String(term).toLowerCase()));
  });
}
