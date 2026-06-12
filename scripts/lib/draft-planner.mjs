export function buildDraftPlan({ date, picked = [], accountStrategy = null, targetPerAccount = 10 }) {
  const accounts = accountStrategy?.accounts ?? [];
  const tools = picked.map(normalizePickedItem).filter((item) => item.toolId && item.followUpAction !== "skip");
  const toolRecommendations = accountStrategy?.toolRecommendations ?? [];
  const recommendationByToolId = new Map(toolRecommendations.map((item) => [item.toolId, item]));
  const matchCounts = new Map(accounts.map((account) => [
    account.id,
    tools.filter((tool) => scoreToolForAccount(tool, account, recommendationByToolId) > 0).length
  ]));
  const plans = new Map(accounts.map((account) => [account.id, {
    accountId: account.id,
    displayName: account.displayName,
    category: account.category,
    targetPosts: targetPerAccount,
    plannedPosts: 0,
    gap: targetPerAccount,
    drafts: []
  }]));
  const usedToolIds = new Set();
  const allocationOrder = [...accounts].sort((a, b) => {
    const matchDiff = (matchCounts.get(a.id) ?? 0) - (matchCounts.get(b.id) ?? 0);
    if (matchDiff !== 0) return matchDiff;
    return a.displayName.localeCompare(b.displayName);
  });

  for (const account of allocationOrder) {
    const candidates = tools
      .filter((tool) => !usedToolIds.has(tool.toolId))
      .map((tool) => ({
        tool,
        matchScore: scoreToolForAccount(tool, account, recommendationByToolId)
      }))
      .filter((item) => item.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore || b.tool.score - a.tool.score);
    const plan = plans.get(account.id);

    for (const candidate of candidates) {
      if (plan.drafts.length >= targetPerAccount) break;
      const variantType = chooseVariantType(candidate.tool, account);
      const copyText = candidate.tool.copyVariants[variantType] ?? firstCopy(candidate.tool.copyVariants);
      if (!copyText) continue;
      usedToolIds.add(candidate.tool.toolId);
      plan.drafts.push({
        toolId: candidate.tool.toolId,
        toolName: candidate.tool.name,
        url: candidate.tool.url,
        score: candidate.tool.score,
        sourceName: candidate.tool.sourceName,
        circle: candidate.tool.circle,
        candidateType: candidate.tool.candidateType,
        followUpAction: candidate.tool.followUpAction,
        variantType,
        copyText,
        reason: draftReason(candidate.tool, account, candidate.matchScore)
      });
    }

    plan.plannedPosts = plan.drafts.length;
    plan.gap = Math.max(0, targetPerAccount - plan.plannedPosts);
  }

  const accountPlans = accounts.map((account) => plans.get(account.id));
  const unallocatedTools = tools
    .filter((tool) => !usedToolIds.has(tool.toolId))
    .map((tool) => ({
      toolId: tool.toolId,
      name: tool.name,
      url: tool.url,
      score: tool.score,
      sourceName: tool.sourceName,
      circle: tool.circle,
      followUpAction: tool.followUpAction
    }));
  const plannedPosts = accountPlans.reduce((sum, account) => sum + account.plannedPosts, 0);
  const targetPosts = accounts.length * targetPerAccount;

  return {
    date,
    mode: "manual_review",
    rule: "Each draft uses one unique candidate. No tool is allocated to more than one account in this plan.",
    summary: {
      accounts: accounts.length,
      targetPosts,
      plannedPosts,
      gap: Math.max(0, targetPosts - plannedPosts),
      uniqueToolsUsed: usedToolIds.size,
      accountsCovered: accountPlans.filter((account) => account.gap === 0).length
    },
    accountPlans,
    unallocatedTools,
    warnings: plannedPosts < targetPosts
      ? [`Draft supply is short by ${targetPosts - plannedPosts} posts. Add candidates instead of reusing tools across accounts.`]
      : []
  };
}

export function renderDraftPlanMarkdown(plan) {
  if (!plan) return "# Draft Planner\n\nNo draft plan available. Run npm run daily first.\n";

  return `# Account Draft Planner - ${plan.date}

- Mode: ${plan.mode}
- Rule: ${plan.rule}
- Target posts: ${plan.summary.targetPosts}
- Planned posts: ${plan.summary.plannedPosts}
- Gap: ${plan.summary.gap}
- Unique tools used: ${plan.summary.uniqueToolsUsed}
- Accounts covered: ${plan.summary.accountsCovered}/${plan.summary.accounts}

${plan.warnings.length ? `Warnings:\n${plan.warnings.map((warning) => `- ${warning}`).join("\n")}\n\n` : ""}${plan.accountPlans.map(renderAccountPlan).join("\n\n")}
`;
}

function renderAccountPlan(account) {
  return `## ${account.displayName}

- Planned: ${account.plannedPosts}/${account.targetPosts}
- Gap: ${account.gap}

${account.drafts.length ? account.drafts.map((draft, index) => `${index + 1}. ${draft.toolName} — ${draft.variantType} — score ${draft.score}
   ${draft.copyText}`).join("\n") : "No drafts allocated. Add more source candidates for this account."}`;
}

function normalizePickedItem(item) {
  const tool = item.tool ?? item;
  const rawVariants = Array.isArray(item.copyVariants)
    ? item.copyVariants.reduce((variants, variant) => {
      variants[variant.label] = variant.text;
      return variants;
    }, {})
    : item.copyVariants ?? {};

  return {
    toolId: item.toolId ?? item.id ?? tool.toolId ?? tool.id,
    name: tool.name ?? item.name ?? "",
    url: tool.url ?? item.url ?? "",
    score: Number(item.score ?? tool.score ?? 0),
    sourceName: tool.sourceName ?? item.sourceName ?? "",
    circle: tool.circle ?? item.circle ?? "",
    candidateType: tool.candidateType ?? item.candidateType ?? "product",
    followUpAction: item.followUpAction ?? tool.followUpAction ?? "",
    reason: item.reason ?? "",
    angle: item.angle ?? {},
    accountRecommendation: item.accountRecommendation ?? null,
    copyVariants: rawVariants
  };
}

function scoreToolForAccount(tool, account, recommendationByToolId) {
  const recommendation = recommendationByToolId.get(tool.toolId) ?? tool.accountRecommendation;
  const primary = recommendation?.primary;
  const alternatives = recommendation?.alternatives ?? [];
  const primaryMatch = primary?.accountId === account.id && recommendationHasMatch(primary);
  const alternativeMatch = alternatives.some((item) => item.accountId === account.id && recommendationHasMatch(item));
  const text = `${tool.name} ${tool.reason} ${tool.circle} ${tool.sourceName} ${tool.angle?.audience ?? ""} ${tool.angle?.outcome ?? ""}`.toLowerCase();
  const accountText = `${account.displayName ?? ""} ${account.category ?? ""} ${account.id ?? ""}`.toLowerCase();
  const keywordMatches = (account.keywords ?? []).filter((keyword) => text.includes(String(keyword).toLowerCase())).length;
  const pillarMatches = (account.contentPillars ?? []).filter((pillar) => text.includes(String(pillar).toLowerCase())).length;
  const categoryMatch = account.category && text.includes(String(account.category).toLowerCase());
  const circleMatch = tool.circle && accountText.includes(String(tool.circle).replace(/_/g, " ").toLowerCase());
  const routingScore = (primaryMatch ? 100 : 0) + (alternativeMatch ? 45 : 0);
  const organicScore = keywordMatches * 6 + pillarMatches * 4 + (categoryMatch ? 10 : 0) + (circleMatch ? 10 : 0);

  if (routingScore + organicScore <= 0) return 0;

  return routingScore
    + organicScore
    + Number(tool.score || 0) / 2;
}

function recommendationHasMatch(summary) {
  return Boolean((summary?.matchedKeywords ?? []).length || (summary?.matchedPillars ?? []).length);
}

function chooseVariantType(tool, account) {
  const category = `${account.category ?? ""} ${account.displayName ?? ""}`.toLowerCase();
  if (tool.candidateType === "topic") return "casualPost";
  if (tool.followUpAction === "thread candidate") return "threadOpening";
  if (tool.followUpAction === "review page candidate") return "contrarianAngle";
  if (tool.followUpAction === "affiliate priority") return "painPointHook";
  if (category.includes("pricing") || category.includes("market") || category.includes("seo")) return "contrarianAngle";
  return "shortPost";
}

function firstCopy(copyVariants) {
  return Object.values(copyVariants ?? {}).find(Boolean) ?? "";
}

function draftReason(tool, account, matchScore) {
  return `${account.displayName} match score ${Math.round(matchScore)}; ${tool.sourceName || "source"}; ${tool.followUpAction || "candidate"}.`;
}
