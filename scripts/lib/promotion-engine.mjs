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

export function buildPromotionReviewQueue({ latest, history, feedback, queues = { items: [] }, affiliateLinks = { links: [] }, limit = 12 }) {
  const queueItems = queues.items ?? [];
  const suggestions = buildPromotionSuggestions({ latest, history, feedback, affiliateLinks })
    .map((item) => {
      const queueType = queueTypeForSuggestion(item.suggestion);
      const alreadyQueued = queueType
        ? queueItems.some((queued) => queued.toolId === item.toolId && queued.type === queueType && !["skipped", "archived"].includes(queued.status))
        : false;
      const priorityScore = promotionPriority(item, queueType, alreadyQueued);
      const reviewStatus = reviewStatusForItem(item, queueType, alreadyQueued);

      return {
        id: `${item.toolId}:${queueType || item.suggestion}`,
        toolId: item.toolId,
        toolName: item.toolName,
        toolUrl: item.toolUrl,
        score: item.score,
        suggestion: item.suggestion,
        queueType,
        reviewStatus,
        priorityScore,
        alreadyQueued,
        reason: item.reason,
        recommendedAction: recommendedAction(item, queueType, reviewStatus),
        evidence: {
          affiliateScore: item.affiliateScore,
          riskScore: item.riskScore,
          freshForPosting: item.freshForPosting,
          historyCount: item.historyCount,
          hasAffiliateLink: item.hasAffiliateLink,
          feedbackEntries: item.feedback.entries,
          engagementScore: round(item.feedback.engagementScore),
          impressions: item.feedback.impressions,
          bookmarks: item.feedback.bookmarks,
          replies: item.feedback.replies,
          clicks: item.feedback.clicks
        }
      };
    })
    .filter((item) => item.reviewStatus !== "skip")
    .sort((a, b) => b.priorityScore - a.priorityScore || b.score - a.score)
    .slice(0, limit);

  return {
    date: latest?.date ?? "",
    generatedAt: new Date().toISOString(),
    mode: "manual_review",
    rule: "Promotion review only. Nothing is added to queues until you click the queue button.",
    summary: {
      totalItems: suggestions.length,
      readyToQueue: suggestions.filter((item) => item.reviewStatus === "ready_to_queue").length,
      alreadyQueued: suggestions.filter((item) => item.reviewStatus === "already_queued").length,
      needsFeedback: suggestions.filter((item) => item.reviewStatus === "needs_feedback").length,
      watch: suggestions.filter((item) => item.reviewStatus === "watch").length
    },
    items: suggestions,
    nextActions: nextPromotionActions(suggestions)
  };
}

export function renderPromotionReviewMarkdown(review) {
  if (!review) return "# Promotion Review Queue\n\nNo promotion review generated. Run npm run promotion-review.\n";

  return `# Promotion Review Queue - ${review.date}

- Mode: ${review.mode}
- Rule: ${review.rule}
- Total items: ${review.summary.totalItems}
- Ready to queue: ${review.summary.readyToQueue}
- Already queued: ${review.summary.alreadyQueued}
- Needs feedback: ${review.summary.needsFeedback}
- Watch: ${review.summary.watch}

## Next Actions

${review.nextActions.length ? review.nextActions.map((item, index) => `${index + 1}. ${item}`).join("\n") : "No clear promotion actions yet."}

## Review Items

${review.items.length ? review.items.map((item, index) => `${index + 1}. ${item.toolName} — ${item.reviewStatus} — ${item.queueType || item.suggestion} — priority ${item.priorityScore}
   ${item.reason}
   Action: ${item.recommendedAction}
   Evidence: score ${item.score}, affiliate ${item.evidence.affiliateScore}, risk ${item.evidence.riskScore}, feedback ${item.evidence.feedbackEntries}, clicks ${item.evidence.clicks}, bookmarks ${item.evidence.bookmarks}`).join("\n") : "No review items."}
`;
}

function queueTypeForSuggestion(suggestion) {
  if (suggestion === "affiliate priority") return "affiliate_research";
  if (suggestion === "review page candidate") return "review_page";
  if (suggestion === "thread candidate") return "thread";
  if (suggestion === "watch") return "watch";
  return "";
}

function promotionPriority(item, queueType, alreadyQueued) {
  const base = Number(item.score || 0) * 2
    + Number(item.affiliateScore || 0) * 6
    - Number(item.riskScore || 0) * 5
    + Math.min(40, Number(item.feedback.engagementScore || 0) * 2)
    + Number(item.feedback.bookmarks || 0) * 8
    + Number(item.feedback.clicks || 0) * 7
    + (item.freshForPosting ? 8 : 0)
    + (item.hasAffiliateLink ? 10 : 0);
  const typeBonus = queueType === "affiliate_research" ? 18
    : queueType === "review_page" ? 14
      : queueType === "thread" ? 12
        : queueType === "watch" ? -10
          : -30;
  const queuedPenalty = alreadyQueued ? 35 : 0;
  return Math.max(0, Math.round(base + typeBonus - queuedPenalty));
}

function reviewStatusForItem(item, queueType, alreadyQueued) {
  if (item.suggestion === "skip" || !queueType) return "skip";
  if (alreadyQueued) return "already_queued";
  if (queueType === "watch") return "watch";
  if (item.feedback.entries <= 0 && !item.freshForPosting && item.suggestion !== "affiliate priority") return "needs_feedback";
  return "ready_to_queue";
}

function recommendedAction(item, queueType, status) {
  if (status === "already_queued") return "Keep working the existing queue item; do not duplicate it.";
  if (status === "watch") return "Do not promote yet. Collect feedback or wait for a fresher angle.";
  if (status === "needs_feedback") return "Post or record feedback before promoting this into a long-form queue.";
  if (queueType === "affiliate_research") return "Open affiliate research, verify the real program, then record the result.";
  if (queueType === "review_page") return "Add to SEO review queue, then generate an outline after confirming facts.";
  if (queueType === "thread") return "Add to thread queue and expand only the strongest angle.";
  return "Review manually.";
}

function nextPromotionActions(items) {
  const ready = items.filter((item) => item.reviewStatus === "ready_to_queue");
  const actions = [];
  const affiliate = ready.find((item) => item.queueType === "affiliate_research");
  const reviewPage = ready.find((item) => item.queueType === "review_page");
  const thread = ready.find((item) => item.queueType === "thread");

  if (affiliate) actions.push(`Research affiliate program for ${affiliate.toolName}.`);
  if (reviewPage) actions.push(`Queue ${reviewPage.toolName} for an SEO review page.`);
  if (thread) actions.push(`Queue ${thread.toolName} for a thread.`);
  if (!actions.length && items.some((item) => item.reviewStatus === "needs_feedback")) {
    actions.push("Record feedback before promoting more tools into long-form queues.");
  }
  return actions.slice(0, 5);
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

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
