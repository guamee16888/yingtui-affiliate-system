import { calculateEngagement } from "./scoring.mjs";
import { normalizeAccountConfig } from "./account-system.mjs";

const MAX_X_POST_CHARS = 280;

export function buildFeedbackOps({ date, latest = null, feedback = { entries: [] }, accountPosts = { items: [] }, accountConfig = { accounts: [] } }) {
  const entries = feedback.entries ?? [];
  const posted = entries.filter((entry) => entry.posted !== false);
  const measured = posted.filter(hasRecordedMetrics);
  const pending = posted.filter((entry) => !hasRecordedMetrics(entry));
  const config = normalizeAccountConfig(accountConfig);
  const activeAccounts = config.accounts.filter((account) => account.active);
  const toolById = new Map((latest?.tools ?? []).map((tool) => [tool.toolId, tool]));
  const unlinkedPosts = (accountPosts.items ?? []).filter((post) => post.feedbackId && !entries.some((entry) => entry.id === post.feedbackId));
  const accountStats = buildAccountStats(activeAccounts, posted, measured, pending);
  const angleStats = buildVariantStats(posted, measured);
  const sourceStats = buildSourceStats(posted, measured, toolById);
  const debtGate = buildFeedbackDebtGate({ posted, measured, pending, activeAccounts, accountStats });
  const seedTestPlan = buildFeedbackSeedTestPlan({ latest, posted, accountPosts, activeAccounts, debtGate });
  const measuredAccounts = accountStats.filter((item) => item.measured > 0).length;
  const measuredRate = posted.length ? measured.length / posted.length : 0;
  const accountLearningRate = activeAccounts.length ? measuredAccounts / activeAccounts.length : 0;
  const learningScore = Math.round(Math.min(100, measuredRate * 65 + accountLearningRate * 25 + Math.min(10, measured.length)));

  return {
    date,
    generatedAt: new Date().toISOString(),
    summary: {
      posted: posted.length,
      measured: measured.length,
      pending: pending.length,
      activeAccounts: activeAccounts.length,
      measuredAccounts,
      unlinkedPostRecords: unlinkedPosts.length,
      learningScore,
      seedTests: seedTestPlan.items.length,
      feedbackGateStatus: debtGate.status,
      maxNewPostsBeforeMetrics: debtGate.maxNewPostsBeforeMetrics,
      topAccount: accountStats.find((item) => item.measured > 0)?.displayName ?? "",
      topAngle: angleStats.find((item) => item.measured > 0)?.variantType ?? "",
      topSource: sourceStats.find((item) => item.measured > 0)?.sourceName ?? ""
    },
    debtGate,
    seedTestPlan,
    actionList: feedbackOpsActions({ pending, unlinkedPosts, accountStats, angleStats, sourceStats, activeAccounts, debtGate, seedTestPlan }),
    pendingFeedback: pending
      .sort((a, b) => pendingAgeHours(b) - pendingAgeHours(a))
      .slice(0, 20)
      .map((entry) => feedbackEntrySummary(entry)),
    accountStats,
    angleStats,
    sourceStats,
    learningSignals: buildFeedbackLearningSignalsFromStats({
      summary: {
        posted: posted.length,
        measured: measured.length,
        pending: pending.length,
        learningScore
      },
      debtGate,
      accountStats,
      angleStats,
      sourceStats,
      pendingFeedback: pending.map((entry) => feedbackEntrySummary(entry))
    }),
    notes: [
      posted.length ? `${pending.length}/${posted.length} posted rows still need metrics.` : "No posted feedback rows yet.",
      measured.length ? "Use measured account, angle, and source winners to choose tomorrow's posts." : "The system cannot learn until at least one posted row has impressions.",
      unlinkedPosts.length ? `${unlinkedPosts.length} account post records are missing matching feedback rows.` : "Account post records and feedback rows are linked."
    ]
  };
}

export function buildFeedbackLearningSignals(ops = null) {
  if (!ops) {
    return buildFeedbackLearningSignalsFromStats({
      summary: {},
      debtGate: null,
      accountStats: [],
      angleStats: [],
      sourceStats: [],
      pendingFeedback: []
    });
  }
  return buildFeedbackLearningSignalsFromStats({
    summary: ops.summary ?? {},
    debtGate: ops.debtGate ?? null,
    accountStats: ops.accountStats ?? [],
    angleStats: ops.angleStats ?? [],
    sourceStats: ops.sourceStats ?? [],
    pendingFeedback: ops.pendingFeedback ?? []
  });
}

function buildFeedbackLearningSignalsFromStats({
  summary = {},
  debtGate = null,
  accountStats = [],
  angleStats = [],
  sourceStats = [],
  pendingFeedback = []
} = {}) {
  const measured = Number(summary.measured ?? 0);
  const pending = Number(summary.pending ?? 0);
  const topAccounts = accountStats
    .filter((item) => item.measured > 0)
    .sort((a, b) => b.averageScore - a.averageScore || b.engagementScore - a.engagementScore || b.measured - a.measured)
    .slice(0, 3)
    .map((item) => ({
      accountId: item.accountId,
      displayName: item.displayName,
      category: item.category || "",
      measured: item.measured,
      averageScore: item.averageScore,
      engagementScore: item.engagementScore,
      topVariant: item.topVariant || ""
    }));
  const topAngles = angleStats
    .filter((item) => item.measured > 0)
    .sort((a, b) => b.averageScore - a.averageScore || b.engagementScore - a.engagementScore || b.measured - a.measured)
    .slice(0, 3)
    .map((item) => ({
      variantType: item.variantType,
      measured: item.measured,
      averageScore: item.averageScore,
      engagementScore: item.engagementScore,
      clicks: item.clicks,
      bookmarks: item.bookmarks
    }));
  const topSources = sourceStats
    .filter((item) => item.measured > 0)
    .sort((a, b) => b.averageScore - a.averageScore || b.engagementScore - a.engagementScore || b.measured - a.measured)
    .slice(0, 3)
    .map((item) => ({
      sourceId: item.sourceId || "",
      sourceName: item.sourceName,
      sourceType: item.sourceType || "",
      circle: item.circle || "",
      measured: item.measured,
      averageScore: item.averageScore,
      engagementScore: item.engagementScore,
      bestTool: item.bestTool ?? null
    }));
  const status = learningSignalStatus({ measured, pending, debtGate });
  const confidence = measured >= 10 ? "strong" : measured >= 5 ? "usable" : measured > 0 ? "early" : "none";

  return {
    status,
    confidence,
    headline: learningSignalHeadline({ status, measured, pending, debtGate }),
    summary: {
      posted: Number(summary.posted ?? 0),
      measured,
      pending,
      learningScore: Number(summary.learningScore ?? 0),
      readyToGuideTomorrow: measured >= 5 && debtGate?.severity !== "bad",
      maxNewPostsBeforeMetrics: Number(debtGate?.maxNewPostsBeforeMetrics ?? summary.maxNewPostsBeforeMetrics ?? 0)
    },
    topAccounts,
    topAngles,
    topSources,
    scoringHints: {
      maxBoostPerTool: 3,
      accountIds: topAccounts.map((item) => item.accountId).filter(Boolean),
      variantTypes: topAngles.map((item) => item.variantType).filter(Boolean),
      sourceNames: topSources.map((item) => item.sourceName).filter(Boolean),
      sourceIds: topSources.map((item) => item.sourceId).filter(Boolean),
      circles: topSources.map((item) => item.circle).filter(Boolean)
    },
    pendingAlerts: pendingFeedback.slice(0, 5).map((item) => ({
      id: item.id,
      toolName: item.toolName,
      accountId: item.accountId,
      accountName: item.accountName,
      variantType: item.variantType,
      ageHours: item.ageHours
    })),
    tomorrowStrategy: learningTomorrowStrategy({ status, confidence, topAccounts, topAngles, topSources, pending, measured })
  };
}

function learningSignalStatus({ measured, pending, debtGate }) {
  if (!measured && pending) return "metrics_blocked";
  if (!measured) return "needs_seed";
  if (debtGate?.severity === "bad") return "clear_feedback_debt";
  if (measured < 5) return "early_learning";
  return "guiding_tomorrow";
}

function learningSignalHeadline({ status, measured, pending, debtGate }) {
  if (status === "metrics_blocked") return `You have ${pending} posted row${pending === 1 ? "" : "s"} without metrics. Fill X Analytics before posting more.`;
  if (status === "needs_seed") return "No measured feedback yet. Post a tiny seed batch, then import X Analytics.";
  if (status === "clear_feedback_debt") return debtGate?.headline || "Clear pending feedback before adding more posts.";
  if (status === "early_learning") return `${measured} measured post${measured === 1 ? "" : "s"} found. Treat winners as hints, not proof.`;
  return "Measured feedback is ready to guide tomorrow's account, angle, and source choices.";
}

function learningTomorrowStrategy({ status, confidence, topAccounts, topAngles, topSources, pending, measured }) {
  const actions = [];
  if (status === "metrics_blocked" || status === "clear_feedback_debt") {
    actions.push(`Fill ${pending} pending X Analytics row${pending === 1 ? "" : "s"} before adding volume.`);
  }
  if (status === "needs_seed") {
    actions.push("Run only 2-3 manually confirmed seed posts before trusting rankings.");
  }
  if (topAccounts[0]) {
    actions.push(`Give ${topAccounts[0].displayName} first look tomorrow, but keep per-account cooldowns.`);
  }
  if (topAngles[0]) {
    actions.push(`Test more ${topAngles[0].variantType} copy only when the candidate is fresh and specific.`);
  }
  if (topSources[0]) {
    actions.push(`Prioritize ${topSources[0].sourceName} candidates if they still pass quality gates.`);
  }
  if (!actions.length) actions.push("Collect measured feedback before changing tomorrow's strategy.");

  return {
    confidence,
    rule: "Feedback can nudge ranking, but cannot override freshness, quality, account cooldown, or manual confirmation gates.",
    actions: actions.slice(0, 4),
    measuredBasis: measured
  };
}

export function renderFeedbackOpsMarkdown(ops) {
  if (!ops) return "# Feedback Operating Mode\n\nNo feedback operating report available. Run npm run feedback-ops.\n";

  return `# Feedback Operating Mode - ${ops.date}

- Learning score: ${ops.summary.learningScore}/100
- Posted rows: ${ops.summary.posted}
- Measured rows: ${ops.summary.measured}
- Pending feedback: ${ops.summary.pending}
- Seed test candidates: ${ops.summary.seedTests ?? 0}
- Feedback gate: ${ops.debtGate?.title ?? ops.summary.feedbackGateStatus ?? "unknown"}
- Max new posts before metrics: ${ops.debtGate?.maxNewPostsBeforeMetrics ?? ops.summary.maxNewPostsBeforeMetrics ?? 0}
- Measured accounts: ${ops.summary.measuredAccounts}/${ops.summary.activeAccounts}
- Top account: ${ops.summary.topAccount || "none"}
- Top angle: ${ops.summary.topAngle || "none"}
- Top source: ${ops.summary.topSource || "none"}

## Today Actions

${ops.actionList.length ? ops.actionList.map((item, index) => `${index + 1}. ${item.title} — ${item.detail}`).join("\n") : "No feedback actions yet."}

## Feedback Debt Gate

${renderFeedbackDebtGateMarkdown(ops.debtGate)}

## Seed Test Plan

${renderSeedTestPlanMarkdown(ops.seedTestPlan)}

## Pending Feedback

${ops.pendingFeedback.length ? ops.pendingFeedback.slice(0, 10).map((item) => `- ${item.toolName} — ${item.accountName || item.accountId || "no account"} — ${item.variantType} — ${item.ageHours}h old`).join("\n") : "No pending feedback rows."}

## Account Performance

${ops.accountStats.slice(0, 10).map((item) => `- ${item.displayName}: measured ${item.measured}/${item.posts}, pending ${item.pending}, score ${item.engagementScore}, clicks ${item.clicks}, bookmarks ${item.bookmarks}`).join("\n") || "No account feedback yet."}

## Angle Performance

${ops.angleStats.slice(0, 8).map((item) => `- ${item.variantType}: measured ${item.measured}/${item.posts}, score ${item.engagementScore}, avg ${item.averageScore}, clicks ${item.clicks}, bookmarks ${item.bookmarks}`).join("\n") || "No angle feedback yet."}

## Source Performance

${ops.sourceStats.slice(0, 8).map((item) => `- ${item.sourceName}: measured ${item.measured}/${item.posts}, score ${item.engagementScore}, avg ${item.averageScore}, clicks ${item.clicks}, bookmarks ${item.bookmarks}`).join("\n") || "No source feedback yet."}

## Notes

${ops.notes.map((item) => `- ${item}`).join("\n")}
`;
}

export function buildLearningLoop({ ops = null }) {
  if (!ops) {
    return {
      status: "missing",
      stage: "missing_report",
      summary: {},
      nextActions: ["Run npm run feedback-ops first."],
      seedTests: [],
      pendingFeedback: [],
      feedbackCsvTemplate: feedbackCsvTemplate([]),
      workflow: learningWorkflow("missing_report")
    };
  }
  const summary = ops.summary ?? {};
  const posted = Number(summary.posted ?? 0);
  const measured = Number(summary.measured ?? 0);
  const pending = Number(summary.pending ?? 0);
  const gate = ops.debtGate;
  const stage = learningStage({ posted, measured, pending, gate });
  const seedTests = (ops.seedTestPlan?.items ?? []).map(seedLearningItem);
  const pendingFeedback = (ops.pendingFeedback ?? []).map(pendingLearningItem);
  const csvRows = pendingFeedback.length ? pendingFeedback : seedTests;

  return {
    date: ops.date,
    generatedAt: new Date().toISOString(),
    status: stage.status,
    stage: stage.id,
    headline: stage.headline,
    summary: {
      learningScore: Number(summary.learningScore ?? 0),
      posted,
      measured,
      pending,
      activeAccounts: Number(summary.activeAccounts ?? 0),
      measuredAccounts: Number(summary.measuredAccounts ?? 0),
      safeNewPosts: Number(gate?.maxNewPostsBeforeMetrics ?? summary.maxNewPostsBeforeMetrics ?? 0),
      seedTests: seedTests.length,
      topAccount: summary.topAccount || "",
      topAngle: summary.topAngle || "",
      topSource: summary.topSource || ""
    },
    gate: gate ? {
      status: gate.status,
      severity: gate.severity,
      title: gate.title,
      headline: gate.headline,
      maxNewPostsBeforeMetrics: gate.maxNewPostsBeforeMetrics,
      pendingLimit: gate.pendingLimit,
      measuredRate: gate.measuredRate,
      oldestPendingHours: gate.oldestPendingHours,
      nextActions: gate.nextActions ?? []
    } : null,
    workflow: learningWorkflow(stage.id),
    nextActions: learningNextActions({ stage: stage.id, ops }),
    seedTests,
    pendingFeedback,
    feedbackCsvTemplate: feedbackCsvTemplate(csvRows),
    afterPosting: ops.seedTestPlan?.afterPosting ?? []
  };
}

export function renderLearningLoopMarkdown(loop) {
  if (!loop) return "# Learning Loop Starter\n\nNo learning loop report available. Run npm run learning-loop.\n";
  return `# Learning Loop Starter - ${loop.date ?? "unknown"}

- Status: ${loop.status}
- Stage: ${loop.stage}
- Headline: ${loop.headline ?? ""}
- Learning score: ${loop.summary?.learningScore ?? 0}/100
- Posted: ${loop.summary?.posted ?? 0}
- Measured: ${loop.summary?.measured ?? 0}
- Pending: ${loop.summary?.pending ?? 0}
- Safe new posts: ${loop.summary?.safeNewPosts ?? 0}
- Seed tests: ${loop.summary?.seedTests ?? 0}

## Next Actions

${(loop.nextActions ?? []).map((item, index) => `${index + 1}. ${item}`).join("\n") || "No actions."}

## Workflow

${(loop.workflow ?? []).map((item, index) => `${index + 1}. ${item.title} — ${item.detail}`).join("\n")}

## Seed Tests

${(loop.seedTests ?? []).length ? loop.seedTests.map((item, index) => `${index + 1}. ${item.toolName} — ${item.accountName} — ${item.variantType}
   ${item.copyText}`).join("\n") : "No seed tests available."}

## Pending Feedback

${(loop.pendingFeedback ?? []).length ? loop.pendingFeedback.map((item, index) => `${index + 1}. ${item.toolName} — ${item.accountName || item.accountId || "no account"} — ${item.variantType} — ${item.ageHours}h old`).join("\n") : "No pending feedback."}

## Feedback CSV Template

\`\`\`csv
${loop.feedbackCsvTemplate ?? ""}
\`\`\`
`;
}

export function buildFeedbackSeedTestPlan({ latest = null, posted = [], accountPosts = { items: [] }, activeAccounts = [], debtGate = null }) {
  const maxTests = Math.max(0, Math.min(3, Number(debtGate?.maxNewPostsBeforeMetrics ?? 3)));
  const postedToolIds = new Set([
    ...posted.map((entry) => entry.toolId).filter(Boolean),
    ...(accountPosts.items ?? []).map((post) => post.toolId).filter(Boolean)
  ]);
  const activeById = new Map(activeAccounts.map((account) => [account.id, account]));
  const usedAccounts = new Set();
  const variantOrder = ["shortPost", "painPointHook", "casualPost", "threadOpening", "contrarianAngle"];

  if (!maxTests) {
    return seedPlan({
      status: "blocked",
      maxTests,
      items: [],
      reason: debtGate?.headline || "Feedback gate does not allow new posts yet."
    });
  }

  const candidates = (latest?.tools ?? [])
    .map((tool) => seedCandidate(tool, latest, activeById, variantOrder, postedToolIds))
    .filter(Boolean)
    .sort((a, b) => b.priorityScore - a.priorityScore || a.toolName.localeCompare(b.toolName));
  const items = [];

  for (const candidate of candidates) {
    if (items.length >= maxTests) break;
    if (candidate.accountId && usedAccounts.has(candidate.accountId) && activeAccounts.length >= maxTests) continue;
    candidate.position = items.length + 1;
    const preferredVariant = variantOrder[items.length % variantOrder.length];
    const selectedVariant = selectPostableVariant(candidate.copyVariants, variantOrder, preferredVariant);
    if (!selectedVariant) continue;
    candidate.variantType = selectedVariant.variantType;
    candidate.copyText = selectedVariant.copyText;
    candidate.checklist = seedChecklist(candidate);
    items.push(candidate);
    if (candidate.accountId) usedAccounts.add(candidate.accountId);
  }

  if (!items.length) {
    return seedPlan({
      status: "no_candidates",
      maxTests,
      items,
      reason: "No fresh, unposted, low-risk candidates with account routing and copy were available."
    });
  }

  return seedPlan({
    status: "ready",
    maxTests,
    items,
    reason: `Run ${items.length} manually reviewed seed test${items.length === 1 ? "" : "s"}, then import X Analytics before scaling.`
  });
}

function seedPlan({ status, maxTests, items, reason }) {
  return {
    status,
    maxTests,
    plannedTests: items.length,
    rule: "Manual-confirm only. Post a tiny batch, mark each post with accountId, then import X Analytics before scaling.",
    reason,
    items,
    afterPosting: [
      "Click Mark posted or publish through the confirmation dialog so accountId is recorded.",
      "Wait until X Analytics has impressions.",
      "Paste the analytics table into Feedback import.",
      "Do not scale beyond the gate until measured feedback exists."
    ]
  };
}

function seedCandidate(tool, latest, activeById, variantOrder, postedToolIds) {
  if (!tool?.toolId || postedToolIds.has(tool.toolId)) return null;
  if (tool.seenBefore || tool.followUpAction === "skip") return null;
  if (tool.sourceQuality?.isNoisy) return null;
  const freshness = seedFreshness(tool, latest?.generatedAt);
  if (freshness.kind !== "fresh") return null;
  if (Number(tool.scoreBreakdown?.riskScore ?? 0) >= 8) return null;
  const accountId = tool.accountRecommendation?.primary?.accountId ?? "";
  const account = activeById.get(accountId);
  if (!account) return null;
  const copyVariants = normalizeCopyVariants(tool.copyVariants);
  const selectedVariant = selectPostableVariant(copyVariants, variantOrder);
  if (!selectedVariant) return null;
  const affiliateScore = Number(tool.scoreBreakdown?.affiliateScore ?? 0);
  const contentScore = Number(tool.scoreBreakdown?.contentScore ?? 0);
  const riskScore = Number(tool.scoreBreakdown?.riskScore ?? 0);
  const priorityScore = Number(tool.score ?? 0) * 2
    + affiliateScore * 4
    + contentScore * 3
    + (freshness.label === "Fresh today" ? 12 : 6)
    - riskScore * 5;

  return {
    toolId: tool.toolId,
    toolName: tool.name,
    toolUrl: tool.url,
    score: Number(tool.score ?? 0),
    priorityScore: Math.round(priorityScore),
    followUpAction: tool.followUpAction,
    sourceName: tool.sourceName ?? "",
    freshnessLabel: freshness.label,
    accountId: account.id,
    accountName: account.displayName,
    accountCategory: account.category,
    variantType: selectedVariant.variantType,
    copyText: selectedVariant.copyText,
    copyVariants,
    reason: `Fresh ${tool.sourceName || "candidate"} routed to ${account.displayName}; score ${tool.score}, risk ${riskScore}.`,
    suggestedAngle: tool.suggestedAngle || "",
    affiliateStatus: tool.affiliateStatus || "research_needed"
  };
}

function selectPostableVariant(copyVariants, variantOrder, preferredVariant = "") {
  const orderedVariants = uniqueDisplayNames([
    preferredVariant,
    ...variantOrder,
    ...Object.keys(copyVariants ?? {})
  ]);
  const variantType = orderedVariants.find((variant) => {
    const text = copyVariants?.[variant];
    return text && xPostLength(text) <= MAX_X_POST_CHARS;
  });
  return variantType ? { variantType, copyText: copyVariants[variantType] } : null;
}

function xPostLength(text) {
  return String(text ?? "").trim().length;
}

function seedFreshness(tool, generatedAt) {
  const ageHours = productAgeHours(tool.published, generatedAt);
  if (ageHours !== null && ageHours <= 24) return { kind: "fresh", label: "Fresh today" };
  if (ageHours !== null && ageHours <= 48) return { kind: "fresh", label: "Fresh 48h" };
  return { kind: "stale", label: "Older but useful" };
}

function productAgeHours(published, generatedAt) {
  const date = new Date(published);
  const reference = generatedAt ? new Date(generatedAt) : new Date();
  if (Number.isNaN(date.getTime()) || Number.isNaN(reference.getTime())) return null;
  return Math.max(0, (reference.getTime() - date.getTime()) / 3600000);
}

function normalizeCopyVariants(copyVariants) {
  if (Array.isArray(copyVariants)) {
    return copyVariants.reduce((variants, variant) => {
      if (variant?.label && variant?.text) variants[variant.label] = variant.text;
      return variants;
    }, {});
  }
  return copyVariants ?? {};
}

function seedChecklist(candidate) {
  return [
    `Account: ${candidate.accountName}`,
    `Variant: ${candidate.variantType}`,
    `Freshness: ${candidate.freshnessLabel}`,
    "Confirm manually before publish.",
    "Record feedback row immediately after posting."
  ];
}

function renderSeedTestPlanMarkdown(plan) {
  if (!plan) return "No seed test plan available.";
  const header = [
    `- Status: ${plan.status}`,
    `- Max tests: ${plan.maxTests}`,
    `- Planned tests: ${plan.plannedTests}`,
    `- Rule: ${plan.rule}`,
    `- Reason: ${plan.reason}`
  ].join("\n");
  const items = plan.items.length
    ? plan.items.map((item, index) => `${index + 1}. ${item.toolName} — ${item.accountName} — ${item.variantType} — priority ${item.priorityScore}
   ${item.copyText}`).join("\n")
    : "No seed tests.";
  return `${header}\n\n${items}\n\nAfter posting:\n${plan.afterPosting.map((item, index) => `${index + 1}. ${item}`).join("\n")}`;
}

function buildAccountStats(accounts, posted, measured, pending) {
  const byAccount = new Map(accounts.map((account) => [account.id, {
    accountId: account.id,
    displayName: account.displayName,
    category: account.category,
    posts: 0,
    measured: 0,
    pending: 0,
    engagementScore: 0,
    impressions: 0,
    likes: 0,
    bookmarks: 0,
    replies: 0,
    reposts: 0,
    clicks: 0,
    profileVisits: 0,
    topVariant: ""
  }]));

  for (const entry of posted) {
    const accountId = entry.accountId || "unknown";
    const stats = byAccount.get(accountId) ?? createUnknownAccountStats(entry);
    stats.posts += 1;
    if (!byAccount.has(accountId)) byAccount.set(accountId, stats);
  }

  for (const entry of pending) {
    const stats = byAccount.get(entry.accountId || "unknown") ?? createUnknownAccountStats(entry);
    stats.pending += 1;
    if (!byAccount.has(stats.accountId)) byAccount.set(stats.accountId, stats);
  }

  const variantsByAccount = new Map();
  for (const entry of measured) {
    const stats = byAccount.get(entry.accountId || "unknown") ?? createUnknownAccountStats(entry);
    applyMetrics(stats, entry);
    stats.measured += 1;
    const variantKey = `${stats.accountId}:${entry.variantType || "unknown"}`;
    variantsByAccount.set(variantKey, (variantsByAccount.get(variantKey) ?? 0) + feedbackScore(entry));
    if (!byAccount.has(stats.accountId)) byAccount.set(stats.accountId, stats);
  }

  for (const stats of byAccount.values()) {
    stats.averageScore = average(stats.engagementScore, stats.measured);
    stats.completionRate = stats.posts ? round(stats.measured / stats.posts) : 0;
    stats.topVariant = topVariantForAccount(stats.accountId, variantsByAccount);
  }

  return [...byAccount.values()]
    .sort((a, b) => b.engagementScore - a.engagementScore || b.measured - a.measured || b.posts - a.posts || a.displayName.localeCompare(b.displayName));
}

function buildVariantStats(posted, measured) {
  const map = new Map();
  for (const entry of posted) {
    const key = entry.variantType || "unknown";
    const stats = map.get(key) ?? createGroupStats({ variantType: key });
    stats.posts += 1;
    if (!hasRecordedMetrics(entry)) stats.pending += 1;
    map.set(key, stats);
  }
  for (const entry of measured) {
    const key = entry.variantType || "unknown";
    const stats = map.get(key) ?? createGroupStats({ variantType: key });
    applyMetrics(stats, entry);
    stats.measured += 1;
    map.set(key, stats);
  }
  return finalizeGroupStats([...map.values()], "variantType");
}

function buildSourceStats(posted, measured, toolById) {
  const map = new Map();
  for (const entry of posted) {
    const tool = toolById.get(entry.toolId);
    const key = tool?.sourceId || entry.sourceId || tool?.sourceName || entry.sourceName || "unknown_source";
    const stats = map.get(key) ?? createGroupStats({
      sourceId: tool?.sourceId || entry.sourceId || "",
      sourceName: tool?.sourceName || entry.sourceName || "Unknown source",
      sourceType: tool?.sourceType || entry.sourceType || "",
      circle: tool?.circle || entry.circle || ""
    });
    stats.posts += 1;
    if (!hasRecordedMetrics(entry)) stats.pending += 1;
    map.set(key, stats);
  }
  for (const entry of measured) {
    const tool = toolById.get(entry.toolId);
    const key = tool?.sourceId || entry.sourceId || tool?.sourceName || entry.sourceName || "unknown_source";
    const stats = map.get(key) ?? createGroupStats({
      sourceId: tool?.sourceId || entry.sourceId || "",
      sourceName: tool?.sourceName || entry.sourceName || "Unknown source",
      sourceType: tool?.sourceType || entry.sourceType || "",
      circle: tool?.circle || entry.circle || ""
    });
    applyMetrics(stats, entry);
    stats.measured += 1;
    if (!stats.bestTool || feedbackScore(entry) > stats.bestTool.score) {
      stats.bestTool = {
        toolName: entry.toolName,
        toolUrl: entry.toolUrl,
        score: feedbackScore(entry)
      };
    }
    map.set(key, stats);
  }
  return finalizeGroupStats([...map.values()], "sourceName");
}

function feedbackOpsActions({ pending, unlinkedPosts, accountStats, angleStats, sourceStats, activeAccounts, debtGate, seedTestPlan }) {
  const actions = [];
  const pendingByAccount = accountStats.filter((item) => item.pending > 0).sort((a, b) => b.pending - a.pending)[0];
  const topAngle = angleStats.find((item) => item.measured > 0);
  const topSource = sourceStats.find((item) => item.measured > 0);
  const emptyAccounts = accountStats.filter((item) => item.posts === 0 && activeAccounts.some((account) => account.id === item.accountId)).slice(0, 3);

  if (debtGate) actions.push({
    type: "feedback_debt_gate",
    title: debtGate.title,
    detail: `${debtGate.headline} Max new posts before metrics: ${debtGate.maxNewPostsBeforeMetrics}.`
  });
  if (pending.length) actions.push({
    type: "fill_metrics",
    title: `补 ${pending.length} 条 X Analytics 数据`,
    detail: pendingByAccount ? `优先补 ${pendingByAccount.displayName}，还有 ${pendingByAccount.pending} 条没数据。` : "先清空待补反馈。"
  });
  if (unlinkedPosts.length) actions.push({
    type: "repair_records",
    title: `修复 ${unlinkedPosts.length} 条发帖记录`,
    detail: "这些 account-posts 没有匹配 feedback row，后续会影响账号冷却和学习。"
  });
  if (topAngle) actions.push({
    type: "double_down_angle",
    title: `继续测试 ${topAngle.variantType}`,
    detail: `当前 angle score ${topAngle.engagementScore}，平均 ${topAngle.averageScore}。`
  });
  if (topSource) actions.push({
    type: "double_down_source",
    title: `继续观察 ${topSource.sourceName}`,
    detail: `当前来源 score ${topSource.engagementScore}，最佳工具 ${topSource.bestTool?.toolName || "暂无"}.`
  });
  const seedAccounts = uniqueDisplayNames((seedTestPlan?.items ?? []).map((item) => item.accountName || item.accountId));
  if (seedAccounts.length) {
    actions.push({
      type: "cover_accounts",
      title: `给 ${seedAccounts.length} 个账号补第一条测试`,
      detail: seedAccounts.join(" / ")
    });
  } else if (emptyAccounts.length) actions.push({
    type: "cover_accounts",
    title: `给 ${emptyAccounts.length} 个账号补第一条测试`,
    detail: emptyAccounts.map((item) => item.displayName).join(" / ")
  });
  if (!actions.length) actions.push({
    type: "start_feedback_loop",
    title: "先发少量新鲜候选并标记账号",
    detail: "至少拿到 3-5 条带 impressions 的反馈，系统才会开始有学习能力。"
  });

  return actions.slice(0, 5);
}

function buildFeedbackDebtGate({ posted, measured, pending, activeAccounts, accountStats }) {
  const activeCount = activeAccounts.length;
  const pendingLimit = Math.max(3, Math.ceil(activeCount * 0.25));
  const pendingRate = posted.length ? round(pending.length / posted.length) : 0;
  const measuredRate = posted.length ? round(measured.length / posted.length) : 0;
  const oldestPendingHours = pending.reduce((max, entry) => Math.max(max, pendingAgeHours(entry)), 0);
  const accountDebt = accountStats
    .filter((item) => item.pending > 0)
    .sort((a, b) => b.pending - a.pending || b.posts - a.posts || a.displayName.localeCompare(b.displayName))
    .slice(0, 8)
    .map((item) => ({
      accountId: item.accountId,
      displayName: item.displayName,
      pending: item.pending,
      posts: item.posts,
      measured: item.measured,
      completionRate: item.completionRate
    }));
  const accountsMissingMeasured = accountStats
    .filter((item) => item.posts > 0 && item.measured === 0)
    .slice(0, 8)
    .map((item) => ({
      accountId: item.accountId,
      displayName: item.displayName,
      posts: item.posts,
      pending: item.pending
    }));

  const base = {
    pendingLimit,
    pendingRate,
    measuredRate,
    oldestPendingHours,
    accountDebt,
    accountsMissingMeasured
  };

  if (!posted.length) {
    return debtGate({
      ...base,
      status: "seed_test",
      severity: "warn",
      title: "Seed the feedback loop",
      headline: "Start with a tiny manually reviewed batch before scaling.",
      maxNewPostsBeforeMetrics: 3,
      nextActions: [
        "Post 3 fresh candidates at most.",
        "Mark each post with accountId immediately.",
        "Wait for X Analytics, then import impressions and engagement."
      ]
    });
  }

  if (!measured.length && pending.length) {
    return debtGate({
      ...base,
      status: "blocked_no_metrics",
      severity: "bad",
      title: "Pause new posts until metrics exist",
      headline: "You have posted rows, but zero measured feedback. The system cannot learn yet.",
      maxNewPostsBeforeMetrics: 0,
      nextActions: [
        `Fill metrics for ${pending.length} pending posts first.`,
        "Paste X Analytics into the feedback import box.",
        "Do not expand account volume until at least one post has impressions."
      ]
    });
  }

  if (pending.length >= pendingLimit || (pending.length >= 3 && pendingRate >= 0.5)) {
    return debtGate({
      ...base,
      status: "feedback_debt_high",
      severity: "bad",
      title: "Feedback debt is high",
      headline: "Too many posted rows are still missing metrics, so new posting should slow down.",
      maxNewPostsBeforeMetrics: Math.max(0, Math.min(2, pendingLimit - pending.length)),
      nextActions: [
        `Clear pending feedback down below ${pendingLimit}.`,
        accountDebt[0] ? `Start with ${accountDebt[0].displayName}.` : "Start with the oldest pending rows.",
        "Use measured winners before adding more publish volume."
      ]
    });
  }

  if (measured.length < 5) {
    return debtGate({
      ...base,
      status: "controlled_test",
      severity: "warn",
      title: "Controlled test mode",
      headline: "There is some feedback, but not enough to trust account or angle rankings yet.",
      maxNewPostsBeforeMetrics: Math.max(0, Math.min(3, 5 - pending.length)),
      nextActions: [
        "Keep posting small batches only.",
        "Aim for 5 measured posts before repeating an angle heavily.",
        accountsMissingMeasured[0] ? `Get first measured feedback for ${accountsMissingMeasured[0].displayName}.` : "Cover one more account with a measured post."
      ]
    });
  }

  return debtGate({
    ...base,
    status: "healthy_learning",
    severity: "good",
    title: "Feedback loop is learning",
    headline: "Measured feedback is strong enough to guide the next batch.",
    maxNewPostsBeforeMetrics: Math.max(1, Math.min(5, measured.length - pending.length + 1)),
    nextActions: [
      "Use top account and top angle to choose the next batch.",
      "Keep pending feedback below the gate limit.",
      "Promote winners into thread, review page, or affiliate research."
    ]
  });
}

function debtGate(input) {
  return {
    status: input.status,
    severity: input.severity,
    title: input.title,
    headline: input.headline,
    maxNewPostsBeforeMetrics: input.maxNewPostsBeforeMetrics,
    pendingLimit: input.pendingLimit,
    pendingRate: input.pendingRate,
    measuredRate: input.measuredRate,
    oldestPendingHours: input.oldestPendingHours,
    accountDebt: input.accountDebt,
    accountsMissingMeasured: input.accountsMissingMeasured,
    nextActions: input.nextActions
  };
}

function learningStage({ posted, measured, pending, gate }) {
  if (!posted) {
    return {
      id: "seed_batch",
      status: "seed_ready",
      headline: "Start with three manually reviewed seed posts, then mark each one with accountId."
    };
  }
  if (!measured && pending) {
    return {
      id: "metrics_required",
      status: "blocked_until_metrics",
      headline: "You have posted rows, but no X Analytics metrics yet. Fill feedback before posting more."
    };
  }
  if (gate?.severity === "bad") {
    return {
      id: "clear_debt",
      status: "feedback_debt",
      headline: gate.headline
    };
  }
  if (measured < 5) {
    return {
      id: "controlled_learning",
      status: "controlled_test",
      headline: "Keep testing small batches until at least five posts have measured feedback."
    };
  }
  return {
    id: "learning",
    status: "learning",
    headline: "The loop has enough measured feedback to start ranking accounts, angles, and sources."
  };
}

function learningWorkflow(stage) {
  const current = (id) => id === stage ? "current" : "todo";
  return [
    {
      id: "seed_batch",
      status: ["metrics_required", "clear_debt", "controlled_learning", "learning"].includes(stage) ? "done" : current("seed_batch"),
      title: "Post tiny seed batch",
      detail: "Use at most three fresh, low-risk posts and confirm each manually."
    },
    {
      id: "mark_posted",
      status: ["metrics_required", "clear_debt", "controlled_learning", "learning"].includes(stage) ? "done" : "todo",
      title: "Mark posted with accountId",
      detail: "Use the Dashboard button so account routing and cooldown records stay linked."
    },
    {
      id: "metrics_required",
      status: stage === "metrics_required" || stage === "clear_debt" ? "current" : ["controlled_learning", "learning"].includes(stage) ? "done" : "todo",
      title: "Paste X Analytics",
      detail: "Import impressions, likes, bookmarks, replies, reposts, clicks, and profile visits."
    },
    {
      id: "controlled_learning",
      status: stage === "controlled_learning" ? "current" : stage === "learning" ? "done" : "todo",
      title: "Compare account and angle",
      detail: "Use measured winners before repeating an angle or scaling account volume."
    },
    {
      id: "learning",
      status: stage === "learning" ? "current" : "todo",
      title: "Promote winners",
      detail: "Move proven tools into thread, review page, or affiliate research queues."
    }
  ];
}

function learningNextActions({ stage, ops }) {
  if (stage === "seed_batch") {
    return [
      "Post only the seed test items shown below.",
      "Use the publish confirmation dialog or Mark posted button so accountId is saved.",
      "Do not expand beyond the gate until X Analytics is imported."
    ];
  }
  if (stage === "metrics_required" || stage === "clear_debt") {
    const pending = ops.pendingFeedback?.length ?? ops.summary?.pending ?? 0;
    return [
      `Fill metrics for ${pending} pending post${pending === 1 ? "" : "s"} first.`,
      "Paste X Analytics into the CSV import box.",
      "Run npm run feedback-ops after importing metrics."
    ];
  }
  if (stage === "controlled_learning") {
    return [
      "Keep posting small batches only.",
      "Aim for at least five measured posts.",
      "Use top account and top angle as hints, not proof."
    ];
  }
  if (stage === "learning") {
    return [
      "Double down on the best account and angle.",
      "Promote winners into follow-up queues.",
      "Keep pending feedback below the gate limit."
    ];
  }
  return ["Run npm run feedback-ops first."];
}

function seedLearningItem(item) {
  return {
    toolId: item.toolId,
    toolName: item.toolName,
    toolUrl: item.toolUrl,
    accountId: item.accountId,
    accountName: item.accountName,
    variantType: item.variantType,
    copyText: item.copyText,
    priorityScore: item.priorityScore,
    freshnessLabel: item.freshnessLabel,
    reason: item.reason
  };
}

function pendingLearningItem(item) {
  return {
    id: item.id,
    toolId: item.toolId,
    toolName: item.toolName,
    toolUrl: item.toolUrl,
    accountId: item.accountId,
    accountName: item.accountName,
    variantType: item.variantType,
    copyText: item.copyText,
    postedUrl: item.postedUrl,
    ageHours: item.ageHours
  };
}

function feedbackCsvTemplate(items) {
  const headers = ["toolName", "toolUrl", "variantType", "accountId", "accountName", "postedUrl", "impressions", "likes", "bookmarks", "replies", "reposts", "clicks", "profileVisits", "notes"];
  const rows = items.length ? items.slice(0, 10) : [{ toolName: "", toolUrl: "", variantType: "shortPost", accountId: "", accountName: "", postedUrl: "" }];
  return [
    headers.join(","),
    ...rows.map((item) => headers.map((header) => csvCell(item[header] ?? "")).join(","))
  ].join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function uniqueDisplayNames(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function renderFeedbackDebtGateMarkdown(gate) {
  if (!gate) return "No feedback debt gate available.";
  return [
    `- Status: ${gate.status}`,
    `- Severity: ${gate.severity}`,
    `- Headline: ${gate.headline}`,
    `- Max new posts before metrics: ${gate.maxNewPostsBeforeMetrics}`,
    `- Pending limit: ${gate.pendingLimit}`,
    `- Pending rate: ${gate.pendingRate}`,
    `- Measured rate: ${gate.measuredRate}`,
    `- Oldest pending: ${gate.oldestPendingHours}h`,
    "",
    "Next actions:",
    gate.nextActions.map((item, index) => `${index + 1}. ${item}`).join("\n"),
    "",
    "Account debt:",
    gate.accountDebt.length ? gate.accountDebt.map((item) => `- ${item.displayName}: pending ${item.pending}, measured ${item.measured}/${item.posts}`).join("\n") : "- No account debt."
  ].join("\n");
}

function createUnknownAccountStats(entry) {
  return {
    accountId: entry.accountId || "unknown",
    displayName: entry.accountName || entry.accountId || "Unknown account",
    category: "unknown",
    posts: 0,
    measured: 0,
    pending: 0,
    engagementScore: 0,
    impressions: 0,
    likes: 0,
    bookmarks: 0,
    replies: 0,
    reposts: 0,
    clicks: 0,
    profileVisits: 0,
    topVariant: ""
  };
}

function createGroupStats(base) {
  return {
    ...base,
    posts: 0,
    measured: 0,
    pending: 0,
    engagementScore: 0,
    impressions: 0,
    likes: 0,
    bookmarks: 0,
    replies: 0,
    reposts: 0,
    clicks: 0,
    profileVisits: 0,
    bestTool: null
  };
}

function finalizeGroupStats(items, nameKey) {
  return items
    .map((item) => ({
      ...item,
      averageScore: average(item.engagementScore, item.measured),
      completionRate: item.posts ? round(item.measured / item.posts) : 0
    }))
    .sort((a, b) => b.engagementScore - a.engagementScore || b.measured - a.measured || String(a[nameKey] ?? "").localeCompare(String(b[nameKey] ?? "")));
}

function applyMetrics(stats, entry) {
  const metrics = entry.metrics ?? {};
  stats.engagementScore += feedbackScore(entry);
  for (const key of ["impressions", "likes", "bookmarks", "replies", "reposts", "clicks", "profileVisits"]) {
    stats[key] += Number(metrics[key] ?? 0);
  }
}

function topVariantForAccount(accountId, variantsByAccount) {
  const prefix = `${accountId}:`;
  return [...variantsByAccount.entries()]
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, score]) => ({ variantType: key.slice(prefix.length), score }))
    .sort((a, b) => b.score - a.score)[0]?.variantType ?? "";
}

function feedbackEntrySummary(entry) {
  return {
    id: entry.id,
    toolId: entry.toolId,
    toolName: entry.toolName,
    toolUrl: entry.toolUrl,
    variantType: entry.variantType || "unknown",
    accountId: entry.accountId || "",
    accountName: entry.accountName || "",
    postedUrl: entry.postedUrl || "",
    postedAt: entry.postedAt || "",
    ageHours: pendingAgeHours(entry),
    copyText: entry.copyText || ""
  };
}

function hasRecordedMetrics(entry) {
  const metrics = entry.metrics ?? {};
  return ["impressions", "likes", "bookmarks", "replies", "reposts", "clicks", "profileVisits"]
    .some((key) => Number(metrics[key] ?? 0) > 0);
}

function feedbackScore(entry) {
  return Number(entry.engagementScore ?? calculateEngagement(entry.metrics).engagementScore ?? 0);
}

function pendingAgeHours(entry) {
  const value = entry.postedAt || entry.updatedAt || entry.createdAt;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.round((Date.now() - time) / 3600000));
}

function average(total, count) {
  return count ? round(total / count) : 0;
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
