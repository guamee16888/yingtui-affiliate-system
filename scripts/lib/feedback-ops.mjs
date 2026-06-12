import { calculateEngagement } from "./scoring.mjs";
import { normalizeAccountConfig } from "./account-system.mjs";

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
      feedbackGateStatus: debtGate.status,
      maxNewPostsBeforeMetrics: debtGate.maxNewPostsBeforeMetrics,
      topAccount: accountStats.find((item) => item.measured > 0)?.displayName ?? "",
      topAngle: angleStats.find((item) => item.measured > 0)?.variantType ?? "",
      topSource: sourceStats.find((item) => item.measured > 0)?.sourceName ?? ""
    },
    debtGate,
    actionList: feedbackOpsActions({ pending, unlinkedPosts, accountStats, angleStats, sourceStats, activeAccounts, debtGate }),
    pendingFeedback: pending
      .sort((a, b) => pendingAgeHours(b) - pendingAgeHours(a))
      .slice(0, 20)
      .map((entry) => feedbackEntrySummary(entry)),
    accountStats,
    angleStats,
    sourceStats,
    notes: [
      posted.length ? `${pending.length}/${posted.length} posted rows still need metrics.` : "No posted feedback rows yet.",
      measured.length ? "Use measured account, angle, and source winners to choose tomorrow's posts." : "The system cannot learn until at least one posted row has impressions.",
      unlinkedPosts.length ? `${unlinkedPosts.length} account post records are missing matching feedback rows.` : "Account post records and feedback rows are linked."
    ]
  };
}

export function renderFeedbackOpsMarkdown(ops) {
  if (!ops) return "# Feedback Operating Mode\n\nNo feedback operating report available. Run npm run feedback-ops.\n";

  return `# Feedback Operating Mode - ${ops.date}

- Learning score: ${ops.summary.learningScore}/100
- Posted rows: ${ops.summary.posted}
- Measured rows: ${ops.summary.measured}
- Pending feedback: ${ops.summary.pending}
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
    const key = tool?.sourceId || tool?.sourceName || "unknown_source";
    const stats = map.get(key) ?? createGroupStats({
      sourceId: tool?.sourceId || "",
      sourceName: tool?.sourceName || "Unknown source",
      sourceType: tool?.sourceType || "",
      circle: tool?.circle || ""
    });
    stats.posts += 1;
    if (!hasRecordedMetrics(entry)) stats.pending += 1;
    map.set(key, stats);
  }
  for (const entry of measured) {
    const tool = toolById.get(entry.toolId);
    const key = tool?.sourceId || tool?.sourceName || "unknown_source";
    const stats = map.get(key) ?? createGroupStats({
      sourceId: tool?.sourceId || "",
      sourceName: tool?.sourceName || "Unknown source",
      sourceType: tool?.sourceType || "",
      circle: tool?.circle || ""
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

function feedbackOpsActions({ pending, unlinkedPosts, accountStats, angleStats, sourceStats, activeAccounts, debtGate }) {
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
  if (emptyAccounts.length) actions.push({
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
