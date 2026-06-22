import { sourceImportRowsToCsv } from "./content-source-system.mjs";

const DEFAULT_MAX_CIRCLE_BATCHES = 4;
const DEFAULT_MAX_ACCOUNT_BATCHES = 5;

export function buildSupplyGapFiller({
  date,
  latest = null,
  sourceImportPack = null,
  accountRefillWorkbench = null,
  accountContentMatrix = null,
  contentSourceConfig = null,
  sourceNetwork = null,
  maxCircleBatches = DEFAULT_MAX_CIRCLE_BATCHES,
  maxAccountBatches = DEFAULT_MAX_ACCOUNT_BATCHES
}) {
  const resolvedDate = date || latest?.date || sourceImportPack?.date || accountRefillWorkbench?.date || "";
  const todayBatches = buildCircleBatches({
    date: resolvedDate,
    latest,
    sourceImportPack,
    contentSourceConfig,
    maxBatches: maxCircleBatches
  });
  const accountBatches = buildAccountBatches({
    accountRefillWorkbench,
    maxBatches: maxAccountBatches
  });
  const totalNeededCandidates = Number(sourceImportPack?.summary?.totalNeededCandidates
    ?? latest?.sourceQualityQueue?.summary?.totalNeededCandidates
    ?? 0);
  const totalRefillNeed = Number(accountRefillWorkbench?.summary?.totalRefillNeed
    ?? accountContentMatrix?.inventory?.summary?.totalRefillNeed
    ?? 0);
  const targetDailyPosts = Number(accountRefillWorkbench?.summary?.targetDailyPosts
    ?? accountContentMatrix?.summary?.targetDailyPosts
    ?? latest?.supplyPlan?.targetDrafts
    ?? 0);
  const postableToday = Number(accountRefillWorkbench?.summary?.postableToday
    ?? accountContentMatrix?.inventory?.summary?.postableToday
    ?? 0);
  const rowsToCollect = todayBatches.reduce((sum, batch) => sum + batch.targetCandidates, 0);
  const networkSummary = buildSourceNetworkSummary(sourceNetwork);
  const networkNeedsSupply = Number(networkSummary?.projectedGap ?? 0) > 0;
  const status = totalNeededCandidates > 0 || totalRefillNeed > 0 || networkNeedsSupply ? "needs_supply" : "covered";

  return {
    version: 1,
    date: resolvedDate,
    generatedAt: new Date().toISOString(),
    status,
    headline: buildHeadline({ status, todayBatches, accountBatches, totalNeededCandidates, totalRefillNeed }),
    summary: {
      targetDailyPosts,
      postableToday,
      totalRefillNeed,
      totalNeededCandidates,
      rowsToCollect,
      sourceNetworkRequiredInventory: Number(networkSummary?.requiredInventory ?? 0),
      sourceNetworkCurrentInventory: Number(networkSummary?.currentInventory ?? 0),
      sourceNetworkProjectedInventory: Number(networkSummary?.projectedInventory ?? 0),
      sourceNetworkProjectedGap: Number(networkSummary?.projectedGap ?? 0),
      focusCircles: todayBatches.length,
      focusAccounts: accountBatches.length,
      sourceRows: Number(sourceImportPack?.summary?.totalRows ?? sourceImportPack?.rows?.length ?? 0),
      rowsNeedingResearch: Number(sourceImportPack?.summary?.rowsNeedingResearch ?? 0),
      contentBlockedAccounts: Number(accountRefillWorkbench?.summary?.contentBlockedAccounts
        ?? accountContentMatrix?.inventory?.summary?.contentBlockedAccounts
        ?? 0),
      feedbackBlockedAccounts: Number(accountRefillWorkbench?.summary?.feedbackBlockedAccounts
        ?? accountContentMatrix?.inventory?.summary?.feedbackBlockedAccounts
        ?? 0)
    },
    actionList: buildActionList({ todayBatches, accountBatches, postableToday, sourceNetwork: networkSummary }),
    todayBatches,
    accountBatches,
    sourceNetwork: networkSummary,
    guardrails: [
      "Fill only real candidates with name, url, and tagline.",
      "Leave weak or duplicate rows blank; blank rows are ignored by import.",
      "Use this to refill supply, not to authorize automatic publishing.",
      "After importing candidates, rerun daily before choosing posts."
    ],
    commands: [
      "npm run supply-gap",
      "npm run source-pack",
      "npm run daily",
      "npm start"
    ]
  };
}

export function renderSupplyGapFillerMarkdown(plan) {
  if (!plan) return "# Supply Gap Filler\n\nNo data available. Run npm run daily first.\n";
  return `# Supply Gap Filler - ${plan.date}

- Status: ${plan.status}
- Headline: ${plan.headline}
- Target posts: ${plan.summary.targetDailyPosts}/day
- Postable today: ${plan.summary.postableToday}
- Total refill need: ${plan.summary.totalRefillNeed}
- Needed candidates: ${plan.summary.totalNeededCandidates}
- Rows to collect now: ${plan.summary.rowsToCollect}
- Source network inventory: ${plan.summary.sourceNetworkCurrentInventory}/${plan.summary.sourceNetworkRequiredInventory}
- Source network projected gap: ${plan.summary.sourceNetworkProjectedGap}
- Focus circles: ${plan.summary.focusCircles}
- Focus accounts: ${plan.summary.focusAccounts}

## Today Action List

${plan.actionList.length ? plan.actionList.map((item, index) => `${index + 1}. ${item.title} — ${item.detail}`).join("\n") : "No supply action needed."}

## Circle Batches

${plan.todayBatches.length ? plan.todayBatches.map(renderCircleBatchMarkdown).join("\n\n") : "No circle batch needed."}

## Account Batches

${plan.accountBatches.length ? plan.accountBatches.map(renderAccountBatchMarkdown).join("\n\n") : "No account batch needed."}

## Source Network

${renderSourceNetworkGapMarkdown(plan.sourceNetwork)}

## Guardrails

${plan.guardrails.map((item) => `- ${item}`).join("\n")}
`;
}

function buildCircleBatches({ date, latest, sourceImportPack, contentSourceConfig, maxBatches }) {
  const rowsByCircle = groupRowsByCircle(sourceImportPack?.rows ?? []);
  const discoveryByCircle = new Map((latest?.sourceDiscovery?.circles ?? []).map((item) => [item.circleId, item]));
  const queueByCircle = new Map((latest?.sourceQualityQueue?.items ?? []).map((item) => [item.circleId, item]));
  const configuredCircles = new Map((contentSourceConfig?.circles ?? []).map((circle) => [circle.id, circle]));
  const circleSummaries = sourceImportPack?.rowsByCircle?.length
    ? sourceImportPack.rowsByCircle
    : [...queueByCircle.values()].map((item) => ({
      circleId: item.circleId,
      circleName: item.circleName,
      rows: item.neededCandidates,
      neededCandidates: item.neededCandidates,
      currentQualifiedTools: item.currentQualifiedTools,
      affectedAccounts: item.affectedAccounts,
      importHint: item.importHint
    }));

  return circleSummaries
    .map((circle) => {
      const circleId = circle.circleId || circle.circle || "";
      const queue = queueByCircle.get(circleId) ?? {};
      const discovery = discoveryByCircle.get(circleId) ?? {};
      const config = configuredCircles.get(circleId) ?? {};
      const rows = rowsByCircle.get(circleId) ?? [];
      const targetCandidates = targetCandidateCount({
        rows: Number(circle.rows ?? rows.length ?? 0),
        needed: Number(circle.neededCandidates ?? queue.neededCandidates ?? 0)
      });
      const batchRows = rows.slice(0, targetCandidates);
      const searchLinks = mergeSearchLinks(rowsToSearchLinks(batchRows), discovery.searchLinks ?? []);
      const affectedAccounts = circle.affectedAccounts ?? queue.affectedAccounts ?? [];
      const qualityChecklist = checklistFromRows(batchRows, circleId);
      const circleName = circle.circleName || queue.circleName || config.name || circleId;

      return {
        batchId: `circle:${circleId}`,
        type: "circle",
        date,
        circleId,
        circleName,
        targetCandidates,
        neededCandidates: Number(circle.neededCandidates ?? queue.neededCandidates ?? 0),
        currentQualifiedTools: Number(circle.currentQualifiedTools ?? queue.currentQualifiedTools ?? 0),
        assignedRows: Number(circle.rows ?? rows.length ?? 0),
        affectedAccounts,
        searchLinks,
        searchUrls: searchLinks.map((link) => link.url).filter(Boolean),
        csv: sourceImportRowsToCsv(batchRows),
        csvRows: batchRows.length,
        qualityChecklist,
        nextAction: `Collect ${targetCandidates} real ${circleName} candidates, then import only filled rows.`,
        reason: circle.importHint || queue.importHint || `This circle still needs ${circle.neededCandidates ?? queue.neededCandidates ?? 0} stronger candidates.`,
        rows: batchRows
      };
    })
    .filter((batch) => batch.circleId && (batch.targetCandidates > 0 || batch.neededCandidates > 0))
    .sort((a, b) => batchPriority(b) - batchPriority(a) || a.circleName.localeCompare(b.circleName))
    .slice(0, maxBatches);
}

function buildAccountBatches({ accountRefillWorkbench, maxBatches }) {
  const accounts = accountRefillWorkbench?.focusAccounts?.length
    ? accountRefillWorkbench.focusAccounts
    : accountRefillWorkbench?.accounts ?? [];

  return accounts
    .filter((account) => Number(account.refillNeed ?? 0) > 0 || Number(account.postableToday ?? 0) > 0)
    .slice(0, maxBatches)
    .map((account) => {
      const targetCandidates = Math.max(1, Math.min(10, Number(account.refillNeed ?? account.csvRows ?? 0) || 5));
      return {
        batchId: `account:${account.accountId}`,
        type: "account",
        accountId: account.accountId,
        displayName: account.displayName,
        category: account.category || "",
        status: account.status,
        statusLabel: account.statusLabel || account.status || "",
        firstBottleneck: account.firstBottleneck || "",
        targetCandidates,
        refillNeed: Number(account.refillNeed ?? 0),
        postableToday: Number(account.postableToday ?? 0),
        targetPosts: Number(account.targetPosts ?? 0),
        searchLinks: account.searchLinks ?? [],
        searchUrls: account.searchUrls ?? [],
        csv: account.csv || "",
        csvRows: Number(account.csvRows ?? 0),
        nextAction: `Fill ${targetCandidates} real candidates for ${account.displayName}.`,
        reason: account.actionDetail || account.actionLabel || "This account needs account-specific supply before scale."
      };
    });
}

function buildActionList({ todayBatches, accountBatches, postableToday, sourceNetwork = null }) {
  const actions = [];
  const topNetworkLane = sourceNetwork?.lanes?.find((lane) => Number(lane.projectedGap || 0) > 0);
  if (topNetworkLane) {
    actions.push({
      type: "source_network_lane",
      title: `优先补 ${topNetworkLane.name}`,
      detail: `100 账号库存预计还缺 ${topNetworkLane.projectedGap} 条；当前候选 ${topNetworkLane.directCandidateCount} 条，库存 ${topNetworkLane.currentInventory}/${topNetworkLane.requiredInventory}。`,
      laneId: topNetworkLane.laneId
    });
  }
  const premiumAction = sourceNetwork?.premiumActions?.[0];
  if (premiumAction) {
    actions.push({
      type: "premium_source_budget",
      title: `评估 ${premiumAction.sourceName}`,
      detail: `${premiumAction.sourceName} 可补 ${premiumAction.laneName}，预计缺口 ${premiumAction.projectedGap}。先用公开源验证，再决定是否付费。`,
      sourceId: premiumAction.sourceId
    });
  }
  const topCircle = todayBatches[0];
  const topAccount = accountBatches[0];
  if (topCircle) {
    actions.push({
      type: "collect_circle",
      title: `补 ${topCircle.circleName}`,
      detail: `先找 ${topCircle.targetCandidates} 条真实候选，影响 ${topCircle.affectedAccounts.length} 个账号。`,
      batchId: topCircle.batchId
    });
  }
  if (topAccount) {
    actions.push({
      type: "collect_account",
      title: `补 ${topAccount.displayName}`,
      detail: `账号还缺 ${topAccount.refillNeed} 条，先用搜索组补 ${topAccount.targetCandidates} 条。`,
      batchId: topAccount.batchId
    });
  }
  if (todayBatches.length || accountBatches.length) {
    actions.push({
      type: "import_candidates",
      title: "导入候选后重新跑 daily",
      detail: "粘贴 CSV 先预览评分，只导入可导入项，再刷新每日包。"
    });
  }
  if (postableToday > 0) {
    actions.push({
      type: "review_publish",
      title: "发布前走最终审核",
      detail: `${postableToday} 条理论可发，但仍要检查账号、重复、freshness 和反馈债。`
    });
  }
  return actions.slice(0, 5);
}

function buildSourceNetworkSummary(sourceNetwork) {
  const supply = sourceNetwork?.supply ?? sourceNetwork;
  if (!supply?.summary) return null;
  const lanes = (supply.lanes ?? [])
    .map((lane) => ({
      laneId: lane.laneId,
      name: lane.name || lane.laneId,
      requiredInventory: Number(lane.requiredInventory || 0),
      currentInventory: Number(lane.currentInventory || 0),
      directCandidateCount: Number(lane.directCandidateCount || 0),
      projectedInventory: Number(lane.projectedInventory || 0),
      projectedGap: Number(lane.projectedGap || 0),
      status: lane.status || ""
    }))
    .sort((a, b) => b.projectedGap - a.projectedGap);
  const registrySources = sourceNetwork?.registry?.sources ?? [];
  const premiumActions = lanes
    .filter((lane) => lane.projectedGap > 0)
    .map((lane) => {
      const source = registrySources.find((entry) => entry.tier === "L0" && (entry.laneIds ?? []).includes(lane.laneId));
      if (!source) return null;
      return {
        laneId: lane.laneId,
        laneName: lane.name,
        sourceId: source.sourceId,
        sourceName: source.name,
        projectedGap: lane.projectedGap
      };
    })
    .filter(Boolean);
  return {
    targetAccounts: Number(supply.summary.targetAccounts || 0),
    inventoryPerAccount: Number(supply.summary.inventoryPerAccount || 0),
    requiredInventory: Number(supply.summary.requiredInventory || 0),
    currentInventory: Number(supply.summary.currentInventory || 0),
    projectedInventory: Number(supply.summary.projectedInventory || 0),
    currentGap: Number(supply.summary.inventoryGap || 0),
    projectedGap: Number(supply.summary.projectedGap || 0),
    directCandidates: Number(supply.summary.directCandidates || 0),
    reviewOnlyCandidates: Number(supply.summary.reviewOnlyCandidates || 0),
    lanes,
    premiumActions
  };
}

function renderSourceNetworkGapMarkdown(sourceNetwork) {
  if (!sourceNetwork) return "No source network data yet. Run npm run source-network or npm run daily.";
  const lanes = sourceNetwork.lanes?.length
    ? sourceNetwork.lanes.map((lane) => `- ${lane.name}: current ${lane.currentInventory}/${lane.requiredInventory}, candidates ${lane.directCandidateCount}, projected gap ${lane.projectedGap}`).join("\n")
    : "- No lane data.";
  const premium = sourceNetwork.premiumActions?.length
    ? sourceNetwork.premiumActions.slice(0, 5).map((item) => `- ${item.sourceName}: helps ${item.laneName}, projected gap ${item.projectedGap}`).join("\n")
    : "- No premium source recommendation yet.";
  return `- Target accounts: ${sourceNetwork.targetAccounts}
- Required inventory: ${sourceNetwork.requiredInventory}
- Projected inventory: ${sourceNetwork.projectedInventory}
- Projected gap: ${sourceNetwork.projectedGap}

### Lane Gaps

${lanes}

### Premium Source Watchlist

${premium}`;
}

function buildHeadline({ status, todayBatches, accountBatches, totalNeededCandidates, totalRefillNeed }) {
  if (status === "covered") return "Content supply is covered under the current target.";
  if (todayBatches[0]) {
    return `Start with ${todayBatches[0].circleName}; source queue still needs ${totalNeededCandidates} candidates.`;
  }
  if (accountBatches[0]) {
    return `Start with ${accountBatches[0].displayName}; accounts still need ${totalRefillNeed} refill rows.`;
  }
  return "Supply is short; generate a source pack before trying to scale posts.";
}

function renderCircleBatchMarkdown(batch, index) {
  return `### ${index + 1}. ${batch.circleName}

- Target candidates now: ${batch.targetCandidates}
- Needed candidates: ${batch.neededCandidates}
- Current qualified tools: ${batch.currentQualifiedTools}
- Affected accounts: ${batch.affectedAccounts.length ? batch.affectedAccounts.map((account) => `${account.displayName} gap ${account.gap}`).join("; ") : "none"}
- Next action: ${batch.nextAction}
- Search links:
${batch.searchLinks.length ? batch.searchLinks.slice(0, 6).map((link) => `  - ${link.provider}: ${link.url}`).join("\n") : "  - none"}

CSV template:

\`\`\`csv
${batch.csv}
\`\`\``;
}

function renderAccountBatchMarkdown(batch, index) {
  return `### ${index + 1}. ${batch.displayName}

- Status: ${batch.statusLabel}
- Refill need: ${batch.refillNeed}
- Postable today: ${batch.postableToday}/${batch.targetPosts}
- First bottleneck: ${batch.firstBottleneck || "none"}
- Next action: ${batch.nextAction}
- Search links:
${batch.searchLinks.length ? batch.searchLinks.slice(0, 6).map((link) => `  - ${link.provider}: ${link.url}`).join("\n") : "  - none"}`;
}

function groupRowsByCircle(rows) {
  const map = new Map();
  for (const row of rows) {
    const circleId = row.circle || "";
    if (!circleId) continue;
    map.set(circleId, [...(map.get(circleId) ?? []), row]);
  }
  return map;
}

function rowsToSearchLinks(rows) {
  return rows
    .filter((row) => row.researchUrl || row.sourceUrl)
    .map((row) => ({
      provider: row.researchProvider || "Search",
      query: row.researchQuery || "",
      url: row.researchUrl || row.sourceUrl
    }));
}

function mergeSearchLinks(primary, secondary) {
  const seen = new Set();
  const merged = [];
  for (const link of [...primary, ...secondary]) {
    if (!link?.url || seen.has(link.url)) continue;
    seen.add(link.url);
    merged.push({
      provider: link.provider || link.label || "Search",
      label: link.label || link.provider || "Search",
      query: link.query || "",
      url: link.url
    });
  }
  return merged.slice(0, 8);
}

function checklistFromRows(rows, circleId) {
  const raw = rows.find((row) => row.acceptanceChecklist)?.acceptanceChecklist || "";
  const items = raw.split("|").map((item) => item.trim()).filter(Boolean);
  if (items.length) return items;
  if (circleId === "crypto_builders") return ["real URL", "builder or infrastructure angle", "not pure price drama", "clear audience"];
  if (circleId === "ai_startups") return ["real URL", "AI product or founder signal", "clear buyer pain", "not broad hype"];
  return ["real URL", "clear audience", "one narrow pain", "fresh enough or evergreen"];
}

function targetCandidateCount({ rows, needed }) {
  const available = Number(rows || 0);
  const required = Number(needed || available || 5);
  if (!available) return Math.max(1, Math.min(10, required || 5));
  return Math.max(1, Math.min(10, available, required || available));
}

function batchPriority(batch) {
  return Number(batch.neededCandidates ?? 0)
    + Number(batch.affectedAccounts?.length ?? 0) * 3
    + Number(batch.assignedRows ?? 0) / 10;
}
