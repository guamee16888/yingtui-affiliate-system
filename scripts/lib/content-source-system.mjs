import { XMLParser } from "fast-xml-parser";
import { createStableId, createToolId } from "./ids.mjs";
import { readJson, writeJsonAtomic } from "./file-store.mjs";

export const CONTENT_SOURCES_PATH = "config/content-sources.json";
export const SOURCE_CANDIDATES_PATH = "data/source-candidates.json";

export const DEFAULT_CONTENT_SOURCE_CONFIG = {
  version: 1,
  dailyTargets: {
    accounts: 20,
    postsPerAccount: 10,
    minimumQualityScore: 18
  },
  circles: [
    { id: "ai_startups", name: "AI startup circle", keywords: ["AI", "agent", "workflow", "automation"] },
    { id: "indie_hackers", name: "Indie hacker circle", keywords: ["indie", "builder", "launch", "micro SaaS"] },
    { id: "saas_founders", name: "SaaS founder circle", keywords: ["SaaS", "B2B", "pricing", "growth"] },
    { id: "crypto_builders", name: "Crypto builder circle", keywords: ["crypto", "web3", "wallet", "onchain"] }
  ],
  sources: []
};

export const DEFAULT_SOURCE_CANDIDATES = {
  version: 1,
  updatedAt: "",
  items: []
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ""
});

export function normalizeContentSourceConfig(config = DEFAULT_CONTENT_SOURCE_CONFIG) {
  const circles = Array.isArray(config.circles) ? config.circles : DEFAULT_CONTENT_SOURCE_CONFIG.circles;
  const sources = Array.isArray(config.sources) ? config.sources : [];

  return {
    ...DEFAULT_CONTENT_SOURCE_CONFIG,
    ...config,
    dailyTargets: {
      ...DEFAULT_CONTENT_SOURCE_CONFIG.dailyTargets,
      ...(config.dailyTargets ?? {})
    },
    circles: circles.map((circle) => ({
      id: String(circle.id || "").trim(),
      name: String(circle.name || circle.id || "").trim(),
      keywords: Array.isArray(circle.keywords) ? circle.keywords : []
    })).filter((circle) => circle.id),
    sources: sources.map(normalizeSource).filter((source) => source.id && source.url)
  };
}

export async function loadContentSourceConfig(warnings = []) {
  try {
    return normalizeContentSourceConfig(await readJson(CONTENT_SOURCES_PATH, DEFAULT_CONTENT_SOURCE_CONFIG));
  } catch (error) {
    warnings.push(`Content source config failed: ${error.message}. Using built-in defaults.`);
    return normalizeContentSourceConfig(DEFAULT_CONTENT_SOURCE_CONFIG);
  }
}

export async function loadSourceCandidates() {
  return readJson(SOURCE_CANDIDATES_PATH, DEFAULT_SOURCE_CANDIDATES);
}

export async function saveSourceCandidates(data) {
  await writeJsonAtomic(SOURCE_CANDIDATES_PATH, {
    ...DEFAULT_SOURCE_CANDIDATES,
    ...data,
    updatedAt: new Date().toISOString(),
    items: Array.isArray(data.items) ? data.items : []
  });
}

export async function refreshSourceCandidates(config, warnings = []) {
  const normalized = normalizeContentSourceConfig(config);
  const enabledSources = normalized.sources.filter((source) => source.enabled);
  const existing = await loadSourceCandidates();

  if (!enabledSources.length) {
    return {
      fetchedCount: 0,
      cachedCount: existing.items?.length ?? 0,
      enabledSources: 0,
      sourceCandidates: existing
    };
  }

  const fetched = [];
  const refreshedSourceIds = new Set();

  for (const source of enabledSources) {
    try {
      fetched.push(...await fetchSource(source));
      refreshedSourceIds.add(source.id);
    } catch (error) {
      warnings.push(`Source ${source.name} unavailable: ${error.message}`);
    }
  }

  const retained = (existing.items ?? []).filter((item) => !refreshedSourceIds.has(item.source));
  const merged = mergeSourceCandidateItems(retained, fetched);
  await saveSourceCandidates({ ...existing, items: merged });

  return {
    fetchedCount: fetched.length,
    cachedCount: merged.length,
    enabledSources: enabledSources.length,
    sourceCandidates: { ...existing, items: merged }
  };
}

export function sourceCandidatesToTools(sourceCandidates, date) {
  return (sourceCandidates.items ?? [])
    .filter((item) => item.status === "active")
    .map((item) => ({
      id: item.id,
      sourceId: item.source || "",
      name: item.name,
      url: item.url,
      tagline: item.tagline || item.description,
      description: item.description || item.tagline,
      published: item.published || `${date}T00:00:00+08:00`,
      updated: item.updatedAt,
      author: item.sourceName || item.source || "source",
      sourceType: "source_feed",
      sourceName: item.sourceName || item.source || "Source Candidate",
      sourceUrl: item.sourceUrl || "",
      sourceNote: item.notes || "",
      circle: item.circle || "",
      candidateType: item.candidateType || "topic"
    }))
    .filter((tool) => tool.name && tool.url);
}

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

export function renderSourceDiscoveryMarkdown(pack) {
  if (!pack?.circles?.length) return "# Source Discovery Pack\n\nNo source discovery actions needed.\n";

  return `# Source Discovery Pack - ${pack.date}

- Circles: ${pack.summary.circles}
- Needed candidates: ${pack.summary.totalNeededCandidates}
- Search links: ${pack.summary.totalSearchLinks}
- Top gap: ${pack.summary.topCircle || "none"}

${pack.circles.map((circle, index) => `## ${index + 1}. ${circle.circleName}

- Needed candidates: ${circle.neededCandidates}
- Current qualified tools: ${circle.currentQualifiedTools}
- Opening move: ${circle.openingMove}
- Import hint: ${circle.importHint}

Search links:
${circle.searchLinks.map((link) => `- [${link.label}](${link.url}) — ${link.query}`).join("\n")}

Source ideas:
${circle.sourceIdeas.map((source) => `- ${source.name}: ${source.url} — ${source.why}`).join("\n")}

Quality checklist:
${circle.qualityChecklist.map((item) => `- ${item}`).join("\n")}`).join("\n\n")}
`;
}

export function renderSourceHealthMarkdown(health) {
  if (!health) return "# Source Health\n\nNo source health report available. Run npm run source-health.\n";

  return `# Source Health - ${health.date}

- Configured sources: ${health.summary.configuredSources}
- Enabled sources: ${health.summary.enabledSources}
- Tracked sources: ${health.summary.trackedSources}
- Healthy sources: ${health.summary.healthySources}
- Tune sources: ${health.summary.tuneSources}
- Disable candidates: ${health.summary.disableCandidates}
- Total candidates: ${health.summary.totalCandidates}
- Qualified candidates: ${health.summary.qualifiedCandidates}
- Noise candidates: ${health.summary.noiseCandidates}

## Recommendations

${health.recommendations.length ? health.recommendations.map((item, index) => `${index + 1}. ${item}`).join("\n") : "No source-health actions yet."}

## Sources

${health.sources.map((source, index) => `${index + 1}. ${source.name} — ${source.status} — ${source.healthScore}/100
   Circle: ${source.circle || "unknown"} · enabled ${source.enabled ? "yes" : "no"} · candidates ${source.totalCandidates} · qualified ${source.qualifiedCandidates} · noise ${source.noiseCandidates}
   Recommendation: ${source.recommendation}`).join("\n")}

## Circle Coverage

${health.circles.map((circle) => `- ${circle.name}: sources ${circle.sources}, enabled ${circle.enabledSources}, candidates ${circle.totalCandidates}, qualified ${circle.qualifiedCandidates}, source gap ${circle.sourceGap}, candidate gap ${circle.candidateGap}`).join("\n")}
`;
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
      rows.push({
        name: "",
        url: "",
        tagline: "",
        source: "manual_research",
        circle: item.circleId,
        candidateType: index % 3 === 0 ? "topic" : "product",
        sourceUrl: "",
        published: date,
        notes: `Find from: ${item.searchQueries[index % item.searchQueries.length] ?? item.circleName}`
      });
    }
  }

  return rows.slice(0, totalRows);
}

export function sourceImportRowsToCsv(rows) {
  const headers = ["name", "url", "tagline", "source", "circle", "candidateType", "sourceUrl", "published", "notes"];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header] ?? "")).join(","))
  ].join("\n");
}

export function renderSourceQualityQueueMarkdown(queue) {
  if (!queue?.items?.length) {
    return "# Source Quality Queue\n\nNo source gaps detected under the current target.\n";
  }

  return `# Source Quality Queue

- Queue items: ${queue.summary.items}
- Needed candidates: ${queue.summary.totalNeededCandidates}
- Top gap: ${queue.summary.topCircle || "none"}

${queue.items.map((item, index) => `## ${index + 1}. ${item.circleName}

- Needed candidates: ${item.neededCandidates}
- Current qualified tools: ${item.currentQualifiedTools}
- Affected accounts: ${item.affectedAccounts.length ? item.affectedAccounts.map((account) => `${account.displayName} gap ${account.gap}`).join("; ") : "none"}
- Import hint: ${item.importHint}

Search queries:
${item.searchQueries.map((query) => `- ${query}`).join("\n")}

Recommended configured sources:
${item.recommendedSources.length ? item.recommendedSources.map((source) => `- ${source.name} (${source.enabled ? "enabled" : "disabled"}) — ${source.url}`).join("\n") : "- No configured source yet. Add one to config/content-sources.json after testing it."}`).join("\n\n")}
`;
}

function normalizeSource(source) {
  return {
    id: String(source.id || "").trim(),
    name: String(source.name || source.id || "").trim(),
    circle: String(source.circle || "").trim(),
    url: String(source.url || "").trim(),
    type: String(source.type || "rss").trim(),
    candidateType: String(source.candidateType || "topic").trim(),
    enabled: source.enabled === true,
    maxItems: Number(source.maxItems || 20),
    qualityHint: String(source.qualityHint || "").trim(),
    includeKeywords: Array.isArray(source.includeKeywords) ? source.includeKeywords : [],
    excludeKeywords: Array.isArray(source.excludeKeywords) ? source.excludeKeywords : []
  };
}

function sourceHealthForSource({ date, source, candidates, scoreByToolId, minimumQualityScore }) {
  const activeCandidates = candidates.filter((item) => item.status === "active");
  const scoredCandidates = activeCandidates
    .map((item) => scoreByToolId.get(item.toolId || createToolId(item.name, item.url)))
    .filter(Boolean);
  const qualifiedCandidates = scoredCandidates.filter((item) => item.followUpAction !== "skip" && Number(item.score) >= minimumQualityScore).length;
  const skippedCandidates = scoredCandidates.filter((item) => item.followUpAction === "skip" || Number(item.score) < minimumQualityScore).length;
  const freshCandidates = activeCandidates.filter((item) => daysSince(item.published, date) !== null && daysSince(item.published, date) <= 2).length;
  const noiseCandidates = activeCandidates.filter((item) => looksNoisySourceCandidate(item, source)).length;
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
    sampleNoise: activeCandidates.filter((item) => looksNoisySourceCandidate(item, source)).slice(0, 3).map((item) => item.name)
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

function looksNoisySourceCandidate(item, source) {
  const text = `${item.name ?? ""} ${item.description ?? ""} ${item.tagline ?? ""}`.toLowerCase();
  const noisyTerms = [
    "price prediction",
    "resistance",
    "bottomed",
    "war",
    "crime",
    "lawsuit",
    "live updates",
    "really bottomed",
    "climbs back",
    "rockets",
    "bulls",
    "trump",
    "iran",
    "froze",
    "laundering"
  ];
  return noisyTerms.some((term) => text.includes(term))
    || (source.excludeKeywords ?? []).some((term) => text.includes(String(term).toLowerCase()));
}

function daysSince(published, date) {
  const base = new Date(`${date}T12:00:00Z`);
  const time = new Date(published);
  if (Number.isNaN(base.getTime()) || Number.isNaN(time.getTime())) return null;
  return Math.max(0, (base.getTime() - time.getTime()) / 86400000);
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

async function fetchSource(source) {
  if (!["rss", "atom"].includes(source.type)) throw new Error(`unsupported source type ${source.type}`);
  const response = await fetch(source.url, {
    signal: AbortSignal.timeout(10000),
    headers: { "user-agent": "yingtui-affiliate-system/0.3" }
  });

  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

  const xml = await response.text();
  const parsed = parser.parse(xml);
  const entries = source.type === "atom"
    ? asArray(parsed.feed?.entry)
    : asArray(parsed.rss?.channel?.item);

  return entries.slice(0, source.maxItems).map((entry) => entryToCandidate(entry, source)).filter(Boolean);
}

function entryToCandidate(entry, source) {
  const name = stripHtml(entry.title?.["#text"] ?? entry.title ?? "").trim();
  const url = atomLink(entry) || String(entry.link?.["#text"] ?? entry.link ?? "").trim();
  const description = stripHtml(entry.summary?.["#text"] ?? entry.summary ?? entry.description?.["#text"] ?? entry.description ?? entry.content?.["#text"] ?? entry.content ?? source.qualityHint);
  if (!name || !url) return null;
  if (!passesKeywordFilters(`${name} ${description}`, source)) return null;

  const published = entry.published ?? entry.pubDate ?? entry.updated ?? new Date().toISOString();
  const toolId = createToolId(name, url);

  return {
    id: createStableId("source_candidate", [source.id, toolId]),
    toolId,
    name,
    url,
    tagline: description.slice(0, 180),
    description,
    source: source.id,
    sourceName: source.name,
    sourceUrl: source.url,
    circle: source.circle,
    candidateType: source.candidateType,
    published,
    status: "active",
    notes: source.qualityHint,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function passesKeywordFilters(text, source) {
  const lower = text.toLowerCase();
  const includes = source.includeKeywords ?? [];
  const excludes = source.excludeKeywords ?? [];

  if (includes.length && !includes.some((keyword) => lower.includes(String(keyword).toLowerCase()))) return false;
  if (excludes.some((keyword) => lower.includes(String(keyword).toLowerCase()))) return false;
  return true;
}

function mergeSourceCandidateItems(existing, incoming) {
  const byTool = new Map();
  for (const item of [...existing, ...incoming]) {
    const toolId = item.toolId || createToolId(item.name, item.url);
    const previous = byTool.get(toolId);
    byTool.set(toolId, previous ? { ...previous, ...item, createdAt: previous.createdAt, updatedAt: new Date().toISOString() } : { ...item, toolId });
  }
  return Array.from(byTool.values()).sort((a, b) => String(b.published).localeCompare(String(a.published)));
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

function atomLink(entry) {
  const links = asArray(entry.link);
  const alternate = links.find((link) => link.rel === "alternate") ?? links[0];
  return String(alternate?.href ?? "").trim();
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function stripHtml(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}
