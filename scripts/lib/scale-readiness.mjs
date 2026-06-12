import { normalizeAccountConfig } from "./account-system.mjs";

export function buildScaleReadiness({
  date,
  latest = null,
  feedbackOps = null,
  accountConfig = { accounts: [] },
  contentCalendar = null,
  sourceImportPack = null,
  accountContentMatrix = null,
  xStatus = null
}) {
  const config = normalizeAccountConfig(accountConfig);
  const activeAccounts = config.accounts.filter((account) => account.active);
  const defaultLimit = Number(config.rotationPolicy?.defaultDailyPostLimit ?? 10);
  const targetPostsPerAccount = Math.max(1, defaultLimit || 10);
  const targetDailyPosts = Number(contentCalendar?.summary?.targetPosts
    ?? latest?.contentCalendar?.summary?.targetPosts
    ?? latest?.draftPlan?.summary?.targetPosts
    ?? activeAccounts.reduce((sum, account) => sum + Number(account.dailyPostLimit ?? targetPostsPerAccount), 0));
  const plannedPosts = Number(latest?.draftPlan?.summary?.plannedPosts ?? 0);
  const scheduledPosts = Number(contentCalendar?.summary?.scheduledPosts ?? latest?.contentCalendar?.summary?.scheduledPosts ?? 0);
  const freshPublishCandidates = Number(latest?.freshnessReport?.stats?.topPickFreshPostCandidates ?? latest?.freshnessReport?.publishableTools?.length ?? 0);
  const topPicks = Number(latest?.summary?.topPicks ?? latest?.tools?.length ?? latest?.picked?.length ?? 0);
  const sourceGap = Number(latest?.sourceQualityQueue?.summary?.totalNeededCandidates ?? latest?.supplyPlan?.totalGap ?? 0);
  const sourcePackRows = Number(sourceImportPack?.summary?.totalRows ?? 0);
  const sourcePackRowsNeedingResearch = Number(sourceImportPack?.summary?.rowsNeedingResearch ?? 0);
  const feedbackPending = Number(feedbackOps?.summary?.pending ?? 0);
  const feedbackMeasured = Number(feedbackOps?.summary?.measured ?? 0);
  const feedbackLearningScore = Number(feedbackOps?.summary?.learningScore ?? 0);
  const safeNewPosts = Number(feedbackOps?.debtGate?.maxNewPostsBeforeMetrics ?? feedbackOps?.summary?.maxNewPostsBeforeMetrics ?? 0);
  const accountMatrixReadyAccounts = Number(accountContentMatrix?.summary?.readyAccounts ?? 0);
  const accountMatrixCandidateBench = Number(accountContentMatrix?.summary?.matchedCandidates ?? 0);
  const accountMatrixBenchTarget = Number(accountContentMatrix?.summary?.candidateBenchTarget ?? 0);
  const accountMatrixStrongCandidates = Number(accountContentMatrix?.summary?.strongCandidates ?? 0);
  const accountMatrixFreshCandidates = Number(accountContentMatrix?.summary?.freshCandidates ?? 0);
  const accountMatrixDraftGap = Number(accountContentMatrix?.summary?.draftGap ?? 0);
  const authReady = Boolean(latest?.accountStrategy?.authReady || xStatus?.publishReady);
  const deployMode = latest?.accountStrategy?.mode ?? config.rotationPolicy?.mode ?? "manual_confirm";
  const scaleReality = buildScaleReality({
    targetDailyPosts,
    safeNewPosts,
    freshPublishCandidates,
    plannedPosts,
    scheduledPosts,
    accountMatrixCandidateBench,
    accountMatrixBenchTarget
  });
  const coverage = {
    plannedRate: rate(plannedPosts, targetDailyPosts),
    scheduledRate: rate(scheduledPosts, targetDailyPosts),
    freshRate: rate(freshPublishCandidates, Math.min(targetDailyPosts, 10)),
    safeRate: rate(safeNewPosts, Math.min(targetDailyPosts, 10))
  };
  const readinessScore = Math.round(Math.min(100,
    feedbackLearningScore * 0.35
    + coverage.plannedRate * 20
    + coverage.scheduledRate * 15
    + coverage.freshRate * 15
    + coverage.safeRate * 10
    + Math.max(0, 5 - Math.min(5, sourceGap / 20))
  ));
  const blockers = scaleBlockers({
    targetDailyPosts,
    plannedPosts,
    scheduledPosts,
    freshPublishCandidates,
    sourceGap,
    sourcePackRows,
    sourcePackRowsNeedingResearch,
    feedbackPending,
    feedbackMeasured,
    safeNewPosts,
    accountMatrixReadyAccounts,
    accountMatrixCandidateBench,
    accountMatrixBenchTarget,
    accountMatrixStrongCandidates,
    accountMatrixFreshCandidates,
    accountMatrixDraftGap,
    activeAccounts: activeAccounts.length,
    authReady
  });

  return {
    version: 1,
    date,
    generatedAt: new Date().toISOString(),
    status: scaleStatus({ readinessScore, blockers }),
    headline: scaleHeadline({ readinessScore, targetDailyPosts, safeNewPosts, freshPublishCandidates, feedbackMeasured }),
    readinessScore,
    target: {
      activeAccounts: activeAccounts.length,
      targetPostsPerAccount,
      targetDailyPosts,
      mode: deployMode
    },
    capacity: {
      safeNewPosts,
      freshPublishCandidates,
      topPicks,
      plannedPosts,
      scheduledPosts,
      sourceGap,
      sourcePackRows,
      sourcePackRowsNeedingResearch,
      feedbackPending,
      feedbackMeasured,
      feedbackLearningScore,
      accountMatrixReadyAccounts,
      accountMatrixCandidateBench,
      accountMatrixBenchTarget,
      accountMatrixStrongCandidates,
      accountMatrixFreshCandidates,
      accountMatrixDraftGap,
      realisticDailyPosts: scaleReality.realisticDailyPosts,
      gapToTarget: scaleReality.gapToTarget,
      scaleBottleneck: scaleReality.bottleneck,
      authReady
    },
    scaleReality,
    coverage,
    blockers,
    actionPlan: scaleActionPlan(blockers, {
      safeNewPosts,
      sourceGap,
      sourcePackRows,
      feedbackPending,
      feedbackMeasured,
      freshPublishCandidates,
      accountContentMatrix
    }),
    notes: [
      "This is a scale-readiness report, not a permission to auto-post.",
      "Manual confirmation remains required for every X publish action.",
      "If safeNewPosts is lower than targetDailyPosts, keep the batch small and fill feedback first."
    ]
  };
}

export function renderScaleReadinessMarkdown(report) {
  if (!report) return "# Scale Readiness\n\nNo report available. Run npm run scale.\n";
  return `# Scale Readiness - ${report.date}

- Status: ${report.status}
- Score: ${report.readinessScore}/100
- Headline: ${report.headline}
- Target: ${report.target.activeAccounts} accounts x ${report.target.targetPostsPerAccount} posts = ${report.target.targetDailyPosts}/day
- Realistic today: ${report.scaleReality?.realisticDailyPosts ?? report.capacity.safeNewPosts}/${report.target.targetDailyPosts} (gap ${report.scaleReality?.gapToTarget ?? 0}; bottleneck ${report.scaleReality?.bottleneck?.label ?? "unknown"})
- Safe new posts now: ${report.capacity.safeNewPosts}
- Fresh publish candidates: ${report.capacity.freshPublishCandidates}
- Planned / scheduled: ${report.capacity.plannedPosts}/${report.capacity.scheduledPosts}
- Account matrix: ${report.capacity.accountMatrixReadyAccounts ?? 0}/${report.target.activeAccounts} ready accounts; bench ${report.capacity.accountMatrixCandidateBench ?? 0}/${report.capacity.accountMatrixBenchTarget ?? 0}
- Source gap: ${report.capacity.sourceGap}
- Feedback measured / pending: ${report.capacity.feedbackMeasured}/${report.capacity.feedbackPending}
- Auth ready: ${report.capacity.authReady ? "yes" : "not yet"}

## Blockers

${report.blockers.length ? report.blockers.map((item, index) => `${index + 1}. ${item.title} — ${item.severity}
   ${item.detail}
   Next: ${item.nextAction}`).join("\n") : "No major blockers."}

## Action Plan

${report.actionPlan.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## Notes

${report.notes.map((item) => `- ${item}`).join("\n")}
`;
}

function buildScaleReality({
  targetDailyPosts,
  safeNewPosts,
  freshPublishCandidates,
  plannedPosts,
  scheduledPosts,
  accountMatrixCandidateBench,
  accountMatrixBenchTarget
}) {
  const reviewablePosts = scheduledPosts || plannedPosts;
  const limits = [
    { id: "feedback_gate", label: "feedback gate", value: safeNewPosts },
    { id: "fresh_candidates", label: "fresh candidates", value: freshPublishCandidates },
    { id: "planned_drafts", label: "planned drafts", value: plannedPosts },
    { id: "calendar_slots", label: "calendar slots", value: reviewablePosts }
  ].map((item) => ({
    ...item,
    value: Math.max(0, Math.min(targetDailyPosts, Number(item.value ?? 0)))
  }));
  const bottleneck = limits
    .slice()
    .sort((a, b) => a.value - b.value || a.id.localeCompare(b.id))[0] ?? null;
  const realisticDailyPosts = bottleneck?.value ?? 0;
  return {
    targetDailyPosts,
    realisticDailyPosts,
    gapToTarget: Math.max(0, targetDailyPosts - realisticDailyPosts),
    bottleneck,
    limits,
    candidateBench: {
      current: accountMatrixCandidateBench,
      target: accountMatrixBenchTarget,
      gap: Math.max(0, accountMatrixBenchTarget - accountMatrixCandidateBench)
    }
  };
}

function scaleBlockers(input) {
  const blockers = [];
  if (!input.feedbackMeasured && input.feedbackPending) {
    blockers.push({
      id: "feedback_missing",
      title: "Posted rows have no X Analytics yet",
      severity: "critical",
      detail: `${input.feedbackPending} posted rows are pending metrics, so the system cannot learn what to repeat.`,
      nextAction: "Open Feedback, fill the pending template, paste X Analytics, then rerun npm run feedback-ops."
    });
  } else if (!input.feedbackMeasured) {
    blockers.push({
      id: "feedback_seed",
      title: "No measured feedback yet",
      severity: "high",
      detail: "The system has not seen real impressions or engagement, so scaling would be blind.",
      nextAction: "Post at most the seed batch and import metrics before increasing volume."
    });
  }

  if (input.safeNewPosts < Math.min(3, input.targetDailyPosts)) {
    blockers.push({
      id: "safe_post_gate",
      title: "Feedback gate is limiting new posts",
      severity: "critical",
      detail: `The current safe-new-post limit is ${input.safeNewPosts}, far below the daily target.`,
      nextAction: "Clear pending metrics first; do not increase account volume while the gate is closed."
    });
  }

  if (input.freshPublishCandidates < Math.min(5, input.targetDailyPosts)) {
    blockers.push({
      id: "fresh_candidates",
      title: "Not enough fresh publish candidates",
      severity: "high",
      detail: `${input.freshPublishCandidates} fresh candidates are available for posting today.`,
      nextAction: "Refresh Live Feed and import external candidates from the source supply workbench."
    });
  }

  if (input.plannedPosts < input.targetDailyPosts) {
    blockers.push({
      id: "draft_gap",
      title: "Draft gap is too large for the target",
      severity: "high",
      detail: `${input.plannedPosts}/${input.targetDailyPosts} unique drafts are planned.`,
      nextAction: "Fill source-pack rows, rerun daily, then rerun draft-plan and content-calendar."
    });
  }

  if (input.accountMatrixBenchTarget && input.accountMatrixReadyAccounts < input.activeAccounts) {
    blockers.push({
      id: "account_matrix_gap",
      title: "Account-level content matrix is not ready",
      severity: "high",
      detail: `${input.accountMatrixReadyAccounts}/${input.activeAccounts} accounts are ready; candidate bench is ${input.accountMatrixCandidateBench}/${input.accountMatrixBenchTarget}, strong ${input.accountMatrixStrongCandidates}, fresh ${input.accountMatrixFreshCandidates}.`,
      nextAction: input.accountMatrixDraftGap
        ? `Run npm run account-matrix, then fill account-level search tasks until the ${input.accountMatrixDraftGap} draft gap shrinks.`
        : "Use account-matrix search tasks to raise candidate bench and fresh candidates before scaling."
    });
  }

  if (input.sourceGap > 0) {
    blockers.push({
      id: "source_gap",
      title: "Source supply is below target",
      severity: "medium",
      detail: `${input.sourceGap} more source candidates are needed for the current account mix.`,
      nextAction: input.sourcePackRows
        ? `Fill the ${input.sourcePackRowsNeedingResearch} source-pack rows that still need real candidates.`
        : "Run npm run source-pack and fill the largest circle gap first."
    });
  }

  if (!input.authReady) {
    blockers.push({
      id: "auth_deferred",
      title: "Real multi-account X auth is not connected",
      severity: "deferred",
      detail: "Account profiles exist, but OAuth binding is intentionally not the current bottleneck.",
      nextAction: "Keep auth deferred until feedback and source quality gates are stable."
    });
  }

  return blockers;
}

function scaleActionPlan(blockers, context) {
  const actions = [];
  if (blockers.some((item) => item.id === "feedback_missing" || item.id === "feedback_seed")) {
    actions.push(context.feedbackPending
      ? "补齐待补 X Analytics，先让 learning score 离开 0。"
      : "先发 1-3 条 seed posts，全部手动确认并记录 accountId。");
  }
  if (context.sourceGap > 0) actions.push("补来源：优先填 source-pack 里缺口最大的圈子，不要用低质候选硬凑。");
  if (context.freshPublishCandidates < 5) actions.push("刷新 Live Feed，并从 X/newsletter/社区手动导入新鲜候选。");
  if (context.accountContentMatrix?.summary?.candidateGap > 0) {
    actions.push(`按账号矩阵补候选：先处理 ${context.accountContentMatrix.priorityAccounts?.[0]?.displayName ?? "缺口最大账号"}，不要用泛内容填满所有号。`);
  }
  actions.push(`今天最多按 safe gate 发 ${context.safeNewPosts} 条，不要按 20 账号目标硬放量。`);
  actions.push("有 measured winners 后，再把强信号工具推进 thread / SEO review / affiliate research。");
  return unique(actions).slice(0, 6);
}

function scaleStatus({ readinessScore, blockers }) {
  if (blockers.some((item) => item.severity === "critical")) return "blocked";
  if (readinessScore >= 75) return "ready_for_controlled_scale";
  if (readinessScore >= 45) return "controlled_test";
  return "seed_only";
}

function scaleHeadline({ readinessScore, targetDailyPosts, safeNewPosts, freshPublishCandidates, feedbackMeasured }) {
  if (!feedbackMeasured) return "先拿真实反馈，暂时不要放量。";
  if (safeNewPosts < Math.min(5, targetDailyPosts)) return "反馈闸门还没打开，继续小批量测试。";
  if (freshPublishCandidates < Math.min(10, targetDailyPosts)) return "候选不够新鲜，先补来源再扩量。";
  if (readinessScore >= 75) return "可以进入受控放量，但仍需逐条确认发布。";
  return "还在受控测试期，先补短板再谈规模。";
}

function rate(value, target) {
  const denominator = Number(target || 0);
  if (!denominator) return 0;
  return Math.max(0, Math.min(1, Number(value || 0) / denominator));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
