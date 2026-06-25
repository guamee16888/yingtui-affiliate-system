import { createToolId } from "./ids.mjs";
import {
  DEFAULT_CONTENT_SOURCE_CONFIG,
  DEFAULT_SOURCE_CANDIDATES,
  normalizeContentSourceConfig
} from "./content-source/config.mjs";
import { daysSince, evaluateSourceCandidateQuality } from "./content-source/quality.mjs";

export {
  CONTENT_SOURCES_PATH,
  SOURCE_CANDIDATES_PATH,
  DEFAULT_CONTENT_SOURCE_CONFIG,
  DEFAULT_SOURCE_CANDIDATES,
  loadContentSourceConfig,
  loadSourceCandidates,
  normalizeContentSourceConfig,
  saveSourceCandidates
} from "./content-source/config.mjs";
export {
  refreshSourceCandidates,
  sourceCandidatesToTools
} from "./content-source/candidates.mjs";
export { evaluateSourceCandidateQuality } from "./content-source/quality.mjs";
export {
  renderSourceDiscoveryMarkdown,
  renderSourceHealthMarkdown,
  renderSourceQualityQueueMarkdown,
  renderSourceSupplyWorkbenchMarkdown
} from "./content-source/render.mjs";

export function buildSupplyPlan({ date, scored = [], accountStrategy = null, contentSourceConfig = DEFAULT_CONTENT_SOURCE_CONFIG }) {
  const config = normalizeContentSourceConfig(contentSourceConfig);
  const targetAccounts = Number(config.dailyTargets.accounts || accountStrategy?.summary?.activeAccounts || 0);
  const targetPerAccount = Number(config.dailyTargets.postsPerAccount || 0);
  const minimumQualityScore = Number(config.dailyTargets.minimumQualityScore || 18);
  const activeAccounts = accountStrategy?.accounts ?? [];
  const qualified = scored.filter((item) => item.followUpAction !== "skip" && Number(item.score) >= minimumQualityScore);
  const uniqueQualifiedTools = uniqueByTool(qualified);
  const possibleDrafts = uniqueQualifiedTools.length * 5;
  const targetDrafts = targetAccounts * targetPerAccount;
  const accountCoverage = activeAccounts.map((account) => {
    const matches = uniqueQualifiedTools.filter((item) => accountMatchesItem(account, item));
    const availableDrafts = Math.min(targetPerAccount, matches.length);
    return {
      accountId: account.id,
      displayName: account.displayName,
      category: account.category,
      targetPosts: targetPerAccount,
      availableDrafts,
      qualifiedTools: matches.length,
      gap: Math.max(0, targetPerAccount - availableDrafts),
      status: availableDrafts >= targetPerAccount ? "covered" : "short"
    };
  });
  const circleCoverage = config.circles.map((circle) => {
    const items = uniqueQualifiedTools.filter((item) => itemMatchesCircle(item, circle));
    return {
      circleId: circle.id,
      name: circle.name,
      qualifiedTools: items.length,
      possibleDrafts: items.length * 5
    };
  });
  const totalGap = Math.max(0, targetDrafts - possibleDrafts);
  const accountShort = accountCoverage.some((account) => account.status === "short");
  const status = totalGap === 0 && !accountShort ? "covered" : "short";

  return {
    date,
    targetAccounts,
    targetPerAccount,
    targetDrafts,
    minimumQualityScore,
    qualifiedTools: uniqueQualifiedTools.length,
    possibleDrafts,
    totalGap,
    status,
    note: status === "covered"
      ? "Supply is enough for the configured account target, subject to manual review."
      : "Supply is short for at least one account or circle. Add more source candidates instead of lowering quality just to fill slots.",
    accountCoverage,
    circleCoverage
  };
}

export function buildSourceQualityQueue({ supplyPlan = null, contentSourceConfig = DEFAULT_CONTENT_SOURCE_CONFIG }) {
  const config = normalizeContentSourceConfig(contentSourceConfig);
  if (!supplyPlan) {
    return {
      summary: { items: 0, totalNeededCandidates: 0 },
      items: []
    };
  }

  const accountGaps = (supplyPlan.accountCoverage ?? [])
    .filter((account) => Number(account.gap) > 0)
    .sort((a, b) => Number(b.gap) - Number(a.gap));

  const items = config.circles.map((circle) => {
    const affectedAccounts = accountGaps.filter((account) => accountLooksLikeCircle(account, circle));
    const circleCoverage = (supplyPlan.circleCoverage ?? []).find((item) => item.circleId === circle.id);
    const accountGap = affectedAccounts.reduce((sum, account) => sum + Number(account.gap || 0), 0);
    const baselineNeed = Math.max(0, Math.ceil(Number(supplyPlan.targetPerAccount || 10) * 2) - Number(circleCoverage?.qualifiedTools || 0));
    const neededCandidates = Math.max(accountGap, baselineNeed);

    return {
      circleId: circle.id,
      circleName: circle.name,
      priorityScore: neededCandidates + affectedAccounts.length * 2,
      neededCandidates,
      currentQualifiedTools: Number(circleCoverage?.qualifiedTools || 0),
      affectedAccounts: affectedAccounts.map((account) => ({
        accountId: account.accountId,
        displayName: account.displayName,
        gap: account.gap,
        category: account.category
      })),
      recommendedSources: recommendedSourcesForCircle(config, circle),
      searchQueries: searchQueriesForCircle(circle),
      importHint: `Add ${neededCandidates || 5} fresh ${circle.name} candidates with clear buyer, narrow pain, and a real URL.`
    };
  })
    .filter((item) => item.neededCandidates > 0 || item.affectedAccounts.length > 0)
    .sort((a, b) => b.priorityScore - a.priorityScore || a.circleName.localeCompare(b.circleName));

  return {
    summary: {
      items: items.length,
      totalNeededCandidates: items.reduce((sum, item) => sum + item.neededCandidates, 0),
      topCircle: items[0]?.circleName ?? ""
    },
    items
  };
}

export function buildSourceHealth({ date, sourceCandidates = DEFAULT_SOURCE_CANDIDATES, scored = [], contentSourceConfig = DEFAULT_CONTENT_SOURCE_CONFIG, sourceQualityQueue = null }) {
  const config = normalizeContentSourceConfig(contentSourceConfig);
  const scoreByToolId = new Map(scored.map((item) => [item.toolId || createToolId(item.tool?.name, item.tool?.url), item]));
  const candidateItems = sourceCandidates.items ?? [];
  const sourceReports = config.sources.map((source) => sourceHealthForSource({
    date,
    source,
    candidates: candidateItems.filter((item) => item.source === source.id),
    scoreByToolId,
    minimumQualityScore: Number(config.dailyTargets?.minimumQualityScore ?? 18)
  }));
  const orphanSources = [...new Set(candidateItems.map((item) => item.source).filter(Boolean))]
    .filter((sourceId) => !config.sources.some((source) => source.id === sourceId))
    .map((sourceId) => sourceHealthForSource({
      date,
      source: {
        id: sourceId,
        name: sourceId,
        circle: candidateItems.find((item) => item.source === sourceId)?.circle ?? "",
        enabled: true,
        type: "unknown",
        candidateType: "topic",
        includeKeywords: [],
        excludeKeywords: []
      },
      candidates: candidateItems.filter((item) => item.source === sourceId),
      scoreByToolId,
      minimumQualityScore: Number(config.dailyTargets?.minimumQualityScore ?? 18)
    }));
  const sources = [...sourceReports, ...orphanSources].sort((a, b) => b.healthScore - a.healthScore || a.name.localeCompare(b.name));
  const circles = config.circles.map((circle) => circleHealthForCircle(circle, sources, sourceQualityQueue));

  return {
    date,
    generatedAt: new Date().toISOString(),
    minimumQualityScore: Number(config.dailyTargets?.minimumQualityScore ?? 18),
    summary: {
      configuredSources: config.sources.length,
      enabledSources: config.sources.filter((source) => source.enabled).length,
      trackedSources: sources.length,
      healthySources: sources.filter((source) => source.status === "healthy").length,
      tuneSources: sources.filter((source) => source.status === "tune").length,
      disableCandidates: sources.filter((source) => source.status === "disable_candidate").length,
      totalCandidates: sources.reduce((sum, source) => sum + source.totalCandidates, 0),
      qualifiedCandidates: sources.reduce((sum, source) => sum + source.qualifiedCandidates, 0),
      noiseCandidates: sources.reduce((sum, source) => sum + source.noiseCandidates, 0)
    },
    sources,
    circles,
    recommendations: sourceHealthRecommendations(sources, circles)
  };
}

export function buildSourceDiscoveryPack({ date, sourceQualityQueue = null, contentSourceConfig = DEFAULT_CONTENT_SOURCE_CONFIG }) {
  const config = normalizeContentSourceConfig(contentSourceConfig);
  const queueItems = sourceQualityQueue?.items?.length
    ? sourceQualityQueue.items
    : config.circles.map((circle) => ({
      circleId: circle.id,
      circleName: circle.name,
      neededCandidates: 5,
      currentQualifiedTools: 0,
      searchQueries: searchQueriesForCircle(circle),
      recommendedSources: recommendedSourcesForCircle(config, circle),
      importHint: `Find 5 fresh ${circle.name} candidates with clear buyer, narrow pain, and a real URL.`
    }));

  const circles = queueItems.map((item) => {
    const circle = config.circles.find((entry) => entry.id === item.circleId) ?? { id: item.circleId, name: item.circleName, keywords: [] };
    const queries = item.searchQueries?.length ? item.searchQueries : searchQueriesForCircle(circle);
    const primaryQueries = queries.slice(0, 4);

    return {
      circleId: item.circleId,
      circleName: item.circleName,
      priorityScore: Number(item.priorityScore || item.neededCandidates || 0),
      neededCandidates: Number(item.neededCandidates || 0),
      currentQualifiedTools: Number(item.currentQualifiedTools || 0),
      openingMove: sourceDiscoveryOpeningMove(item),
      importHint: item.importHint,
      searchLinks: primaryQueries.flatMap((query) => discoveryLinksForQuery(query, item.circleId)),
      sourceIdeas: sourceIdeasForCircle(item.circleId),
      configuredSources: item.recommendedSources ?? recommendedSourcesForCircle(config, circle),
      qualityChecklist: [
        "Has a real URL, not only a vague trend.",
        "Clear buyer or audience.",
        "One narrow pain point.",
        "Fresh enough for X, or evergreen enough for a review page.",
        "Avoid pure price/news drama unless there is a builder or product angle."
      ]
    };
  }).sort((a, b) => b.priorityScore - a.priorityScore || a.circleName.localeCompare(b.circleName));

  return {
    date,
    generatedAt: new Date().toISOString(),
    summary: {
      circles: circles.length,
      totalNeededCandidates: circles.reduce((sum, item) => sum + item.neededCandidates, 0),
      totalSearchLinks: circles.reduce((sum, item) => sum + item.searchLinks.length, 0),
      topCircle: circles[0]?.circleName ?? ""
    },
    circles
  };
}

export function buildSourceSupplyWorkbench({
  date,
  supplyPlan = null,
  sourceQualityQueue = null,
  sourceDiscovery = null,
  sourceHealth = null,
  candidateInbox = { items: [] },
  sourceCandidates = DEFAULT_SOURCE_CANDIDATES
}) {
  const activeInbox = (candidateInbox.items ?? []).filter((item) => item.status === "active");
  const activeSourceCandidates = (sourceCandidates.items ?? []).filter((item) => item.status === "active");
  const queueItems = sourceQualityQueue?.items ?? [];
  const discoveryByCircle = new Map((sourceDiscovery?.circles ?? []).map((circle) => [circle.circleId, circle]));
  const healthByCircle = new Map((sourceHealth?.sources ?? []).reduce((entries, source) => {
    const circle = source.circle || "unknown";
    entries.set(circle, [...(entries.get(circle) ?? []), source]);
    return entries;
  }, new Map()));
  const circleIds = new Set([...queueItems.map((item) => item.circleId), ...discoveryByCircle.keys()]);
  const circles = [...circleIds].map((circleId) => {
    const queueItem = queueItems.find((item) => item.circleId === circleId) ?? {};
    const discoveryItem = discoveryByCircle.get(circleId) ?? {};
    const healthSources = healthByCircle.get(circleId) ?? [];
    const searchQueries = queueItem.searchQueries ?? (discoveryItem.searchLinks ?? []).map((link) => link.query).filter(Boolean);
    return {
      circleId,
      circleName: queueItem.circleName || discoveryItem.circleName || circleId,
      priorityScore: Number(queueItem.priorityScore ?? discoveryItem.priorityScore ?? 0),
      neededCandidates: Number(queueItem.neededCandidates ?? discoveryItem.neededCandidates ?? 0),
      currentQualifiedTools: Number(queueItem.currentQualifiedTools ?? discoveryItem.currentQualifiedTools ?? 0),
      affectedAccounts: queueItem.affectedAccounts ?? [],
      openingMove: discoveryItem.openingMove || queueItem.importHint || "Collect candidates, preview score, then import only strong fits.",
      importHint: queueItem.importHint || discoveryItem.importHint || "",
      searchQueries,
      searchLinks: discoveryItem.searchLinks ?? [],
      sourceIdeas: discoveryItem.sourceIdeas ?? [],
      configuredSources: discoveryItem.configuredSources ?? queueItem.recommendedSources ?? [],
      health: {
        trackedSources: healthSources.length,
        enabledSources: healthSources.filter((source) => source.enabled).length,
        healthySources: healthSources.filter((source) => source.status === "healthy").length,
        qualifiedCandidates: healthSources.reduce((sum, source) => sum + Number(source.qualifiedCandidates || 0), 0),
        weakestSource: healthSources.slice().sort((a, b) => Number(a.healthScore || 0) - Number(b.healthScore || 0))[0]?.name ?? ""
      },
      qualityChecklist: discoveryItem.qualityChecklist ?? sourceSupplyQualityChecklist(),
      importTemplate: sourceSupplyCsvTemplate({ circleId, searchQueries })
    };
  }).sort((a, b) => b.neededCandidates - a.neededCandidates || b.priorityScore - a.priorityScore);

  const totalNeededCandidates = sourceQualityQueue?.summary?.totalNeededCandidates
    ?? sourceDiscovery?.summary?.totalNeededCandidates
    ?? circles.reduce((sum, circle) => sum + circle.neededCandidates, 0);
  const supplyGap = Number(supplyPlan?.totalGap ?? 0);
  const status = totalNeededCandidates > 0 || supplyGap > 0 ? "needs_supply" : "covered";

  return {
    date,
    generatedAt: new Date().toISOString(),
    status,
    summary: {
      targetDrafts: Number(supplyPlan?.targetDrafts ?? 0),
      targetAccounts: Number(supplyPlan?.targetAccounts ?? 0),
      targetPerAccount: Number(supplyPlan?.targetPerAccount ?? 0),
      qualifiedTools: Number(supplyPlan?.qualifiedTools ?? 0),
      possibleDrafts: Number(supplyPlan?.possibleDrafts ?? 0),
      supplyGap,
      totalNeededCandidates,
      topCircle: circles[0]?.circleName ?? "",
      activeInboxCount: activeInbox.length,
      activeSourceCandidateCount: activeSourceCandidates.length,
      enabledSources: Number(sourceHealth?.summary?.enabledSources ?? 0),
      configuredSources: Number(sourceHealth?.summary?.configuredSources ?? 0)
    },
    workflow: [
      "Open search links for the top gap circle.",
      "Collect real candidates with a URL, a clear audience, and one narrow pain.",
      "Paste candidates into Candidate Inbox and preview scoring before importing.",
      "Run daily again so account routing and draft planning update from the new supply."
    ],
    commands: [
      "npm run source-workbench",
      "npm run source-pack",
      "npm run daily",
      "npm start"
    ],
    circles,
    sourceHealth: sourceHealth ? {
      summary: sourceHealth.summary,
      recommendations: sourceHealth.recommendations ?? []
    } : null
  };
}

export function buildSourceImportPackRows({ sourceQualityQueue = null, contentSourceConfig = DEFAULT_CONTENT_SOURCE_CONFIG, totalRows = 100, date = "" }) {
  const config = normalizeContentSourceConfig(contentSourceConfig);
  const queueItems = sourceQualityQueue?.items?.length
    ? sourceQualityQueue.items
    : config.circles.map((circle) => ({
      circleId: circle.id,
      circleName: circle.name,
      neededCandidates: Math.ceil(totalRows / Math.max(1, config.circles.length)),
      searchQueries: searchQueriesForCircle(circle)
    }));
  const weighted = distributeRows(queueItems, totalRows);
  const rows = [];

  for (const item of weighted) {
    for (let index = 0; index < item.rows; index += 1) {
      const query = item.searchQueries[index % item.searchQueries.length] ?? item.circleName;
      const research = sourceResearchTask({
        item,
        query,
        index,
        date
      });
      rows.push({
        researchId: research.researchId,
        priority: research.priority,
        name: "",
        url: "",
        tagline: "",
        source: "manual_research",
        circle: item.circleId,
        candidateType: index % 3 === 0 ? "topic" : "product",
        sourceUrl: research.researchUrl,
        published: date,
        researchProvider: research.researchProvider,
        researchQuery: query,
        researchUrl: research.researchUrl,
        acceptanceChecklist: research.acceptanceChecklist,
        notes: research.notes
      });
    }
  }

  return rows.slice(0, totalRows);
}

export function buildSourceImportPack({
  date,
  sourceQualityQueue = null,
  contentSourceConfig = DEFAULT_CONTENT_SOURCE_CONFIG,
  totalRows = 100,
  csvPath = "",
  guidePath = ""
}) {
  const config = normalizeContentSourceConfig(contentSourceConfig);
  const rows = buildSourceImportPackRows({ sourceQualityQueue, contentSourceConfig: config, totalRows, date });
  const rowsByCircle = summarizeRowsByCircle(rows, sourceQualityQueue, config);
  const rowsByCandidateType = summarizeRows(rows, "candidateType");
  const rowsByResearchProvider = summarizeRows(rows, "researchProvider");
  const collectionPlan = buildSourceCollectionPlan(rowsByCircle, rowsByResearchProvider);
  const priorityGaps = (sourceQualityQueue?.items ?? []).map((item) => ({
    circleId: item.circleId,
    circleName: item.circleName,
    neededCandidates: Number(item.neededCandidates || 0),
    currentQualifiedTools: Number(item.currentQualifiedTools || 0),
    assignedRows: rows.filter((row) => row.circle === item.circleId).length,
    affectedAccounts: item.affectedAccounts ?? [],
    importHint: item.importHint || ""
  }));

  return {
    version: 1,
    date,
    generatedAt: new Date().toISOString(),
    summary: {
      totalRows: rows.length,
      circles: rowsByCircle.length,
      productRows: rows.filter((row) => row.candidateType === "product").length,
      topicRows: rows.filter((row) => row.candidateType === "topic").length,
      rowsNeedingResearch: rows.filter((row) => !row.name || !row.url || !row.tagline).length,
      rowsWithResearchUrl: rows.filter((row) => row.researchUrl).length,
      totalNeededCandidates: Number(sourceQualityQueue?.summary?.totalNeededCandidates ?? priorityGaps.reduce((sum, item) => sum + item.neededCandidates, 0)),
      topCircle: sourceQualityQueue?.summary?.topCircle || rowsByCircle[0]?.circleName || "",
      generatedFromQueue: Boolean(sourceQualityQueue?.items?.length),
      csvPath,
      guidePath
    },
    rowsByCircle,
    rowsByCandidateType,
    rowsByResearchProvider,
    collectionPlan,
    priorityGaps,
    rows
  };
}

export function sourceImportRowsToCsv(rows) {
  const headers = ["researchId", "priority", "name", "url", "tagline", "source", "circle", "candidateType", "sourceUrl", "published", "researchProvider", "researchQuery", "researchUrl", "acceptanceChecklist", "notes"];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header] ?? "")).join(","))
  ].join("\n");
}

function sourceResearchTask({ item, query, index, date }) {
  const links = discoveryLinksForQuery(query, item.circleId);
  const preferred = preferredResearchLink(links, item.circleId, index);
  const priority = sourceResearchPriority(item, index);
  return {
    researchId: [date || "today", item.circleId, String(index + 1).padStart(3, "0")].join("-"),
    priority,
    researchProvider: preferred.label,
    researchUrl: preferred.url,
    acceptanceChecklist: sourceResearchChecklist(item.circleId).join(" | "),
    notes: [
      `Find from: ${query}`,
      `Open: ${preferred.label}`,
      `Priority: ${priority}`,
      `Accept only if: ${sourceResearchChecklist(item.circleId).join("; ")}`
    ].join(" | ")
  };
}

function preferredResearchLink(links, circleId, index) {
  const preferredLabels = circleId === "crypto_builders"
    ? ["X live search", "CoinDesk search", "Google recent search", "HN Algolia"]
    : circleId === "ai_startups"
      ? ["Product Hunt search", "X live search", "Google recent search", "HN Algolia"]
      : ["X live search", "Google recent search", "HN Algolia"];
  const ordered = preferredLabels
    .map((label) => links.find((link) => link.label === label))
    .filter(Boolean);
  const fallback = links.filter((link) => !ordered.some((item) => item.label === link.label));
  const candidates = [...ordered, ...fallback];
  return candidates[index % Math.max(1, candidates.length)] ?? { label: "Manual search", url: `https://www.google.com/search?q=${encodeURIComponent(links[0]?.query ?? "")}` };
}

function sourceResearchPriority(item, index) {
  const needed = Number(item.neededCandidates || 0);
  if (needed >= 25 && index < 10) return "P0";
  if (needed >= 10 && index < 8) return "P1";
  return "P2";
}

function sourceResearchChecklist(circleId) {
  const common = [
    "real URL",
    "clear audience",
    "one narrow pain",
    "fresh enough or evergreen"
  ];
  if (circleId === "crypto_builders") return [...common, "builder or infrastructure angle", "not pure price drama"];
  if (circleId === "indie_hackers") return [...common, "solo founder or revenue angle"];
  if (circleId === "saas_founders") return [...common, "SaaS operator lesson"];
  if (circleId === "ai_startups") return [...common, "AI product or founder signal"];
  return common;
}

function buildSourceCollectionPlan(rowsByCircle, rowsByResearchProvider) {
  const topCircle = rowsByCircle[0];
  const topProvider = rowsByResearchProvider[0];
  const firstBatch = rowsByCircle.slice(0, 3).map((item) => ({
    circleId: item.circleId,
    circleName: item.circleName,
    targetRows: Math.min(10, item.rows),
    neededCandidates: item.neededCandidates,
    instruction: `Collect ${Math.min(10, item.rows)} real candidates for ${item.circleName}, then import only the rows with name/url/tagline filled.`
  }));
  return {
    headline: topCircle ? `Start with ${topCircle.circleName}; it has ${topCircle.rows} assigned research rows.` : "No source collection gap detected.",
    firstBatch,
    preferredProvider: topProvider?.researchProvider ?? "",
    rule: "Fill name, url, and tagline. Leave weak or duplicate rows blank."
  };
}

function summarizeRowsByCircle(rows, sourceQualityQueue, config) {
  const queueByCircle = new Map((sourceQualityQueue?.items ?? []).map((item) => [item.circleId, item]));
  const circleById = new Map(config.circles.map((circle) => [circle.id, circle]));
  return summarizeRows(rows, "circle").map((item) => {
    const queueItem = queueByCircle.get(item.circle) ?? {};
    const circle = circleById.get(item.circle) ?? {};
    return {
      circleId: item.circle,
      circleName: queueItem.circleName || circle.name || item.circle,
      rows: item.rows,
      neededCandidates: Number(queueItem.neededCandidates || 0),
      currentQualifiedTools: Number(queueItem.currentQualifiedTools || 0),
      affectedAccounts: queueItem.affectedAccounts ?? [],
      importHint: queueItem.importHint || ""
    };
  }).sort((a, b) => Number(b.rows) - Number(a.rows) || a.circleName.localeCompare(b.circleName));
}

function summarizeRows(rows, key) {
  const counts = rows.reduce((map, row) => {
    const value = String(row[key] || "unknown");
    map.set(value, (map.get(value) ?? 0) + 1);
    return map;
  }, new Map());
  return [...counts.entries()]
    .map(([value, rows]) => ({ [key]: value, rows }))
    .sort((a, b) => Number(b.rows) - Number(a.rows) || String(a[key]).localeCompare(String(b[key])));
}

function sourceHealthForSource({ date, source, candidates, scoreByToolId, minimumQualityScore }) {
  const activeCandidates = candidates.filter((item) => item.status === "active");
  const candidateQuality = activeCandidates.map((item) => ({
    item,
    quality: evaluateSourceCandidateQuality(item, source)
  }));
  const scoredCandidates = activeCandidates
    .map((item) => scoreByToolId.get(item.toolId || createToolId(item.name, item.url)))
    .filter(Boolean);
  const qualifiedCandidates = scoredCandidates.filter((item) => item.followUpAction !== "skip" && Number(item.score) >= minimumQualityScore).length;
  const skippedCandidates = scoredCandidates.filter((item) => item.followUpAction === "skip" || Number(item.score) < minimumQualityScore).length;
  const freshCandidates = activeCandidates.filter((item) => daysSince(item.published, date) !== null && daysSince(item.published, date) <= 2).length;
  const noiseCandidates = candidateQuality.filter((entry) => entry.quality.isNoisy).length;
  const totalCandidates = activeCandidates.length;
  const qualityRate = totalCandidates ? qualifiedCandidates / totalCandidates : 0;
  const freshRate = totalCandidates ? freshCandidates / totalCandidates : 0;
  const noiseRate = totalCandidates ? noiseCandidates / totalCandidates : 0;
  const filterConfigured = (source.includeKeywords?.length ? 1 : 0) + (source.excludeKeywords?.length ? 1 : 0);
  const base = source.enabled ? 20 : 5;
  const healthScore = Math.max(0, Math.min(100, Math.round(
    base
    + Math.min(20, totalCandidates * 2)
    + qualityRate * 35
    + freshRate * 20
    + filterConfigured * 8
    - noiseRate * 35
  )));
  const status = sourceHealthStatus({ source, totalCandidates, healthScore, noiseRate, qualityRate });

  return {
    sourceId: source.id,
    name: source.name,
    circle: source.circle,
    type: source.type,
    candidateType: source.candidateType,
    enabled: source.enabled,
    totalCandidates,
    activeCandidates: totalCandidates,
    qualifiedCandidates,
    skippedCandidates,
    freshCandidates,
    noiseCandidates,
    qualityRate: roundRate(qualityRate),
    freshRate: roundRate(freshRate),
    noiseRate: roundRate(noiseRate),
    healthScore,
    status,
    recommendation: sourceRecommendation({ source, status, totalCandidates, qualifiedCandidates, noiseCandidates, qualityRate, noiseRate }),
    sampleNoise: candidateQuality.filter((entry) => entry.quality.isNoisy).slice(0, 3).map((entry) => entry.item.name),
    sampleNoiseDetails: candidateQuality.filter((entry) => entry.quality.isNoisy).slice(0, 3).map((entry) => ({
      name: entry.item.name,
      reason: entry.quality.reason,
      blockedTerms: entry.quality.blockedTerms,
      matchedTerms: entry.quality.matchedTerms
    }))
  };
}

function circleHealthForCircle(circle, sources, sourceQualityQueue) {
  const sourceItems = sources.filter((source) => source.circle === circle.id);
  const queueItem = (sourceQualityQueue?.items ?? []).find((item) => item.circleId === circle.id);
  const totalCandidates = sourceItems.reduce((sum, source) => sum + source.totalCandidates, 0);
  const qualifiedCandidates = sourceItems.reduce((sum, source) => sum + source.qualifiedCandidates, 0);
  const enabledSources = sourceItems.filter((source) => source.enabled).length;
  const healthySources = sourceItems.filter((source) => source.status === "healthy").length;
  const sourceGap = Math.max(0, 3 - enabledSources);
  const candidateGap = Number(queueItem?.neededCandidates ?? 0);

  return {
    circleId: circle.id,
    name: circle.name,
    sources: sourceItems.length,
    enabledSources,
    healthySources,
    totalCandidates,
    qualifiedCandidates,
    sourceGap,
    candidateGap,
    status: enabledSources >= 3 && qualifiedCandidates >= 20 ? "covered" : "short",
    recommendation: sourceGap > 0
      ? `Add or test ${sourceGap} more reliable ${circle.name} sources.`
      : candidateGap > 0
        ? `Import ${candidateGap} more vetted ${circle.name} candidates.`
        : "Source coverage is acceptable under current targets."
  };
}

function sourceHealthStatus({ source, totalCandidates, healthScore, noiseRate, qualityRate }) {
  if (!source.enabled) return "disabled";
  if (!totalCandidates) return "needs_candidates";
  if (noiseRate >= 0.35 || (totalCandidates >= 5 && qualityRate < 0.15)) return "disable_candidate";
  if (healthScore >= 72) return "healthy";
  if (healthScore >= 45) return "tune";
  return "weak";
}

function sourceRecommendation({ source, status, totalCandidates, qualifiedCandidates, noiseCandidates, qualityRate, noiseRate }) {
  if (status === "disabled") return "Disabled in config. Keep off until manual testing proves useful.";
  if (status === "needs_candidates") return "Enabled but produced no active candidates. Check URL, filters, or source reliability.";
  if (status === "disable_candidate") return `High noise or low quality: ${noiseCandidates}/${totalCandidates} noisy, ${qualifiedCandidates} qualified. Tighten filters or disable.`;
  if (status === "tune") return `Keep testing, but tune include/exclude filters. Quality rate ${roundRate(qualityRate)}, noise rate ${roundRate(noiseRate)}.`;
  if (status === "weak") return "Weak source. Use as watch-only until it produces qualified candidates.";
  return "Keep. This source is producing usable candidates under current scoring.";
}

function sourceHealthRecommendations(sources, circles) {
  const actions = [];
  const disable = sources.find((source) => source.status === "disable_candidate");
  const needs = sources.find((source) => source.status === "needs_candidates");
  const sourceGap = circles.find((circle) => circle.sourceGap > 0);
  const candidateGap = circles.find((circle) => circle.candidateGap > 0);

  if (disable) actions.push(`Tune or disable ${disable.name}; it has ${disable.noiseCandidates} noisy candidates and ${disable.qualifiedCandidates} qualified candidates.`);
  if (needs) actions.push(`Check ${needs.name}; it is enabled but produced no active candidates.`);
  if (sourceGap) actions.push(`Add more ${sourceGap.name} sources; current enabled source gap is ${sourceGap.sourceGap}.`);
  if (candidateGap) actions.push(`Fill ${candidateGap.name}; source queue still needs ${candidateGap.candidateGap} candidates.`);
  return actions.slice(0, 6);
}

function sourceDiscoveryOpeningMove(item) {
  const need = Number(item.neededCandidates || 0);
  if (need >= 25) return "Open the X and Google links first, collect 10 candidates, then narrow to 3 that have a concrete product or founder lesson.";
  if (need >= 10) return "Collect 5 candidates from search links, then import only the ones with a clear audience and URL.";
  return "Use this as a watchlist. Add only unusually strong candidates.";
}

function discoveryLinksForQuery(query, circleId) {
  const providers = [
    {
      label: "X live search",
      url: `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`
    },
    {
      label: "Google recent search",
      url: `https://www.google.com/search?q=${encodeURIComponent(`${query} after:2026-01-01`)}`
    },
    {
      label: "HN Algolia",
      url: `https://hn.algolia.com/?q=${encodeURIComponent(query)}`
    }
  ];

  if (circleId === "ai_startups") {
    providers.push({ label: "Product Hunt search", url: `https://www.producthunt.com/search?q=${encodeURIComponent(query)}` });
  }
  if (circleId === "crypto_builders") {
    providers.push({ label: "CoinDesk search", url: `https://www.coindesk.com/search?s=${encodeURIComponent(query)}` });
  }

  return providers.map((provider) => ({
    ...provider,
    query,
    why: "Use this link for manual discovery. Import only candidates that pass the checklist."
  }));
}

function sourceIdeasForCircle(circleId) {
  const ideas = {
    ai_startups: [
      { name: "Product Hunt AI launches", url: "https://www.producthunt.com/topics/artificial-intelligence", why: "Good for new AI tools, but still needs pain/niche filtering." },
      { name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/", why: "Useful for market signals and AI startup funding/product shifts." },
      { name: "Hacker News AI searches", url: "https://hn.algolia.com/?q=AI%20agent", why: "Good for technical/founder debates when filtered manually." }
    ],
    indie_hackers: [
      { name: "Indie Hackers products", url: "https://www.indiehackers.com/products", why: "Best for revenue, launch, and solo founder stories." },
      { name: "X build in public search", url: "https://x.com/search?q=%22build%20in%20public%22%20launched&src=typed_query&f=live", why: "Find fresh launches before they become saturated." },
      { name: "HN launch posts", url: "https://hn.algolia.com/?q=Show%20HN%20SaaS", why: "Useful for early products with founder context." }
    ],
    saas_founders: [
      { name: "SaaStr", url: "https://www.saastr.com/", why: "Evergreen B2B SaaS lessons for review threads and founder takes." },
      { name: "Lenny's Newsletter search", url: "https://www.google.com/search?q=site%3Alennysnewsletter.com%20SaaS%20pricing", why: "Good for pricing, growth, onboarding, and activation angles." },
      { name: "OpenView blog", url: "https://openviewpartners.com/blog/", why: "Useful PLG and B2B SaaS growth material." }
    ],
    crypto_builders: [
      { name: "CoinDesk", url: "https://www.coindesk.com/", why: "Use only product, infrastructure, ETF, stablecoin, or builder-facing items." },
      { name: "The Block", url: "https://www.theblock.co/", why: "Good for infrastructure and funding signals when not pure market noise." },
      { name: "X onchain tools search", url: "https://x.com/search?q=%22onchain%22%20%22tool%22%20launch&src=typed_query&f=live", why: "Find fresh builder tools and protocol launches." }
    ]
  };

  return ideas[circleId] ?? [];
}

function roundRate(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function accountLooksLikeCircle(account, circle) {
  const text = `${account.displayName ?? ""} ${account.category ?? ""} ${account.accountId ?? ""}`.toLowerCase();
  const anchors = {
    ai_startups: ["ai tools", "ai founder", "ai startup", "ai agent", "agent ops", "sales support ai"],
    indie_hackers: ["indie", "build in public", "affiliate", "monetization", "side project"],
    saas_founders: ["saas", "b2b"],
    crypto_builders: ["crypto", "web3", "onchain", "wallet"]
  };
  return text.includes(circle.id.replace(/_/g, " "))
    || (anchors[circle.id] ?? []).some((anchor) => text.includes(anchor));
}

function recommendedSourcesForCircle(config, circle) {
  return (config.sources ?? [])
    .filter((source) => source.circle === circle.id)
    .map((source) => ({
      id: source.id,
      name: source.name,
      url: source.url,
      enabled: source.enabled
    }));
}

function searchQueriesForCircle(circle) {
  const defaults = {
    ai_startups: [
      "\"AI startup\" launch new tool",
      "\"AI agent\" founder workflow",
      "\"LLM\" \"Product Hunt\" launch",
      "\"AI automation\" \"pricing\" startup",
      "\"AI tool\" \"founder\" \"waitlist\""
    ],
    indie_hackers: [
      "\"micro SaaS\" launch",
      "\"indie hacker\" \"revenue\"",
      "\"build in public\" \"launched\"",
      "\"solo founder\" \"pricing\"",
      "\"side project\" \"SaaS\" \"users\""
    ],
    saas_founders: [
      "\"SaaS pricing\" \"case study\"",
      "\"B2B SaaS\" \"onboarding\"",
      "\"SaaS founder\" \"churn\"",
      "\"PLG\" \"activation\" \"SaaS\"",
      "\"SaaS\" \"pricing page\" \"launch\""
    ],
    crypto_builders: [
      "\"crypto wallet\" \"developer\"",
      "\"onchain\" \"tool\" launch",
      "\"DeFi\" \"dashboard\"",
      "\"stablecoin\" \"infrastructure\"",
      "\"web3\" \"founder\" \"product\""
    ]
  };

  return defaults[circle.id] ?? (circle.keywords ?? []).slice(0, 5).map((keyword) => `"${keyword}" startup tool`);
}

function distributeRows(items, totalRows) {
  if (!items.length) return [];
  const totalNeed = items.reduce((sum, item) => sum + Math.max(1, Number(item.neededCandidates || 0)), 0);
  let allocated = 0;
  const rows = items.map((item) => {
    const count = Math.max(1, Math.floor(totalRows * Math.max(1, Number(item.neededCandidates || 0)) / totalNeed));
    allocated += count;
    return { ...item, rows: count };
  });
  let cursor = 0;
  while (allocated < totalRows) {
    rows[cursor % rows.length].rows += 1;
    allocated += 1;
    cursor += 1;
  }
  return rows;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function sourceSupplyCsvTemplate({ circleId, searchQueries = [] }) {
  const source = `${circleId || "manual"}_research`;
  const query = searchQueries.find(Boolean) || "specific narrow pain";
  return sourceImportRowsToCsv([
    {
      name: "Real tool or topic name",
      url: "https://example.com",
      tagline: "Who has this pain and why it matters",
      source,
      circle: circleId,
      candidateType: "product",
      sourceUrl: "",
      published: "",
      notes: `Found from: ${query}`
    },
    {
      name: "Second real candidate",
      url: "https://example.com/blog",
      tagline: `Founder/product signal found from ${query}`,
      source,
      circle: circleId,
      candidateType: "topic",
      sourceUrl: "",
      published: "",
      notes: "Only import if it has a real URL and clear audience."
    }
  ]);
}

function sourceSupplyQualityChecklist() {
  return [
    "Has a real URL, not only a vague trend.",
    "Clear buyer or audience.",
    "One narrow pain point.",
    "Fresh enough for X, or evergreen enough for a review page.",
    "Avoid pure price/news drama unless there is a builder or product angle."
  ];
}

function accountMatchesItem(account, item) {
  const text = `${item.tool?.name ?? ""} ${item.tool?.description ?? ""} ${item.tool?.circle ?? ""} ${item.angle?.audience ?? ""} ${item.angle?.outcome ?? ""}`.toLowerCase();
  return (account.keywords ?? []).some((keyword) => text.includes(String(keyword).toLowerCase()))
    || (account.contentPillars ?? []).some((pillar) => text.includes(String(pillar).toLowerCase()));
}

function itemMatchesCircle(item, circle) {
  const text = `${item.tool?.name ?? ""} ${item.tool?.description ?? ""} ${item.tool?.circle ?? ""}`.toLowerCase();
  return text.includes(circle.id.replace(/_/g, " ")) || (circle.keywords ?? []).some((keyword) => text.includes(String(keyword).toLowerCase()));
}

function uniqueByTool(items) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const key = item.toolId || createToolId(item.tool?.name, item.tool?.url);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}
