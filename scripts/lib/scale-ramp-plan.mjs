const START_BATCH_SIZE = 3;
const NEXT_BATCH_SIZE = 5;
const MIN_SEED_DRAFTS = 3;
const MIN_SEED_FRESH = 3;

export function buildScaleRampPlan({ date, accountContentMatrix = null, scaleReadiness = null }) {
  const rows = [...(accountContentMatrix?.accountRows ?? [])];
  const searchTasksByAccount = groupSearchTasks(accountContentMatrix?.searchTasks ?? []);
  const plannedDrafts = sum(rows, "plannedDrafts");
  const measuredFeedbackAccounts = rows.filter((row) => Number(row.measuredFeedback ?? 0) > 0).length;
  const ranked = rows
    .map((row) => buildRampAccount(row, searchTasksByAccount.get(row.accountId) ?? []))
    .sort((a, b) => rankScore(b) - rankScore(a) || a.displayName.localeCompare(b.displayName));
  const startAccounts = ranked.slice(0, START_BATCH_SIZE);
  const nextAccounts = ranked.slice(START_BATCH_SIZE, START_BATCH_SIZE + NEXT_BATCH_SIZE);
  const holdAccounts = ranked.slice(START_BATCH_SIZE + NEXT_BATCH_SIZE);
  const safeTestPosts = measuredFeedbackAccounts
    ? Math.min(plannedDrafts, Math.max(MIN_SEED_DRAFTS, startAccounts.length * MIN_SEED_DRAFTS))
    : Math.min(plannedDrafts, MIN_SEED_DRAFTS);

  return {
    version: 1,
    date,
    generatedAt: new Date().toISOString(),
    mode: "manual_confirm_ramp",
    rule: "Scale in batches. Do not unlock broad multi-account posting until seed accounts have fresh drafts and measured feedback.",
    summary: {
      activeAccounts: rows.length,
      recommendedStartAccounts: startAccounts.length,
      nextBatchAccounts: nextAccounts.length,
      holdAccounts: holdAccounts.length,
      safeTestPosts,
      targetDailyPosts: accountContentMatrix?.summary?.targetDailyPosts ?? sum(rows, "targetPosts"),
      plannedDrafts,
      measuredFeedbackAccounts,
      readyAccounts: accountContentMatrix?.summary?.readyAccounts ?? 0,
      blockers: scaleReadiness?.blockers ?? []
    },
    stages: buildStages({ startAccounts, nextAccounts, holdAccounts, measuredFeedbackAccounts }),
    startAccounts,
    nextAccounts,
    holdAccounts,
    accountLaunchPlan: ranked,
    operatingRules: [
      "Start with the first 3 accounts, not all accounts.",
      "Cap new posts at 3 total until at least one account has measured feedback.",
      "Every post still needs manual review and confirmation.",
      "Do not reuse the same tool across accounts during the same cooldown window.",
      "If an account has fewer than 3 fresh drafts, use it for research only."
    ]
  };
}

export function renderScaleRampPlanMarkdown(plan) {
  if (!plan) return "# Scale Ramp Plan\n\nNo ramp plan available. Run npm run scale-ramp.\n";
  return `# Scale Ramp Plan - ${plan.date}

- Mode: ${plan.mode}
- Safe test posts now: ${plan.summary.safeTestPosts}
- Ready accounts: ${plan.summary.readyAccounts}/${plan.summary.activeAccounts}
- Planned drafts: ${plan.summary.plannedDrafts}/${plan.summary.targetDailyPosts}
- Accounts with measured feedback: ${plan.summary.measuredFeedbackAccounts}

## Start First

${plan.startAccounts.length ? plan.startAccounts.map(renderRampAccount).join("\n\n") : "No account has enough coverage to start. Add candidates first."}

## Next Batch

${plan.nextAccounts.length ? plan.nextAccounts.map(renderRampAccount).join("\n\n") : "No next batch yet."}

## Stages

${plan.stages.map((stage) => `- ${stage.label}: ${stage.accountCount} accounts — ${stage.exitCriteria}`).join("\n")}

## Operating Rules

${plan.operatingRules.map((rule) => `- ${rule}`).join("\n")}
`;
}

function buildRampAccount(row, searchTasks) {
  const targetPosts = Number(row.targetPosts ?? 10);
  const seedReady = Number(row.plannedDrafts ?? 0) >= MIN_SEED_DRAFTS
    && Number(row.freshCandidates ?? 0) >= MIN_SEED_FRESH
    && Number(row.strongCandidates ?? 0) >= MIN_SEED_DRAFTS;
  const launchStage = row.status === "ready" || seedReady
    ? "start_today"
    : Number(row.matchedCandidates ?? 0) || Number(row.plannedDrafts ?? 0)
      ? "seed_this_week"
      : "research_only";
  const missing = {
    candidateBench: Math.max(0, Number(row.candidateBenchTarget ?? targetPosts * 3) - Number(row.matchedCandidates ?? 0)),
    strong: Math.max(0, targetPosts - Number(row.strongCandidates ?? 0)),
    fresh: Math.max(0, targetPosts - Number(row.freshCandidates ?? 0)),
    drafts: Math.max(0, targetPosts - Number(row.plannedDrafts ?? 0)),
    feedback: Number(row.measuredFeedback ?? 0) ? 0 : 1
  };

  return {
    accountId: row.accountId,
    displayName: row.displayName,
    category: row.category,
    launchStage,
    readinessScore: Number(row.readinessScore ?? 0),
    targetPosts,
    plannedDrafts: Number(row.plannedDrafts ?? 0),
    matchedCandidates: Number(row.matchedCandidates ?? 0),
    strongCandidates: Number(row.strongCandidates ?? 0),
    freshCandidates: Number(row.freshCandidates ?? 0),
    scheduledPosts: Number(row.scheduledPosts ?? 0),
    measuredFeedback: Number(row.measuredFeedback ?? 0),
    missing,
    blockers: row.blockers ?? [],
    nextAction: rampNextAction(row, missing, launchStage),
    searchTasks: (searchTasks.length ? searchTasks : fallbackSearchTasks(row, missing)).slice(0, 2),
    topMatchedTools: (row.topMatchedTools ?? []).slice(0, 3)
  };
}

function buildStages({ startAccounts, nextAccounts, holdAccounts, measuredFeedbackAccounts }) {
  return [
    {
      id: "seed_batch",
      label: "Phase 1 seed batch",
      accountCount: startAccounts.length,
      accountIds: startAccounts.map((account) => account.accountId),
      exitCriteria: measuredFeedbackAccounts
        ? "Keep only accounts with fresh drafts and positive feedback."
        : "Post up to 3 manually reviewed tweets, then import X Analytics feedback."
    },
    {
      id: "next_batch",
      label: "Phase 2 next batch",
      accountCount: nextAccounts.length,
      accountIds: nextAccounts.map((account) => account.accountId),
      exitCriteria: "Each account needs 10 drafts, 10 fresh candidates, and at least one feedback row."
    },
    {
      id: "hold",
      label: "Phase 3 hold / research only",
      accountCount: holdAccounts.length,
      accountIds: holdAccounts.map((account) => account.accountId),
      exitCriteria: "Do not post until the account has a 3x candidate bench and unique drafts."
    }
  ];
}

function rampNextAction(row, missing, launchStage) {
  if (launchStage === "start_today") return `Use ${row.displayName} for the seed batch; publish manually and collect feedback.`;
  if (missing.drafts > 0) return `Add ${missing.drafts} unique drafts before using ${row.displayName}.`;
  if (missing.fresh > 0) return `Add ${missing.fresh} fresh candidates before posting from ${row.displayName}.`;
  if (missing.candidateBench > 0) return `Add ${missing.candidateBench} more account-matched candidates.`;
  return `Keep ${row.displayName} in manual review until feedback improves.`;
}

function rankScore(account) {
  const stageBonus = account.launchStage === "start_today" ? 1000 : account.launchStage === "seed_this_week" ? 500 : 0;
  return stageBonus
    + account.readinessScore * 10
    + account.plannedDrafts * 8
    + account.freshCandidates * 6
    + account.strongCandidates * 5
    + account.matchedCandidates;
}

function groupSearchTasks(tasks) {
  const grouped = new Map();
  for (const task of tasks) {
    const list = grouped.get(task.accountId) ?? [];
    list.push(task);
    grouped.set(task.accountId, list);
  }
  return grouped;
}

function fallbackSearchTasks(row, missing) {
  if (!missing.candidateBench && !missing.fresh && !missing.drafts) return [];
  const query = `${row.displayName} ${row.category ?? ""} tools founder workflow`.trim();
  const targetRows = Math.min(10, Math.max(3, missing.drafts, missing.fresh, Math.ceil(missing.candidateBench / 3)));
  return [
    {
      accountId: row.accountId,
      displayName: row.displayName,
      provider: "X live search",
      query,
      url: `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`,
      targetRows
    },
    {
      accountId: row.accountId,
      displayName: row.displayName,
      provider: "Google recent search",
      query,
      url: `https://www.google.com/search?q=${encodeURIComponent(`${query} after:2026-01-01`)}`,
      targetRows
    }
  ];
}

function renderRampAccount(account, index = 0) {
  const tasks = account.searchTasks.length
    ? account.searchTasks.map((task) => `   - ${task.provider}: ${task.query}`).join("\n")
    : "   - No search task available.";
  return `${index + 1}. ${account.displayName} — ${account.launchStage} — score ${account.readinessScore}/100
   Drafts ${account.plannedDrafts}/${account.targetPosts}; fresh ${account.freshCandidates}; strong ${account.strongCandidates}; matched ${account.matchedCandidates}
   Next: ${account.nextAction}
${tasks}`;
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row?.[key] ?? 0), 0);
}
