const DEFAULT_MAX_FOCUS_ACCOUNTS = 5;
const DEFAULT_MAX_CIRCLE_TASKS = 4;

export function buildContentOpsPlan({
  date,
  latest = null,
  scaleReadiness = null,
  accountRefillWorkbench = null,
  sourceImportPack = null
}) {
  const targetDailyPosts = Number(scaleReadiness?.target?.targetDailyPosts
    ?? latest?.draftPlan?.summary?.targetPosts
    ?? latest?.supplyPlan?.targetDrafts
    ?? 0);
  const safeNewPosts = Number(scaleReadiness?.capacity?.safeNewPosts
    ?? latest?.feedbackOps?.debtGate?.maxNewPostsBeforeMetrics
    ?? 0);
  const feedbackMeasured = Number(scaleReadiness?.capacity?.feedbackMeasured
    ?? latest?.feedbackOps?.summary?.measured
    ?? 0);
  const feedbackPending = Number(scaleReadiness?.capacity?.feedbackPending
    ?? latest?.feedbackOps?.summary?.pending
    ?? 0);
  const freshPublishCandidates = Number(scaleReadiness?.capacity?.freshPublishCandidates
    ?? latest?.freshnessReport?.stats?.topPickFreshPostCandidates
    ?? 0);
  const postableToday = Number(accountRefillWorkbench?.summary?.postableToday ?? 0);
  const sourceGap = Number(scaleReadiness?.capacity?.sourceGap
    ?? latest?.sourceQualityQueue?.summary?.totalNeededCandidates
    ?? latest?.supplyPlan?.totalGap
    ?? 0);
  const dailyTargetCap = feedbackMeasured ? 10 : 3;
  const recommendedPostLimit = Math.max(0, Math.min(
    safeNewPosts,
    freshPublishCandidates || safeNewPosts,
    postableToday || safeNewPosts,
    dailyTargetCap
  ));
  const accountTasks = buildAccountTasks(accountRefillWorkbench);
  const circleTasks = buildCircleTasks(latest, sourceImportPack);
  const status = planStatus({ feedbackPending, feedbackMeasured, recommendedPostLimit, sourceGap, accountTasks });

  return {
    version: 1,
    date,
    generatedAt: new Date().toISOString(),
    status,
    headline: planHeadline(status, { recommendedPostLimit, sourceGap, feedbackPending }),
    summary: {
      targetDailyPosts,
      recommendedPostLimit,
      safeNewPosts,
      freshPublishCandidates,
      postableToday,
      feedbackMeasured,
      feedbackPending,
      sourceGap,
      focusAccounts: accountTasks.length,
      focusCircles: circleTasks.length,
      rowsToCollect: accountTasks.reduce((sum, item) => sum + item.rowsToCollect, 0)
    },
    checklist: buildChecklist({ feedbackPending, feedbackMeasured, recommendedPostLimit, accountTasks, circleTasks, sourceGap }),
    accountTasks,
    circleTasks,
    guardrails: [
      "Do not chase the configured 20-account target until feedback and supply gates are green.",
      "Only collect candidates with a real URL, clear audience, and one narrow pain.",
      "Every publish still needs manual confirmation and a recorded accountId.",
      "After posting, mark it posted and import real X Analytics before scaling."
    ],
    commands: [
      "npm run content-ops-plan",
      "npm run source-pack",
      "npm run daily",
      "npm start"
    ]
  };
}

export function renderContentOpsPlanMarkdown(plan) {
  if (!plan) return "# Content Ops Plan\n\nNo plan available. Run npm run daily first.\n";
  return `# Content Ops Plan - ${plan.date}

- Status: ${plan.status}
- Headline: ${plan.headline}
- Target: ${plan.summary.targetDailyPosts}/day
- Recommended posts now: ${plan.summary.recommendedPostLimit}
- Safe new posts: ${plan.summary.safeNewPosts}
- Fresh publish candidates: ${plan.summary.freshPublishCandidates}
- Postable today: ${plan.summary.postableToday}
- Feedback measured / pending: ${plan.summary.feedbackMeasured}/${plan.summary.feedbackPending}
- Source gap: ${plan.summary.sourceGap}
- Rows to collect: ${plan.summary.rowsToCollect}

## Checklist

${plan.checklist.map((item, index) => `${index + 1}. ${item.title} — ${item.detail}`).join("\n")}

## Account Collection Tasks

${plan.accountTasks.length ? plan.accountTasks.map((item, index) => renderAccountTask(item, index)).join("\n\n") : "No account collection task."}

## Circle Tasks

${plan.circleTasks.length ? plan.circleTasks.map((item, index) => `${index + 1}. ${item.circleName} — collect ${item.rowsToCollect} rows. ${item.reason}`).join("\n") : "No circle task."}

## Guardrails

${plan.guardrails.map((item) => `- ${item}`).join("\n")}
`;
}

function buildAccountTasks(workbench) {
  return (workbench?.focusAccounts ?? [])
    .filter((account) => Number(account.refillNeed ?? 0) > 0 || Number(account.postableToday ?? 0) > 0)
    .slice(0, DEFAULT_MAX_FOCUS_ACCOUNTS)
    .map((account) => {
      const refillNeed = Number(account.refillNeed ?? 0);
      const csvRows = Number(account.csvRows ?? 0);
      const rowsToCollect = Math.max(1, Math.min(10, refillNeed || csvRows || 3));
      return {
        accountId: account.accountId,
        displayName: account.displayName,
        category: account.category || "",
        status: account.status,
        statusLabel: account.statusLabel || account.status || "",
        actionLabel: account.actionLabel || "",
        firstBottleneck: account.firstBottleneck || "",
        refillNeed,
        postableToday: Number(account.postableToday ?? 0),
        targetPosts: Number(account.targetPosts ?? 0),
        rowsToCollect,
        searchUrls: (account.searchUrls ?? []).slice(0, 5),
        searchLinks: (account.searchLinks ?? []).slice(0, 5),
        csv: account.csv || "",
        reason: account.actionDetail || account.actionLabel || "Fill account-specific candidates first."
      };
    });
}

function buildCircleTasks(latest, sourceImportPack) {
  const importRowsByCircle = new Map((sourceImportPack?.rowsByCircle ?? []).map((item) => [item.circleId, item]));
  return (latest?.sourceQualityQueue?.items ?? [])
    .slice()
    .sort((a, b) => Number(b.neededCandidates ?? 0) - Number(a.neededCandidates ?? 0))
    .slice(0, DEFAULT_MAX_CIRCLE_TASKS)
    .map((item) => {
      const packCircle = importRowsByCircle.get(item.circleId);
      const rowsToCollect = Math.max(1, Math.min(25, Number(item.neededCandidates ?? packCircle?.neededCandidates ?? 0) || 5));
      return {
        circleId: item.circleId,
        circleName: item.circleName || item.circleId,
        neededCandidates: Number(item.neededCandidates ?? 0),
        currentQualifiedTools: Number(item.currentQualifiedTools ?? 0),
        rowsToCollect,
        affectedAccounts: item.affectedAccounts ?? [],
        searchQueries: item.searchQueries ?? [],
        recommendedSources: item.recommendedSources ?? [],
        reason: item.importHint || `Add ${rowsToCollect} real candidates for this circle.`
      };
    });
}

function buildChecklist({ feedbackPending, feedbackMeasured, recommendedPostLimit, accountTasks, circleTasks, sourceGap }) {
  const items = [];
  if (feedbackPending > 0) {
    items.push({
      type: "feedback",
      title: `补 ${feedbackPending} 条 X Analytics`,
      detail: "先清空待补反馈，再考虑继续发布。",
      priority: 1
    });
  } else if (!feedbackMeasured && recommendedPostLimit > 0) {
    items.push({
      type: "seed_posts",
      title: `手动确认 ${recommendedPostLimit} 条 seed posts`,
      detail: "发完马上标记账号，几个小时后补真实 metrics。",
      priority: 1
    });
  }
  if (accountTasks.length) {
    const top = accountTasks[0];
    items.push({
      type: "account_refill",
      title: `先补 ${top.displayName}`,
      detail: `收集 ${top.rowsToCollect} 条真实候选，优先解决 ${top.firstBottleneck || "content"} 缺口。`,
      priority: 2
    });
  }
  if (circleTasks.length || sourceGap > 0) {
    const topCircle = circleTasks[0];
    items.push({
      type: "source_supply",
      title: topCircle ? `补 ${topCircle.circleName}` : "补来源候选",
      detail: topCircle ? `先找 ${topCircle.rowsToCollect} 条，预览评分后再导入。` : "运行 source-pack，填真实候选。",
      priority: 3
    });
  }
  items.push({
    type: "rerun_daily",
    title: "导入后重新跑 daily",
    detail: "让账号路由、草稿计划、日历和 roadmap 全部重算。",
    priority: 4
  });
  return items.sort((a, b) => a.priority - b.priority);
}

function planStatus({ feedbackPending, feedbackMeasured, recommendedPostLimit, sourceGap, accountTasks }) {
  if (feedbackPending > 0) return "clear_feedback_first";
  if (!feedbackMeasured && recommendedPostLimit > 0) return "seed_then_measure";
  if (sourceGap > 0 || accountTasks.length) return "collect_supply";
  if (recommendedPostLimit > 0) return "controlled_publish";
  return "watch";
}

function planHeadline(status, context) {
  if (status === "clear_feedback_first") return `先补 ${context.feedbackPending} 条 X Analytics，暂时别放量。`;
  if (status === "seed_then_measure") return `今天最多手动测 ${context.recommendedPostLimit} 条，发完补反馈。`;
  if (status === "collect_supply") return `内容供给还差 ${context.sourceGap}，先补候选再排日历。`;
  if (status === "controlled_publish") return `可以小批量手动确认 ${context.recommendedPostLimit} 条。`;
  return "今天先观察，不要为了数量硬发。";
}

function renderAccountTask(item, index) {
  return `### ${index + 1}. ${item.displayName}

- Status: ${item.statusLabel}
- Refill need: ${item.refillNeed}
- Postable today: ${item.postableToday}/${item.targetPosts}
- Rows to collect: ${item.rowsToCollect}
- First bottleneck: ${item.firstBottleneck || "none"}
- Reason: ${item.reason}
- Search URLs:
${item.searchUrls.length ? item.searchUrls.map((url) => `  - ${url}`).join("\n") : "  - none"}
`;
}
