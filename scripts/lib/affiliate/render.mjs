import { buildAffiliateStatus, summarizeLint } from "./copy.mjs";

export function renderDailyMarkdown(model) {
  const freshCount = model.picked.filter((item) => !item.seenBefore).length;
  const seenCount = model.picked.length - freshCount;
  const topScore = model.picked[0]?.score ?? 0;
  const warningBlock = model.warnings.length
    ? `\n## Warnings\n\n${model.warnings.map((warning) => `- ${warning}`).join("\n")}\n`
    : "";

  return `# Daily English X Pack - ${model.date}

## Summary

- Source: ${model.feedSource}${model.usedFallback ? " (fallback sample)" : ""}
- Source mix: Product Hunt ${model.sourceBreakdown?.productHuntTools ?? model.scored.length}, Candidate Inbox ${model.sourceBreakdown?.candidateInboxTools ?? 0}, Source Candidates ${model.sourceBreakdown?.sourceCandidateTools ?? 0}, merged ${model.sourceBreakdown?.mergedTools ?? model.scored.length}
- Evaluated: ${model.scored.length} tools
- Picked: ${model.picked.length} tools (${freshCount} fresh, ${seenCount} Seen before)
- Top score: ${topScore}
- Rule: drafts are material, not a posting queue. Pick only tools you would defend in public.
${warningBlock}
## Supply Plan

${renderSupplyPlan(model.supplyPlan)}

## Source Quality Queue

${renderSourceQueueSummary(model.sourceQualityQueue)}

## Source Discovery

${renderSourceDiscoverySummary(model.sourceDiscovery)}

## Source Health

${renderSourceHealthSummary(model.sourceHealth)}

## Draft Planner

${renderDraftPlanSummary(model.draftPlan)}

## Content Calendar

${renderContentCalendarSummary(model.contentCalendar)}

## Promotion Review Queue

${renderPromotionReviewSummary(model.promotionReview)}

## Feedback Operating Mode

${renderFeedbackOpsSummary(model.feedbackOps)}

## Feedback Learning Signals

${renderFeedbackLearningSignals(model.feedbackLearningSignals)}

## Today's Top Picks

${renderTopPicks(model.picked)}

## Freshness Diagnostic

${renderFreshnessDiagnostic(model.freshnessReport)}

## Today's Action List

${renderActionList(model.actionList)}

## Account Routing

${renderAccountRouting(model.accountStrategy)}

## Tool Cards

${model.picked.map(renderToolCard).join("\n\n")}

## Skipped / Low Priority Tools

${renderLowPriority(model.lowPriority)}

## Affiliate Research Queue

${renderAffiliateQueue(model.affiliateQueue)}

## Historical Notes

- History records before this run: ${model.historySummary.totalRecords}
- Unique tools seen: ${model.historySummary.uniqueTools}
- Last history date before this run: ${model.historySummary.lastDate ?? "none"}
- Seen-before tools in today's picks: ${seenCount}
- Records written by this run: ${model.picked.length}
`;
}

function renderTopPicks(items) {
  if (!items.length) return "No picks generated.";

  return items.slice(0, 5).map((item, index) => {
    const marker = item.seenBefore ? " Seen before." : "";
    return `${index + 1}. ${item.tool.name} — ${item.score} points — ${item.followUpAction}.${marker}`;
  }).join("\n");
}

function renderSupplyPlan(supplyPlan) {
  if (!supplyPlan) return "No supply plan available.";
  const accountShortages = (supplyPlan.accountCoverage ?? [])
    .filter((account) => account.gap > 0)
    .slice(0, 8)
    .map((account) => `- ${account.displayName}: ${account.availableDrafts}/${account.targetPosts} unique candidates, gap ${account.gap}`)
    .join("\n");
  const circles = (supplyPlan.circleCoverage ?? [])
    .map((circle) => `- ${circle.name}: ${circle.qualifiedTools} qualified items, up to ${circle.possibleDrafts} draft variants`)
    .join("\n");

  return [
    `- Target: ${supplyPlan.targetAccounts} accounts x ${supplyPlan.targetPerAccount} posts = ${supplyPlan.targetDrafts} drafts/day`,
    `- Quality floor: score ${supplyPlan.minimumQualityScore}+ and not skip`,
    `- Qualified unique items: ${supplyPlan.qualifiedTools}`,
    `- Possible non-identical draft variants: ${supplyPlan.possibleDrafts}`,
    `- Gap: ${supplyPlan.totalGap}`,
    `- Status: ${supplyPlan.status}`,
    `- Note: ${supplyPlan.note}`,
    "",
    "Circle coverage:",
    circles || "- No circle coverage yet.",
    "",
    "Account shortages:",
    accountShortages || "- No account shortage under the current target."
  ].join("\n");
}

function renderSourceQueueSummary(queue) {
  if (!queue?.items?.length) return "No source quality gaps detected.";
  return [
    `- Queue items: ${queue.summary.items}`,
    `- Needed candidates: ${queue.summary.totalNeededCandidates}`,
    `- Top gap: ${queue.summary.topCircle || "none"}`,
    "",
    ...queue.items.slice(0, 5).map((item, index) => {
      return `${index + 1}. ${item.circleName}: need ${item.neededCandidates}; affected accounts ${item.affectedAccounts.length}; try ${item.searchQueries[0] ?? "manual research"}`;
    })
  ].join("\n");
}

function renderSourceDiscoverySummary(discovery) {
  if (!discovery) return "No source discovery pack generated.";
  const top = (discovery.circles ?? []).slice(0, 4).map((circle) => {
    const links = (circle.searchLinks ?? []).slice(0, 3).map((link) => `[${link.label}](${link.url})`).join("; ");
    return `- ${circle.circleName}: need ${circle.neededCandidates}, ${circle.openingMove} Links: ${links}`;
  }).join("\n");

  return [
    `- Needed candidates: ${discovery.summary.totalNeededCandidates}`,
    `- Search links: ${discovery.summary.totalSearchLinks}`,
    `- Top gap: ${discovery.summary.topCircle || "none"}`,
    "",
    "Today source discovery:",
    top || "- No source discovery actions needed."
  ].join("\n");
}

function renderSourceHealthSummary(health) {
  if (!health) return "No source health report generated.";
  const weakSources = (health.sources ?? [])
    .filter((source) => ["disable_candidate", "needs_candidates", "weak", "tune"].includes(source.status))
    .slice(0, 6)
    .map((source) => `- ${source.name}: ${source.status}, health ${source.healthScore}, qualified ${source.qualifiedCandidates}/${source.totalCandidates}, noise ${source.noiseCandidates}`)
    .join("\n");

  return [
    `- Enabled sources: ${health.summary.enabledSources}/${health.summary.configuredSources}`,
    `- Healthy sources: ${health.summary.healthySources}`,
    `- Tune sources: ${health.summary.tuneSources}`,
    `- Disable candidates: ${health.summary.disableCandidates}`,
    `- Qualified candidates: ${health.summary.qualifiedCandidates}/${health.summary.totalCandidates}`,
    `- Noise candidates: ${health.summary.noiseCandidates}`,
    "",
    "Source actions:",
    health.recommendations.length ? health.recommendations.map((item) => `- ${item}`).join("\n") : "- No source-health action needed.",
    "",
    "Weak/tune sources:",
    weakSources || "- No weak sources detected."
  ].join("\n");
}

function renderDraftPlanSummary(plan) {
  if (!plan) return "No draft plan available.";
  const gaps = (plan.accountPlans ?? [])
    .filter((account) => account.gap > 0)
    .slice(0, 8)
    .map((account) => `- ${account.displayName}: ${account.plannedPosts}/${account.targetPosts}, gap ${account.gap}`)
    .join("\n");
  return [
    `- Rule: ${plan.rule}`,
    `- Planned posts: ${plan.summary.plannedPosts}/${plan.summary.targetPosts}`,
    `- Gap: ${plan.summary.gap}`,
    `- Unique tools used: ${plan.summary.uniqueToolsUsed}`,
    "",
    "Account gaps:",
    gaps || "- No account gaps in this draft plan."
  ].join("\n");
}

function renderContentCalendarSummary(calendar) {
  if (!calendar) return "No content calendar available.";
  const targetIncompatible = (calendar.accountCalendars ?? [])
    .filter((account) => account.status === "target_incompatible")
    .slice(0, 8)
    .map((account) => `- ${account.displayName}: ${account.sameDayCapacity}/${account.targetPosts} slots, cooldown ${account.cooldownHours}h, suggested ${account.recommendedCooldownHours}h`)
    .join("\n");

  return [
    `- Rule: ${calendar.rule}`,
    `- Scheduled posts: ${calendar.summary.scheduledPosts}/${calendar.summary.targetPosts}`,
    `- Same-day capacity: ${calendar.summary.sameDayCapacity}`,
    `- Draft gap: ${calendar.summary.draftGap}`,
    `- Capacity gap: ${calendar.summary.capacityGap}`,
    `- Ready accounts: ${calendar.summary.readyAccounts}/${calendar.summary.accounts}`,
    "",
    "Target/cooldown conflicts:",
    targetIncompatible || "- No target/cooldown conflict detected."
  ].join("\n");
}

function renderPromotionReviewSummary(review) {
  if (!review) return "No promotion review generated.";

  return [
    `- Rule: ${review.rule}`,
    `- Total items: ${review.summary.totalItems}`,
    `- Ready to queue: ${review.summary.readyToQueue}`,
    `- Already queued: ${review.summary.alreadyQueued}`,
    `- Needs feedback: ${review.summary.needsFeedback}`,
    "",
    "Next actions:",
    review.nextActions.length ? review.nextActions.map((item) => `- ${item}`).join("\n") : "- No promotion action yet.",
    "",
    "Top review items:",
    review.items.slice(0, 5).map((item) => `- ${item.toolName}: ${item.reviewStatus} -> ${item.queueType || item.suggestion}, priority ${item.priorityScore}`).join("\n") || "- No review items."
  ].join("\n");
}

function renderFeedbackOpsSummary(ops) {
  if (!ops) return "No feedback operating report generated.";
  return [
    `- Learning score: ${ops.summary.learningScore}/100`,
    `- Posted rows: ${ops.summary.posted}`,
    `- Measured rows: ${ops.summary.measured}`,
    `- Pending feedback: ${ops.summary.pending}`,
    `- Measured accounts: ${ops.summary.measuredAccounts}/${ops.summary.activeAccounts}`,
    `- Top account: ${ops.summary.topAccount || "none"}`,
    `- Top angle: ${ops.summary.topAngle || "none"}`,
    "",
    "Feedback actions:",
    ops.actionList.length ? ops.actionList.map((item) => `- ${item.title}: ${item.detail}`).join("\n") : "- No feedback actions yet."
  ].join("\n");
}

function renderFeedbackLearningSignals(signals) {
  if (!signals) return "No feedback learning signal generated.";
  const topAccounts = (signals.topAccounts ?? []).slice(0, 3).map((item) => `- ${item.displayName}: avg ${item.averageScore}, measured ${item.measured}, top ${item.topVariant || "none"}`).join("\n");
  const topAngles = (signals.topAngles ?? []).slice(0, 3).map((item) => `- ${item.variantType}: avg ${item.averageScore}, measured ${item.measured}, clicks ${item.clicks}, bookmarks ${item.bookmarks}`).join("\n");
  const topSources = (signals.topSources ?? []).slice(0, 3).map((item) => `- ${item.sourceName}: avg ${item.averageScore}, measured ${item.measured}`).join("\n");
  return [
    `- Status: ${signals.status}`,
    `- Confidence: ${signals.confidence}`,
    `- Headline: ${signals.headline}`,
    `- Ready to guide tomorrow: ${signals.summary?.readyToGuideTomorrow ? "yes" : "no"}`,
    `- Rule: ${signals.tomorrowStrategy?.rule ?? "Feedback never overrides quality gates."}`,
    "",
    "Tomorrow strategy:",
    ...((signals.tomorrowStrategy?.actions ?? []).map((item) => `- ${item}`)),
    "",
    "Top accounts:",
    topAccounts || "- No measured account yet.",
    "",
    "Top angles:",
    topAngles || "- No measured angle yet.",
    "",
    "Top sources:",
    topSources || "- No measured source yet."
  ].join("\n");
}

function renderActionList(actions) {
  if (!actions.length) return "No clear action today. Better to skip than force weak posts.";

  return actions.map((action, index) => {
    return `${index + 1}. ${action.type}: ${action.detail}`;
  }).join("\n");
}

function renderFreshnessDiagnostic(report) {
  if (!report) return "No freshness report available.";
  const stats = report.stats ?? {};
  const watchlist = report.freshFeedWatchlist?.length
    ? `\n\nFresh feed watchlist:\n${report.freshFeedWatchlist.map((item, index) => {
      const age = item.ageDays === null ? "unknown age" : `${item.ageDays} day${item.ageDays === 1 ? "" : "s"} old`;
      return `${index + 1}. ${item.name} — ${age} — score ${item.score}${item.inTopPicks ? " — in top picks" : ""}`;
    }).join("\n")}`
    : "";

  return [
    `- Feed fresh today: ${stats.freshToday ?? 0}`,
    `- Feed fresh 48h: ${stats.fresh48 ?? 0}`,
    `- Feed fresh 7d: ${stats.fresh7d ?? 0}`,
    `- Older/unknown: ${(stats.older ?? 0) + (stats.unknownPublished ?? 0)}`,
    `- Fresh but generic news: ${stats.lowOriginalityNews ?? 0}`,
    `- Fresh top-pick candidates: ${stats.topPickFreshPostCandidates ?? 0}`,
    `- Diagnosis: ${report.diagnosis}`,
    `- Recommendation: ${report.recommendation}`
  ].join("\n") + watchlist;
}

function renderAccountRouting(strategy) {
  if (!strategy?.accounts?.length) return "No account profiles configured yet.";
  const recommendations = strategy.toolRecommendations?.length
    ? `\n\nRecommended routing:\n${strategy.toolRecommendations.map((item, index) => `${index + 1}. ${item.toolName} → ${item.primary?.displayName ?? "No account"} (${item.reason})`).join("\n")}`
    : "";
  return [
    `- Mode: ${strategy.mode}`,
    `- Active accounts: ${strategy.summary.activeAccounts}/${strategy.summary.totalAccounts}`,
    `- Auth ready: ${strategy.authReady ? "yes" : "no — planning only"}`,
    `- Same-tool cooldown: ${strategy.sameToolCooldownDays} days`,
    `- Same-copy cooldown: ${strategy.sameCopyCooldownDays} days`
  ].join("\n") + recommendations;
}

function renderScoreBreakdown(scoreBreakdown) {
  return [
    `painScore ${scoreBreakdown.painScore}`,
    `nicheScore ${scoreBreakdown.nicheScore}`,
    `affiliateScore ${scoreBreakdown.affiliateScore}`,
    `contentScore ${scoreBreakdown.contentScore}`,
    `noveltyScore ${scoreBreakdown.noveltyScore}`,
    `riskScore ${scoreBreakdown.riskScore ? `-${scoreBreakdown.riskScore}` : "0"}`,
    `originalityPenalty ${scoreBreakdown.originalityPenalty ? `-${scoreBreakdown.originalityPenalty}` : "0"}`,
    `seenPenalty ${scoreBreakdown.seenPenalty ? `-${scoreBreakdown.seenPenalty}` : "0"}`,
    `total ${scoreBreakdown.total}`
  ].join(" | ");
}

function renderToolCard(item) {
  const affiliateStatus = buildAffiliateStatus(item);
  const seenLine = item.seenBefore
    ? `Seen before: yes (${item.historyInfo.count} prior record${item.historyInfo.count === 1 ? "" : "s"}, last ${item.historyInfo.lastSeen})`
    : "Seen before: no";
  const copy = item.copyVariants.map((variant) => {
    return `**${formatVariantLabel(variant.label)}**\n${variant.text}\nCheck: ${summarizeLint(variant.lint)}`;
  }).join("\n\n");

  return `### ${item.tool.name}

- Score breakdown: ${renderScoreBreakdown(item.scoreBreakdown)}
- Follow-up action: ${item.followUpAction}
- Product Hunt: ${item.tool.url}
- Published: ${item.tool.published ?? "unknown"}
- Tagline: ${item.tool.tagline || "none"}
- ${seenLine}
- Reason: ${item.reason}
- Recommended account: ${item.accountRecommendation?.primary?.displayName ?? "No account profile"}${item.accountRecommendation?.reason ? ` — ${item.accountRecommendation.reason}` : ""}
- Affiliate status: ${affiliateStatus.text}
- Suggested angle: ${item.angle.audience} want ${item.angle.outcome}; test whether it solves ${item.angle.pain}.

#### X Copy Variants

${copy}`;
}

function formatVariantLabel(label) {
  const labels = {
    shortPost: "short post",
    casualPost: "casual post",
    contrarianAngle: "contrarian angle",
    painPointHook: "pain-point hook",
    threadOpening: "thread opening"
  };

  return labels[label] ?? label;
}

function renderLowPriority(items) {
  if (!items.length) return "No low-priority tools found in this feed.";

  return items.map((item) => {
    const seen = item.seenBefore ? " Seen before." : "";
    return `- ${item.tool.name}: ${item.score} points, ${item.followUpAction}.${seen} Reason: ${item.reason}`;
  }).join("\n");
}

function renderAffiliateQueue(items) {
  if (!items.length) return "No high-affiliate-score tools without a configured affiliate link today.";

  return items.map((item, index) => {
    return `${index + 1}. ${item.tool.name} — affiliateScore ${item.scoreBreakdown.affiliateScore}, total ${item.score}. No affiliate link yet — research needed. ${item.tool.url}`;
  }).join("\n");
}
