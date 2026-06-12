import { normalizeAccountConfig } from "./account-system.mjs";

const BENCH_MULTIPLIER = 3;

export function buildAccountContentMatrix({
  date,
  latest = null,
  accountConfig = { accounts: [] },
  draftPlan = null,
  contentCalendar = null,
  feedbackOps = null
}) {
  const config = normalizeAccountConfig(accountConfig);
  const accounts = config.accounts.filter((account) => account.active);
  const tools = normalizeMatrixTools(latest).filter((tool) => tool && tool.followUpAction !== "skip");
  const publishableUrls = new Set((latest?.freshnessReport?.publishableTools ?? []).map((item) => normalizeUrl(item.url)));
  const draftByAccount = new Map((draftPlan?.accountPlans ?? latest?.draftPlan?.accountPlans ?? []).map((item) => [item.accountId, item]));
  const calendarByAccount = new Map((contentCalendar?.accountCalendars ?? latest?.contentCalendar?.accountCalendars ?? []).map((item) => [item.accountId, item]));
  const feedbackByAccount = new Map((feedbackOps?.accountStats ?? latest?.feedbackOps?.accountStats ?? []).map((item) => [item.accountId, item]));

  const accountRows = accounts.map((account) => buildAccountRow({
    account,
    tools,
    publishableUrls,
    draftPlan: draftByAccount.get(account.id),
    calendar: calendarByAccount.get(account.id),
    feedback: feedbackByAccount.get(account.id)
  }));
  const totalTargetPosts = sum(accountRows, "targetPosts");
  const totalBenchTarget = sum(accountRows, "candidateBenchTarget");
  const summary = {
    activeAccounts: accounts.length,
    targetPostsPerAccount: Math.round(rate(totalTargetPosts, Math.max(1, accounts.length))),
    targetDailyPosts: totalTargetPosts,
    candidateBenchTarget: totalBenchTarget,
    matchedCandidates: sum(accountRows, "matchedCandidates"),
    strongCandidates: sum(accountRows, "strongCandidates"),
    freshCandidates: sum(accountRows, "freshCandidates"),
    plannedDrafts: sum(accountRows, "plannedDrafts"),
    scheduledPosts: sum(accountRows, "scheduledPosts"),
    candidateGap: sum(accountRows, "candidateGap"),
    freshGap: sum(accountRows, "freshGap"),
    draftGap: sum(accountRows, "draftGap"),
    scheduleGap: sum(accountRows, "scheduleGap"),
    readyAccounts: accountRows.filter((row) => row.status === "ready").length,
    blockedAccounts: accountRows.filter((row) => row.status !== "ready").length,
    averageReadinessScore: Math.round(rate(sum(accountRows, "readinessScore"), Math.max(1, accountRows.length)))
  };

  return {
    version: 1,
    date,
    generatedAt: new Date().toISOString(),
    rule: `Target one account with ${BENCH_MULTIPLIER}x candidate bench before trying to fill its daily post limit.`,
    summary,
    qualityRadar: buildQualityRadar(summary),
    accountRows,
    priorityAccounts: accountRows
      .filter((row) => row.status !== "ready")
      .sort((a, b) => b.totalGap - a.totalGap || a.displayName.localeCompare(b.displayName))
      .slice(0, 10),
    searchTasks: buildSearchTasks(accountRows).slice(0, 20),
    notes: [
      "Matched candidates can be counted for more than one account because this is a planning matrix, not a publish allocation.",
      "Fresh candidates are scored top picks that are also in the freshness publishable set.",
      "This report does not authorize automatic posting; every slot still needs manual review."
    ]
  };
}

export function renderAccountContentMatrixMarkdown(matrix) {
  if (!matrix) return "# Account Content Matrix\n\nNo matrix available. Run npm run account-matrix.\n";
  return `# Account Content Matrix - ${matrix.date}

- Active accounts: ${matrix.summary.activeAccounts}
- Target posts: ${matrix.summary.targetDailyPosts}/day
- Candidate bench target: ${matrix.summary.candidateBenchTarget}
- Matched / strong / fresh candidates: ${matrix.summary.matchedCandidates}/${matrix.summary.strongCandidates}/${matrix.summary.freshCandidates}
- Planned / scheduled posts: ${matrix.summary.plannedDrafts}/${matrix.summary.scheduledPosts}
- Candidate / fresh / draft gaps: ${matrix.summary.candidateGap}/${matrix.summary.freshGap}/${matrix.summary.draftGap}
- Ready accounts: ${matrix.summary.readyAccounts}/${matrix.summary.activeAccounts}
- Average readiness: ${matrix.summary.averageReadinessScore}/100

## Quality Radar

${matrix.qualityRadar.map((item) => `- ${item.label}: ${item.score}/100 — ${item.reason}`).join("\n")}

## Priority Accounts

${matrix.priorityAccounts.length ? matrix.priorityAccounts.map((account, index) => `${index + 1}. ${account.displayName} — ${account.status} — score ${account.readinessScore}/100
   Target ${account.targetPosts}, planned ${account.plannedDrafts}, scheduled ${account.scheduledPosts}, matched ${account.matchedCandidates}, fresh ${account.freshCandidates}
   Next: ${account.nextAction}`).join("\n") : "All accounts have enough candidate and draft coverage."}

## Search Tasks

${matrix.searchTasks.length ? matrix.searchTasks.map((task, index) => `${index + 1}. ${task.displayName}: ${task.query}
   ${task.url}
   Goal: add ${task.targetRows} candidates`).join("\n") : "No account-level search tasks needed."}

## Notes

${matrix.notes.map((note) => `- ${note}`).join("\n")}
`;
}

function buildAccountRow({ account, tools, publishableUrls, draftPlan = null, calendar = null, feedback = null }) {
  const targetPosts = Number(account.dailyPostLimit || 10);
  const candidateBenchTarget = targetPosts * BENCH_MULTIPLIER;
  const matches = tools
    .map((tool) => ({ tool, match: accountMatchType(tool, account.id) }))
    .filter((item) => item.match);
  const strong = matches.filter(({ tool }) => isStrongCandidate(tool));
  const fresh = matches.filter(({ tool }) => publishableUrls.has(normalizeUrl(tool.url)));
  const plannedDrafts = Number(draftPlan?.plannedPosts ?? draftPlan?.drafts?.length ?? 0);
  const scheduledPosts = Number(calendar?.scheduledPosts ?? calendar?.slots?.length ?? 0);
  const measuredFeedback = Number(feedback?.measured ?? 0);
  const pendingFeedback = Number(feedback?.pending ?? 0);
  const candidateGap = Math.max(0, candidateBenchTarget - matches.length);
  const qualityGap = Math.max(0, targetPosts - strong.length);
  const freshGap = Math.max(0, targetPosts - fresh.length);
  const draftGap = Math.max(0, targetPosts - plannedDrafts);
  const scheduleGap = Math.max(0, targetPosts - scheduledPosts);
  const radar = {
    bench: percent(matches.length, candidateBenchTarget),
    quality: percent(strong.length, targetPosts),
    freshness: percent(fresh.length, targetPosts),
    draft: percent(plannedDrafts, targetPosts),
    schedule: percent(scheduledPosts, targetPosts),
    feedback: measuredFeedback ? 100 : pendingFeedback ? 35 : 0
  };
  const readinessScore = Math.round(
    radar.bench * 0.2
    + radar.quality * 0.2
    + radar.freshness * 0.2
    + radar.draft * 0.2
    + radar.schedule * 0.15
    + radar.feedback * 0.05
  );
  const blockers = [
    candidateGap ? "candidate_bench" : "",
    qualityGap ? "quality" : "",
    freshGap ? "freshness" : "",
    draftGap ? "drafts" : "",
    scheduleGap ? "schedule" : "",
    !measuredFeedback ? "feedback" : ""
  ].filter(Boolean);

  return {
    accountId: account.id,
    displayName: account.displayName,
    category: account.category,
    targetPosts,
    candidateBenchTarget,
    matchedCandidates: matches.length,
    primaryMatches: matches.filter((item) => item.match === "primary").length,
    alternateMatches: matches.filter((item) => item.match === "alternative").length,
    strongCandidates: strong.length,
    freshCandidates: fresh.length,
    plannedDrafts,
    scheduledPosts,
    measuredFeedback,
    pendingFeedback,
    candidateGap,
    qualityGap,
    freshGap,
    draftGap,
    scheduleGap,
    totalGap: candidateGap + qualityGap + freshGap + draftGap + scheduleGap,
    readinessScore,
    status: accountStatus({ candidateGap, qualityGap, freshGap, draftGap, scheduleGap, readinessScore }),
    blockers,
    radar,
    topMatchedTools: matches
      .sort((a, b) => Number(b.tool.score ?? 0) - Number(a.tool.score ?? 0))
      .slice(0, 5)
      .map(({ tool, match }) => ({
        toolId: tool.toolId,
        name: tool.name,
        url: tool.url,
        score: tool.score,
        followUpAction: tool.followUpAction,
        match
      })),
    nextAction: nextAction({ candidateGap, qualityGap, freshGap, draftGap, scheduleGap, account })
  };
}

function buildQualityRadar(summary) {
  return [
    {
      id: "candidate_bench",
      label: "Candidate bench",
      score: percent(summary.matchedCandidates, summary.candidateBenchTarget),
      reason: `${summary.matchedCandidates}/${summary.candidateBenchTarget} matched account-level candidates.`
    },
    {
      id: "quality",
      label: "Quality",
      score: percent(summary.strongCandidates, summary.targetDailyPosts),
      reason: `${summary.strongCandidates}/${summary.targetDailyPosts} strong candidates clear the quality floor.`
    },
    {
      id: "freshness",
      label: "Freshness",
      score: percent(summary.freshCandidates, summary.targetDailyPosts),
      reason: `${summary.freshCandidates}/${summary.targetDailyPosts} candidates are fresh enough to post.`
    },
    {
      id: "drafts",
      label: "Drafts",
      score: percent(summary.plannedDrafts, summary.targetDailyPosts),
      reason: `${summary.plannedDrafts}/${summary.targetDailyPosts} unique drafts are planned.`
    },
    {
      id: "schedule",
      label: "Schedule",
      score: percent(summary.scheduledPosts, summary.targetDailyPosts),
      reason: `${summary.scheduledPosts}/${summary.targetDailyPosts} posts are in manual review slots.`
    }
  ];
}

function buildSearchTasks(accountRows) {
  return accountRows
    .filter((account) => account.candidateGap || account.freshGap || account.draftGap)
    .sort((a, b) => b.totalGap - a.totalGap || a.displayName.localeCompare(b.displayName))
    .flatMap((account) => {
      const query = searchQueryForAccount(account);
      return [
        {
          accountId: account.accountId,
          displayName: account.displayName,
          provider: "X live search",
          query,
          url: `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`,
          targetRows: Math.min(10, Math.max(account.draftGap, account.freshGap, Math.ceil(account.candidateGap / BENCH_MULTIPLIER)))
        },
        {
          accountId: account.accountId,
          displayName: account.displayName,
          provider: "Google recent search",
          query,
          url: `https://www.google.com/search?q=${encodeURIComponent(`${query} after:2026-01-01`)}`,
          targetRows: Math.min(10, Math.max(3, account.draftGap))
        }
      ];
    });
}

function normalizeMatrixTools(latest) {
  const raw = latest?.tools?.length ? latest.tools : latest?.picked ?? [];
  return raw.map((item) => {
    if (!item?.tool) return item;
    return {
      ...item.tool,
      toolId: item.toolId ?? item.tool.toolId ?? item.tool.id,
      id: item.id ?? item.tool.id,
      score: item.score,
      scoreBreakdown: item.scoreBreakdown,
      followUpAction: item.followUpAction,
      seenBefore: item.seenBefore,
      sourceQuality: item.tool.sourceQuality,
      accountRecommendation: item.accountRecommendation,
      accountId: item.tool.accountId ?? item.accountId ?? "",
      accountName: item.tool.accountName ?? item.accountName ?? "",
      seedId: item.tool.seedId ?? item.seedId ?? "",
      copyVariants: item.copyVariants
    };
  });
}

function accountMatchType(tool, accountId) {
  if (tool.accountId === accountId) return "seed";
  if (tool.accountRecommendation?.primary?.accountId === accountId) return "primary";
  if ((tool.accountRecommendation?.alternatives ?? []).some((item) => item.accountId === accountId)) return "alternative";
  return "";
}

function isStrongCandidate(tool) {
  return Number(tool.score ?? 0) >= 25
    && !tool.seenBefore
    && Number(tool.scoreBreakdown?.riskScore ?? 0) <= 4
    && !tool.sourceQuality?.isNoisy;
}

function accountStatus({ candidateGap, qualityGap, freshGap, draftGap, scheduleGap, readinessScore }) {
  if (!candidateGap && !qualityGap && !freshGap && !draftGap && !scheduleGap && readinessScore >= 75) return "ready";
  if (draftGap || scheduleGap) return "draft_short";
  if (freshGap) return "fresh_short";
  if (qualityGap) return "quality_short";
  if (candidateGap) return "candidate_short";
  return "needs_feedback";
}

function nextAction({ candidateGap, qualityGap, freshGap, draftGap, scheduleGap, account }) {
  if (draftGap) return `Add ${draftGap} unique drafts for ${account.displayName}; do not reuse the same tool across accounts.`;
  if (scheduleGap) return `Add ${scheduleGap} manual review slots or lower ${account.displayName}'s daily target.`;
  if (freshGap) return `Collect ${freshGap} fresh candidates for ${account.displayName} before posting.`;
  if (qualityGap) return `Raise candidate quality for ${account.displayName}; skip broad or repeated items.`;
  if (candidateGap) return `Build a ${BENCH_MULTIPLIER}x candidate bench for ${account.displayName}.`;
  return "Post only after manual review, then import X Analytics.";
}

function searchQueryForAccount(account) {
  const category = String(account.category || account.displayName || "").replace(/\s+/g, " ").trim();
  if (/crypto/i.test(category)) return `"crypto" "builder" "tool"`;
  if (/SaaS/i.test(category)) return `"SaaS" "pricing" "founder"`;
  if (/indie/i.test(category)) return `"indie hacker" "launch"`;
  if (/AI|agent/i.test(category)) return `"AI" "workflow" "launch"`;
  if (/affiliate/i.test(category)) return `"affiliate" "partner program" "SaaS"`;
  return `"${category || account.displayName}" "tool"`;
}

function normalizeUrl(value) {
  return String(value ?? "").trim().replace(/\/$/, "");
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function percent(value, target) {
  const denominator = Number(target || 0);
  if (!denominator) return 0;
  return Math.max(0, Math.min(100, Math.round(Number(value || 0) / denominator * 100)));
}

function rate(value, target) {
  const denominator = Number(target || 0);
  if (!denominator) return 0;
  return Number(value || 0) / denominator;
}
